import { useCallback, useEffect, useRef, useState } from "react";
import { getFriendlyErrorMessage, isNetworkError } from "../lib/api";
import type { DataTopic } from "../lib/data-sync";
import { useDataRefresh } from "./useDataRefresh";

export type PageResult<T> = {
  items: T[];
  /** Whether a further page exists — usually `pagination.page < pagination.pages`. */
  hasMore: boolean;
};

type Options<T> = {
  /** Stable identity per item, used to drop duplicates when page boundaries
   * shift (new items arriving at the top push old ones onto the next page). */
  getKey?: (item: T) => string;
  /** Quietly refresh when any of these change (see hooks/useDataRefresh.ts). */
  refreshOn?: DataTopic[];
};

const defaultKey = (item: unknown) => String((item as { _id?: string; id?: string })._id ?? (item as { id?: string }).id);

function mergeUnique<T>(first: T[], rest: T[], getKey: (item: T) => string) {
  const seen = new Set(first.map(getKey));
  return first.concat(rest.filter((item) => !seen.has(getKey(item))));
}

/**
 * Page-based list with a "Show more" button (components/LoadMoreButton.tsx)
 * or infinite scroll. Mirrors useAsyncLoad's shape (loading/refreshing/error/
 * offline/reload) plus `hasMore`/`loadingMore`/`loadMore`.
 *
 * - `reload()` / pull-to-refresh start over from page 1.
 * - A failed `loadMore` keeps the list and `hasMore`, so the button can retry.
 * - A background refresh (`refreshOn`) re-fetches every page already shown
 *   and replaces the list, so items deleted elsewhere disappear without
 *   collapsing the list back to one page.
 */
export function usePaginatedList<T>(
  fetchPage: (page: number) => Promise<PageResult<T>>,
  deps: unknown[] = [],
  options: Options<T> = {},
) {
  const getKey = options.getKey ?? (defaultKey as (item: T) => string);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const pageRef = useRef(1);
  // Bumped on every reload, so a slow loadMore from the previous query
  // (e.g. before a filter change) can't append into the new list.
  const generationRef = useRef(0);
  const loadingMoreRef = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchRef = useCallback(fetchPage, deps);

  const reload = useCallback(
    async (isRefresh = false) => {
      const generation = ++generationRef.current;
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        setOffline(false);
        const result = await fetchRef(1);
        if (generation !== generationRef.current) return;
        pageRef.current = 1;
        setItems(result.items);
        setHasMore(result.hasMore);
      } catch (err) {
        if (generation !== generationRef.current) return;
        setError(getFriendlyErrorMessage(err));
        setOffline(isNetworkError(err));
      } finally {
        if (generation === generationRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [fetchRef],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    const generation = generationRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const result = await fetchRef(nextPage);
      if (generation !== generationRef.current) return;
      pageRef.current = nextPage;
      setItems((prev) => mergeUnique(prev, result.items, getKey));
      setHasMore(result.hasMore);
    } catch {
      // Keep the list and the button so the user can retry.
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRef, hasMore]);

  useDataRefresh(options.refreshOn ?? [], async () => {
    const generation = generationRef.current;
    const pages = pageRef.current;
    try {
      // Merging page 1 over the old list would keep items deleted on another
      // screen or device (tapping one opens a 404), so rebuild pages 1..N.
      let next: T[] = [];
      let more = false;
      let loaded = 0;
      while (loaded < pages) {
        const result = await fetchRef(loaded + 1);
        if (generation !== generationRef.current) return;
        loaded += 1;
        next = mergeUnique(next, result.items, getKey);
        more = result.hasMore;
        if (!more) break;
      }
      // A loadMore that landed meanwhile would be wiped; skip this refresh.
      if (pageRef.current !== pages) return;
      pageRef.current = loaded;
      setItems(next);
      setHasMore(more);
      setError(null);
      setOffline(false);
    } catch {
      // keep what's shown
    }
  });

  return {
    items,
    setItems,
    loading,
    refreshing,
    error,
    offline,
    hasMore,
    loadingMore,
    loadMore,
    reload,
  };
}
