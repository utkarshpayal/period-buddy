/**
 * Small, pure helpers for the Forest screen's summary sections (streak,
 * week totals, encouragement), unit-tested in lib/__tests__/forestView.test.ts.
 */

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
