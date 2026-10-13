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
