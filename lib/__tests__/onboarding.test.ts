import test from "node:test";
import assert from "node:assert/strict";
import {
  approximatePeriodStart,
  checkBirthday,
  currentCycleDay,
  EMPTY_DRAFT,
  estimateNextPeriod,
  isPlausiblePhone,
  normalizePhone,
  parseDraft,
} from "../onboarding";
import { isStrongPassword, PASSWORD_RULES } from "../password";

const today = new Date(2026, 8, 28); // 28 Sep 2026

test("next period rolls forward past today", () => {
  const { date, daysAway } = estimateNextPeriod("2026-09-10", 28, today);
  assert.equal(date.getDate(), 8);
  assert.equal(date.getMonth(), 9);
  assert.equal(daysAway, 10);

  // A start two cycles back still lands on the next upcoming start.
  const old = estimateNextPeriod("2026-07-20", 28, today);
  assert.equal(old.date.getMonth(), 9);
  assert.equal(old.date.getDate(), 12);
});

test("next period due today counts as 0 days away", () => {
  assert.equal(estimateNextPeriod("2026-08-31", 28, today).daysAway, 0);
});

test("cycle day is 1-based and wraps", () => {
  assert.equal(currentCycleDay("2026-09-28", 28, today), 1);
  assert.equal(currentCycleDay("2026-09-10", 28, today), 19);
  assert.equal(currentCycleDay("2026-08-31", 28, today), 1);
});

test("'not sure' ranges map to a past date", () => {
  assert.equal(approximatePeriodStart("this_week", today), "2026-09-25");
  assert.equal(approximatePeriodStart("over_month", today), "2026-08-24");
});

test("phone is optional but a typo is caught", () => {
  assert.equal(isPlausiblePhone(""), true);
  assert.equal(isPlausiblePhone("98765 43210"), true);
  assert.equal(isPlausiblePhone("+91 98765-43210"), true);
  assert.equal(isPlausiblePhone("98765"), false);
  assert.equal(isPlausiblePhone("abc"), false);
  assert.equal(normalizePhone(" +91 (98765) 43210 "), "+919876543210");
});

test("draft parsing survives junk", () => {
  assert.deepEqual(parseDraft(null, 5), EMPTY_DRAFT);
  assert.deepEqual(parseDraft("{nope", 5), EMPTY_DRAFT);
  const draft = parseDraft(
    JSON.stringify({ stepIndex: 9, goals: ["track_period", "bogus"], cycleLength: 90, dateOfBirth: "x" }),
    5,
  );
  assert.equal(draft.stepIndex, 0);
  assert.deepEqual(draft.goals, ["track_period"]);
  assert.equal(draft.cycleLength, 45);
  assert.equal(draft.dateOfBirth, "");
});

test("password rules match the backend", () => {
  assert.equal(PASSWORD_RULES.length, 5);
  assert.equal(isStrongPassword("Hello#123"), true);
  assert.equal(isStrongPassword("hello#123"), false);
  assert.equal(isStrongPassword("Hello1234"), false);
});

test("typed birthday: incomplete, invalid and ok", () => {
  assert.equal(checkBirthday("14", "2", "20", today).status, "incomplete");
  assert.equal(checkBirthday("31", "2", "2001", today).status, "invalid");
  assert.equal(checkBirthday("1", "13", "2001", today).status, "invalid");
  assert.equal(checkBirthday("1", "1", "2020", today).status, "invalid"); // under 13
  assert.equal(checkBirthday("1", "1", "1900", today).status, "invalid");
  const ok = checkBirthday("14", "02", "2001", today);
  assert.deepEqual(ok, { status: "ok", dateKey: "2001-02-14", age: 25 });
  // Birthday later this year hasn't happened yet.
  assert.equal((checkBirthday("30", "9", "2001", today) as { age: number }).age, 24);
});
