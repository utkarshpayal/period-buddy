import assert from "node:assert/strict";
import { test } from "node:test";
import { PARTNER_PHASE_COPY, humanizeTag, inDays, logTags } from "../partnerView";

test("raw log values read as words", () => {
  assert.equal(humanizeTag("moodSwings"), "Mood swings");
  assert.equal(humanizeTag("tender-breasts"), "Tender breasts");
  assert.equal(humanizeTag("low_energy"), "Low energy");
  assert.equal(humanizeTag("cramps"), "Cramps");
  assert.equal(humanizeTag("calm", { calm: "Calm 🌿" }), "Calm 🌿");
});

test("a day's log becomes readable, de-duplicated tags without 'none' flow", () => {
  assert.deepEqual(logTags({ mood: "moodSwings", energy: "low", flow: "none", symptoms: ["tender-breasts", "cramps", "cramps"] }), [
    "Mood swings",
    "Low energy",
    "Tender breasts",
    "Cramps",
  ]);
  assert.deepEqual(logTags({ flow: "heavy" }), ["Heavy flow"]);
  assert.deepEqual(logTags({}), []);
});

test("phase copy is third person and has no gendered pronouns", () => {
  for (const copy of Object.values(PARTNER_PHASE_COPY)) {
    assert.doesNotMatch(`${copy.title} ${copy.note}`, /\b(her|she|your|you)\b/i);
  }
  assert.equal(PARTNER_PHASE_COPY.period.title, "Period days");
});

test("day counts read naturally", () => {
  assert.equal(inDays(0), "today");
  assert.equal(inDays(1), "in 1 day");
  assert.equal(inDays(11), "in 11 days");
});
