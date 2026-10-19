import test from "node:test";
import assert from "node:assert/strict";
import { FEATURE_REGISTRY } from "../appConfig";
import { TRACKER_SEARCH_ITEMS, searchTrackerItems } from "../trackerSearch";

const all = () => true;

test("an empty query finds nothing", () => {
  assert.deepEqual(searchTrackerItems("   ", all), []);
});

test("matches title or description, ignoring case", () => {
  const keys = searchTrackerItems("CRAMP", all).map((i) => i.key);
  assert.ok(keys.includes("log-cramps"));
  assert.ok(searchTrackerItems("journal", all).some((i) => i.key === "log-note"));
});

test("phases match by plain and medical name", () => {
  assert.ok(searchTrackerItems("before your period", all).some((i) => i.key === "phase-luteal"));
  assert.ok(searchTrackerItems("luteal", all).some((i) => i.key === "phase-luteal"));
});

test("features the CMS hides are left out, others stay", () => {
  const hidden = (key: string) => key !== "forest";
  assert.equal(searchTrackerItems("forest", hidden).some((i) => i.key === "feature-forest"), false);
  assert.equal(searchTrackerItems("forest", all).some((i) => i.key === "feature-forest"), true);
  // Not CMS-controlled: always shown.
  assert.ok(searchTrackerItems("community", () => false).some((i) => i.key === "community"));
});

test("keys are unique and every feature action is a registry key", () => {
  const keys = TRACKER_SEARCH_ITEMS.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
  const registry = new Set(FEATURE_REGISTRY.map((f) => f.key));
  for (const item of TRACKER_SEARCH_ITEMS) {
    if (item.action.type === "feature") assert.ok(registry.has(item.action.key), item.key);
  }
});
