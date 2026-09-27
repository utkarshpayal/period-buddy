import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "../components/AppState";
import type { DayEntry as LocalDayEntry } from "../components/AppState";
import { cycleApi, type CycleSettings, type Predictions } from "../lib/api";
import { buildCalendarModel, mapApiDayEntry } from "../lib/cycleCalendar";
import { getDateKey, getMonthKey } from "../lib/format";
import { useDataRefresh } from "./useDataRefresh";

/**
 * Data behind the full Calendar screen: the prediction model plus day logs,
 * fetched a year at a time (12 month calls, cached) as the user scrolls.
 * Local unsynced entries from AppState win over what the server returned.
 */
export function useCycleCalendar() {
  const { dayEntries, dayNotes } = useAppState();
  const [predictions, setPredictions] = useState<Predictions | null>(null);
  const [settings, setSettings] = useState<CycleSettings | null>(null);
  const [remote, setRemote] = useState<Record<string, LocalDayEntry>>({});
  const loadedYears = useRef(new Set<number>());

  const loadModel = useCallback(async () => {
    const [p, s] = await Promise.allSettled([cycleApi.getPredictions(), cycleApi.getSettings()]);
    if (p.status === "fulfilled") setPredictions(p.value);
    if (s.status === "fulfilled") setSettings(s.value);
  }, []);

  const fetchYear = useCallback(async (year: number) => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, m) => cycleApi.getMonthLogs(getMonthKey(new Date(year, m, 1)))),
    );
    const entries: Record<string, LocalDayEntry> = {};
    results.forEach((r) => {
      if (r.status === "fulfilled") r.value.forEach((log) => (entries[log.dateKey] = mapApiDayEntry(log)));
    });
    setRemote((current) => ({ ...current, ...entries }));
  }, []);

  /** Load a year's logs once (no-op if already loaded). */
  const loadYear = useCallback(
    (year: number) => {
      if (loadedYears.current.has(year)) return;
      loadedYears.current.add(year);
      fetchYear(year).catch(() => loadedYears.current.delete(year));
    },
    [fetchYear],
  );

  useEffect(() => {
    loadModel();
    loadYear(new Date().getFullYear());
  }, [loadModel, loadYear]);

  // A log saved here or elsewhere can move predictions; logs from other
  // screens are picked up when returning.
  useDataRefresh(["cycle"], ({ whileFocused }) =>
    Promise.all([loadModel(), whileFocused ? Promise.resolve() : Promise.all([...loadedYears.current].map(fetchYear))]),
  );

  const model = useMemo(() => buildCalendarModel(predictions, settings), [predictions, settings]);

  const entryFor = useCallback((dateKey: string) => dayEntries[dateKey] ?? remote[dateKey], [dayEntries, remote]);
  const noteFor = useCallback((dateKey: string) => dayNotes[dateKey], [dayNotes]);

  /** Patch one day after a save, from the server's copy of the log. */
  const setRemoteEntry = useCallback((dateKey: string, entry: LocalDayEntry) => setRemote((current) => ({ ...current, [dateKey]: entry })), []);

  return { model, entryFor, noteFor, loadYear, setRemoteEntry, todayKey: getDateKey(new Date()), ready: predictions !== null || settings !== null };
}
