import { useCallback, useEffect, useRef, useState } from "react";
import type { CashfreeResult } from "../components/CashfreeCheckoutModal";
import type { PaymentSheetOutcome } from "../components/PaymentSheet";
import { alert } from "../lib/alert";
import {
  ApiError,
  consultationApi,
  getFriendlyErrorMessage,
  type Consultation,
  type ConsultationOrder,
  type Doctor,
} from "../lib/api";
import { formatINR, formatSessionWhen } from "../lib/consultationFormat";
import { doctorNameOf } from "../lib/consultationModel";
import { isPaymentDeclined, isPendingVerify } from "../lib/paymentVerify";
import { haptics } from "../lib/haptics";

// Waits between verify retries when the payment went through but the first
// confirmation call failed (verify is idempotent, so retrying is safe).
const VERIFY_RETRY_DELAYS_MS = [1500, 3000, 6000, 10000];
// iOS won't present a modal while another is still dismissing.
export const SHEET_DISMISS_MS = 400;

/**
 * setTimeout that is cleared when the screen unmounts, so a delayed
 * "open the chat" can't run on a screen that's gone.
 */
export function useSafeTimeout() {
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);
  return useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      fn();
    }, ms);
    timers.current.add(timer);
  }, []);
}

/**
 * Booking a doctor: order → PaymentSheet (UPI) or Cashfree's hosted checkout
 * → verify → open the booked chat; plus cancelling a booking.
 *
 * Not built on hooks/useCheckoutSession: that one reports through a
 * PurchaseResultPanel, while a booking answers with alerts, a progress note
 * in the booking bar and the chat opening. The paid/pending/failed rules are
 * the same ones (lib/paymentVerify.ts): only a definite answer from the
 * server is "failed", never a 5xx or a dropped connection.
 */
