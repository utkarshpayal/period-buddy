import test from "node:test";
import assert from "node:assert/strict";
import { isOnlyFlow } from "../dayLog";

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
