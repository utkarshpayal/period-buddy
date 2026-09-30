import test from "node:test";
import assert from "node:assert/strict";
import { analyticsAllowed, isMinor, setAnalyticsAllowed } from "../analyticsConsent";

const now = new Date("2026-10-01T00:00:00Z").getTime();

test("isMinor: under 18 by birthday, unknown birthdays aren't", () => {
  assert.equal(isMinor("2012-05-01", now), true);
  assert.equal(isMinor("2008-12-01", now), true);
  assert.equal(isMinor("2008-09-01", now), false);
  assert.equal(isMinor("1995-01-01", now), false);
  assert.equal(isMinor(undefined, now), false);
  assert.equal(isMinor("not a date", now), false);
});

test("analytics switch", () => {
  assert.equal(analyticsAllowed(), true);
  setAnalyticsAllowed(false);
  assert.equal(analyticsAllowed(), false);
  setAnalyticsAllowed(true);
});
