export function formatShortDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Local-timezone YYYY-MM-DD key, e.g. for indexing a day's log by date. */
export function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * A calendar day from the server ("2026-10-08" or "2026-10-08T00:00:00.000Z")
 * as that same day at local midnight. Cycle dates are days, not instants:
 * `new Date(iso)` would turn UTC midnight into the previous evening west of
 * UTC. Anything without a leading YYYY-MM-DD falls back to `new Date`.
 */
export function dateFromDayKey(value: string | Date): Date {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) {
    const d = new Date(value);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Local-timezone YYYY-MM key, e.g. for grouping logs by month. */
export function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
