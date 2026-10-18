/**
 * Small, pure helpers for the Forest screen's summary sections (streak,
 * week totals, encouragement), unit-tested in lib/__tests__/forestView.test.ts.
 */

import type { ForestGrowth, ForestStatus } from "./api";

/** Growth to draw each stage's tree at, for the "growth journey" strip. */
export const STAGE_GROWTH = [0.02, 0.13, 0.22, 0.38, 0.56, 0.76, 1];

/**
 * Days in a row with at least one task done, ending today. Today not done yet
 * doesn't break it: the streak still counts up to yesterday.
 */
export function careStreak(week: { dateKey: string; done: number }[], todayKey: string): number {
  const days = [...week].sort((a, b) => a.dateKey.localeCompare(b.dateKey)).filter((d) => d.dateKey <= todayKey);
  let i = days.length - 1;
  if (i >= 0 && days[i].dateKey === todayKey && days[i].done === 0) i -= 1;
  let streak = 0;
  for (; i >= 0 && days[i].done > 0; i--) streak += 1;
  return streak;
}

/** Tasks done across the week, out of 3 a day. */
export function weekTotals(week: { done: number }[]): { done: number; possible: number } {
  return { done: week.reduce((n, d) => n + Math.min(3, Math.max(0, d.done)), 0), possible: week.length * 3 };
}

/** One encouraging line for today's progress. */
export function careHeadline(done: number, total = 3): string {
  if (done >= total) return "All done today. Your tree is happy";
  if (done === 0) return "Three small things grow your tree";
  return `${total - done} more to finish today`;
}

/* ------------------------- Offline copy (lib/forestCache.ts) ------------------------- */

/**
 * The last forest status, packed small enough for the OS keystore (expo-secure-store
 * may refuse values over ~2 KB): only the fields the Forest screen draws, with
 * grown trees as `[number, grownOn]` pairs. Oldest grown trees are dropped first
 * if it would still be too big; `treesGrown` keeps the real count.
 */
export type PackedForest = {
  v: 1;
  /** Account the copy belongs to; another account's copy is ignored. */
  u: string;
  /** When it was fetched from the server (ms). */
  t: number;
  h: number;
  c: boolean;
  g: (Omit<ForestGrowth, "grownTrees"> & { grownTrees: [number, string][] }) | null;
};

export const PACKED_FOREST_MAX_BYTES = 1900;

export function packForestStatus(status: ForestStatus, userId: string, savedAt: number): PackedForest {
  const packed: PackedForest = { v: 1, u: userId, t: savedAt, h: status.currentHealth, c: status.todayCareLogged, g: null };
  if (status.growth) {
    const { grownTrees, ...rest } = status.growth;
    packed.g = { ...rest, grownTrees: grownTrees.map((t) => [t.number, t.grownOn] as [number, string]) };
    while (packed.g.grownTrees.length > 0 && JSON.stringify(packed).length > PACKED_FOREST_MAX_BYTES) {
      packed.g.grownTrees = packed.g.grownTrees.slice(Math.ceil(packed.g.grownTrees.length / 4));
    }
  }
  return packed;
}

/** The packed copy back as a status, or null if it isn't one (or isn't this account's). */
export function unpackForestStatus(raw: unknown, userId: string): { status: ForestStatus; savedAt: number } | null {
  const p = raw as PackedForest | null;
  if (!p || typeof p !== "object" || p.v !== 1 || p.u !== userId || typeof p.t !== "number") return null;
  if (typeof p.h !== "number") return null;
  let growth: ForestGrowth | undefined;
  if (p.g) {
    if (!Array.isArray(p.g.grownTrees) || !Array.isArray(p.g.week) || !p.g.today || !Array.isArray(p.g.today.tasks)) return null;
    growth = { ...p.g, grownTrees: p.g.grownTrees.map(([number, grownOn]) => ({ number, grownOn })) };
  }
  return {
    savedAt: p.t,
    status: {
      growth,
      currentHealth: p.h,
      todayCareLogged: !!p.c,
      activeHabits: 0,
      averageHealth: p.h,
      careActions: 0,
      forestTier: "",
      healthyTreeCount: 0,
      tokens: 0,
      trackedDays: 0,
      trees: [],
    },
  };
}

/**
 * A cached copy from an earlier day: today's tasks start fresh (nothing done
 * yet), so yesterday's ticks don't show as today's while offline.
 */
export function rollCachedDay(status: ForestStatus, todayKey: string): ForestStatus {
  const g = status.growth;
  if (!g || g.today.dateKey === todayKey) return status;
  return {
    ...status,
    todayCareLogged: false,
    growth: { ...g, today: { ...g.today, dateKey: todayKey, done: 0, tasks: g.today.tasks.map((t) => ({ ...t, done: false })) } },
  };
}

/**
 * Watering saved offline: show it done right away (the server adds the growth
 * point when it syncs, so points and stage stay as they were).
 */
export function withOfflineWater(status: ForestStatus, dateKey: string): ForestStatus {
  const g = status.growth;
  if (!g) return { ...status, todayCareLogged: true };
  if (g.today.dateKey !== dateKey || g.today.tasks.some((t) => t.key === "water" && t.done)) return status;
  return {
    ...status,
    todayCareLogged: true,
    growth: {
      ...g,
      vitality: "thriving",
      daysSinceActive: 0,
      today: {
        ...g.today,
        done: Math.min(g.today.total, g.today.done + 1),
        tasks: g.today.tasks.map((t) => (t.key === "water" ? { ...t, done: true } : t)),
      },
      week: g.week.map((d) => (d.dateKey === dateKey ? { ...d, done: Math.min(3, d.done + 1) } : d)),
    },
  };
}

/** "Last synced just now / 5 min ago / 3 h ago / on 12 Oct". */
export function lastSyncedLabel(savedAt: number, now: number): string {
  const min = Math.max(0, Math.round((now - savedAt) / 60000));
  if (min < 1) return "Last synced just now";
  if (min < 60) return `Last synced ${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `Last synced ${h} h ago`;
  const d = new Date(savedAt);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `Last synced on ${d.getDate()} ${months[d.getMonth()]}`;
}

/**
 * Lighter scene on low-end phones: fewer particles, fewer trees on the hill
 * and the simpler tree. `memoryBytes`/`yearClass` come from expo-device (null if unknown).
 */
export function shouldUseLowDetail({ memoryBytes, yearClass }: { memoryBytes: number | null; yearClass: number | null }): boolean {
  if (memoryBytes !== null && memoryBytes > 0 && memoryBytes < 3.5 * 1024 ** 3) return true;
  return yearClass !== null && yearClass > 0 && yearClass < 2018;
}
