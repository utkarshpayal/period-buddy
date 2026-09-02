import { useEffect, useRef } from "react";
import type { CashfreeResult } from "./CashfreeCheckoutModal";

export type { CashfreeResult } from "./CashfreeCheckoutModal";

type Props = {
  visible: boolean;
  mode: "sandbox" | "production";
  orderId: string;
  paymentSessionId: string;
  onResult: (result: CashfreeResult) => void;
};

type CashfreeCheckoutOptions = { paymentSessionId: string; redirectTarget: string };
type CashfreeCheckoutResult = { error?: unknown; paymentDetails?: unknown };
type CashfreeInstance = { checkout: (options: CashfreeCheckoutOptions) => Promise<CashfreeCheckoutResult> };
type CashfreeGlobal = (options: { mode: "sandbox" | "production" }) => CashfreeInstance;

declare global {
  interface Window {
    Cashfree?: CashfreeGlobal;
  }
}

const CHECKOUT_SCRIPT_SRC = "https://sdk.cashfree.com/js/v3/cashfree.js";

let checkoutScriptPromise: Promise<void> | null = null;
function loadCheckoutScript(): Promise<void> {
  if (window.Cashfree) return Promise.resolve();
  if (!checkoutScriptPromise) {
    checkoutScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = CHECKOUT_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load the Cashfree checkout script."));
      document.head.appendChild(script);
    });
  }
  return checkoutScriptPromise;
}

/**
 * Web counterpart to CashfreeCheckoutModal.tsx — same reason as
 * RazorpayCheckoutModal.web.tsx (react-native-webview has no web
 * implementation), loading the Cashfree SDK directly and rendering its
 * `_modal` checkout on the page instead of inside a WebView.
 */
export function CashfreeCheckoutModal({ visible, mode, orderId, paymentSessionId, onResult }: Props) {
  const openedForOrderRef = useRef<string | null>(null);

  useEffect(() => {
    if (!visible || openedForOrderRef.current === orderId) return;
    openedForOrderRef.current = orderId;

    let cancelled = false;
    loadCheckoutScript()
      .then(() => {
        if (cancelled || !window.Cashfree) return;
        const cashfree = window.Cashfree({ mode });
        return cashfree.checkout({ paymentSessionId, redirectTarget: "_modal" }).then((result) => {
          if (cancelled) return;
          if (result?.error) {
            onResult({ type: "failed", error: result.error });
          } else if (result?.paymentDetails) {
            onResult({ type: "success", orderId });
          } else {
            onResult({ type: "dismiss" });
          }
        });
      })
      .catch((error) => {
        if (!cancelled) onResult({ type: "failed", error });
      });

    return () => {
      cancelled = true;
    };
  }, [visible, mode, orderId, paymentSessionId, onResult]);

  useEffect(() => {
    if (!visible) openedForOrderRef.current = null;
  }, [visible]);

  return null;
}
