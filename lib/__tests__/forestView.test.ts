import test from "node:test";
import assert from "node:assert/strict";
import type { ForestStatus } from "../api";
import {
  careHeadline,
  careStreak,
  lastSyncedLabel,
  packForestStatus,
  PACKED_FOREST_MAX_BYTES,
  rollCachedDay,
  shouldUseLowDetail,
  unpackForestStatus,
  weekTotals,
  withOfflineWater,
} from "../forestView";

const week = (dones: number[]) => dones.map((done, i) => ({ dateKey: `2026-10-0${i + 1}`, done }));

test("streak counts back from today", () => {
  assert.equal(careStreak(week([1, 0, 2, 3, 1]), "2026-10-05"), 3);
});

test("today not done yet doesn't break the streak", () => {
  assert.equal(careStreak(week([0, 1, 1, 2, 0]), "2026-10-05"), 3);
});

test("a missed yesterday resets it", () => {
  assert.equal(careStreak(week([1, 1, 1, 0, 0]), "2026-10-05"), 0);
});

test("order of the week doesn't matter, future days are ignored", () => {
  const w = week([1, 2, 1]).reverse().concat({ dateKey: "2026-10-09", done: 3 });
  assert.equal(careStreak(w, "2026-10-03"), 3);
});

test("week totals cap at 3 a day", () => {
  assert.deepEqual(weekTotals([{ done: 3 }, { done: 5 }, { done: 0 }]), { done: 6, possible: 9 });
});

test("headline", () => {
  assert.match(careHeadline(3), /All done/);
  assert.match(careHeadline(0), /Three small things/);
  assert.equal(careHeadline(1), "2 more to finish today");
});

const status = (trees = 3): ForestStatus => ({
  activeHabits: 2,
  averageHealth: 70,
  careActions: 4,
  currentHealth: 66,
  forestTier: "Sprout Woodland",
  healthyTreeCount: 3,
  todayCareLogged: false,
  tokens: 40,
  trackedDays: 9,
  trees: [{ health: 70, month: "2026-10", status: "healthy" }],
  growth: {
    stage: "sapling",
    stageIndex: 3,
    stageCount: 7,
    stageProgress: 0.4,
    nextStage: "young",
    pointsToNextStage: 6,
    points: 21,
    pointsPerTree: 60,
    growth: 0.35,
    totalPoints: 21 + trees * 60,
    treesGrown: trees,
    grownTrees: Array.from({ length: Math.min(trees, 24) }, (_, i) => ({ number: trees - Math.min(trees, 24) + i + 1, grownOn: "2026-09-01" })),
    vitality: "thirsty",
    vitalityLevel: 60,
    daysSinceActive: 1,
    today: { dateKey: "2026-10-16", tasks: [{ key: "log", done: true }, { key: "habit", done: false }, { key: "water", done: false }], done: 1, total: 3 },
    week: Array.from({ length: 7 }, (_, i) => ({ dateKey: `2026-10-1${i}`, done: i === 6 ? 1 : 2 })),
  },
});

test("packed forest round-trips for the same account", () => {
  const s = status();
  const back = unpackForestStatus(JSON.parse(JSON.stringify(packForestStatus(s, "u1", 1000))), "u1");
  assert.ok(back);
  assert.equal(back.savedAt, 1000);
  assert.deepEqual(back.status.growth, s.growth);
  assert.equal(back.status.currentHealth, 66);
});

test("another account's copy or junk is ignored", () => {
  assert.equal(unpackForestStatus(packForestStatus(status(), "u1", 1), "u2"), null);
  assert.equal(unpackForestStatus({ v: 2 }, "u1"), null);
  assert.equal(unpackForestStatus(null, "u1"), null);
});

test("a big forest still fits the keystore, keeping the newest trees", () => {
  const packed = packForestStatus(status(24), "a".repeat(24), Date.now());
  assert.ok(JSON.stringify(packed).length <= PACKED_FOREST_MAX_BYTES);
  assert.equal(packed.g?.treesGrown, 24);
  assert.equal(packed.g?.grownTrees.at(-1)?.[0], 24);
});

test("yesterday's cached ticks don't show as today's", () => {
  const rolled = rollCachedDay(status(), "2026-10-17");
  assert.equal(rolled.growth?.today.dateKey, "2026-10-17");
  assert.equal(rolled.growth?.today.done, 0);
  assert.ok(rolled.growth?.today.tasks.every((t) => !t.done));
  assert.equal(rollCachedDay(status(), "2026-10-16").growth?.today.done, 1);
});

test("offline watering shows done at once, once", () => {
  const once = withOfflineWater(status(), "2026-10-16");
  assert.equal(once.growth?.today.done, 2);
  assert.ok(once.growth?.today.tasks.find((t) => t.key === "water")?.done);
  assert.equal(once.growth?.week.at(-1)?.done, 2);
  assert.equal(once.growth?.points, 21);
  assert.equal(withOfflineWater(once, "2026-10-16"), once);
});

test("last synced label", () => {
  const now = Date.UTC(2026, 9, 16, 12);
  assert.equal(lastSyncedLabel(now - 10_000, now), "Last synced just now");
  assert.equal(lastSyncedLabel(now - 5 * 60_000, now), "Last synced 5 min ago");
  assert.equal(lastSyncedLabel(now - 3 * 3600_000, now), "Last synced 3 h ago");
  assert.match(lastSyncedLabel(now - 3 * 86400_000, now), /^Last synced on \d+ Oct$/);
});

test("low detail on small-memory or old phones", () => {
  assert.equal(shouldUseLowDetail({ memoryBytes: 2 * 1024 ** 3, yearClass: 2021 }), true);
  assert.equal(shouldUseLowDetail({ memoryBytes: 8 * 1024 ** 3, yearClass: 2016 }), true);
  assert.equal(shouldUseLowDetail({ memoryBytes: 8 * 1024 ** 3, yearClass: 2022 }), false);
  assert.equal(shouldUseLowDetail({ memoryBytes: null, yearClass: null }), false);
});
