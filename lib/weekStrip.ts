import { getCycleDay, startOfDay } from "./cycleCalendar";

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type WeekStripDay = {
  letter: string;
  dayNumber: number;
  isToday: boolean;
  isFuture: boolean;
  isPeriod: boolean;
  isFertile: boolean;
};

/**
 * Home's current Mon–Sun week (day letter + date number), plus, for each
 * day, whether it falls in the period or fertile window — same thresholds
 * tracker.tsx's calendar uses — so the strip reads as real cycle context.
 * Unit-tested in lib/__tests__/weekStrip.test.ts.
 *
 * Days from the current period's start up to today count on without wrapping:
 * when the period is late (today past `cycleLength`), the days since the
 * expected start are not period days, they're just late. Only days ahead
 * (and before the current cycle) wrap onto the predicted cycle.
 */
export function buildCurrentWeekStrip(
  today: Date,
  cycleStartDate: Date,
  cycleLength: number,
  periodLength: number,
  ovulationDayPivot: number,
): WeekStripDay[] {
  const todayStart = startOfDay(today);
  const start = startOfDay(cycleStartDate);
  const mondayOffset = (todayStart.getDay() + 6) % 7;
  const todaySince = Math.round((todayStart.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  const monday = new Date(todayStart);
  monday.setDate(todayStart.getDate() - mondayOffset);

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const isFuture = date.getTime() > todayStart.getTime();
    const sinceStart = Math.round((date.getTime() - start.getTime()) / MS_PER_DAY) + 1;
    const inCurrentCycle = sinceStart >= 1 && !isFuture;
    // While late, the period can start any day: future days project from tomorrow.
    const lateStart = todaySince > cycleLength ? new Date(todayStart.getTime() + MS_PER_DAY) : null;
    const cycleDay = inCurrentCycle ? sinceStart : isFuture && lateStart ? getCycleDay(date, lateStart, cycleLength) : getCycleDay(date, start, cycleLength);
    return {
      letter: WEEKDAY_LETTERS[i],
      dayNumber: date.getDate(),
      isToday: date.getTime() === todayStart.getTime(),
      isFuture,
      isPeriod: cycleDay <= periodLength,
      isFertile: cycleDay >= ovulationDayPivot - 5 && cycleDay <= ovulationDayPivot,
    };
  });
}
