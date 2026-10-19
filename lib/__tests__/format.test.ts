import test from "node:test";
import assert from "node:assert/strict";
import { dateFromDayKey, getDateKey } from "../format";

test("dateFromDayKey keeps the server's calendar day in any timezone", () => {
  for (const v of ["2026-10-08", "2026-10-08T00:00:00.000Z", "2026-10-08T23:59:59.999Z"]) {
    const d = dateFromDayKey(v);
    assert.equal(getDateKey(d), "2026-10-08", v);
    assert.equal(d.getHours(), 0);
  }
  assert.equal(getDateKey(dateFromDayKey(new Date(2026, 0, 31, 18))), "2026-01-31");
});

test("timeAgo: full and compact forms", async () => {
  const { timeAgo } = await import("../format");
  const now = Date.parse("2026-10-19T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  assert.equal(timeAgo(ago(20_000), { now }), "just now");
  assert.equal(timeAgo(ago(5 * 60_000), { now }), "5m ago");
  assert.equal(timeAgo(ago(119 * 60_000), { now }), "1h ago");
  assert.equal(timeAgo(ago(3 * 86_400_000), { now }), "3d ago");
  assert.equal(timeAgo(ago(20_000), { now, compact: true }), "now");
  assert.equal(timeAgo(ago(5 * 3_600_000), { now, compact: true }), "5h");
  assert.equal(timeAgo(undefined), "");
  assert.notEqual(timeAgo(ago(10 * 86_400_000), { now, compact: true }), "10d");
});
