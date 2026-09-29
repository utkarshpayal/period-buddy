import test from "node:test";
import assert from "node:assert/strict";
import { getCycleDay } from "../cycleCalendar";

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
