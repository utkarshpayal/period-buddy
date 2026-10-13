import React from "react";

/**
 * Web build of PrescriptionDocumentView: react-native-webview has no web
 * implementation, so the page goes in a sandboxed iframe (no scripts).
 */
export function PrescriptionDocumentView({ html }: { html: string }) {
  return React.createElement("iframe", {
    srcDoc: html,
    sandbox: "",
    title: "Prescription",
    style: { border: 0, flex: 1, height: "100%", width: "100%", background: "transparent" },
  });
}
