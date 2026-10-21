import test from "node:test";
import assert from "node:assert/strict";
import { addedSymptoms, isOnlyFlow, parseDecimal, withSymptoms } from "../dayLog";

test("isOnlyFlow: a log with just a flow (and empty fields) is only a flow", () => {
  assert.equal(isOnlyFlow({ flow: "medium", note: "", symptoms: [], updatedAt: "x" }), true);
  assert.equal(isOnlyFlow({ flow: "light", note: "  ", symptoms: [], moods: [], isIntimate: false, sleepHours: undefined }), true);
  assert.equal(isOnlyFlow({}), true);
});

test("isOnlyFlow: anything else logged that day keeps the log", () => {
  assert.equal(isOnlyFlow({ flow: "medium", note: "cramps at work", symptoms: [] }), false);
  assert.equal(isOnlyFlow({ flow: "medium", note: "", symptoms: ["cramps"] }), false);
  assert.equal(isOnlyFlow({ flow: "medium", note: "", symptoms: [], mood: "happy" }), false);
  assert.equal(isOnlyFlow({ flow: "medium", note: "", symptoms: [], waterIntake: 0 }), false);
  assert.equal(isOnlyFlow({ flow: "medium", note: "", symptoms: [], isIntimate: true }), false);
});

test("parseDecimal reads a decimal comma and checks the range", () => {
  assert.equal(parseDecimal("36,6", 30, 45), 36.6);
  assert.equal(parseDecimal(" 58.5 ", 20, 300), 58.5);
  assert.equal(parseDecimal("", 30, 45), undefined);
  assert.equal(parseDecimal("abc", 30, 45), null);
  assert.equal(parseDecimal("366", 30, 45), null);
  assert.equal(parseDecimal("36,6,1", 30, 45), null);
});

test("addedSymptoms is only what the saved log doesn't have", () => {
  assert.deepEqual(addedSymptoms(["cramps", "acne"], ["cramps"]), ["acne"]);
  assert.deepEqual(addedSymptoms(["cramps"], ["cramps"]), []);
  assert.deepEqual(addedSymptoms(["cramps"]), ["cramps"]);
});

test("withSymptoms keeps the rest of the day's log", () => {
  const next = withSymptoms(
    { flow: "medium", moods: ["happy"], sleepHours: 7, weight: 60, discharge: "creamy", note: "hi", symptoms: ["cramps"], updatedAt: "x" },
    ["acne", "cramps"],
  );
  assert.deepEqual(next, { flow: "medium", moods: ["happy"], sleepHours: 7, weight: 60, discharge: "creamy", isIntimate: false, note: "hi", symptoms: ["cramps", "acne"] });
  assert.deepEqual(withSymptoms(undefined, ["acne"]), { isIntimate: false, note: "", symptoms: ["acne"] });
});
