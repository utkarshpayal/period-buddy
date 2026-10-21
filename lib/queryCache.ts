/**
 * App-wide response cache for GET data (stale-while-revalidate), so a screen
 * opened a second time paints instantly from what it loaded before and
 * refetches quietly, and two screens asking for the same thing at once share
 * one request. Used by hooks/useAsyncLoad.ts (`cacheKey` option).
 *
 * - Entries are keyed by a string ("cycle:predictions", "blogs:list:all").
 * - `staleMs`: younger entries are served without a refetch.
 * - `topics`: a mutation on one of them (lib/data-sync.ts) marks the entry
 *   stale (kept, so screens still paint, but the next read refetches).
 * - `persist`: also kept on the device (public CMS content only, never
 *   per-account data), so a cold start paints before the network answers.
 * - `clearQueryCache()` drops everything (sign-out / account switch).
 *
 * No React in here: unit-tested in lib/__tests__/queryCache.test.ts.
 */
import { subscribeDataChange, type DataTopic } from "./data-sync";

export type CacheOptions = {
  staleMs?: number;
  topics?: DataTopic[];
  persist?: boolean;
};

type Entry<T = unknown> = {
  data?: T;
  /** When `data` was fetched; 0 = stale (invalidated or loaded from disk). */
  fetchedAt: number;
  hasData: boolean;
  promise?: Promise<T>;
  /**
   * Bumped whenever the entry is invalidated, so a request that was already in
   * flight (and may carry pre-mutation data) is neither shared with the next
   * read nor stamped fresh when it lands.
   */
  version: number;
  topics: DataTopic[];
  persist: boolean;
};

type Listener = (data: unknown) => void;

/** Minimal AsyncStorage-shaped store, injected so this file stays testable. */
export type PersistStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: readonly string[]): Promise<void>;
};

export const DEFAULT_STALE_MS = 60_000;
const PERSIST_PREFIX = "nura.qc.";
/** A persisted copy older than this is ignored (content may have moved on a lot). */
const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<Listener>>();
let store: PersistStore | null = null;
/** Bumped by clearQueryCache so a fetch started before sign-out never writes back. */
let generation = 0;

export function configureQueryPersistence(next: PersistStore | null) {
  store = next;
}

function markStale(entry: Entry) {
  entry.fetchedAt = 0;
  entry.promise = undefined;
  entry.version += 1;
}

subscribeDataChange((topics) => {
  for (const entry of entries.values()) {
    if (entry.topics.some((topic) => topics.has(topic))) markStale(entry);
  }
});

function entryFor(key: string, options: CacheOptions): Entry {
  let entry = entries.get(key);
  if (!entry) {
    entry = { fetchedAt: 0, hasData: false, version: 0, topics: options.topics ?? [], persist: Boolean(options.persist) };
    entries.set(key, entry);
  } else {
    if (options.topics) entry.topics = options.topics;
    if (options.persist) entry.persist = true;
  }
  return entry;
}

/** The cached value (fresh or stale), or undefined. */
export function peekQuery<T>(key: string): T | undefined {
  const entry = entries.get(key);
  return entry?.hasData ? (entry.data as T) : undefined;
}

export function isQueryFresh(key: string, staleMs = DEFAULT_STALE_MS, now = Date.now()): boolean {
  const entry = entries.get(key);
  return Boolean(entry?.hasData && entry.fetchedAt > 0 && now - entry.fetchedAt < staleMs);
}

/** Puts a value in the cache and tells every subscriber (optimistic updates, or data fetched elsewhere). */
export function setQueryData<T>(key: string, data: T, options: CacheOptions = {}) {
  const entry = entryFor(key, options);
  entry.data = data;
  entry.hasData = true;
  entry.fetchedAt = Date.now();
  listeners.get(key)?.forEach((listener) => listener(data));
  if (entry.persist && store) {
    store.setItem(PERSIST_PREFIX + key, JSON.stringify({ at: entry.fetchedAt, data })).catch(() => {});
  }
}

/** Marks entries stale. With no argument, every entry. A prefix ends with ":" ("blogs:"). */
export function invalidateQueries(keyOrPrefix?: string) {
  for (const [key, entry] of entries) {
    if (!keyOrPrefix || key === keyOrPrefix || (keyOrPrefix.endsWith(":") && key.startsWith(keyOrPrefix))) {
      markStale(entry);
    }
  }
}

/**
 * Returns the cached value when fresh; otherwise fetches (sharing a request
 * already in flight for the same key) and caches the result. `force` skips
 * the freshness check but still shares an in-flight request.
 */
export function fetchQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions & { force?: boolean } = {},
): Promise<T> {
  const entry = entryFor(key, options) as Entry<T>;
  if (!options.force && isQueryFresh(key, options.staleMs ?? DEFAULT_STALE_MS)) {
    return Promise.resolve(entry.data as T);
  }
  if (entry.promise) return entry.promise;
  const startedIn = generation;
  const startedAt = entry.version;
  const current = () => entries.get(key) === entry && entry.version === startedAt;
  const promise = fetcher().then(
    (data) => {
      // Invalidated mid-flight: the caller still gets its answer, but the
      // cache doesn't keep it (the next read refetches).
      if (current()) {
        entry.promise = undefined;
        if (startedIn === generation) setQueryData(key, data, options);
      }
      return data;
    },
    (err) => {
      if (current()) entry.promise = undefined;
      throw err;
    },
  );
  entry.promise = promise;
  return promise;
}

/** Called with the new value whenever this key is set (by any screen). */
export function subscribeQuery(key: string, listener: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

/**
 * Loads a persisted copy into memory (as stale, so it is shown and then
 * revalidated). Resolves to the value, or undefined if there is none.
 */
export async function hydrateQuery<T>(key: string, now = Date.now()): Promise<T | undefined> {
  const existing = entries.get(key);
  if (existing?.hasData) return existing.data as T;
  if (!store) return undefined;
  try {
    const raw = await store.getItem(PERSIST_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { at: number; data: T };
    if (!parsed || typeof parsed.at !== "number" || now - parsed.at > PERSIST_MAX_AGE_MS) return undefined;
    const entry = entryFor(key, { persist: true });
    // A real fetch may have landed while we were reading the disk.
    if (entry.hasData) return entry.data as T;
    entry.data = parsed.data;
    entry.hasData = true;
    entry.fetchedAt = 0;
    listeners.get(key)?.forEach((listener) => listener(parsed.data));
    return parsed.data;
  } catch {
    return undefined;
  }
}

/** Drops every entry, in memory and on the device (sign-out, account switch). */
export function clearQueryCache() {
  generation += 1;
  entries.clear();
  if (store) {
    const s = store;
    s.getAllKeys()
      .then((keys) => s.multiRemove(keys.filter((key) => key.startsWith(PERSIST_PREFIX))))
      .catch(() => {});
  }
}
