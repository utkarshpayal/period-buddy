import * as Linking from "expo-linking";

/**
 * Resolves an incoming URL to an in-app router target, or `null` if expo-router's
 * own scheme-based linking should just handle it unchanged.
 *
 * `lib/share.ts` shares links shaped like `https://thenura.care/app?deeplink=<path>`
 * so the marketing site can fall back to the Play Store when the app isn't
 * installed (see `Marketing website/src/pages/AppRedirect.jsx`). When the app
 * *is* installed and opens straight from that https link (Universal
 * Links/App Links — see the `associatedDomains`/`intentFilters` in
 * app.json), the URL's path is just "/app", which isn't a real route — the
 * actual destination is packed into the `deeplink` query param (itself a
 * path with its own query string, e.g. "community?postId=abc123"). This
 * unwraps that one level so it lands on the real screen instead of a blank
 * "/app" route.
 *
 * Links opened via the bare custom scheme (`thenura://community?postId=abc123`)
 * don't need this — expo-router already routes those directly.
 */
export function resolveDeepLink(url: string): { pathname: string; params: Record<string, string> } | null {
  let parsed: Linking.ParsedURL;
  try {
    parsed = Linking.parse(url);
  } catch {
    return null;
  }

  const deeplink = parsed.queryParams?.deeplink;
  const encodedTarget = Array.isArray(deeplink) ? deeplink[0] : deeplink;
  if (parsed.path !== "app" || !encodedTarget) return null;

  const [path, queryString] = encodedTarget.split("?");
  if (!path) return null;

  const params: Record<string, string> = {};
  if (queryString) {
    new URLSearchParams(queryString).forEach((value, key) => {
      params[key] = value;
    });
  }

  return { pathname: `/${path}`, params };
}
