import { useCallback, useRef } from "react";
import { useAppState, type DayEntry } from "../components/AppState";
import { alertLogNotSaved } from "../lib/alert";
import { cycleApi } from "../lib/api";
import { mapApiDayEntry } from "../lib/cycleCalendar";
import { withSymptoms } from "../lib/dayLog";


type Remote = {
  /** The day as shown (local overlay over the server copy). */
  entryFor: (dateKey: string) => DayEntry | undefined;
  setRemoteEntry: (dateKey: string, entry: DayEntry) => void;
  removeRemoteEntry: (dateKey: string) => void;
};

/**
 * Save / clear / quick-log for the day-log sheet (DayDetailsModal), shared
 * by the Tracker and the Calendar screen.
 *
 * Saves write the in-session overlay first so the calendar updates at once,
 * then the server; a failed save puts the overlay back the way it was and
 * rethrows, so the sheet stays open with its error instead of looking saved.
 */
export function useDayLogActions({ entryFor, setRemoteEntry, removeRemoteEntry }: Remote) {
  const { dayEntries, saveDayEntry, removeDayEntry } = useAppState();
  // Saves resolve after awaits; read the overlay as it is then, not at render.
  const overlayRef = useRef(dayEntries);
  overlayRef.current = dayEntries;
  const entryForRef = useRef(entryFor);
  entryForRef.current = entryFor;

  /** `replace` marks a full "Save Log" (cleared fields get removed server-side). */
  const save = useCallback(
    async (dateKey: string, entry: Omit<DayEntry, "updatedAt">, replace = false) => {
      const previousOverlay = overlayRef.current[dateKey];
      saveDayEntry(dateKey, entry);
      try {
        const result = await cycleApi.saveLog({ dateKey, ...entry, replace });
        setRemoteEntry(dateKey, mapApiDayEntry(result.cycleLog));
      } catch (err) {
        if (previousOverlay) {
          const { updatedAt: _updatedAt, ...rest } = previousOverlay;
          saveDayEntry(dateKey, rest);
        } else {
          removeDayEntry(dateKey);
        }
        throw err;
      }
    },
    [saveDayEntry, removeDayEntry, setRemoteEntry],
  );

  const clear = useCallback(
    async (dateKey: string) => {
      await cycleApi.deleteLog(dateKey);
      removeDayEntry(dateKey);
      removeRemoteEntry(dateKey);
    },
    [removeDayEntry, removeRemoteEntry],
  );

  /**
   * Quick Log: adds tags to the day and keeps everything else on it. The
   * sheet has already closed, so a failure is shown here.
   */
  const logSymptoms = useCallback(
    (dateKey: string, symptoms: string[]) => {
      save(dateKey, withSymptoms(entryForRef.current(dateKey), symptoms)).catch(alertLogNotSaved);
    },
    [save],
  );

  return { save, clear, logSymptoms };
}
