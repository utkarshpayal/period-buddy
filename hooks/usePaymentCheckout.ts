import { useRef, useState } from "react";
import type { CashfreeResult } from "../components/CashfreeCheckoutModal";
import type { PaymentSheetOutcome } from "../components/PaymentSheet";
import { getFriendlyErrorMessage, subscriptionApi, type Entitlement, type SubscriptionOrder } from "../lib/api";
import { isPaymentDeclined, isPendingVerify, verifyWithRetries, type PendingVerify } from "../lib/paymentVerify";

export type PurchaseResult =
  | { type: "success" }
  | { type: "failed"; message: string }
  | { type: "pending"; message?: string };

type PurchasePayload = { source: "plan"; planId: string } | { source: "feature"; featureKey: string };

/** The Cashfree fields every order shape (subscription, consultation) carries. */
export type CheckoutOrder = {
  orderId?: string;
  paymentSessionId?: string;
  cashfreeMode?: "sandbox" | "production";
  amount?: number;
};

export type CheckoutAdapter<O extends CheckoutOrder, V> = {
  /** One verify call: the settled record, or `{ pending: true }` while Cashfree's order is still open. */
  verify: (order: O, orderId: string) => Promise<V | PendingVerify>;
  /** Runs once a payment is confirmed, with the verified record when this session saw it. */
  onPaid?: (verified: V | null, order: O) => void;
  /** HTTP statuses that mean "definitely not paid". Default [400]; everything else keeps waiting. */
  failedStatuses?: readonly number[];
};

const NOT_CHARGED = "The payment didn't go through. You haven't been charged.";

// A hosted-checkout "success" occasionally races Cashfree's own webhook —
// verifying the order a moment too early can still come back `pending` even
// though the payment genuinely went through. A handful of short retries
// resolves nearly all of those before we ever show the user a dead end.
const PENDING_RETRY_DELAYS_MS = [1500, 3000, 5000];

/**
 * The checkout→verify state machine behind PaymentSheet (UPI apps / UPI ID)
 * and CashfreeCheckoutModal (cards, netbanking, wallets), independent of what
 * is being bought: the caller creates the order and passes it to `open`, and
 * `adapter.verify` checks it. `usePaymentCheckout` below is the subscription
 * flavour; a consultation booking can use this directly with
 * `consultationApi.verifyPayment` (and `failedStatuses: [400, 409]`, since 409
 * there means "paid, but the slot was gone").
 *
 * Only a definite answer from the server (lib/paymentVerify.ts) ever turns
 * into "failed": a 5xx or a dropped connection while someone is paying is
 * "still pending", never "You haven't been charged".
 */
