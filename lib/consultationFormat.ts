// Pure display helpers for consultations: money and times. The backend sends
// every instant as UTC ISO 8601 and every price in INR; these turn them into
// what the patient reads, always in the device's own time zone (pass
// `timeZone` only to show another zone, e.g. a doctor's weekly hours, or in tests).

const LOCALE = "en-IN";

const inr = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** 499 -> "₹499"; null when there is no usable fee (missing, zero, not a number). */
export function formatINR(amount: unknown): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  return inr.format(amount);
}

function parts(date: Date, options: Intl.DateTimeFormatOptions, timeZone?: string) {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat(LOCALE, { ...options, timeZone }).formatToParts(date)) {
    out[p.type] = p.value;
  }
  return out;
}

function toDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/** Short zone name at `date` ("IST", "GMT+1"…), or "" if the runtime has none. */
export function shortZoneName(date: Date = new Date(), timeZone?: string): string {
  try {
    return parts(date, { timeZoneName: "short" }, timeZone).timeZoneName ?? "";
  } catch {
    return "";
  }
}

/** "2026-10-05" for the calendar day `value` falls on in `timeZone`. */
export function localDayKey(value: string | Date, timeZone?: string): string {
  const p = parts(toDate(value), { year: "numeric", month: "2-digit", day: "2-digit" }, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "9:30 AM" */
export function formatTime(value: string | Date, timeZone?: string): string {
  const date = toDate(value);
  const options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true };
  const p = parts(date, options, timeZone);
  // Some older Intl engines name the AM/PM part "dayperiod".
  const period = p.dayPeriod ?? p.dayperiod;
  if (!p.hour || !p.minute || !period) return date.toLocaleTimeString(LOCALE, { ...options, timeZone });
  return `${p.hour}:${p.minute} ${period.toUpperCase()}`;
}

/** Labels for a date chip: { top: "Today" | "Mon", day: "5", month: "Oct" }. */
export function dayChipLabel(value: string | Date, now: Date = new Date(), timeZone?: string) {
  const date = toDate(value);
  const p = parts(date, { weekday: "short", day: "numeric", month: "short" }, timeZone);
  const isToday = localDayKey(date, timeZone) === localDayKey(now, timeZone);
  return { top: isToday ? "Today" : p.weekday, day: p.day, month: p.month };
}

/** "Mon 5 Oct, 9:30 AM" (or "Today, 9:30 AM"), optionally with the zone: "… IST". */
export function formatSessionWhen(
  value: string | Date,
  { now = new Date(), timeZone, withZone = false }: { now?: Date; timeZone?: string; withZone?: boolean } = {},
): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  const chip = dayChipLabel(date, now, timeZone);
  const day = chip.top === "Today" ? "Today" : `${chip.top} ${chip.day} ${chip.month}`;
  const zone = withZone ? shortZoneName(date, timeZone) : "";
  return `${day}, ${formatTime(date, timeZone)}${zone ? ` ${zone}` : ""}`;
}

export type BookableSlot = { start: string; end: string };
export type SlotDay = { key: string; slots: BookableSlot[] };

/**
 * Groups bookable slots by the local calendar day they start on, in time
 * order. Only days that have at least one slot appear.
 */
export function groupSlotsByLocalDay(slots: BookableSlot[], timeZone?: string): SlotDay[] {
  const sorted = slots
    .filter((s) => !Number.isNaN(new Date(s.start).getTime()))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const days: SlotDay[] = [];
  for (const slot of sorted) {
    const key = localDayKey(slot.start, timeZone);
    const last = days[days.length - 1];
    if (last?.key === key) last.slots.push(slot);
    else days.push({ key, slots: [slot] });
  }
  return days;
}

/** "14:30" -> "2:30 PM" (wall-clock HH:MM, no zone conversion). */
export function to12Hour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
