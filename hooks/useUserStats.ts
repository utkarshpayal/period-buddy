import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../components/auth-context";
import { authApi, type DashboardSummary } from "../lib/api";

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
  const { user, updateUser } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const summary = await authApi.getDashboard();
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
    let isMounted = true;

    (async () => {
      try {
        const summary = await authApi.getDashboard();
        if (!isMounted) return;
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
  }, [updateUser]);

  const streakCount = dashboard?.user?.streakCount ?? user?.streakCount ?? 1;
  const walletBalance =
    dashboard?.tokens ??
    dashboard?.user?.walletBalance ??
    user?.walletBalance ??
    0;

  return { streakCount, walletBalance, dashboard, isLoading, refresh };
}
