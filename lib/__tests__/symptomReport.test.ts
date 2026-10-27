import assert from "node:assert/strict";
import test from "node:test";
import type { DayEntry } from "../api";
import { buildSymptomReport, mainFlow } from "../symptomReport";

const TODAY = "2026-10-26";
const log = (dateKey: string, extra: Partial<DayEntry>): DayEntry => ({ dateKey, ...extra });
const mood = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

test("counts days per symptom, mood and flow inside the range", () => {
  const r = buildSymptomReport(
    [
      log("2026-10-26", { symptoms: ["cramps", "sex-protected", "ovulation-test-positive"], flow: "heavy", moods: ["sad"] }),
      log("2026-10-25", { symptoms: ["cramps", "blood-clots"], flow: "medium", mood: "sad" }),
      log("2026-10-24", { symptoms: ["headache"], digestions: ["bloated", "normal"], skin: "acne", flow: "none" }),
      log("2026-08-01", { symptoms: ["cramps"] }), // outside 30 days
    ],
    TODAY,
    30,
    mood,
  );
  assert.equal(r.daysLogged, 3);
  assert.equal(r.periodDays, 2);
  assert.deepEqual(r.symptoms.map((s) => [s.label, s.days]), [
    ["Cramps", 2],
    ["Acne", 1],
    ["Bloating", 1],
    ["Blood clots", 1],
    ["Headache", 1],
  ]);
  assert.deepEqual(r.moods, [{ key: "sad", label: "Sad", days: 2 }]);
  assert.deepEqual(r.flow, { spotting: 0, light: 0, medium: 1, heavy: 1 });
});

test("private, non-symptom tags never count; a day counts once", () => {
  const r = buildSymptomReport(
    [log("2026-10-20", { symptoms: ["sex-unprotected", "pregnancy-positive", "everything-is-fine"] }), log("2026-10-20", { symptoms: ["cramps"] })],
    TODAY,
    30,
    mood,
  );
  assert.equal(r.symptoms.length, 0);
  assert.equal(r.daysLogged, 1);
});

test("main flow", () => {
  assert.equal(mainFlow({ spotting: 1, light: 3, medium: 5, heavy: 2 }), "medium");
  assert.equal(mainFlow({ spotting: 0, light: 0, medium: 0, heavy: 0 }), null);
});
