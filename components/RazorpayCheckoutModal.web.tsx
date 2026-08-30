import { useEffect, useRef } from "react";
import type { RazorpayResult } from "./RazorpayCheckoutModal";

export type { RazorpayResult } from "./RazorpayCheckoutModal";

type Props = {
  visible: boolean;
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  onResult: (result: RazorpayResult) => void;
};

// Razorpay's actual checkout widget — a real browser popup, not an iframe —
// no ReactNativeWebView bridge involved.
type RazorpayCheckoutInstance = {
  open: () => void;
  on: (event: "payment.failed", handler: (response: { error?: unknown }) => void) => void;
};
type RazorpayGlobal = new (options: Record<string, unknown>) => RazorpayCheckoutInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayGlobal;
  }
}

const CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

// Loaded once per page and cached — every RazorpayCheckoutModal.web mount
// reuses the same <script>/promise instead of re-injecting it.
let checkoutScriptPromise: Promise<void> | null = null;
function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (!checkoutScriptPromise) {
    checkoutScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = CHECKOUT_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load the Razorpay checkout script."));
      document.head.appendChild(script);
    });
  }
  return checkoutScriptPromise;
}

/**
 * Web counterpart to RazorpayCheckoutModal.tsx — react-native-webview ships
 * no web implementation at all (its fallback just renders "React Native
 * WebView does not support this platform."), so checkout.js can never run
 * inside a WebView on web. Since Expo web output is a real webpage, this
 * loads checkout.js directly and opens Razorpay's own browser popup instead
 * — same `onResult` shape as the native version, so callers don't branch.
 */
export function RazorpayCheckoutModal({ visible, keyId, orderId, amount, currency, name, description, onResult }: Props) {
  // Guards against re-opening on every re-render while `visible` stays true
  // (e.g. a parent state update) — only fires once per visible:false->true edge.
  const openedForOrderRef = useRef<string | null>(null);

  useEffect(() => {
    if (!visible || openedForOrderRef.current === orderId) return;
    openedForOrderRef.current = orderId;

    let cancelled = false;
    loadCheckoutScript()
      .then(() => {
        if (cancelled || !window.Razorpay) return;
        const rzp = new window.Razorpay({
          key: keyId,
          amount,
          currency,
          order_id: orderId,
          name,
          description,
          handler: (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            onResult({
              type: "success",
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
          },
          modal: {
            ondismiss: () => onResult({ type: "dismiss" }),
          },
        });
        rzp.on("payment.failed", (response) => onResult({ type: "failed", error: response.error }));
        rzp.open();
      })
      .catch((error) => {
        if (!cancelled) onResult({ type: "failed", error });
      });

    return () => {
      cancelled = true;
    };
  }, [visible, keyId, orderId, amount, currency, name, description, onResult]);

  useEffect(() => {
    if (!visible) openedForOrderRef.current = null;
  }, [visible]);

  // Razorpay renders its own popup directly on the page — nothing for this
  // component itself to render.
  return null;
}
