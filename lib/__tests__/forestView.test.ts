import test from "node:test";
import assert from "node:assert/strict";
import { careHeadline, careStreak, weekTotals } from "../forestView";

const week = (dones: number[]) => dones.map((done, i) => ({ dateKey: `2026-10-0${i + 1}`, done }));

test("streak counts back from today", () => {
  assert.equal(careStreak(week([1, 0, 2, 3, 1]), "2026-10-05"), 3);
});

test("today not done yet doesn't break the streak", () => {
  assert.equal(careStreak(week([0, 1, 1, 2, 0]), "2026-10-05"), 3);
});

test("a missed yesterday resets it", () => {
  assert.equal(careStreak(week([1, 1, 1, 0, 0]), "2026-10-05"), 0);
});

test("order of the week doesn't matter, future days are ignored", () => {
  const w = week([1, 2, 1]).reverse().concat({ dateKey: "2026-10-09", done: 3 });
  assert.equal(careStreak(w, "2026-10-03"), 3);
});

test("week totals cap at 3 a day", () => {
  assert.deepEqual(weekTotals([{ done: 3 }, { done: 5 }, { done: 0 }]), { done: 6, possible: 9 });
});

test("headline", () => {
  assert.match(careHeadline(3), /All done/);
  assert.match(careHeadline(0), /Three small things/);
  assert.equal(careHeadline(1), "2 more to finish today");
});
