import test from "node:test";
import assert from "node:assert/strict";
import { buildCurrentWeekStrip } from "../weekStrip";

// Wednesday 15 Oct 2025; the week strip runs Mon 13 – Sun 19.
const today = new Date(2025, 9, 15, 14, 30);
const marks = (days: ReturnType<typeof buildCurrentWeekStrip>, key: "isPeriod" | "isFertile") =>
  days.filter((d) => d[key]).map((d) => d.dayNumber);

test("week strip: Monday first, today and future flagged", () => {
  const days = buildCurrentWeekStrip(today, new Date(2025, 9, 1), 28, 5, 15);
  assert.deepEqual(days.map((d) => d.dayNumber), [13, 14, 15, 16, 17, 18, 19]);
  assert.deepEqual(days.map((d) => d.letter), ["M", "T", "W", "T", "F", "S", "S"]);
  assert.deepEqual(days.filter((d) => d.isToday).map((d) => d.dayNumber), [15]);
  assert.deepEqual(days.filter((d) => d.isFuture).map((d) => d.dayNumber), [16, 17, 18, 19]);
});

test("week strip: period started this week shows its days, fertile window from the pivot", () => {
  assert.deepEqual(marks(buildCurrentWeekStrip(today, new Date(2025, 9, 14), 28, 5, 15), "isPeriod"), [14, 15, 16, 17, 18]);
  // Cycle started 1 Oct: days 13–19 are cycle days 13–19; fertile is the 5 days
  // before ovulation (day 15) plus ovulation day, so 10–15.
  assert.deepEqual(marks(buildCurrentWeekStrip(today, new Date(2025, 9, 1), 28, 5, 15), "isFertile"), [13, 14, 15]);
});

test("week strip: a late period doesn't paint the days since it was due as period days", () => {
  // Started 13 Sep with a 28-day cycle: due 11 Oct, today is cycle day 33.
  const days = buildCurrentWeekStrip(today, new Date(2025, 8, 13), 28, 5, 15);
  assert.deepEqual(days.filter((d) => !d.isFuture && d.isPeriod), []);
  // Days before the current cycle still wrap onto the previous one.
  const before = buildCurrentWeekStrip(today, new Date(2025, 9, 17), 28, 5, 15);
  assert.deepEqual(marks(before, "isPeriod"), [17, 18, 19]);
});

test("week strip: while late, upcoming days project from tomorrow, not a wrapped cycle", () => {
  // Started 13 Sep, 28-day cycle: due 11 Oct, today (cycle day 33) is late.
  const days = buildCurrentWeekStrip(today, new Date(2025, 8, 13), 28, 5, 15);
  const future = days.filter((d) => d.isFuture);
  // The period could start any day, so every upcoming day this week is a possible period day.
  assert.ok(future.length === 0 || future.every((d) => d.isPeriod));
});
