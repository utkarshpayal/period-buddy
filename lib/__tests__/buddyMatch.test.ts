import test from "node:test";
import assert from "node:assert/strict";
import { matchStrength, phaseFilters, phaseKeyOf, visibleCandidates } from "../buddyMatch";

const people = [
  { id: "a", name: "Asha", cyclePhase: "Luteal Phase", cycleOverlapDays: 3, compatibility: 70, similarities: ["cramps"] },
  { id: "b", name: "Bina", cyclePhase: "Follicular Phase", cycleOverlapDays: 6, compatibility: 90, similarities: ["yoga"] },
  { id: "c", name: "Chitra", cyclePhase: "Luteal Phase", cycleOverlapDays: 6, compatibility: 60, similarities: [] },
];

test("phase labels map to a phase key", () => {
  assert.equal(phaseKeyOf("Luteal Phase"), "luteal");
  assert.equal(phaseKeyOf("Menstrual Phase"), "period");
  assert.equal(phaseKeyOf("Period Phase"), "period");
  assert.equal(phaseKeyOf("Ovulation Phase"), "ovulation");
  assert.equal(phaseKeyOf(undefined), "unknown");
});

test("best match first, ties keep their order", () => {
  assert.deepEqual(visibleCandidates(people, {}).map((p) => p.id), ["b", "a", "c"]);
});

test("most overlap first, then compatibility", () => {
  assert.deepEqual(visibleCandidates(people, { sort: "overlap" }).map((p) => p.id), ["b", "c", "a"]);
});

test("the active buddy is always pinned first", () => {
  assert.deepEqual(visibleCandidates(people, { activeId: "c" }).map((p) => p.id), ["c", "b", "a"]);
});

test("search covers name, phase and shared traits", () => {
  assert.deepEqual(visibleCandidates(people, { query: "yoga" }).map((p) => p.id), ["b"]);
  assert.deepEqual(visibleCandidates(people, { query: " luteal " }).map((p) => p.id), ["a", "c"]);
  assert.deepEqual(visibleCandidates(people, { query: "nobody" }), []);
});

test("phase chip filters, and chips only list phases present", () => {
  assert.deepEqual(visibleCandidates(people, { phase: "follicular" }).map((p) => p.id), ["b"]);
  assert.deepEqual(phaseFilters(people), [
    { key: "follicular", label: "Follicular", count: 1 },
    { key: "luteal", label: "Luteal", count: 2 },
  ]);
});

test("match strength wording", () => {
  assert.equal(matchStrength(85).tier, "great");
  assert.equal(matchStrength(65).tier, "good");
  assert.equal(matchStrength(40).label, "Fair match");
});
