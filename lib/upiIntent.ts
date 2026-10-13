/**
 * UPI apps the payment sheet (components/PaymentSheet.tsx) offers, and how to
 * open each one with a `upi://pay?…` link. `probe` is checked with
 * Linking.canOpenURL to show only installed apps; `prefix` replaces `upi://`
 * so the tapped app opens instead of the system chooser (null = only plain
 * upi://). Every scheme here must be in plugins/withUpiAppQueries.js and in
 * app.json's iOS LSApplicationQueriesSchemes.
 */
export type UpiAppId = "phonepe" | "gpay" | "paytm" | "cred" | "bhim";

export type UpiApp = {
  id: UpiAppId;
  name: string;
  packageName: string;
  probe: string;
  prefix: string | null;
  /** Tile colour (the app's own brand colour). */
  color: string;
};

export const UPI_APPS: UpiApp[] = [
  { id: "phonepe", name: "PhonePe", packageName: "com.phonepe.app", probe: "phonepe://", prefix: "phonepe://", color: "#5F259F" },
  { id: "gpay", name: "Google Pay", packageName: "com.google.android.apps.nbu.paisa.user", probe: "tez://", prefix: "tez://upi/", color: "#1A73E8" },
  { id: "paytm", name: "Paytm", packageName: "net.one97.paytm", probe: "paytmmp://", prefix: "paytmmp://", color: "#00B9F1" },
  { id: "cred", name: "CRED", packageName: "com.dreamplug.androidapp", probe: "credpay://", prefix: "credpay://upi/", color: "#1C1C1C" },
  { id: "bhim", name: "BHIM", packageName: "in.org.npci.upiapp", probe: "bhim://", prefix: null, color: "#F37021" },
];

/** `upi://pay?…` (or `upi://upi/pay?…`) as the given app's own link. */
export function appUpiUrl(app: UpiApp, upiUrl: string): string {
  const match = /^upi:\/\/(?:upi\/)?(.*)$/i.exec(upiUrl);
  return app.prefix && match ? app.prefix + match[1] : upiUrl;
}

/**
 * The links Cashfree's Order Pay API returns for a UPI intent (`channel:
 * "link"`) payment: `data.payload` holds `default` (plain upi://) and, per
 * API version, app keys like `gpay`/`phonepe`/`paytm`/`bhim`; some versions
 * only give `data.url`. Returns null when there is no usable link.
 */
export function parseUpiIntentLinks(response: unknown): { defaultUrl: string; apps: Partial<Record<UpiAppId, string>> } | null {
  const data = (response as { data?: { url?: unknown; payload?: unknown } } | null)?.data;
  const payload = data?.payload && typeof data.payload === "object" ? (data.payload as Record<string, unknown>) : {};
  const links = Object.entries(payload).filter((entry): entry is [string, string] => typeof entry[1] === "string" && /^[a-z]+:\/\//i.test(entry[1]));
  const isUpi = (url: string) => /^upi:\/\//i.test(url);
  const defaultUrl =
    (typeof payload.default === "string" && isUpi(payload.default) ? payload.default : undefined) ??
    (typeof data?.url === "string" && isUpi(data.url) ? data.url : undefined) ??
    links.find(([, url]) => isUpi(url))?.[1];
  if (!defaultUrl) return null;
  const apps: Partial<Record<UpiAppId, string>> = {};
  for (const app of UPI_APPS) {
    const own = payload[app.id];
    if (typeof own === "string" && own) apps[app.id] = own;
  }
  return { defaultUrl, apps };
}

/** The URLs to try, in order, to pay with `app`: its own link, then plain upi:// (the system chooser). */
export function upiAppLaunchUrls(app: UpiApp | null, links: { defaultUrl: string; apps: Partial<Record<UpiAppId, string>> }): string[] {
  if (!app) return [links.defaultUrl];
  const own = links.apps[app.id] ?? appUpiUrl(app, links.defaultUrl);
  return own === links.defaultUrl ? [own] : [own, links.defaultUrl];
}

/**
 * Android `intent://pay?…#Intent;scheme=upi;package=…;end` links (from
 * Cashfree's hosted checkout, CashfreeCheckoutModal) can't go through
 * Linking.openURL (React Native doesn't parse intent: URIs), so they are
 * turned back into links the OS can open: the tapped app's own scheme first,
 * then plain `upi://pay?…`. Anything that isn't an intent: link is returned as is.
 */
export function upiLaunchUrls(url: string): string[] {
  const match = /^intent:\/\/([^#]*)#Intent;(.*)$/i.exec(url);
  if (!match) return [url];
  const path = match[1];
  const scheme = /(?:^|;)scheme=([^;]+)/i.exec(match[2])?.[1] ?? "upi";
  const pkg = /(?:^|;)package=([^;]+)/i.exec(match[2])?.[1];
  const urls: string[] = [];
  const prefix = UPI_APPS.find((app) => app.packageName === pkg)?.prefix;
  if (prefix) urls.push(prefix + path.replace(/^upi\//i, ""));
  urls.push(`${scheme}://${path}`);
  return urls;
}
