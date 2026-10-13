import { useCallback, useEffect, useRef, useState } from "react";
import { useAppState, type DayEntry } from "../components/AppState";
import { alertLogNotSaved } from "../lib/alert";
import { cycleApi } from "../lib/api";
import { mapApiDayEntry } from "../lib/cycleCalendar";
import { useDataRefresh } from "./useDataRefresh";
import { useTodayKey } from "./useTodayKey";

export type DayLogPatch = Partial<Omit<DayEntry, "updatedAt" | "note" | "symptoms">> & { symptoms?: string[] };

export const isPeriodFlow = (flow: DayEntry["flow"]) => Boolean(flow && flow !== "none");

/**
 * Today's day log for Home's one-tap logging. Reads the in-session overlay
 * (AppState, what the tracker shows) over the server copy, and writes both,
 * so the tracker and Home agree straight away.
 *
 * Saves are partial (no `replace`), but the backend clears `symptoms` when a
 * partial save leaves them out, so every save carries today's symptoms.
 */
export function useTodayLog() {
  const { dayEntries, saveDayEntry, removeDayEntry, earnTokens } = useAppState();
  const dateKey = useTodayKey();
  // undefined = not loaded yet, null = nothing logged today.
  const [remote, setRemote] = useState<DayEntry | null | undefined>(undefined);
  const keyRef = useRef(dateKey);
  keyRef.current = dateKey;

  const load = useCallback(async () => {
    const key = keyRef.current;
    try {
      const log = await cycleApi.getDayLog(key);
      if (keyRef.current === key) setRemote(log ? mapApiDayEntry(log) : null);
    } catch {
      // Keep what we have; the buttons still work and the save itself will report.
    }
  }, []);

  // Reloads on a new day too (dateKey changes at midnight).
  useEffect(() => {
    setRemote(undefined);
    load();
  }, [load, dateKey]);
  useDataRefresh(["cycle"], load);

  const entry: DayEntry | null | undefined = dayEntries[dateKey] ?? remote;

  /** Merge `patch` into today's log. Resolves true once the server has it. */
  const save = useCallback(
    async (patch: DayLogPatch): Promise<boolean> => {
      const key = keyRef.current;
      const before = entry ?? undefined;
      const next: Omit<DayEntry, "updatedAt"> = {
        ...(before ?? {}),
        note: before?.note ?? "",
        symptoms: before?.symptoms ?? [],
        ...patch,
      };
      saveDayEntry(key, next);
      try {
        const result = await cycleApi.saveLog({ dateKey: key, ...patch, symptoms: next.symptoms });
        setRemote(mapApiDayEntry(result.cycleLog));
        if (result.tokensEarned) earnTokens(result.tokensEarned);
        return true;
      } catch (err) {
        if (before) saveDayEntry(key, before);
        else removeDayEntry(key);
        alertLogNotSaved(err);
        return false;
      }
    },
    [entry, saveDayEntry, removeDayEntry, earnTokens],
  );

  /** Put today back to `previous` (undefined = nothing was logged), for Undo. */
  const restore = useCallback(
    async (previous: DayEntry | undefined): Promise<boolean> => {
      const key = keyRef.current;
      try {
        if (!previous) {
          const result = await cycleApi.deleteLog(key);
          removeDayEntry(key);
          setRemote(null);
          // Mirrors the backend taking back the +5 "new log" credit.
          if (result.deleted) earnTokens(-5);
        } else {
          const { updatedAt: _u, ...rest } = previous;
          saveDayEntry(key, rest);
          const result = await cycleApi.saveLog({ dateKey: key, ...rest, replace: true });
          setRemote(mapApiDayEntry(result.cycleLog));
        }
        return true;
      } catch (err) {
        alertLogNotSaved(err);
        return false;
      }
    },
    [saveDayEntry, removeDayEntry, earnTokens],
  );

  return { dateKey, entry, loaded: remote !== undefined || Boolean(dayEntries[dateKey]), save, restore, reload: load };
}
