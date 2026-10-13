import type { DayEntry } from "../components/AppState";

/**
 * True when a day log holds nothing but its flow (an empty note and no
 * symptoms count as nothing), so undoing that flow can delete the log
 * instead of leaving an empty one behind. Unit-tested in lib/__tests__/dayLog.test.ts.
 */
export function isOnlyFlow(entry: Partial<DayEntry>): boolean {
  return Object.entries(entry).every(([key, value]) => {
    if (key === "flow" || key === "updatedAt") return true;
    if (value === undefined || value === null || value === false) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    return false;
  });
}
