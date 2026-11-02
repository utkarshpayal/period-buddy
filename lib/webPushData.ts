/**
 * Push taps on web arrive from the service worker (public/sw.js): as a
 * `nura-push-tap` message to an open tab, or, when no tab is open, in the
 * `?nuraPush=` query of the page it opens. Pure parsing, unit-tested.
 */

export const WEB_PUSH_TAP_PARAM = "nuraPush";
export const WEB_PUSH_TAP_MESSAGE = "nura-push-tap";
export const WEB_PUSH_RECEIVED_MESSAGE = "nura-push-received";

/** The notification's `data` as a flat string record, or null if unusable. */
export function toPushData(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") out[key] = String(val);
  }
  return out;
}

/** `?nuraPush=<json>` from a page's query string. */
export function parseWebPushTapParam(search: string): Record<string, unknown> | null {
  const raw = new URLSearchParams(search.replace(/^\?/, "")).get(WEB_PUSH_TAP_PARAM);
  if (!raw || raw.length > 4000) return null;
  try {
    return toPushData(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** A service worker message, if it's one of ours. */
export function readWebPushMessage(
  message: unknown,
): { kind: "tap"; data: Record<string, unknown> } | { kind: "received" } | null {
  if (!message || typeof message !== "object") return null;
  const { type, data } = message as { type?: unknown; data?: unknown };
  if (type === WEB_PUSH_RECEIVED_MESSAGE) return { kind: "received" };
  if (type !== WEB_PUSH_TAP_MESSAGE) return null;
  const parsed = toPushData(data);
  return parsed ? { kind: "tap", data: parsed } : null;
}

/** Firebase web app config (lib/webPushConfig.ts reads it from the build). */
export type FirebaseWebConfig = {
  apiKey: string;
  appId: string;
  projectId: string;
  messagingSenderId: string;
  vapidKey: string;
};

const FIELDS: (keyof FirebaseWebConfig)[] = ["apiKey", "appId", "projectId", "messagingSenderId", "vapidKey"];

/** Merges env over app.json and returns null unless every field is set. */
export function resolveFirebaseWebConfig(
  fromAppJson: Partial<Record<keyof FirebaseWebConfig, unknown>> | undefined,
  fromEnv: Partial<Record<keyof FirebaseWebConfig, string | undefined>>,
): FirebaseWebConfig | null {
  const config = {} as FirebaseWebConfig;
  for (const field of FIELDS) {
    const env = fromEnv[field]?.trim();
    const json = fromAppJson?.[field];
    const value = env || (typeof json === "string" ? json.trim() : "");
    if (!value) return null;
    config[field] = value;
  }
  return config;
}
