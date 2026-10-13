import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { flowOptions } from "../components/logOptions";
import { QuickLogSheet, type QuickLogKind } from "../components/QuickLogSheet";
import { UndoToast, type ToastContent } from "../components/UndoToast";
import { alert } from "../lib/alert";
import { logFocusRoute, type LogFocus } from "../lib/logFocus";
import { isPeriodFlow, useTodayLog, type DayLogPatch } from "./useTodayLog";

/**
 * One-tap logging for today, shared by Home's quick-log buttons and the
 * tracker's "Log period" / "Symptoms" buttons:
 * - Log period opens the flow sheet: one tap on a flow saves it, with Undo
 *   in a toast. Nothing is logged until a flow is picked.
 * - Symptoms and Mood open a small sheet with just that part of today's log.
 * - Anything else opens the full day log at that section.
 * The sheets open only once today's log is known (loading it again if the
 * first fetch failed), so a save can't erase what's already logged.
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
  // "All details" waits for the sheet to finish closing: iOS can't present
  // the full log's modal while this one is still animating away.
  const pendingFullLog = useRef<LogFocus | null>(null);
  const { loaded, reload } = today;

  /** Open a quick-log sheet once today's log is known. */
  const openSheet = useCallback(
    async (kind: QuickLogKind) => {
      if (!loaded && !(await reload())) {
        alert("Couldn't load today's log", "Check your connection and try again.");
        return;
      }
      setSheet(kind);
    },
    [loaded, reload],
  );

  // Log period only asks for the flow; picking one saves it (see QuickLogSheet).
  const logPeriodNow = useCallback(() => openSheet("flow"), [openSheet]);

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
          actions: [{ label: "Undo", onPress: () => void today.restoreFlow(previous) }],
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
      else if (key === "symptoms" || key === "mood") void openSheet(key);
      else fullLog(key);
    },
    [logPeriodNow, openSheet, fullLog],
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
          pendingFullLog.current = kind;
          setSheet(null);
        }}
        onDismissed={() => {
          const focus = pendingFullLog.current;
          pendingFullLog.current = null;
          if (focus) fullLog(focus);
        }}
      />
    </>
  );

  return { today, periodLoggedToday, logPeriodNow, onQuickAction, openSheet, loggedCount, overlays };
}
