// Store links a push notification (or the update prompt) may open. Pure, so
// it's unit-tested (lib/__tests__/storeLink.test.ts); the Linking side lives
// in lib/notifications.ts (openStoreLink).
//
// Same allowlist as period-buddy-be's utils/notificationRoute.js
// (isAllowedStoreUrl): https://play.google.com/…, market://… and
// https://apps.apple.com/…, nothing else, so a push can never open an
// arbitrary website or a code-running scheme.

export type StorePlatform = "android" | "ios" | "web" | string;

const STORE_URL_MAX = 500;

// Plain regexes rather than `new URL()`: React Native's URL polyfill doesn't
// implement every getter. The host must be followed by "/", "?" or the end,
// so "play.google.com.evil.com", ports and "user@" credentials don't match.
const HTTPS_STORE = /^https:\/\/(play\.google\.com|apps\.apple\.com)(?:[/?][^\s]*)?$/;
const MARKET = /^market:\/\/[A-Za-z0-9][^\s]*$/;

export function isAllowedStoreUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > STORE_URL_MAX || /\s/.test(value)) return false;
  return HTTPS_STORE.test(value) || MARKET.test(value);
}

const isAppleUrl = (v: string) => /^https:\/\/apps\.apple\.com\//.test(v);

/**
 * The store link a notification's data asks to open on this platform, or
 * null (then the tap falls back to normal in-app routing). iPhones prefer
 * `iosStoreUrl`; everyone else prefers `storeUrl`; a link for the other
 * store is only used when nothing else is there.
 */
export function notificationStoreUrl(data: Record<string, unknown> | null | undefined, platform: StorePlatform): string | null {
  if (!data) return null;
  const links = [data.storeUrl, data.iosStoreUrl].filter(isAllowedStoreUrl);
  if (links.length === 0) return null;
  if (platform === "ios") return links.find(isAppleUrl) ?? links[0];
  return links.find((l) => !isAppleUrl(l)) ?? links[0];
}

/**
 * URLs to try in order. On Android a Play Store link opens the Play app
 * (`market://details?…`) first and falls back to the https page; a
 * `market://` link falls back to its https equivalent (no Play app, e.g. a
 * de-Googled phone). Anything else is opened as-is.
 */
export function storeUrlCandidates(url: string, platform: StorePlatform): string[] {
  if (!isAllowedStoreUrl(url)) return [];
  const market = /^market:\/\/details\?(.*)$/.exec(url);
  if (market) return [url, `https://play.google.com/store/apps/details?${market[1]}`];
  const play = /^https:\/\/play\.google\.com\/store\/apps\/details(\?[^#\s]+)/.exec(url);
  if (platform === "android" && play) return [`market://details${play[1]}`, url];
  return [url];
}
