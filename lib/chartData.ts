import type { DayEntry } from "./api";

/**
 * Data for the app's charts (components/charts/): day-by-day series from day
 * logs, weekly averages for long ranges, axis ranges with round numbers, and
 * the headline numbers. Pure, unit-tested (lib/__tests__/chartData.test.ts).
 */

export type Point = { key: string; value: number };

const DAY_MS = 86_400_000;
const keyToUtc = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const utcToKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export function shiftKey(key: string, days: number) {
  return utcToKey(keyToUtc(key) + days * DAY_MS);
}

type NumericField = "weight" | "temperature" | "sleepHours" | "waterIntake";

/** Logged values of one field in the last `days` days (oldest first); days without a value are skipped. */
export function seriesFromLogs(logs: DayEntry[], field: NumericField, todayKey: string, days: number): Point[] {
  const from = shiftKey(todayKey, -(days - 1));
  return logs
    .filter((l) => l.dateKey >= from && l.dateKey <= todayKey && typeof l[field] === "number" && Number.isFinite(l[field] as number))
    .map((l) => ({ key: l.dateKey, value: l[field] as number }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** Averages per 7-day block ending today (oldest first), keyed by the block's first day; empty weeks dropped. */
export function weeklyAverages(points: Point[], todayKey: string, days: number): Point[] {
  const weeks = Math.ceil(days / 7);
  const out: Point[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = shiftKey(todayKey, -w * 7);
    const start = shiftKey(end, -6);
    const inWeek = points.filter((p) => p.key >= start && p.key <= end);
    if (inWeek.length) out.push({ key: start, value: inWeek.reduce((s, p) => s + p.value, 0) / inWeek.length });
  }
  return out;
}

/** The headline numbers: latest, average and the change across the range. */
export function summarize(points: Point[]) {
  if (!points.length) return null;
  const latest = points[points.length - 1];
  const avg = points.reduce((s, p) => s + p.value, 0) / points.length;
  return { latest, avg, change: points.length > 1 ? latest.value - points[0].value : null, count: points.length };
}

/**
 * A y-range with round steps that hugs the data (not from zero: weight or
 * temperature from 0 would flatten every change), for `sections` gridlines.
 */
export function niceRange(values: number[], { sections = 3, minSpan = 1, fromZero = false } = {}) {
  if (!values.length) return { min: 0, max: sections, step: 1, sections };
  let lo = fromZero ? 0 : Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = fromZero ? 0 : mid - minSpan / 2;
    hi = fromZero ? Math.max(hi, minSpan) : mid + minSpan / 2;
  }
  const raw = (hi - lo) / sections;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const min = fromZero ? 0 : Math.floor(lo / step) * step;
  let max = min + step * sections;
  while (max < hi) max += step;
  return { min, max, step, sections: Math.round((max - min) / step) };
}

/** "Mon 3", "12 Oct" style short labels for axis ticks and tooltips. */
export function shortDay(key: string) {
  const d = new Date(keyToUtc(key));
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
