import type { Habit } from "./api";

/**
 * A habit as it looks right after a tap, before the server answers: today's
 * check, today's dot in the week strip and the streak. A streak counts
 * through yesterday until today is ticked, so ticking adds one and unticking
 * takes it back. The server's answer replaces the streak afterwards.
 */
export function applyTick(habit: Habit, done: boolean): Habit {
  if (habit.completed === done) return habit;
  const week = habit.week?.map((day, i, all) => (i === all.length - 1 ? { ...day, done } : day));
  const streak = Math.max(0, habit.streak + (done ? 1 : -1));
  return { ...habit, completed: done, streak, week };
}

/** Today's progress across the list. */
export function habitProgress(habits: Habit[]) {
  const total = habits.length;
  const done = habits.filter((h) => h.completed).length;
  return { done, total, allDone: total > 0 && done === total, ratio: total ? done / total : 0 };
}

/** "Done 4 of the last 7 days", for screen readers. */
export function weekSummary(habit: Habit): string | null {
  if (!habit.week?.length) return null;
  const done = habit.week.filter((d) => d.done).length;
  return `done ${done} of the last ${habit.week.length} days`;
}
