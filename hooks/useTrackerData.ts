import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../components/auth-context";
import { authApi, type DashboardSummary } from "../lib/api";
import { useCycleCalendar } from "./useCycleCalendar";
import { useDataRefresh } from "./useDataRefresh";

/**
 * Everything the Tracker tab shows: the calendar model and day logs
 * (useCycleCalendar), plus the dashboard summary, which keeps the signed-in
 * profile's streak/points in sync and is the cycle day's fallback.
 *
 * `loading` is true until predictions/settings have answered once; `error`
 * is set when that first load failed, so the screen shows an error with
 * retry instead of a made-up "cycle day 1 of 28".
 */
export function useTrackerData() {
  // Saving a day log can move predictions, and cycle data changes from other
  // screens while this tab stays mounted.
  const calendar = useCycleCalendar({ refreshOn: ["cycle", "dashboard", "profile"] });
  const { updateUser } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const dashboardSeq = useRef(0);

  const loadDashboard = useCallback(
    async (force = false) => {
      const seq = ++dashboardSeq.current;
      try {
        const summary = await authApi.getDashboard({ force });
        if (seq !== dashboardSeq.current) return;
        setDashboard(summary);
        if (summary.user) updateUser(summary.user);
      } catch {
        // Keep what's shown; the ring reads predictions first.
      }
    },
    [updateUser],
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useDataRefresh(["cycle", "dashboard", "profile"], () => loadDashboard());

  /** Pull-to-refresh: everything, past the response cache. */
  const { refresh: refreshCalendar, predictions, modelSettled, modelError } = calendar;
  const refresh = useCallback(() => Promise.all([refreshCalendar(), loadDashboard(true)]), [refreshCalendar, loadDashboard]);

  return {
    ...calendar,
    dashboard,
    refresh,
    loading: !modelSettled,
    // Only when there's nothing real to show; a failed refetch keeps the old data.
    error: predictions === null && modelError ? modelError : null,
  };
}
