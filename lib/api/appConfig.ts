import { analyticsAllowed } from "../analyticsConsent";
import { getDeviceId } from "../deviceId";
import { apiRequest, APP_PLATFORM, getToken } from "./client";

/**
 * Headers for the App CMS endpoints: who's asking (token when signed in, and
 * this install's id) and `X-Nura-Launch: 1`, which tells the backend this
 * build understands launch states. Without it the backend hides every item
 * that isn't plainly open, so older builds never show unfinished features.
 */
async function launchHeaders(): Promise<Record<string, string>> {
  const [token, deviceId] = await Promise.all([getToken(), getDeviceId()]);
  const headers: Record<string, string> = { "X-Device-Id": deviceId, "X-Nura-Launch": "1" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * App CMS layout (period-buddy-be `/api/app-config`, public). Parsed and
 * cached by components/app-config.tsx — screens read it via useAppConfig(),
 * never call this directly.
 *
 * The config is per viewer since launch states (rollout slice, testers,
 * "Notify me"), so the token rides along — attached by hand, with skipAuth,
 * so an expired session can never sign the user out from a background
 * config fetch (the backend's optionalAuth just ignores a bad token).
 */
export const appConfigApi = {
  get: async () =>
    apiRequest<unknown>("/api/app-config", { skipAuth: true, timeoutMs: 8000, headers: await launchHeaders() }),
  /** Join a Coming soon feature's "Notify me" list (itemKey: feature key or `link:<id>`). */
  notifyLaunch: async (itemKey: string) =>
    apiRequest<{ onList: boolean }>(`/api/app-config/launch/${encodeURIComponent(itemKey)}/notify`, {
      method: "POST",
      skipAuth: true,
      timeoutMs: 8000,
      headers: await launchHeaders(),
      // Same platform names as hooks/useViewer.ts, for the CMS's waitlist export.
      body: JSON.stringify({ platform: APP_PLATFORM }),
    }),
  /** Fire-and-forget: someone tapped a locked (Coming soon) tile. */
  /** Batched feature usage (lib/usage.ts): `open` = its screen was visited, `tap` = its tile was tapped. */
  trackUsage: async (events: { itemKey: string; kind: "open" | "tap" }[]) =>
    apiRequest<unknown>("/api/app-config/usage", {
      method: "POST",
      skipAuth: true,
      timeoutMs: 8000,
      headers: await launchHeaders(),
      body: JSON.stringify({ events }),
    }),
  trackLockedTap: async (itemKey: string) =>
    !analyticsAllowed()
      ? null
      : apiRequest<unknown>(`/api/app-config/launch/${encodeURIComponent(itemKey)}/tap`, {
      method: "POST",
      skipAuth: true,
      timeoutMs: 5000,
      headers: await launchHeaders(),
    }),
  // The three tracking calls send nothing for anyone under 18 (lib/analyticsConsent.ts).
  trackBannerClick: async (id: string) =>
    !analyticsAllowed()
      ? null
      : apiRequest<unknown>(`/api/app-config/banners/${encodeURIComponent(id)}/click`, {
      method: "POST",
      skipAuth: true,
      timeoutMs: 5000,
    }),
  trackBannerImpressions: async (ids: string[]) =>
    !analyticsAllowed()
      ? null
      : apiRequest<unknown>("/api/app-config/banners/impressions", {
      method: "POST",
      skipAuth: true,
      timeoutMs: 5000,
      body: JSON.stringify({ ids }),
    }),
};
