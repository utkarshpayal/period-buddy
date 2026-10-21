import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../components/auth-context";
import { authApi, type DashboardSummary } from "../lib/api";
import { peekQuery, subscribeQuery } from "../lib/queryCache";
import { useDataRefresh } from "./useDataRefresh";

// authApi.getDashboard is cached in lib/queryCache under this key: ~13 stack
// screens mount this hook on every visit, and they share one request. The
// cache is dropped on sign-out and marked stale by any "dashboard" write.
const CACHE_KEY = "auth:dashboard";

export type UserStats = {
  /** Current streak in days. Sourced from the dashboard fetch first (freshest),
   * falling back to the cached auth-context user, then a default of 1 — this
   * mirrors the precedence home.tsx used before this hook centralized it. */
  streakCount: number;
  /** Wallet/points balance. `dashboard.tokens` is the same value the backend
   * computes for the dashboard's trophy chip, so it takes precedence; we fall
   * back to `walletBalance` on the (possibly stale) cached user object. The
   * deprecated `tokenEarned` field is intentionally never read here. */
  walletBalance: number;
  dashboard: DashboardSummary | null;
  isLoading: boolean;
  refresh: () => Promise<DashboardSummary | null>;
};

/**
 * Single source of truth for streak/wallet stats shown across screens
 * (home, profile, ...). Fetches the dashboard summary once, syncs the result
 * into auth-context via `updateUser`, and exposes derived values with a
 * consistent fallback precedence so screens never disagree on these numbers.
 */
export function useUserStats(): UserStats {
  const { isAuthenticated, user, updateUser } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(() =>
    isAuthenticated ? (peekQuery<DashboardSummary>(CACHE_KEY) ?? null) : null,
  );
  // Only block on a spinner when we have nothing at all to show yet — a
  // cache hit (even a stale one) renders immediately and revalidates quietly.
  const [isLoading, setIsLoading] = useState(() => isAuthenticated && peekQuery(CACHE_KEY) === undefined);

  // Any instance's fetch updates every mounted one.
  useEffect(
    () =>
      subscribeQuery(CACHE_KEY, (value) => {
        setDashboard(value as DashboardSummary);
        setIsLoading(false);
      }),
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const summary = await authApi.getDashboard({ force: true });
      setDashboard(summary);
      if (summary.user) {
        updateUser(summary.user);
      }
      return summary;
    } catch {
      setDashboard(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [updateUser]);

  // Mounted instances (every tab, screens under the current one) refetch
  // quietly — keeping the numbers already shown if that fails.
  useDataRefresh(["dashboard"], async () => {
    if (!isAuthenticated) return;
    try {
      const summary = await authApi.getDashboard();
      setDashboard(summary);
      if (summary.user) updateUser(summary.user);
    } catch {
      // keep existing stats
    }
  });

  useEffect(() => {
    // Signed out: queryCache was cleared, so the next signed-in user never
    // briefly sees the previous account's dashboard.
    if (!isAuthenticated) {
      setDashboard(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    (async () => {
      try {
        // Served from the cache while fresh; a shared request otherwise.
        const summary = await authApi.getDashboard();
        if (!isMounted) return;
        setDashboard(summary);
        if (summary.user) {
          updateUser(summary.user);
        }
      } catch {
        if (isMounted && peekQuery(CACHE_KEY) === undefined) setDashboard(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, updateUser]);

  const streakCount = dashboard?.user?.streakCount ?? user?.streakCount ?? 1;
  const walletBalance =
    dashboard?.tokens ??
    dashboard?.user?.walletBalance ??
    user?.walletBalance ??
    0;

  return { streakCount, walletBalance, dashboard, isLoading, refresh };
}
