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

/**
 * A typed weight/temperature. Android number pads offer a decimal comma, and
 * parseFloat("36,6") is 36, so a comma is read as the decimal point.
 * Returns undefined for an empty box and null for something that isn't a
 * number in [min, max].
 */
export function parseDecimal(text: string, min: number, max: number): number | undefined | null {
  const cleaned = text.trim().replace(",", ".");
  if (cleaned === "") return undefined;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value >= min && value <= max ? value : null;
}

/** Tags picked in the sheet that the saved log doesn't have yet (what Quick Log adds). */
export function addedSymptoms(selected: string[], saved: string[] = []): string[] {
  const known = new Set(saved);
  return selected.filter((symptom) => !known.has(symptom));
}

/**
 * The log a Quick Log saves: the day as it is, plus the new tags. Keeps
 * every other field (moods, sleep, weight…), since the save carries the
 * whole entry and the in-session copy replaces the day's local one.
 */
export function withSymptoms(previous: DayEntry | undefined, symptoms: string[]): Omit<DayEntry, "updatedAt"> {
  const { updatedAt: _updatedAt, ...rest } = previous ?? { note: "", symptoms: [], updatedAt: "" };
  return {
    ...rest,
    isIntimate: rest.isIntimate ?? false,
    note: rest.note ?? "",
    symptoms: Array.from(new Set([...(rest.symptoms ?? []), ...symptoms])),
  };
}
