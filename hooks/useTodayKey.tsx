import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { emitDataChange } from "../lib/data-sync";
import { getDateKey } from "../lib/format";

/*
 * The local calendar day, as one shared value that changes at midnight and
 * when the app comes back to the foreground (timers don't run while it's in
 * the background). Tabs stay mounted for days, so anything reading
 * `new Date()` once would keep showing yesterday.
 */
let todayKey = getDateKey(new Date());
const listeners = new Set<() => void>();

function check() {
  const key = getDateKey(new Date());
  if (key === todayKey) return;
  todayKey = key;
  listeners.forEach((l) => l());
  // Cycle day, phase, "days until" and the streak all move with the day.
  emitDataChange("cycle", "dashboard");
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Today's local YYYY-MM-DD key; re-renders the caller when the day changes. */
export function useTodayKey(): string {
  return useSyncExternalStore(subscribe, () => todayKey);
}

/** Mount once (AppShell): watches for midnight and for returning to the app. */
export function TodayWatcher() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => {
        check();
        schedule();
      }, nextMidnight.getTime() - now.getTime());
    };
    schedule();
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      check();
      clearTimeout(timer);
      schedule();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);
  return null;
}
