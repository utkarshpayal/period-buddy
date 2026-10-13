import React from "react";
import { WebView } from "react-native-webview";

/**
 * The rendered prescription page (an A4 HTML document from the backend),
 * read-only: no scripts, and nothing in it can navigate away.
 * The web build is PrescriptionDocumentView.web.tsx.
 */
export function PrescriptionDocumentView({ html }: { html: string }) {
  return (
    <WebView
      source={{ html }}
      originWhitelist={["about:*"]}
      javaScriptEnabled={false}
      onShouldStartLoadWithRequest={(req) => req.url.startsWith("about:")}
      style={{ flex: 1, backgroundColor: "transparent" }}
      showsVerticalScrollIndicator={false}
    />
  );
}
