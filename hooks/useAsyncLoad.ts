import { useCallback, useEffect, useState } from "react";
import { getFriendlyErrorMessage, isNetworkError } from "../lib/api";

export function useAsyncLoad<T>(fetcher: () => Promise<T>, deps: any[] = []) {
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

  return { data, loading, refreshing, error, offline, reload };
}
