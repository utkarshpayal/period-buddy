import { Share } from "react-native";

// With the app installed, Android App Links open this URL straight in the app
// (app/+native-intent.tsx → lib/deeplink.ts). Otherwise it loads the marketing
// site's /app page (The-Nura-Marketing-Website/src/pages/AppRedirect.jsx),
// which re-launches the app via thenura://<deeplink> or falls back to the
// Play Store listing. Every `deeplink` route must be listed in
// lib/deeplink.ts#SHAREABLE_ROUTES.
const APP_LINK_BASE = "https://thenura.care/app";

/**
 * Builds a share link that opens this app if it's installed, or the Play
 * Store listing if it isn't. `deeplink` is an optional in-app path (e.g.
 * "partner-connect?code=ABC123") to resume once the app opens.
 */
export function buildAppShareLink(deeplink?: string) {
  return deeplink
    ? `${APP_LINK_BASE}?deeplink=${encodeURIComponent(deeplink)}`
    : APP_LINK_BASE;
}

/** Shares `message` followed by a link that opens the app (or the Play Store). */
export async function shareWithAppLink(message: string, deeplink?: string) {
  const link = buildAppShareLink(deeplink);
  await Share.share({
    message: `${message}\n\n${link}`,
    url: link,
  });
}
