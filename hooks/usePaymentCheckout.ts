import { useRef, useState } from "react";
import type { CashfreeResult } from "../components/CashfreeCheckoutModal";
import type { UpiCollectOutcome } from "../components/CashfreeUpiCollectModal";
import { getFriendlyErrorMessage, subscriptionApi, type SubscriptionOrder } from "../lib/api";

export type PurchaseResult =
  | { type: "success" }
  | { type: "failed"; message: string }
  | { type: "pending" };

type PurchasePayload = { source: "plan"; planId: string } | { source: "feature"; featureKey: string };

// A hosted-checkout "success" occasionally races Cashfree's own webhook —
// verifying the order a moment too early can still come back `pending` even
// though the payment genuinely went through. A handful of short retries
// resolves nearly all of those before we ever show the user a dead end.
const PENDING_RETRY_DELAYS_MS = [1500, 3000, 5000];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The order→checkout→verify state machine shared by the paywall
 * (components/subscription/PaywallModal.tsx) and the always-available
 * pricing screen (app/(app)/subscription.tsx) — both buy against
 * `subscriptionApi` and resolve to the same `SubscriptionOrder`/entitlement
 * shape. app/(app)/consultation.tsx books against a differently-shaped
 * `consultationApi` (a `consultationId`, not an `entitlementId`) and isn't
 * unified into this hook yet — see fixes.md 6.7.
 */
export function usePaymentCheckout() {
  const [purchasingKey, setPurchasingKey] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<SubscriptionOrder | null>(null);
  // Hosted checkout (cards/UPI apps/netbanking/wallets, Cashfree's own
  // branded page) is the default, prominent entry — native UPI-ID collect is
  // an opt-in alternative a caller can request via `startPurchase`'s
  // `preferUpiCollect` option, not the landing surface (fixes.md 6.1).
  const [useHostedCheckout, setUseHostedCheckout] = useState(true);
  const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null);
  const lastOrder = useRef<SubscriptionOrder | null>(null);

  function reset() {
    setCheckout(null);
    setPurchaseResult(null);
    setUseHostedCheckout(true);
  }

  async function startPurchase(
    key: string,
    payload: PurchasePayload,
    options?: { couponCode?: string; preferUpiCollect?: boolean },
  ): Promise<{ free: boolean } | null> {
    setPurchasingKey(key);
    try {
      const order = await subscriptionApi.createOrder({ ...payload, couponCode: options?.couponCode });
      lastOrder.current = order;
      if (order.free) {
        setPurchaseResult({ type: "success" });
        return { free: true };
      }
      setUseHostedCheckout(!options?.preferUpiCollect);
      setCheckout(order);
      return { free: false };
    } catch (err) {
      setPurchaseResult({ type: "failed", message: getFriendlyErrorMessage(err) });
      return null;
    } finally {
      setPurchasingKey(null);
    }
  }

  async function verifyWithRetries(entitlementId: string, orderId: string) {
    for (let attempt = 0; attempt <= PENDING_RETRY_DELAYS_MS.length; attempt++) {
      try {
        const verified = await subscriptionApi.verifyPayment({ entitlementId, orderId });
        if (!("pending" in verified)) return verified;
      } catch {
        // Treat a transient verify error the same as "still pending" and
        // keep retrying — the payment itself already succeeded on Cashfree's
        // side by the time we're in this branch.
      }
      if (attempt < PENDING_RETRY_DELAYS_MS.length) await wait(PENDING_RETRY_DELAYS_MS[attempt]);
    }
    return null;
  }

  const handleCheckoutResult = async (result: CashfreeResult) => {
    const order = checkout;
    setCheckout(null);
    if (!order) return;

    if (result.type === "dismiss") {
      // A dismiss is usually a genuine cancel, but it's also what happens if
      // the user closes the checkout the instant after a redirect-based
      // method (netbanking/wallet/other UPI app) finishes — before
      // CashfreeCheckoutModal's own return_url interception fires. One
      // silent verify check catches that case and unlocks anyway; a real
      // cancel just resolves to "pending"/an error here and stays quiet.
      try {
        const verified = await subscriptionApi.verifyPayment({
          entitlementId: order.entitlementId,
          orderId: order.orderId!,
        });
        if (!("pending" in verified)) setPurchaseResult({ type: "success" });
      } catch {
        // Genuine cancel — nothing was charged, stay quiet.
      }
      return;
    }
    if (result.type === "failed") {
      setPurchaseResult({ type: "failed", message: "The payment didn't go through. You haven't been charged." });
      return;
    }

    try {
      const verified = await verifyWithRetries(order.entitlementId, result.orderId);
      setPurchaseResult(verified ? { type: "success" } : { type: "pending" });
    } catch (err) {
      setPurchaseResult({ type: "failed", message: getFriendlyErrorMessage(err) });
    }
  };

  // Polled by CashfreeUpiCollectModal every few seconds while the user
  // approves the request in their UPI app.
  const verifyUpiOnce = async (orderId: string): Promise<"paid" | "pending" | "failed"> => {
    if (!checkout) return "failed";
    try {
      const result = await subscriptionApi.verifyPayment({ entitlementId: checkout.entitlementId, orderId });
      return "pending" in result ? "pending" : "paid";
    } catch {
      return "failed";
    }
  };

  const handleUpiOutcome = (result: UpiCollectOutcome) => {
    setCheckout(null);
    if (result.type === "dismiss") return;
    if (result.type === "failed") {
      setPurchaseResult({
        type: "failed",
        message: result.message ?? "The payment didn't go through. You haven't been charged.",
      });
      return;
    }
    setPurchaseResult({ type: "success" });
  };

  // Manual "Check payment status" retry for the dead-end pending state
  // (fixes.md 4.1) — re-runs the same verify the automatic retries already
  // tried, in case the order has since settled.
  const recheckPending = async () => {
    const order = lastOrder.current;
    if (!order?.orderId) {
      setPurchaseResult({ type: "failed", message: "We couldn't find that order — check My Subscription instead." });
      return;
    }
    try {
      const verified = await subscriptionApi.verifyPayment({ entitlementId: order.entitlementId, orderId: order.orderId });
      setPurchaseResult("pending" in verified ? { type: "pending" } : { type: "success" });
    } catch (err) {
      setPurchaseResult({ type: "failed", message: getFriendlyErrorMessage(err) });
    }
  };

  return {
    purchasingKey,
    checkout,
    useHostedCheckout,
    setUseHostedCheckout,
    purchaseResult,
    setPurchaseResult,
    startPurchase,
    handleCheckoutResult,
    verifyUpiOnce,
    handleUpiOutcome,
    recheckPending,
    reset,
  };
}
