import { Share } from "react-native";

// Hosted on the marketing site (Marketing website/src/pages/AppRedirect.jsx).
// It tries the app's custom scheme first and falls back to the Play Store
// listing if the app isn't installed (see that file for the redirect logic).
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