export function useConsultationBooking({
  findLiveFor,
  upsertConsultation,
  loadConsultations,
  openChat,
  onSlotGone,
  schedule,
}: {
  /** The live booking with this doctor, if any. */
  findLiveFor: (doctorId: string) => Consultation | undefined;
  upsertConsultation: (consultation: Consultation) => void;
  loadConsultations: () => unknown;
  openChat: (consultation: Consultation) => void;
  /** The picked time was taken or the payment failed: refetch the open times. */
  onSlotGone: () => void;
  schedule: (fn: () => void, ms: number) => void;
}) {
  const [booking, setBooking] = useState(false);
  // Two quick taps on Book would otherwise create two orders.
  const bookingRef = useRef(false);
  // Shown in the booking bar while a finished payment is being confirmed.
  const [paymentNote, setPaymentNote] = useState<string | null>(null);
  const [checkoutOrder, setCheckoutOrderState] = useState<ConsultationOrder | null>(null);
  // Read through a ref: PaymentSheet polls verifyUpiOnce from a timer.
  const checkoutRef = useRef<ConsultationOrder | null>(null);
  const [useHostedCheckout, setUseHostedCheckout] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setCheckoutOrder = (order: ConsultationOrder | null) => {
    checkoutRef.current = order;
    setCheckoutOrderState(order);
  };

  const finishBooking = () => {
    bookingRef.current = false;
    setBooking(false);
  };

  const bookAndPay = async (doctor: Doctor, slot: string | null) => {
    const existing = findLiveFor(doctor._id);
    if (existing) {
      openChat(existing);
      return;
    }
    if (!slot || !formatINR(doctor.pricePerSession) || bookingRef.current) return;
    bookingRef.current = true;
    setBooking(true);
    try {
      const order = await consultationApi.createOrder(doctor._id, slot);
      if (order.consultation) {
        // Backend found an already-paid/active session for this doctor
        // (e.g. a race with another device) — open it instead of charging.
        const found = order.consultation;
        upsertConsultation(found);
        finishBooking();
        schedule(() => openChat(found), SHEET_DISMISS_MS);
        return;
      }
      // PaymentSheet (UPI apps, UPI ID) first; its "Card, netbanking or
      // wallet" option switches to the hosted checkout.
      setUseHostedCheckout(false);
      setCheckoutOrder(order);
      // finishBooking() happens once the checkout resolves.
    } catch (err) {
      finishBooking();
      if (err instanceof ApiError && err.status === 409) {
        // Someone else just took this time: show the fresh open times.
        onSlotGone();
        alert("Time no longer available", `${getFriendlyErrorMessage(err)}\nWe've refreshed the open times — please pick another.`);
        return;
      }
      alert("Couldn't start checkout", getFriendlyErrorMessage(err));
    }
  };

  /**
   * Confirms a checkout with the server and opens the booked chat.
   * `reportedPaid`: the checkout said the payment went through, so a failed
   * verify call is retried with backoff and, if it still can't be confirmed,
   * the user is told not to pay again — the server also re-checks the order
   * with Cashfree on the next /my, so the booking shows up.
   */
  const confirmBooking = async (order: ConsultationOrder, reportedPaid: boolean) => {
    const consultationId = order.consultationId!;
    const orderId = order.orderId!;
    bookingRef.current = true;
    setBooking(true);
    if (reportedPaid) setPaymentNote("Payment received — confirming your booking…");
    try {
      for (let attempt = 0; mountedRef.current; attempt++) {
        try {
          const result = await consultationApi.verifyPayment({ consultationId, orderId });
          if (!isPendingVerify(result)) {
            haptics.success();
            upsertConsultation(result);
            schedule(() => openChat(result), SHEET_DISMISS_MS);
            return;
          }
          // Still open at Cashfree. After a closed checkout that means the
          // user left without paying; after a reported success (UPI still
          // settling) keep checking.
          if (!reportedPaid) {
            alert("Payment not completed", "You closed the payment before it finished, so nothing was booked. You can try again.");
            return;
          }
        } catch (err) {
          if (isPaymentDeclined(err)) {
            haptics.error();
            alert(
              reportedPaid ? "Payment failed" : "Payment not completed",
              "Your payment didn't go through, so nothing was booked. Please try again.",
            );
            onSlotGone();
            return;
          }
          if (err instanceof ApiError && err.status === 409) {
            // Paid, but the booking was cancelled / the slot was taken meanwhile.
            alert("Booking couldn't be completed", getFriendlyErrorMessage(err));
            onSlotGone();
            loadConsultations();
            return;
          }
          // Network / server trouble: retry below.
        }
        if (attempt >= VERIFY_RETRY_DELAYS_MS.length) break;
        await new Promise((resolve) => setTimeout(resolve, VERIFY_RETRY_DELAYS_MS[attempt]));
      }
      if (reportedPaid && mountedRef.current) {
        alert(
          "Confirming your payment",
          "Please don't pay again. Your booking will appear here shortly — we're still checking with the payment provider.",
        );
      }
      loadConsultations();
    } finally {
      if (mountedRef.current) {
        setPaymentNote(null);
        finishBooking();
      }
    }
  };

  const handleCheckoutResult = async (result: CashfreeResult) => {
    const order = checkoutRef.current;
    setCheckoutOrder(null);
    if (!order?.consultationId || !order.orderId) {
      finishBooking();
      return;
    }
    if (result.type === "failed") {
      finishBooking();
      alert("Payment failed", "Your payment didn't go through, so nothing was booked. Please try again or use another payment method.");
      return;
    }
    // A dismiss is usually a genuine cancel, but it's also what happens if
    // the checkout is closed the instant after a redirect-based method
    // finishes — before CashfreeCheckoutModal's own return_url interception
    // fires. Verifying with the order's own id catches that case.
    await confirmBooking(order, result.type === "success");
  };

  // Polled by PaymentSheet every few seconds while the user pays in their UPI app.
  const verifyUpiOnce = async (orderId: string): Promise<"paid" | "pending" | "failed"> => {
    const order = checkoutRef.current;
    if (!order?.consultationId) return "pending";
    try {
      const result = await consultationApi.verifyPayment({ consultationId: order.consultationId, orderId });
      return isPendingVerify(result) ? "pending" : "paid";
    } catch (err) {
      if (isPaymentDeclined(err)) return "failed";
      // 409: paid, but the slot was gone. Stop polling; confirmBooking
      // verifies again and says so (and that the payment is refunded).
      if (err instanceof ApiError && err.status === 409) return "paid";
      // A 5xx or a dropped connection says nothing about the payment.
      return "pending";
    }
  };

  const handleUpiOutcome = async (result: PaymentSheetOutcome) => {
    const order = checkoutRef.current;
    setCheckoutOrder(null);
    if (!order || result.type === "dismiss") {
      finishBooking();
      return;
    }
    if (result.type === "failed") {
      finishBooking();
      alert("Payment failed", result.message || "Your UPI payment didn't go through, so nothing was booked. Please try again.");
      return;
    }
    // The polling in PaymentSheet already saw the order PAID — verifying
    // again both re-confirms and fetches the booked session.
    await confirmBooking(order, true);
  };

  const cancelBooking = async (consultation: Consultation) => {
    setCancellingId(consultation._id);
    try {
      const updated = await consultationApi.cancelConsultation(consultation._id);
      upsertConsultation(updated);
      onSlotGone();
      alert(
        "Booking cancelled",
        updated.refundStatus === "required"
          ? "Your refund is in progress — our team will return your payment."
          : "Your booking has been cancelled.",
      );
    } catch (err) {
      alert("Couldn't cancel", getFriendlyErrorMessage(err));
      loadConsultations();
    } finally {
      setCancellingId(null);
    }
  };

  const cancelRef = useRef(cancelBooking);
  cancelRef.current = cancelBooking;
  // Stable, so memoized booking cards don't re-render for it.
  const confirmCancel = useCallback((consultation: Consultation) => {
    const name = doctorNameOf(consultation, "");
    const when = consultation.scheduledFor ? formatSessionWhen(consultation.scheduledFor, { withZone: true }) : null;
    const paid = consultation.paymentStatus === "paid";
    alert(
      "Cancel this booking?",
      `Your session${name ? ` with ${name}` : ""}${when ? ` on ${when}` : ""} will be cancelled.${
        paid ? " Your payment will be refunded by our team." : ""
      }`,
      [
        { text: "Keep booking", style: "cancel" },
        { text: "Cancel booking", style: "destructive", onPress: () => cancelRef.current(consultation) },
      ],
    );
  }, []);

  return {
    booking,
    paymentNote,
    checkoutOrder,
    useHostedCheckout,
    setUseHostedCheckout,
    cancellingId,
    bookAndPay,
    handleCheckoutResult,
    verifyUpiOnce,
    handleUpiOutcome,
    confirmCancel,
  };
}
