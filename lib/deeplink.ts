/**
 * Incoming shared-content links, end to end:
 *
 * 1. `lib/share.ts` shares `https://thenura.care/app?deeplink=<path>` where
 *    `<path>` is an in-app route + query, e.g. `blogs?slug=abc`.
 * 2. App installed + Android App Link verified (app.json `intentFilters`,
 *    `/.well-known/assetlinks.json` on the marketing site) → Android opens the
 *    app directly with that https URL. Otherwise the browser loads the
 *    marketing site's `/app` page (`src/pages/AppRedirect.jsx` in the
 *    marketing-website repo), which re-launches the app via
 *    `thenura://<path>` (an Android `intent://` URL) or falls back to the
 *    Play Store.
 * 3. Either URL shape reaches `app/+native-intent.tsx#redirectSystemPath`
 *    before expo-router routes anything. It calls `resolveDeepLink` below;
 *    for our links it queues the target here and tells expo-router to stay
 *    put (cold start → `/`, i.e. the normal index → dashboard redirect).
 * 4. `AppShell` in `app/_layout.tsx` watches this queue and `router.push`es
 *    the target once the navigator is ready, the user is signed in (a
 *    logged-out user is sent through login first and lands on it afterwards
 *    — the target stays queued in memory), and the entry-screen redirect has
 *    run, so Back returns to the dashboard.
 *
 * Only paths whose first segment is in `SHAREABLE_ROUTES` are treated as
 * shared content — anything else under the custom scheme (OAuth redirects,
 * dev-client URLs, ...) passes through to expo-router untouched. Add a route
 * here when you add a new share point.
 */

export type DeepLinkTarget = { pathname: string; params: Record<string, string> };

/** Route names (URL paths — route groups like `(app)` aren't part of them) a shared link may open. */
export const SHAREABLE_ROUTES = new Set([
  "blogs",
  "community",
  "government-scheme-detail",
  "government-schemes",
  "partner-connect",
  "reels",
  "symptom-checker",
]);

/** Deep-link targets that work without a session, so they're opened right away instead of after login. */
export const PUBLIC_DEEP_LINK_PATHS = new Set(["/partner-connect"]);

const APP_LINK_HOSTS = new Set(["thenura.care", "www.thenura.care"]);
const APP_SCHEME = "thenura";

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function parseQuery(query: string | undefined): Record<string, string> {
  const params: Record<string, string> = {};
  if (!query) return params;
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = safeDecode(eq === -1 ? pair : pair.slice(0, eq));
    if (key) params[key] = eq === -1 ? "" : safeDecode(pair.slice(eq + 1));
  }
  return params;
}

/** `"blogs?slug=abc"` / `"/blogs?slug=abc"` → a router target, or null if it isn't a shareable route. */
function toTarget(inAppPath: string): DeepLinkTarget | null {
  const withoutHash = inAppPath.split("#")[0];
  const q = withoutHash.indexOf("?");
  const rawPath = q === -1 ? withoutHash : withoutHash.slice(0, q);
  const query = q === -1 ? undefined : withoutHash.slice(q + 1);
  const path = rawPath.replace(/^\/+|\/+$/g, "");
  if (!path || !SHAREABLE_ROUTES.has(path)) return null;
  return { pathname: `/${path}`, params: parseQuery(query) };
}

/**
 * `{ handled: false }` — not one of our shared-content links; let expo-router
 * route it unchanged. `{ handled: true, target }` — ours; `target` is where to
 * go (null means "just open the app", e.g. a bare `https://thenura.care/app`
 * or a deeplink to a route that no longer exists).
 */
export type DeepLinkResolution =
  | { handled: false }
  | { handled: true; target: DeepLinkTarget | null };

export function resolveDeepLink(url: string): DeepLinkResolution {
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/i.exec(url.trim());
  if (!match) return { handled: false };
  const [, scheme, host, path, query] = match;

  // https://thenura.care/app?deeplink=<path> (App Link, or copied into the app some other way).
  if (/^https?$/i.test(scheme)) {
    if (!APP_LINK_HOSTS.has(host.toLowerCase()) || path.replace(/\/+$/, "") !== "/app") {
      return { handled: false };
    }
    const deeplink = parseQuery(query).deeplink;
    return { handled: true, target: deeplink ? toTarget(deeplink) : null };
  }

  // thenura://blogs?slug=abc (the host is the first path segment) or thenura:///blogs?slug=abc.
  if (scheme.toLowerCase() === APP_SCHEME) {
    const target = toTarget(`${host}${path}${query !== undefined ? `?${query}` : ""}`);
    return target ? { handled: true, target } : { handled: false };
  }

  return { handled: false };
}

// --- Pending target queue (written by +native-intent, consumed by AppShell) ---

let pendingDeepLink: DeepLinkTarget | null = null;
const listeners = new Set<() => void>();

export function queueDeepLink(target: DeepLinkTarget) {
  pendingDeepLink = target;
  listeners.forEach((listener) => listener());
}

export function getPendingDeepLink() {
  return pendingDeepLink;
}

export function clearPendingDeepLink() {
  pendingDeepLink = null;
  listeners.forEach((listener) => listener());
}

export function subscribePendingDeepLink(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
