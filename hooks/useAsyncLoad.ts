import { useCallback, useEffect, useState } from "react";
import { getFriendlyErrorMessage, isNetworkError } from "../lib/api";
import type { DataTopic } from "../lib/data-sync";
import { useDataRefresh } from "./useDataRefresh";

export function useAsyncLoad<T>(
  fetcher: () => Promise<T>,
  deps: any[] = [],
  options: {
    /** Silently refetch when any of these change elsewhere in the app —
     * see hooks/useDataRefresh.ts. */
    refreshOn?: DataTopic[];
  } = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lets screens show an "offline" affordance distinct from a generic failure.
  const [offline, setOffline] = useState(false);

  const reload = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setOffline(false);
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
      setOffline(isNetworkError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  // Background refetch: no loader or spinner, and a failure keeps whatever
  // is already on screen instead of swapping it for an error state.
  const silentReload = useCallback(async () => {
    try {
      const result = await fetcher();
      setData(result);
      setError(null);
      setOffline(false);
    } catch {
      // keep existing data
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useDataRefresh(options.refreshOn ?? [], silentReload);

  return { data, loading, refreshing, error, offline, reload };
}
