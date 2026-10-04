import test from "node:test";
import assert from "node:assert/strict";
import {
  dayChipLabel,
  formatINR,
  formatSessionWhen,
  formatTime,
  groupSlotsByLocalDay,
  localDayKey,
  shortZoneName,
} from "../consultationFormat";

const IST = "Asia/Kolkata";
const NY = "America/New_York";

test("formatINR formats rupees and rejects a missing fee", () => {
  assert.equal(formatINR(499), "₹499");
  assert.equal(formatINR(1500), "₹1,500");
  assert.equal(formatINR(0), null);
  assert.equal(formatINR(undefined), null);
  assert.equal(formatINR(Number.NaN), null);
});

test("times are shown in the given zone, not UTC", () => {
  const start = "2026-10-05T04:30:00.000Z";
  assert.equal(formatTime(start, IST), "10:00 AM");
  assert.equal(formatTime(start, NY), "12:30 AM");
  assert.equal(shortZoneName(new Date(start), IST), "IST");
});

test("a slot near midnight lands on the viewer's local day", () => {
  // 20:00 UTC on 4 Oct is 1:30 AM on 5 Oct in India, but still 4 Oct in New York.
  assert.equal(localDayKey("2026-10-04T20:00:00.000Z", IST), "2026-10-05");
  assert.equal(localDayKey("2026-10-04T20:00:00.000Z", NY), "2026-10-04");
});

test("groupSlotsByLocalDay groups by local day in time order", () => {
  const slots = [
    { start: "2026-10-05T05:30:00.000Z", end: "2026-10-05T06:30:00.000Z" },
    { start: "2026-10-04T20:00:00.000Z", end: "2026-10-04T21:00:00.000Z" },
    { start: "2026-10-06T04:30:00.000Z", end: "2026-10-06T05:30:00.000Z" },
  ];
  const days = groupSlotsByLocalDay(slots, IST);
  assert.deepEqual(
    days.map((d) => [d.key, d.slots.length]),
    [
      ["2026-10-05", 2],
      ["2026-10-06", 1],
    ],
  );
  assert.equal(days[0].slots[0].start, "2026-10-04T20:00:00.000Z");
});

test("day chips and session labels say Today for today", () => {
  const now = new Date("2026-10-05T02:00:00.000Z");
  assert.deepEqual(dayChipLabel("2026-10-05T04:30:00.000Z", now, IST), { top: "Today", day: "5", month: "Oct" });
  assert.equal(dayChipLabel("2026-10-06T04:30:00.000Z", now, IST).top, "Tue");
  assert.equal(formatSessionWhen("2026-10-05T04:30:00.000Z", { now, timeZone: IST }), "Today, 10:00 AM");
  assert.equal(
    formatSessionWhen("2026-10-06T04:30:00.000Z", { now, timeZone: IST, withZone: true }),
    "Tue 6 Oct, 10:00 AM IST",
  );
});
