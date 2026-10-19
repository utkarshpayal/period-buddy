import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "../components/AppState";
import type { DayEntry as LocalDayEntry } from "../components/AppState";
import { cycleApi, getFriendlyErrorMessage, isNetworkError, type CycleSettings, type Predictions } from "../lib/api";
import type { DataTopic } from "../lib/data-sync";
import { buildCalendarModel, mapApiDayEntry, replaceYearEntries } from "../lib/cycleCalendar";
import { dateFromDayKey } from "../lib/format";
import { useDataRefresh } from "./useDataRefresh";
import { useTodayKey } from "./useTodayKey";

type YearStatus = "loading" | "loaded" | "error";

/**
 * Data behind the Tracker's month pager and the full Calendar screen: the
 * prediction model plus day logs, fetched a year at a time (one cached
 * `?year=` request) as the user scrolls. Local unsynced entries from
 * AppState win over what the server returned.
 *
 * Every fetch is sequenced, so a slow older response never overwrites a
 * newer one, and a year's fetch replaces that year's slice (a day deleted
 * elsewhere disappears).
 */
export function useCycleCalendar({ refreshOn = ["cycle"] }: { refreshOn?: DataTopic[] } = {}) {
  const { dayEntries, dayNotes } = useAppState();
  const todayKey = useTodayKey();
  const [predictions, setPredictions] = useState<Predictions | null>(null);
  const [settings, setSettings] = useState<CycleSettings | null>(null);
  // Set once the first prediction/settings fetch has answered (either way).
  const [modelSettled, setModelSettled] = useState(false);
  const [modelError, setModelError] = useState<{ message: string; offline: boolean } | null>(null);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const [remote, setRemote] = useState<Record<string, LocalDayEntry>>({});
  const [yearStatus, setYearStatus] = useState<Record<number, YearStatus>>({});
  const loadedYears = useRef(new Set<number>());
  const modelSeq = useRef(0);
  const yearSeq = useRef<Record<number, number>>({});

  const loadModel = useCallback(async (force = false) => {
    const seq = ++modelSeq.current;
    const [p, s] = await Promise.allSettled([cycleApi.getPredictions({ force }), cycleApi.getSettings({ force })]);
    if (seq !== modelSeq.current) return;
    // A failed refetch keeps what's on screen.
    if (p.status === "fulfilled") setPredictions(p.value);
    if (s.status === "fulfilled") setSettings(s.value);
    setSettingsFailed(s.status === "rejected");
    const failed = p.status === "rejected" ? p.reason : null;
    setModelError(failed ? { message: getFriendlyErrorMessage(failed), offline: isNetworkError(failed) } : null);
    setModelSettled(true);
  }, []);

  const fetchYear = useCallback(async (year: number, force = false) => {
    const seq = (yearSeq.current[year] ?? 0) + 1;
    yearSeq.current[year] = seq;
    const logs = await cycleApi.getYearLogs(year, { force });
    if (yearSeq.current[year] !== seq) return;
    const entries: Record<string, LocalDayEntry> = {};
    logs.forEach((log) => (entries[log.dateKey] = mapApiDayEntry(log)));
    setRemote((current) => replaceYearEntries(current, year, entries));
    setYearStatus((current) => ({ ...current, [year]: "loaded" }));
  }, []);

  /** Load a year's logs once (no-op if already loaded or loading). */
  const loadYear = useCallback(
    (year: number) => {
      if (loadedYears.current.has(year)) return;
      loadedYears.current.add(year);
      setYearStatus((current) => (current[year] === "loaded" ? current : { ...current, [year]: "loading" }));
      fetchYear(year).catch(() => {
        loadedYears.current.delete(year);
        setYearStatus((current) => ({ ...current, [year]: "error" }));
      });
    },
    [fetchYear],
  );

  /** Fetches every year already on screen again (pull-to-refresh, catching up on return). */
  const reloadYears = useCallback(
    (force = false) => Promise.all([...loadedYears.current].map((year) => fetchYear(year, force).catch(() => undefined))),
    [fetchYear],
  );

  useEffect(() => {
    loadModel();
  }, [loadModel]);

  // Today's year (again after New Year's midnight).
  useEffect(() => {
    loadYear(dateFromDayKey(todayKey).getFullYear());
  }, [loadYear, todayKey]);

  // A log saved here or elsewhere can move predictions; logs from other
  // screens are picked up when returning.
  useDataRefresh(refreshOn, ({ whileFocused }) =>
    Promise.all([loadModel(), whileFocused ? Promise.resolve() : reloadYears()]),
  );

  /** Pull-to-refresh: everything, past the response cache. */
  const refresh = useCallback(() => Promise.all([loadModel(true), reloadYears(true)]), [loadModel, reloadYears]);
  /** Try again after a failed predictions/settings load. */
  const reloadModel = useCallback(() => loadModel(true), [loadModel]);

  const model = useMemo(
    () => buildCalendarModel(predictions, settings, dateFromDayKey(todayKey)),
    [predictions, settings, todayKey],
  );

  const entryFor = useCallback((dateKey: string) => dayEntries[dateKey] ?? remote[dateKey], [dayEntries, remote]);
  const noteFor = useCallback((dateKey: string) => dayNotes[dateKey], [dayNotes]);

  /**
   * Whether `dateKey`'s saved log is known. Until then a day can't be edited:
   * a full save over an unknown log would erase it.
   */
  const isDayLoaded = useCallback(
    (dateKey: string) => Boolean(dayEntries[dateKey]) || yearStatus[Number(dateKey.slice(0, 4))] === "loaded",
    [dayEntries, yearStatus],
  );
  const yearFailed = useCallback((year: number) => yearStatus[year] === "error", [yearStatus]);

  /** Patch one day after a save, from the server's copy of the log. */
  const setRemoteEntry = useCallback((dateKey: string, entry: LocalDayEntry) => setRemote((current) => ({ ...current, [dateKey]: entry })), []);

  /** Drop one day after its log is deleted on the server. */
  const removeRemoteEntry = useCallback((dateKey: string) => setRemote(({ [dateKey]: _removed, ...rest }) => rest), []);

  return {
    model,
    predictions,
    settings,
    setSettings,
    modelSettled,
    modelError,
    settingsFailed,
    entryFor,
    noteFor,
    loadYear,
    isDayLoaded,
    yearFailed,
    setRemoteEntry,
    removeRemoteEntry,
    refresh,
    reloadModel,
    todayKey,
    ready: predictions !== null || settings !== null,
  };
}
