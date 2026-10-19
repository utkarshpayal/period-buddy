import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendarModel, dayLogSubtitle, dayStatus, getCycleDay, replaceYearEntries, weekDates } from "../cycleCalendar";
import type { Predictions } from "../api";
import { getDateKey } from "../format";

// Pin a zone with daylight saving so the test means the same thing on any
// machine (Node re-reads TZ at runtime; nothing below has built a Date yet).
process.env.TZ = "America/New_York";

test("getCycleDay counts plain days", () => {
  const start = new Date(2025, 0, 1);
  assert.equal(getCycleDay(new Date(2025, 0, 1), start, 28), 1);
  assert.equal(getCycleDay(new Date(2025, 0, 28), start, 28), 28);
  assert.equal(getCycleDay(new Date(2025, 0, 29), start, 28), 1);
});

test("getCycleDay is not a day short after a spring-forward", () => {
  // US clocks went forward on 9 March 2025, so 1 Mar → 10 Mar is 9 days but
  // only 9 × 24h − 1h of wall-clock time.
  const start = new Date(2025, 2, 1);
  assert.equal(getCycleDay(new Date(2025, 2, 10), start, 28), 10);
});

test("getCycleDay is not a day long after a fall-back", () => {
  // Clocks went back on 2 November 2025: 25-hour day.
  const start = new Date(2025, 10, 1);
  assert.equal(getCycleDay(new Date(2025, 10, 3), start, 28), 3);
});

test("getCycleDay wraps days before the cycle start", () => {
  const start = new Date(2025, 2, 10);
  assert.equal(getCycleDay(new Date(2025, 2, 9), start, 28), 28);
});

test("weekDates is Monday to Sunday around today", () => {
  const week = weekDates(new Date(2025, 9, 16)); // Thursday
  assert.equal(week.length, 7);
  assert.equal(getDateKey(week[0]), "2025-10-13");
  assert.equal(getDateKey(week[6]), "2025-10-19");
});

test("a late period counts on past cycleLength up to today, not as a new period", () => {
  const predictions = { cycleLength: 28, periodLength: 5, currentPeriodStartDateISO: "2025-01-01T00:00:00.000Z" } as Predictions;
  const today = new Date(2025, 1, 1); // day 32
  const model = buildCalendarModel(predictions, null, today);
  const none = () => undefined;
  const todayKey = getDateKey(today);
  const status = dayStatus(today, model, none, none, todayKey);
  assert.equal(status.cycleDay, 32);
  assert.notEqual(status.phase, "period");
  assert.equal(status.isToday, true);
  assert.equal(status.isFuture, false);
  // Tomorrow projects a new period from tomorrow, as a prediction.
  const tomorrow = dayStatus(new Date(2025, 1, 2), model, none, none, todayKey);
  assert.equal(tomorrow.cycleDay, 1);
  assert.equal(tomorrow.isFuture, true);
  assert.equal(tomorrow.isPredictedPeriod, true);
  assert.equal(dayLogSubtitle(status), "Before your period · Day 32");
});

test("replaceYearEntries drops that year's deleted days and keeps other years", () => {
  const current = { "2024-12-31": "a", "2025-01-02": "b", "2025-03-04": "c" };
  assert.deepEqual(replaceYearEntries(current, 2025, { "2025-03-04": "c2" }), { "2024-12-31": "a", "2025-03-04": "c2" });
});
