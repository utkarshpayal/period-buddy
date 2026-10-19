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

/**
 * "2h ago" / "just now", or with `compact` "2h" / "now" and a short date
 * after a week (notification rows). Empty for a missing date.
 */
export function timeAgo(iso: string | undefined, { now = Date.now(), compact = false }: { now?: number; compact?: boolean } = {}): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (compact) {
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
