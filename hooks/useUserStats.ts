import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../components/auth-context";
import { authApi, type DashboardSummary } from "../lib/api";

// Short-lived module-level cache: ~13 stack screens mount this hook on every
// visit (stack screens unmount on navigate-away, unlike tabs), so without
// this every visit re-fires GET /api/auth/dashboard even seconds apart.
// Cleared on logout below so a new session never shows a stale user's data.
const DASHBOARD_CACHE_TTL_MS = 60_000;
let dashboardCache: { data: DashboardSummary; fetchedAt: number } | null = null;

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
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(dashboardCache?.data ?? null);
  // Only block on a spinner when we have nothing at all to show yet — a
  // cache hit (even a stale one) renders immediately and revalidates quietly.
  const [isLoading, setIsLoading] = useState(!dashboardCache);

  const refresh = useCallback(async () => {
    try {
      const summary = await authApi.getDashboard();
      dashboardCache = { data: summary, fetchedAt: Date.now() };
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

  useEffect(() => {
    // Logging out invalidates the cache so the next signed-in user never
    // briefly sees the previous account's cached dashboard.
    if (!isAuthenticated) {
      dashboardCache = null;
      setDashboard(null);
      setIsLoading(false);
      return;
    }

    const isFresh = dashboardCache && Date.now() - dashboardCache.fetchedAt < DASHBOARD_CACHE_TTL_MS;
    if (isFresh) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    (async () => {
      try {
        const summary = await authApi.getDashboard();
        if (!isMounted) return;
        dashboardCache = { data: summary, fetchedAt: Date.now() };
        setDashboard(summary);
        if (summary.user) {
          updateUser(summary.user);
        }
      } catch {
        if (isMounted) setDashboard(null);
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
