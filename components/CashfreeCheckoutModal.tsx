import React, { useMemo } from "react";
import { ActivityIndicator, Modal, View } from "react-native";
import { WebView } from "react-native-webview";
import { useTheme } from "./theme";

export type CashfreeResult =
  | { type: "success"; orderId: string }
  | { type: "failed"; error?: unknown }
  | { type: "dismiss" };

type Props = {
  visible: boolean;
  /** "sandbox" while period-buddy-be is on Cashfree test credentials, "production" once live. */
  mode: "sandbox" | "production";
  orderId: string;
  paymentSessionId: string;
  onResult: (result: CashfreeResult) => void;
};

/**
 * Cashfree's JS SDK (v3) runs entirely inside a webpage — same reason
 * RazorpayCheckoutModal uses a WebView instead of a native SDK (no New
 * Architecture support to rely on for a native module here either), so this
 * mirrors that component's shape. `checkout()` resolves in-page for a
 * `_modal` target (no redirect/return URL needed), unlike Razorpay's
 * handler-callback style. Cashfree's flow surfaces UPI (intent + collect),
 * cards, netbanking, and wallets automatically — no separate UPI wiring
 * needed here, same as Razorpay's default checkout.
 */
export function CashfreeCheckoutModal({ visible, mode, orderId, paymentSessionId, onResult }: Props) {
  const { colors } = useTheme();

  const html = useMemo(() => {
    return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;background:transparent">
    <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
    <script>
      try {
        var cashfree = Cashfree({ mode: ${JSON.stringify(mode)} });
        cashfree.checkout({
          paymentSessionId: ${JSON.stringify(paymentSessionId)},
          redirectTarget: "_modal",
        }).then(function (result) {
          if (result && result.error) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: "failed", error: result.error }));
          } else if (result && result.paymentDetails) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: "success", orderId: ${JSON.stringify(orderId)} }));
          } else {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: "dismiss" }));
          }
        }).catch(function (error) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "failed", error: String(error) }));
        });
      } catch (error) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "failed", error: String(error) }));
      }
    </script>
  </body>
</html>`;
  }, [mode, orderId, paymentSessionId]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => onResult({ type: "dismiss" })}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}>
        <WebView
          originWhitelist={["*"]}
          source={{ html }}
          onMessage={(event) => {
            try {
              onResult(JSON.parse(event.nativeEvent.data));
            } catch {
              onResult({ type: "dismiss" });
            }
          }}
          startInLoadingState
          renderLoading={() => (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
          style={{ flex: 1, backgroundColor: "transparent" }}
        />
      </View>
    </Modal>
  );
}
