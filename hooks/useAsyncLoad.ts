import { useCallback, useEffect, useRef, useState } from "react";
import { getFriendlyErrorMessage, isNetworkError } from "../lib/api";
import type { DataTopic } from "../lib/data-sync";
import { fetchQuery, hydrateQuery, isQueryFresh, peekQuery, subscribeQuery, DEFAULT_STALE_MS } from "../lib/queryCache";
import { useDataRefresh } from "./useDataRefresh";

export function useAsyncLoad<T>(
  fetcher: () => Promise<T>,
  deps: any[] = [],
  options: {
    /** Silently refetch when any of these change elsewhere in the app —
     * see hooks/useDataRefresh.ts. With `cacheKey`, they also mark the
     * cached copy stale. */
    refreshOn?: DataTopic[];
    /**
     * Shares the result through lib/queryCache.ts: a later mount (or another
     * screen using the same key) paints the cached copy at once and only
     * refetches once it is older than `staleMs`. Must include anything the
     * fetcher depends on (ids, filters). Omit for data that must always be live.
     */
    cacheKey?: string;
    /** Default 60 s. */
    staleMs?: number;
    /** Also keep the copy on the device (public content only, never account data). */
    persist?: boolean;
  } = {},
) {
  const { cacheKey, staleMs = DEFAULT_STALE_MS, persist, refreshOn } = options;
  const cached = cacheKey ? peekQuery<T>(cacheKey) : undefined;
  const [data, setData] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lets screens show an "offline" affordance distinct from a generic failure.
  const [offline, setOffline] = useState(false);
  const hasDataRef = useRef(cached !== undefined);
  hasDataRef.current = data !== null;
  // Only the newest request may write state, so a slow older response (e.g.
  // the previous month after the user flipped forward) can't overwrite it.
  const requestIdRef = useRef(0);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const cacheOptions = { staleMs, topics: refreshOn, persist };
  const cacheOptionsRef = useRef(cacheOptions);
  cacheOptionsRef.current = cacheOptions;

  const run = useCallback(
    (force: boolean) =>
      cacheKey
        ? fetchQuery(cacheKey, () => fetcherRef.current(), { ...cacheOptionsRef.current, force })
        : fetcherRef.current(),
    [cacheKey],
  );

  // Another screen (or a background refetch) updated the same key.
  useEffect(() => {
    if (!cacheKey) return;
    return subscribeQuery(cacheKey, (value) => {
      setData(value as T);
      setLoading(false);
      setError(null);
      setOffline(false);
    });
  }, [cacheKey]);

  const reload = useCallback(
    async (isRefresh = false) => {
      const id = ++requestIdRef.current;
      const latest = () => id === requestIdRef.current;
      try {
        if (isRefresh) setRefreshing(true);
        // A cached copy stays on screen while it revalidates.
        else if (!hasDataRef.current) setLoading(true);
        setError(null);
        setOffline(false);
        const result = await run(true);
        if (latest()) setData(result);
      } catch (err) {
        // Keep showing cached data if we have it; the error only matters with nothing to show.
        if (latest() && (!hasDataRef.current || isRefresh)) {
          setError(getFriendlyErrorMessage(err));
          setOffline(isNetworkError(err));
        }
      } finally {
        if (latest()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run, ...deps],
  );

  useEffect(() => {
    let cancelled = false;
    const supersede = () => {
      requestIdRef.current += 1;
    };
    if (!cacheKey) {
      void reload();
      return supersede;
    }
    const current = peekQuery<T>(cacheKey);
    if (current !== undefined) {
      setData(current);
      setLoading(false);
      if (isQueryFresh(cacheKey, staleMs)) return supersede;
      void reload();
      return supersede;
    }
    hasDataRef.current = false;
    setData(null);
    if (!persist) {
      void reload();
      return supersede;
    }
    // Paint the device copy first (if any), then revalidate.
    void hydrateQuery<T>(cacheKey).then((stored) => {
      if (cancelled) return;
      if (stored !== undefined) {
        hasDataRef.current = true;
        setData(stored);
        setLoading(false);
      }
      void reload();
    });
    return () => {
      cancelled = true;
      supersede();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  // Background refetch: no loader or spinner, and a failure keeps whatever
  // is already on screen instead of swapping it for an error state.
  const silentReload = useCallback(async () => {
    const id = ++requestIdRef.current;
    try {
      const result = await run(true);
      if (id !== requestIdRef.current) return;
      setData(result);
      setError(null);
      setOffline(false);
    } catch {
      // keep existing data
    }
  }, [run]);

  useDataRefresh(refreshOn ?? [], silentReload);

  return { data, loading, refreshing, error, offline, reload };
}
