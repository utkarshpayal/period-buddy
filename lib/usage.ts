import { AppState } from "react-native";
import { analyticsAllowed } from "./analyticsConsent";
import { appConfigApi } from "./api";

/**
 * Feature usage for the App CMS's Usage page: `open` when a feature's screen
 * is visited (components/AppConfigSync.tsx), `tap` when its tile is tapped
 * (components/LaunchTileParts.tsx). Events are batched and sent every
 * FLUSH_MS, at MAX_BATCH, or when the app goes to the background.
 * Fire and forget: a failed send is dropped, never retried or surfaced.
 * Nothing is tracked for anyone under 18 (lib/analyticsConsent.ts).
 */
type UsageEvent = { itemKey: string; kind: "open" | "tap" };

const FLUSH_MS = 15_000;
const MAX_BATCH = 20;

let queue: UsageEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (queue.length === 0) return;
  const events = queue;
  queue = [];
  // Signed in as someone under 18 since these were queued.
  if (!analyticsAllowed()) return;
  appConfigApi.trackUsage(events).catch(() => undefined);
}

export function trackUse(itemKey: string, kind: UsageEvent["kind"]) {
  if (!analyticsAllowed()) return;
  queue.push({ itemKey, kind });
  if (queue.length >= MAX_BATCH) flush();
  else if (!timer) timer = setTimeout(flush, FLUSH_MS);
}

AppState.addEventListener("change", (state) => {
  if (state !== "active") flush();
});
