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
      script.onerror = () => {
        // Let the next attempt try again instead of replaying this failure.
        checkoutScriptPromise = null;
        script.remove();
        reject(new Error("Failed to load the Cashfree checkout script."));
      };
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
  // Callers pass a new onResult each render. Keeping it out of the effect's
  // deps stops a parent re-render from cancelling the open checkout (whose
  // result would then be dropped, since the re-run won't reopen this order).
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // Only an unmount cancels: a re-run of the effect below (StrictMode, or a
  // prop change for the same order) must not drop the result of the checkout
  // it already opened, since it won't open that order again.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!visible || openedForOrderRef.current === orderId) return;
    openedForOrderRef.current = orderId;

    const report = (result: CashfreeResult) => {
      if (mountedRef.current) onResultRef.current(result);
    };
    loadCheckoutScript()
      .then(() => {
        if (!mountedRef.current) return;
        if (!window.Cashfree) throw new Error("The Cashfree checkout didn't load.");
        const cashfree = window.Cashfree({ mode });
        return cashfree.checkout({ paymentSessionId, redirectTarget: "_modal" }).then((result) => {
          if (result?.error) {
            report({ type: "failed", error: result.error });
          } else if (result?.paymentDetails) {
            report({ type: "success", orderId });
          } else {
            report({ type: "dismiss" });
          }
        });
      })
      .catch((error) => report({ type: "failed", error }));
  }, [visible, mode, orderId, paymentSessionId]);

  useEffect(() => {
    if (!visible) openedForOrderRef.current = null;
  }, [visible]);

  return null;
}
