import { useCallback, useEffect, useRef, useState } from "react";
import { useAppState, type DayEntry } from "../components/AppState";
import { alertLogNotSaved } from "../lib/alert";
import { cycleApi } from "../lib/api";
import { mapApiDayEntry } from "../lib/cycleCalendar";
import { isOnlyFlow } from "../lib/dayLog";
import { useDataRefresh } from "./useDataRefresh";
import { useTodayKey } from "./useTodayKey";

export type DayLogPatch = Partial<Omit<DayEntry, "updatedAt" | "note" | "symptoms">> & { symptoms?: string[] };

/** The backend takes a flat 5 points back when a day log is deleted (cycleController.deleteCycleLog). */
const LOG_DELETE_POINTS = 5;

export const isPeriodFlow = (flow: DayEntry["flow"]) => Boolean(flow && flow !== "none");

/**
 * Today's day log for Home's one-tap logging. Reads the in-session overlay
 * (AppState, what the tracker shows) over the server copy, and writes both,
 * so the tracker and Home agree straight away.
 *
 * Saves are partial (no `replace`), but the backend clears `symptoms` when a
 * partial save leaves them out, so every save carries today's symptoms.
 * Callers wait for `loaded` (see `reload`) before saving: until today's log
 * is known, a save can't carry its symptoms and Undo can't know what to restore.
 */
export function useTodayLog() {
  const { dayEntries, saveDayEntry, removeDayEntry, earnTokens } = useAppState();
  const dateKey = useTodayKey();
  // undefined = not loaded yet, null = nothing logged today.
  const [remote, setRemote] = useState<DayEntry | null | undefined>(undefined);
  const keyRef = useRef(dateKey);
  keyRef.current = dateKey;

  /** Resolves true once today's log is known. */
  const load = useCallback(async (): Promise<boolean> => {
    const key = keyRef.current;
    try {
      const log = await cycleApi.getDayLog(key);
      if (keyRef.current !== key) return false;
      setRemote(log ? mapApiDayEntry(log) : null);
      return true;
    } catch {
      // Stays not loaded; the quick-log buttons try again when tapped.
      return false;
    }
  }, []);

  // Reloads on a new day too (dateKey changes at midnight).
  useEffect(() => {
    setRemote(undefined);
    load();
  }, [load, dateKey]);
  useDataRefresh(["cycle"], load);

  const entry: DayEntry | null | undefined = dayEntries[dateKey] ?? remote;
  const loaded = remote !== undefined || Boolean(dayEntries[dateKey]);
  // Undo runs seconds later and must build on the log as it is then.
  const entryRef = useRef(entry);
  entryRef.current = entry;

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
        // Without today's log we don't know its symptoms: sending [] would erase them.
        const result = await cycleApi.saveLog({ dateKey: key, ...patch, ...(loaded || patch.symptoms ? { symptoms: next.symptoms } : {}) });
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
    [entry, loaded, saveDayEntry, removeDayEntry, earnTokens],
  );

  /**
   * Undo a flow change: put today's flow back to what `previous` had
   * (undefined = nothing was logged), keeping anything logged since. A log
   * that held nothing but that flow is deleted again.
   */
  const restoreFlow = useCallback(
    async (previous: DayEntry | undefined): Promise<boolean> => {
      const key = keyRef.current;
      const current = entryRef.current ?? undefined;
      try {
        if (!previous && (!current || isOnlyFlow(current))) {
          const result = await cycleApi.deleteLog(key);
          removeDayEntry(key);
          setRemote(null);
          // Mirrors the backend taking its points back.
          if (result.deleted) earnTokens(-LOG_DELETE_POINTS);
        } else {
          const { updatedAt: _u, ...rest } = (current ?? previous)!;
          const next = { ...rest, flow: previous?.flow };
          saveDayEntry(key, next);
          try {
            const result = await cycleApi.saveLog({ dateKey: key, ...next, replace: true });
            setRemote(mapApiDayEntry(result.cycleLog));
          } catch (err) {
            if (current) saveDayEntry(key, rest);
            throw err;
          }
        }
        return true;
      } catch (err) {
        alertLogNotSaved(err);
        return false;
      }
    },
    [saveDayEntry, removeDayEntry, earnTokens],
  );

  return { dateKey, entry, loaded, save, restoreFlow, reload: load };
}
