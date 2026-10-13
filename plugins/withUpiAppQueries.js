// Android 11+ hides other apps from this one unless the manifest declares
// them in <queries>. Cashfree's checkout (CashfreeCheckoutModal) hands UPI
// payments to GPay/PhonePe/Paytm/etc. through these schemes, and Cashfree
// asks for this block before it turns on UPI apps for a WebView checkout.
// iOS's equivalent is LSApplicationQueriesSchemes in app.json.
const { withAndroidManifest } = require("expo/config-plugins");

const UPI_SCHEMES = ["upi", "tez", "gpay", "phonepe", "paytmmp", "credpay", "bhim"];

module.exports = function withUpiAppQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const queries = manifest.queries?.[0] ?? {};
    const intents = queries.intent ?? [];
    const declared = new Set(
      intents.flatMap((intent) => (intent.data ?? []).map((d) => d.$?.["android:scheme"])),
    );
    for (const scheme of UPI_SCHEMES) {
      if (declared.has(scheme)) continue;
      intents.push({
        action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
        data: [{ $: { "android:scheme": scheme } }],
      });
    }
    queries.intent = intents;
    manifest.queries = [queries];
    return cfg;
  });
};
