import assert from "node:assert/strict";
import test from "node:test";
import type { DayEntry } from "../api";
import { niceRange, seriesFromLogs, shiftKey, shortDay, summarize, weeklyAverages } from "../chartData";

const TODAY = "2026-10-26";
const log = (dateKey: string, extra: Partial<DayEntry>): DayEntry => ({ dateKey, ...extra });

test("series: only logged values inside the range, oldest first", () => {
  const logs = [
    log(TODAY, { weight: 58.2 }),
    log(shiftKey(TODAY, -2), { weight: 58.6, sleepHours: 7 }),
    log(shiftKey(TODAY, -40), { weight: 60 }),
    log(shiftKey(TODAY, -1), { sleepHours: 6.5 }),
  ];
  assert.deepEqual(seriesFromLogs(logs, "weight", TODAY, 30), [
    { key: shiftKey(TODAY, -2), value: 58.6 },
    { key: TODAY, value: 58.2 },
  ]);
  assert.equal(seriesFromLogs(logs, "sleepHours", TODAY, 30).length, 2);
});

test("weekly averages: 7-day blocks ending today, empty weeks dropped", () => {
  const pts = [
    { key: TODAY, value: 8 },
    { key: shiftKey(TODAY, -3), value: 6 },
    { key: shiftKey(TODAY, -20), value: 5 },
  ];
  const w = weeklyAverages(pts, TODAY, 28);
  assert.equal(w.length, 2);
  assert.deepEqual(w[w.length - 1], { key: shiftKey(TODAY, -6), value: 7 });
});

test("summary: latest, average, change", () => {
  assert.equal(summarize([]), null);
  const s = summarize([{ key: "a", value: 60 }, { key: "b", value: 59 }, { key: "c", value: 58.5 }])!;
  assert.equal(s.latest.value, 58.5);
  assert.equal(s.change, -1.5);
  assert.ok(Math.abs(s.avg - 59.1667) < 0.001);
  assert.equal(summarize([{ key: "a", value: 1 }])!.change, null);
});

test("nice range: round steps that hug the data, or start at zero when asked", () => {
  const r = niceRange([36.3, 36.5, 36.9], { minSpan: 0.6 });
  assert.ok(r.min <= 36.3 && r.max >= 36.9 && r.min > 30, JSON.stringify(r));
  assert.ok(Math.abs((r.max - r.min) / r.step - r.sections) < 1e-9);
  const z = niceRange([1200, 2400, 1800], { fromZero: true });
  assert.equal(z.min, 0);
  assert.ok(z.max >= 2400);
  assert.deepEqual(niceRange([]).min, 0);
});

test("short day labels", () => {
  assert.equal(shortDay("2026-10-05"), "5 Oct");
});
