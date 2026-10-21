import { formatShortDate, getDateKey } from "../../lib/format";

/** "Today", "Yesterday", or a short date for a `YYYY-MM-DD` day key. */
export function formatDateKey(dateKey?: string) {
  if (!dateKey) return "—";
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;

  // Local dates: toISOString() is UTC, which in India called yesterday "Today" until 5:30am.
  const now = new Date();
  const todayKey = getDateKey(now);
  const yesterdayKey = getDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (dateKey === todayKey) return "Today";
  if (dateKey === yesterdayKey) return "Yesterday";

  return formatShortDate(date);
}
