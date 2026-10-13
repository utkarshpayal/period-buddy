import { Platform } from "react-native";
import { parseUpiIntentLinks } from "./upiIntent";

/**
 * UPI Collect goes straight from the app to Cashfree's Order Pay API
 * (POST /pg/orders/sessions) — this call takes only the order's public
 * `payment_session_id` (returned by our own backend's createOrder), no
 * client secret, and Cashfree's docs explicitly say it's callable directly
 * from the browser/client. That's what lets this be a fully native RN form
 * (a themed TextInput + button) instead of Cashfree's hosted checkout page
 * — no card data is ever involved for UPI, so there's no PCI-scope reason
 * to route it through Cashfree's own UI.
 *
 * A "collect" request only *starts* the payment — the user still has to
 * approve it in their UPI app, which can take up to ~a minute. This call
 * resolves once Cashfree has accepted the request, not once it's paid;
 * callers must poll their own backend's verifyPayment (which now treats a
 * still-open Cashfree order as "pending", not "failed" — see
 * period-buddy-be's verifySubscriptionPayment/verifyConsultationPayment)
 * until it reports success, failure, or a timeout.
 */
export type UpiCollectResult =
  | { type: "pending"; cfPaymentId: string }
  | { type: "error"; message: string };

const API_BASE = (mode: "sandbox" | "production") =>
  mode === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";

export async function payWithUpiCollect(params: {
  mode: "sandbox" | "production";
  paymentSessionId: string;
  upiId: string;
}): Promise<UpiCollectResult> {
  try {
    const response = await fetch(`${API_BASE(params.mode)}/orders/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Cashfree's Order Pay API (/orders/sessions) is versioned
        // separately from Orders create/status (which use 2023-08-01) —
        // per Cashfree's docs this endpoint is on 2026-01-01.
        //
        // Cashfree's own API reference also lists x-client-device/os/
        // rendering-type/browser as "required" — but on web, sending them
        // triggers a CORS preflight, and Cashfree's sandbox preflight
        // response doesn't include those in access-control-allow-headers,
        // so the browser blocks the real request before it's sent. Verified
        // directly against sandbox that the endpoint accepts (and correctly
        // processes) the request without them — so they're left off
        // entirely rather than only skipped on web, to keep native and web
        // on one code path.
        "x-api-version": "2026-01-01",
      },
      body: JSON.stringify({
        payment_session_id: params.paymentSessionId,
        payment_method: {
          upi: {
            channel: "collect",
            upi_id: params.upiId.trim(),
          },
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return { type: "error", message: data?.message || "Couldn't start the UPI payment request." };
    }
    return { type: "pending", cfPaymentId: data.cf_payment_id };
  } catch {
    return { type: "error", message: "Couldn't reach the payment network. Check your connection." };
  }
}

/**
 * UPI intent ("pay with a UPI app"): asks Cashfree for this order's
 * `upi://pay?…` links, which the payment sheet opens in the app the person
 * picks. Like collect it only starts the payment; callers poll verify.
 * Native only: the client headers below would fail the browser's CORS
 * preflight (see payWithUpiCollect), and there are no UPI apps on web anyway.
 */
export type UpiIntentResult =
  | { type: "ok"; links: NonNullable<ReturnType<typeof parseUpiIntentLinks>> }
  | { type: "error"; message: string };

export async function startUpiIntent(params: {
  mode: "sandbox" | "production";
  paymentSessionId: string;
}): Promise<UpiIntentResult> {
  try {
    const response = await fetch(`${API_BASE(params.mode)}/orders/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": "2026-01-01",
        "x-client-device": "mobile",
        "x-client-os": Platform.OS === "ios" ? "ios" : "android",
        "x-client-rendering-type": "native",
        "x-client-browser": "others",
      },
      body: JSON.stringify({
        payment_session_id: params.paymentSessionId,
        payment_method: { upi: { channel: "link" } },
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { type: "error", message: data?.message || "Couldn't start the UPI payment." };
    }
    const links = parseUpiIntentLinks(data);
    if (!links) return { type: "error", message: "Couldn't start the UPI payment. Try your UPI ID or another method." };
    return { type: "ok", links };
  } catch {
    return { type: "error", message: "Couldn't reach the payment network. Check your connection." };
  }
}

/** Basic sanity check before submitting — Cashfree still does the real
 * validation, this is just to avoid a pointless round trip on an obviously
 * malformed id (e.g. missing "@handle"). */
export function isPlausibleUpiId(value: string): boolean {
  return /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(value.trim());
}
