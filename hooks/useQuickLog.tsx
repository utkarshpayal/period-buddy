import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { flowOptions } from "../components/logOptions";
import { QuickLogSheet, type QuickLogKind } from "../components/QuickLogSheet";
import { UndoToast, type ToastContent } from "../components/UndoToast";
import { logFocusRoute, type LogFocus } from "../lib/logFocus";
import { isPeriodFlow, useTodayLog, type DayLogPatch } from "./useTodayLog";

/**
 * One-tap logging for today, shared by Home's quick-log buttons and the
 * tracker's "Log period" / "Symptoms" buttons:
 * - Log period opens the flow sheet: one tap on a flow saves it, with Undo
 *   in a toast. Nothing is logged until a flow is picked.
 * - Symptoms and Mood open a small sheet with just that part of today's log.
 * - Anything else opens the full day log at that section.
 * Render `overlays` once, at the end of the screen.
 */
export function useQuickLog({
  toastBottom,
  openFullLog,
}: {
  toastBottom: number;
  /** Open today's full log at `focus`; defaults to the tracker deep link. */
  openFullLog?: (focus: LogFocus) => void;
}) {
  const router = useRouter();
  const today = useTodayLog();
  const [sheet, setSheet] = useState<QuickLogKind | null>(null);
  const [toast, setToast] = useState<ToastContent | null>(null);
  const periodLoggedToday = isPeriodFlow(today.entry?.flow);
  
  // Log period only asks for the flow; picking one saves it (see QuickLogSheet).
  const logPeriodNow = useCallback(() => setSheet("flow"), []);

  /** Sheet saves; a flow change also shows a toast with Undo. */
  const saveFromSheet = useCallback(
    async (patch: DayLogPatch) => {
      const previous = today.entry ?? undefined;
      const wasPeriod = isPeriodFlow(previous?.flow);
      const ok = await today.save(patch);
      if (ok && patch.flow !== undefined && (wasPeriod || isPeriodFlow(patch.flow))) {
        const label = flowOptions.find((o) => o.value === patch.flow)?.label;
        setToast({
          id: Date.now(),
          icon: "checkmark-circle",
          title: !isPeriodFlow(patch.flow) ? "Period removed for today" : wasPeriod ? "Flow updated" : "Period logged for today",
          detail: isPeriodFlow(patch.flow) && label ? `${label} flow` : undefined,
          actions: [{ label: "Undo", onPress: () => void today.restore(previous) }],
        });
      }
      return ok;
    },
    [today],
  );

  const fullLog = useCallback(
    (focus: LogFocus) => (openFullLog ? openFullLog(focus) : router.push(logFocusRoute(focus) as any)),
    [openFullLog, router],
  );

  const onQuickAction = useCallback(
    (key: LogFocus) => {
      if (key === "flow") void logPeriodNow();
      else if (key === "symptoms" || key === "mood") setSheet(key);
      else fullLog(key);
    },
    [logPeriodNow, fullLog],
  );

  /** How many things of `key` are logged today, for a button's badge. */
  const loggedCount = (key: LogFocus): number => {
    const e = today.entry;
    if (!e) return 0;
    if (key === "symptoms") return e.symptoms.filter((s) => s !== "everything-is-fine").length;
    if (key === "mood") return e.moods?.length || (e.mood ? 1 : 0);
    return 0;
  };

  const overlays = (
    <>
      <UndoToast toast={toast} bottom={toastBottom} onHide={() => setToast(null)} />
      <QuickLogSheet
        kind={sheet}
        entry={today.entry}
        dateLabel="Today"
        onClose={() => setSheet(null)}
        onSave={saveFromSheet}
        onOpenFullLog={(kind) => {
          setSheet(null);
          fullLog(kind);
        }}
      />
    </>
  );

  return { today, periodLoggedToday, logPeriodNow, onQuickAction, openSheet: setSheet, loggedCount, overlays };
}
