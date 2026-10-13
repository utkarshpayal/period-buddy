import React, { useMemo } from "react";
import { ActivityIndicator, Linking, Modal, View } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./theme";
import { alert } from "../lib/alert";
import { upiLaunchUrls } from "../lib/upiIntent";
import { AppModalHost } from "./modals/AppModalHost";

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
 * mirrors that component's shape. `checkout()` resolves in-page via
 * postMessage for cards/UPI Collect under a `_modal` target, unlike
 * Razorpay's handler-callback style — but netbanking, wallets, and "other
 * UPI app" still redirect the page itself, so `handleShouldStartLoad` below
 * covers those: it intercepts navigation to order_meta.return_url as a
 * second success signal, and hands off non-http(s) UPI-app URLs to the OS
 * (a bare WebView can't launch those on its own). Cashfree's flow surfaces
 * UPI (intent + collect), cards, netbanking, and wallets automatically — no
 * separate UPI wiring needed here, same as Razorpay's default checkout.
 */
export function CashfreeCheckoutModal({ visible, mode, orderId, paymentSessionId, onResult }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

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

  // Cards and UPI Collect resolve entirely inside the `_modal` iframe, so
  // the checkout()/postMessage path above is all they need. Netbanking,
  // wallets, and "pay via other UPI app" don't — they hand off to a real
  // bank page or external app and only signal completion by navigating back
  // to order_meta.return_url (see cashfreeClient.js#createOrder). Without
  // this handler that hand-off either lands on a page whose JS context has
  // nothing wired to postMessage (checkout looks "stuck" after a successful
  // payment), or — for a non-http(s) UPI app scheme — never navigates the
  // WebView at all (tapping the UPI app does nothing).
  // Only intercept schemes we actually recognize as "hand this to a UPI
  // app" — defaulting to "block anything non-http(s)" instead would also
  // swallow the WebView's own internal navigations (about:blank, data:/blob:
  // URIs some pages use for embedded receipts/images, etc.), silently
  // breaking the checkout page itself on some platform/WebView versions.
  // Failing open (returning true, same as before this handler existed) for
  // anything unrecognized is a strictly smaller risk than failing closed.
  const UPI_APP_SCHEME = /^(upi|intent|tez|phonepe|paytmmp|paytm|bhim|gpay|googlepay|whatsapp|amazonpay|credpay):/i;

  const handleShouldStartLoad = (request: { url: string }): boolean => {
    const { url } = request;
    if (!url) return true;
    if (url.includes("/api/payments/return") && url.includes(orderId)) {
      onResult({ type: "success", orderId });
      return false;
    }
    if (UPI_APP_SCHEME.test(url)) {
      // Hand off to the OS so the actual UPI app launches instead of the
      // WebView silently no-op'ing on a scheme it can't navigate to.
      // Android 11+ can only see these apps because of the <queries> block
      // from plugins/withUpiAppQueries.js (iOS: LSApplicationQueriesSchemes).
      // An intent: link opens the app that was tapped, else plain upi://.
      void (async () => {
        for (const candidate of upiLaunchUrls(url)) {
          try {
            await Linking.openURL(candidate);
            return;
          } catch {
            /* not installed: try the next one */
          }
        }
        alert(
          "UPI app not found",
          "We couldn't open that UPI app on this phone. Try another app, or pay with your UPI ID.",
        );
      })();
      return false;
    }
    return true;
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => onResult({ type: "dismiss" })}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        <WebView
          originWhitelist={["*"]}
          source={{ html }}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
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
      <AppModalHost inline />
    </Modal>
  );
}
