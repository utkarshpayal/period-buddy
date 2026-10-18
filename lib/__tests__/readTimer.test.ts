import test from "node:test";
import assert from "node:assert/strict";
import { createReadTimer, formatReadDuration } from "../readTimer";

function clock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test("counts active time and stops one idle window after the last activity", () => {
  const c = clock();
  const timer = createReadTimer(c.now, 60_000);
  timer.start();
  c.advance(30_000);
  timer.activity();
  c.advance(10 * 60_000); // phone put down
  assert.deepEqual(timer.take(), { durationSeconds: 90, continued: false, completed: false });
});

test("background time doesn't count, and later parts are continuations", () => {
  const c = clock();
  const timer = createReadTimer(c.now, 60_000);
  timer.start();
  c.advance(20_000);
  timer.pause();
  assert.deepEqual(timer.take(), { durationSeconds: 20, continued: false, completed: false });
  c.advance(5 * 60_000); // in the background
  timer.start();
  c.advance(15_000);
  timer.setDepth(0.95);
  timer.pause();
  assert.deepEqual(timer.take(), { durationSeconds: 15, continued: true, completed: true });
  // Completion is reported once.
  timer.start();
  c.advance(5_000);
  assert.deepEqual(timer.take(), { durationSeconds: 5, continued: true, completed: false });
});

test("an empty first take doesn't make the next part a continuation", () => {
  const c = clock();
  const timer = createReadTimer(c.now);
  assert.equal(timer.take().continued, false);
  timer.start();
  c.advance(8_000);
  assert.deepEqual(timer.take(), { durationSeconds: 8, continued: false, completed: false });
});

test("formats average durations", () => {
  assert.equal(formatReadDuration(null), null);
  assert.equal(formatReadDuration(0), null);
  assert.equal(formatReadDuration(45), "45 s");
  assert.equal(formatReadDuration(200), "3 min 20 s");
  assert.equal(formatReadDuration(180), "3 min");
});
