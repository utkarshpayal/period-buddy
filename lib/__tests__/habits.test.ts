import test from "node:test";
import assert from "node:assert/strict";
import type { Habit } from "../api";
import { applyTick, habitProgress, weekSummary } from "../habits";

const week = (pattern: string) =>
  [...pattern].map((c, i) => ({ dateKey: `2026-03-0${i + 1}`, done: c === "x" }));

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: "h1",
  title: "Walk for 20 Minutes",
  icon: "walk-outline",
  color: "#0f766e",
  completed: false,
  streak: 2,
  tokens: 35,
  week: week("....xx."),
  ...over,
});

test("tick: checks today, fills today's dot, adds a day to the streak", () => {
  const next = applyTick(habit(), true);
  assert.equal(next.completed, true);
  assert.equal(next.streak, 3);
  assert.deepEqual(next.week?.map((d) => d.done), [false, false, false, false, true, true, true]);
});

test("untick: takes today back, never below zero", () => {
  const next = applyTick(habit({ completed: true, streak: 1, week: week("......x") }), false);
  assert.equal(next.completed, false);
  assert.equal(next.streak, 0);
  assert.equal(next.week?.[6].done, false);
  assert.equal(applyTick(habit({ completed: true, streak: 0 }), false).streak, 0);
});

test("tick: the same state is returned unchanged; no week is fine", () => {
  const h = habit({ completed: true });
  assert.equal(applyTick(h, true), h);
  assert.equal(applyTick(habit({ week: undefined }), true).week, undefined);
});

test("progress and week summary", () => {
  assert.deepEqual(habitProgress([]), { done: 0, total: 0, allDone: false, ratio: 0 });
  assert.deepEqual(habitProgress([habit({ completed: true }), habit()]), { done: 1, total: 2, allDone: false, ratio: 0.5 });
  assert.equal(habitProgress([habit({ completed: true })]).allDone, true);
  assert.equal(weekSummary(habit()), "done 2 of the last 7 days");
  assert.equal(weekSummary(habit({ week: undefined })), null);
});
