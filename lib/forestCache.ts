import { forestApi, isNetworkError, type ForestStatus } from "./api";
import { packForestStatus, unpackForestStatus } from "./forestView";
import { secureGetItem, secureRemoveItem, secureSetItem } from "./secureStorage";

/**
 * The Forest screen's offline copy (stale-while-revalidate) and its queue of
 * waterings made offline.
 *
 * Where it's kept: lib/secureStorage.ts (OS keystore), not AsyncStorage. The
 * status is derived from health logs (which days you logged, your care
 * streak), so it follows the "health data on the phone" rule. It's packed to
 * well under 2 KB (`packForestStatus`), which the keystore handles fine.
 *
 * One slot per phone, stamped with the account id; `clearForestCache()` runs
 * from AuthProvider's per-account clear (sign-out, or a different account
 * signing in). A copy for another account is ignored.
 */

const CACHE_KEY = "period-buddy.forest-cache";
const QUEUE_KEY = "period-buddy.forest-queue";

/** Last status per account in memory, so reopening the screen draws instantly. */
let memory: { userId: string; status: ForestStatus; savedAt: number } | null = null;
/** Bumped by clearForestCache so a write already in flight can't bring the old copy back. */
let generation = 0;

export function peekForestCache(userId: string): { status: ForestStatus; savedAt: number } | null {
  return memory && memory.userId === userId ? { status: memory.status, savedAt: memory.savedAt } : null;
}

export async function readForestCache(userId: string): Promise<{ status: ForestStatus; savedAt: number } | null> {
  const hit = peekForestCache(userId);
  if (hit) return hit;
  const gen = generation;
  try {
    const raw = await secureGetItem(CACHE_KEY);
    const unpacked = raw ? unpackForestStatus(JSON.parse(raw), userId) : null;
    if (unpacked && gen === generation) memory = { userId, ...unpacked };
    return unpacked;
  } catch {
    return null;
  }
}

export async function writeForestCache(userId: string, status: ForestStatus, savedAt = Date.now()): Promise<void> {
  memory = { userId, status, savedAt };
  const gen = generation;
  try {
    const value = JSON.stringify(packForestStatus(status, userId, savedAt));
    if (gen === generation) await secureSetItem(CACHE_KEY, value);
  } catch {
    // Best effort: the server is the source of truth.
  }
}

/** Shows an offline change on screen without claiming it came from the server (keeps `savedAt`). */
export function patchForestMemory(userId: string, status: ForestStatus) {
  if (memory && memory.userId === userId) memory = { ...memory, status };
}

type WaterQueue = { u: string; dates: string[] };

async function readQueue(userId: string): Promise<string[]> {
  try {
    const raw = await secureGetItem(QUEUE_KEY);
    const q = raw ? (JSON.parse(raw) as WaterQueue) : null;
    return q && q.u === userId && Array.isArray(q.dates) ? q.dates.filter((d) => typeof d === "string") : [];
  } catch {
    return [];
  }
}

async function writeQueue(userId: string, dates: string[]) {
  try {
    if (dates.length) await secureSetItem(QUEUE_KEY, JSON.stringify({ u: userId, dates } satisfies WaterQueue));
    else await secureRemoveItem(QUEUE_KEY);
  } catch {
    // Best effort.
  }
}

/** Days with a watering still waiting to reach the server. */
export function queuedWaterings(userId: string): Promise<string[]> {
  return readQueue(userId);
}

/** Remembers a watering that couldn't reach the server (one per day; the server's upsert is idempotent too). */
export async function queueWatering(userId: string, dateKey: string): Promise<void> {
  const gen = generation;
  const dates = await readQueue(userId);
  if (gen !== generation || dates.includes(dateKey)) return;
  await writeQueue(userId, [...dates, dateKey].slice(-14));
}

let flushing: Promise<ForestStatus | null> | null = null;

/**
 * Sends queued waterings, oldest first. Stops at the first connectivity
 * failure (they stay queued) and drops one the server refuses outright.
 * Returns the newest status the server sent back, or null if nothing was
 * queued; throws the connectivity error if none could be sent.
 */
export function flushWaterings(userId: string, todayKey: string): Promise<ForestStatus | null> {
  if (flushing) return flushing;
  flushing = (async () => {
    const gen = generation;
    let dates = await readQueue(userId);
    let latest: ForestStatus | null = null;
    let offlineError: unknown = null;
    while (dates.length && gen === generation) {
      const [dateKey] = dates;
      try {
        const result = await forestApi.logCare(
          { careType: "water", dateKey, today: todayKey, note: "Watered from the app (synced later)" },
          { timeoutMs: 12000 },
        );
        latest = result.status;
      } catch (err) {
        if (isNetworkError(err)) {
          offlineError = err;
          break;
        }
      }
      // Re-read so a watering queued meanwhile isn't lost.
      dates = (await readQueue(userId)).filter((d) => d !== dateKey);
      if (gen === generation) await writeQueue(userId, dates);
    }
    // Nothing got through: let the caller know it's offline.
    if (offlineError && !latest) throw offlineError;
    return latest;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Per-account clear (AuthProvider): the offline copy and any queued waterings. */
export function clearForestCache(): void {
  generation += 1;
  memory = null;
  secureRemoveItem(CACHE_KEY).catch(() => {});
  secureRemoveItem(QUEUE_KEY).catch(() => {});
}
