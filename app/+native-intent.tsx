import { queueDeepLink, resolveDeepLink } from "../lib/deeplink";

/**
 * expo-router calls this for every URL that opens the app — cold start
 * (`initial: true`) and while running (`initial: false`) — before routing it.
 * https://docs.expo.dev/router/advanced/native-intent/
 *
 * Shared-content links (`https://thenura.care/app?deeplink=...` App Links and
 * `thenura://blogs?slug=...`) aren't routed here directly: the target is
 * queued and `AppShell` (app/_layout.tsx) pushes it once the user is signed in
 * and past the entry redirect. Returning "/" on a cold start lets the normal
 * index → dashboard flow run (and avoids the unmatched "/app" route); returning
 * "" while running tells expo-router not to navigate at all. See lib/deeplink.ts.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    const resolution = resolveDeepLink(path);
    if (!resolution.handled) return path;
    if (resolution.target) queueDeepLink(resolution.target);
    return initial ? "/" : "";
  } catch {
    return initial ? "/" : path;
  }
}
