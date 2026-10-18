import assert from "node:assert/strict";
import test from "node:test";
import {
  addCommunityTag,
  MAX_COMMUNITY_TAGS,
  sameCommunityTag,
  sanitizeCommunityTag,
} from "../communityTags";

test("typed tags lose #, unsafe characters and extra spaces", () => {
  assert.equal(sanitizeCommunityTag("  #cramps "), "cramps");
  assert.equal(sanitizeCommunityTag("late   period!!"), "late period");
  assert.equal(sanitizeCommunityTag("<b>pcos</b>"), "bpcosb");
  assert.equal(sanitizeCommunityTag("#"), "");
});

test("adding a tag dedupes ignoring case and enforces the limits", () => {
  let tags: string[] = [];
  for (const raw of ["PCOS", "sleep", "cramps", "mood", "acne"]) {
    const result = addCommunityTag(tags, raw);
    assert.equal(result.ok, true);
    tags = result.tags;
  }
  assert.equal(tags.length, MAX_COMMUNITY_TAGS);
  assert.deepEqual(addCommunityTag(tags, "#pcos"), { ok: false, tags, reason: "duplicate" });
  assert.deepEqual(addCommunityTag(tags, "new"), { ok: false, tags, reason: "limit" });
  assert.equal(addCommunityTag([], "x".repeat(25)).ok, false);
  assert.equal(addCommunityTag([], "x".repeat(24)).ok, true);
  assert.deepEqual(addCommunityTag([], " # "), { ok: false, tags: [], reason: "empty" });
});

test("tag comparison ignores case and a leading #", () => {
  assert.equal(sameCommunityTag("#Cramps", "cramps"), true);
  assert.equal(sameCommunityTag("cramps", null), false);
});