export function useCheckoutSession<O extends CheckoutOrder, V>(adapter: CheckoutAdapter<O, V>) {
  const [checkout, setCheckout] = useState<O | null>(null);
  // Nura's own PaymentSheet (UPI apps, UPI ID, then "Card, netbanking or
  // wallet") is the landing surface; that last option switches to Cashfree's
  // hosted checkout. The sheet opens UPI apps directly, which the hosted page
  // inside a WebView can't do reliably.
  const [useHostedCheckout, setUseHostedCheckout] = useState(false);
  /** What is being paid for, shown on the sheet. */
  const [checkoutTitle, setCheckoutTitle] = useState<string | undefined>(undefined);
  const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null);

  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  // Read through refs: PaymentSheet polls verifyUpiOnce from a timer, and a
  // closure from an older render would see an older (or no) order.
  const checkoutRef = useRef<O | null>(null);
  const lastOrder = useRef<O | null>(null);
  /** The record a successful UPI poll returned, handed to onPaid. */
  const verifiedRef = useRef<V | null>(null);

  const declined = (err: unknown) => isPaymentDeclined(err, { failedStatuses: adapterRef.current.failedStatuses });

  const paid = (verified: V | null, order: O) => {
    setPurchaseResult({ type: "success" });
    adapterRef.current.onPaid?.(verified, order);
  };

  function open(order: O, title?: string) {
    checkoutRef.current = order;
    lastOrder.current = order;
    verifiedRef.current = null;
    setUseHostedCheckout(false);
    setCheckoutTitle(title);
    setCheckout(order);
  }

  function closeCheckout() {
    checkoutRef.current = null;
    setCheckout(null);
  }

  function reset() {
    closeCheckout();
    setPurchaseResult(null);
    setUseHostedCheckout(false);
  }

  const handleCheckoutResult = async (result: CashfreeResult) => {
    const order = checkoutRef.current;
    closeCheckout();
    if (!order?.orderId) return;
    const orderId = order.orderId;
    const verify = () => adapterRef.current.verify(order, orderId);

    if (result.type === "dismiss") {
      // A dismiss is usually a genuine cancel, but it's also what happens if
      // the user closes the checkout the instant after a redirect-based
      // method (netbanking/wallet/other UPI app) finishes — before
      // CashfreeCheckoutModal's own return_url interception fires. One
      // verify check catches that case and unlocks anyway; a real cancel
      // comes back pending (order still open) and stays quiet.
      try {
        const verified = await verify();
        if (!isPendingVerify(verified)) paid(verified, order);
      } catch (err) {
        // Couldn't ask: if money did move, a silent dismiss would lose it.
        if (!declined(err)) {
          setPurchaseResult({ type: "pending", message: "We couldn't check this payment. If you paid, tap below to confirm it." });
        }
      }
      return;
    }
    if (result.type === "failed") {
      setPurchaseResult({ type: "failed", message: NOT_CHARGED });
      return;
    }

    try {
      const verified = await verifyWithRetries(verify, PENDING_RETRY_DELAYS_MS, {
        failedStatuses: adapterRef.current.failedStatuses,
      });
      if (verified) paid(verified, order);
      else setPurchaseResult({ type: "pending" });
    } catch (err) {
      setPurchaseResult({ type: "failed", message: declined(err) ? NOT_CHARGED : getFriendlyErrorMessage(err) });
    }
  };

  // Polled by PaymentSheet every few seconds while the user pays in their
  // UPI app.
  const verifyUpiOnce = async (orderId: string): Promise<"paid" | "pending" | "failed"> => {
    const order = checkoutRef.current;
    if (!order) return "pending";
    try {
      const result = await adapterRef.current.verify(order, orderId);
      if (isPendingVerify(result)) return "pending";
      verifiedRef.current = result;
      return "paid";
    } catch (err) {
      return declined(err) ? "failed" : "pending";
    }
  };

  const handleUpiOutcome = (result: PaymentSheetOutcome) => {
    const order = checkoutRef.current;
    closeCheckout();
    if (result.type === "dismiss") return;
    if (result.type === "failed") {
      setPurchaseResult({ type: "failed", message: result.message ?? NOT_CHARGED });
      return;
    }
    if (order) paid(verifiedRef.current, order);
    else setPurchaseResult({ type: "success" });
  };

  // Manual "Check payment status" retry for the dead-end pending state
  // (docs/fixes.md 4.1) — re-runs the same verify the automatic retries already
  // tried, in case the order has since settled.
  const recheckPending = async () => {
    const order = lastOrder.current;
    if (!order?.orderId) {
      setPurchaseResult({ type: "failed", message: "We couldn't find that order — check My Subscription instead." });
      return;
    }
    try {
      const verified = await adapterRef.current.verify(order, order.orderId);
      if (isPendingVerify(verified)) setPurchaseResult({ type: "pending" });
      else paid(verified, order);
    } catch (err) {
      setPurchaseResult(
        declined(err)
          ? { type: "failed", message: NOT_CHARGED }
          : { type: "pending", message: "We couldn't reach the payment check just now. Try again in a moment." },
      );
    }
  };

  return {
    checkout,
    checkoutTitle,
    useHostedCheckout,
    setUseHostedCheckout,
    purchaseResult,
    setPurchaseResult,
    open,
    handleCheckoutResult,
    verifyUpiOnce,
    handleUpiOutcome,
    recheckPending,
    reset,
  };
}

const SUBSCRIPTION_CHECKOUT: CheckoutAdapter<SubscriptionOrder, Entitlement> = {
  verify: (order, orderId) => subscriptionApi.verifyPayment({ entitlementId: order.entitlementId, orderId }),
};

/**
 * Subscriptions: shared by the paywall (components/subscription/PaywallModal.tsx)
 * and the always-available pricing screen (app/(app)/subscription.tsx) — both
 * buy against `subscriptionApi` and resolve to the same
 * `SubscriptionOrder`/entitlement shape.
 */
export function usePaymentCheckout() {
  const session = useCheckoutSession(SUBSCRIPTION_CHECKOUT);
  const [purchasingKey, setPurchasingKey] = useState<string | null>(null);
  // A double tap on Confirm would otherwise create two orders.
  const purchasingRef = useRef(false);

  async function startPurchase(
    key: string,
    payload: PurchasePayload,
    options?: { couponCode?: string; title?: string },
  ): Promise<{ free: boolean } | null> {
    if (purchasingRef.current) return null;
    purchasingRef.current = true;
    setPurchasingKey(key);
    try {
      const order = await subscriptionApi.createOrder({ ...payload, couponCode: options?.couponCode });
      if (order.free) {
        session.setPurchaseResult({ type: "success" });
        return { free: true };
      }
      session.open(order, options?.title);
      return { free: false };
    } catch (err) {
      session.setPurchaseResult({ type: "failed", message: getFriendlyErrorMessage(err) });
      return null;
    } finally {
      purchasingRef.current = false;
      setPurchasingKey(null);
    }
  }

  return { ...session, purchasingKey, startPurchase };
}
