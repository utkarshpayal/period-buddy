import React, { useMemo } from "react";
import { ActivityIndicator, Modal, View } from "react-native";
import { WebView } from "react-native-webview";
import { useTheme } from "./theme";

export type RazorpayResult =
  | { type: "success"; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
  | { type: "failed"; error?: unknown }
  | { type: "dismiss" };

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

/**
 * Razorpay's native RN SDK doesn't support the New Architecture, which this
 * app runs (and react-native-reanimated 4 requires) — so checkout instead
 * runs Razorpay's hosted checkout.js inside a WebView (react-native-webview
 * is already a dependency), same integration Razorpay documents for any
 * webview-capable platform. The page posts the result back via
 * `window.ReactNativeWebView.postMessage`.
 */
export function RazorpayCheckoutModal({
  visible,
  keyId,
  orderId,
  amount,
  currency,
  name,
  description,
  onResult,
}: Props) {
  const { colors } = useTheme();

  const html = useMemo(() => {
    const options = {
      key: keyId,
      amount,
      currency,
      order_id: orderId,
      name,
      description,
      theme: { color: colors.primary },
    };
    return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;background:transparent">
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <script>
      var options = ${JSON.stringify(options)};
      options.handler = function (response) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "success",
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        }));
      };
      options.modal = {
        ondismiss: function () {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "dismiss" }));
        }
      };
      var rzp = new Razorpay(options);
      rzp.on("payment.failed", function (response) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "failed", error: response.error }));
      });
      rzp.open();
    </script>
  </body>
</html>`;
  }, [keyId, orderId, amount, currency, name, description, colors.primary]);

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
