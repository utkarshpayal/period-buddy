import test from "node:test";
import assert from "node:assert/strict";
import { RED_FLAG_ITEMS, hasResultRedFlags, soonRedFlags, triageRedFlags } from "../redFlagScreen";

test("nothing ticked continues to the questionnaire", () => {
  assert.equal(triageRedFlags([]), "none");
});

test("bleeding after sex or after menopause means see a doctor soon, not 112", () => {
  assert.equal(triageRedFlags(["bleeding_after_sex"]), "soon");
  assert.equal(triageRedFlags(["postmenopausal_bleeding"]), "soon");
  assert.equal(triageRedFlags(["bleeding_after_sex", "postmenopausal_bleeding"]), "soon");
});

test("every other item is an emergency, and wins over a see-soon item", () => {
  RED_FLAG_ITEMS.filter((item) => item.urgency === "emergency").forEach((item) => {
    assert.equal(triageRedFlags([item.id]), "emergency", item.id);
    assert.equal(triageRedFlags([item.id, "bleeding_after_sex"]), "emergency", item.id);
  });
  assert.deepEqual(
    soonRedFlags(["fainting", "bleeding_after_sex"]).map((item) => item.id),
    ["bleeding_after_sex"],
  );
});

test("covers all seven red flags", () => {
  assert.equal(RED_FLAG_ITEMS.length, 7);
  assert.equal(new Set(RED_FLAG_ITEMS.map((item) => item.id)).size, 7);
});

test("hasResultRedFlags reads the backend field and tolerates older servers", () => {
  assert.equal(hasResultRedFlags({ redFlags: ["thyroid_neck_swelling"] }), true);
  assert.equal(hasResultRedFlags({ redFlags: [] }), false);
  assert.equal(hasResultRedFlags({}), false);
  assert.equal(hasResultRedFlags(null), false);
});
