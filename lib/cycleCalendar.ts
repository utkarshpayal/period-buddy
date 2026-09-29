import type { DayEntry as LocalDayEntry } from "../components/AppState";
import type { DayEntry as ApiDayEntry, Predictions } from "./api";
import { getCyclePhase, type CyclePhase } from "./cycle";
import { getDateKey } from "./format";

/**
 * Calendar maths shared by the Tracker's month pager and the full Calendar
 * screen (month + year views), so both paint days the same way.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_CYCLE_LENGTH = 28;
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * 1-based day of the cycle `date` falls on. The gap between two local
 * midnights is 23h or 25h across a daylight-saving change, so it's rounded to
 * whole days — flooring it made every day after a spring-forward one day short.
 * The one definition for the tracker, Home's week strip and the Calendar screen.
 */
export function getCycleDay(date: Date, cycleStartDate: Date, cycleLength = DEFAULT_CYCLE_LENGTH) {
  const difference = Math.round((startOfDay(date).getTime() - startOfDay(cycleStartDate).getTime()) / MS_PER_DAY);
  return (((difference % cycleLength) + cycleLength) % cycleLength) + 1;
}

/** 0 = Monday … 6 = Sunday. */
export function getMondayFirstWeekday(date: Date) {
  return (date.getDay() + 6) % 7;
}

export function mapApiDayEntry(log: ApiDayEntry): LocalDayEntry {
  return {
    energy: log.energy,
    flow: log.flow,
    mood: log.mood,
    moods: log.moods,
    isIntimate: log.isIntimate ?? false,
    note: log.note ?? "",
    symptoms: log.symptoms ?? [],
    updatedAt: log.date ?? new Date().toISOString(),
    sleepHours: log.sleepHours,
    waterIntake: log.waterIntake,
    weight: log.weight,
    temperature: log.temperature,
    stressLevel: log.stressLevel,
    medication: log.medication,
    digestion: log.digestion,
    digestions: log.digestions,
    skin: log.skin,
    skins: log.skins,
    discharge: log.discharge,
    exercise: log.exercise,
  };
}

/** Everything needed to paint any day, derived once from predictions + settings. */
export type CalendarModel = {
  cycleStartDate: Date;
  cycleLength: number;
  periodLength: number;
  /** Cycle day of ovulation (same pivot getCyclePhase uses). */
  ovulationDay: number;
  /** The logged current period, to hide predicted "tail" days after it ended. */
  periodMask: { start: Date; windowEnd: Date; actualEnd: Date } | null;
  todayStart: Date;
};

export function buildCalendarModel(
  predictions: Predictions | null,
  settings: { lastPeriodStartDate?: string | null; cycleLength?: number; periodLength?: number } | null,
): CalendarModel {
  const cycleLength = predictions?.cycleLength ?? settings?.cycleLength ?? DEFAULT_CYCLE_LENGTH;
  const periodLength = predictions?.periodLength ?? settings?.periodLength ?? 5;
  const cycleStartDate = predictions?.currentPeriodStartDateISO
    ? new Date(predictions.currentPeriodStartDateISO)
    : settings?.lastPeriodStartDate
      ? new Date(settings.lastPeriodStartDate)
      : addDays(new Date(), -13);

  let periodMask: CalendarModel["periodMask"] = null;
  const startISO = predictions?.currentPeriodStartDateISO;
  if (startISO && predictions?.actualPeriodStartISO && predictions?.actualPeriodEndISO) {
    const start = startOfDay(new Date(startISO));
    const windowEnd = addDays(start, periodLength - 1);
    const actualStart = startOfDay(new Date(predictions.actualPeriodStartISO));
    if (actualStart >= start && actualStart <= windowEnd) {
      periodMask = { start, windowEnd, actualEnd: startOfDay(new Date(predictions.actualPeriodEndISO)) };
    }
  }

  return {
    cycleStartDate,
    cycleLength,
    periodLength,
    ovulationDay: Math.max(periodLength + 1, cycleLength - 13),
    periodMask,
    todayStart: startOfDay(new Date()),
  };
}

export type DayStatus = {
  date: Date;
  dateKey: string;
  day: number;
  cycleDay: number;
  phase: CyclePhase;
  isToday: boolean;
  isLogged: boolean;
  hasFlow: boolean;
  /** Future/today period day the user hasn't logged (dashed ring). */
  isPredictedPeriod: boolean;
  isFertile: boolean;
  isOvulation: boolean;
};

type EntryLookup = (dateKey: string) => LocalDayEntry | undefined;

export function dayStatus(date: Date, model: CalendarModel, entryFor: EntryLookup, noteFor: (dateKey: string) => string | undefined, todayKey: string): DayStatus {
  const dateKey = getDateKey(date);
  const cycleDay = getCycleDay(date, model.cycleStartDate, model.cycleLength);
  const phase = getCyclePhase(cycleDay, model.periodLength, model.cycleLength);
  const entry = entryFor(dateKey);
  const isLogged = Boolean(entry?.note.trim() || entry?.symptoms.length || entry?.flow || entry?.mood || entry?.energy || noteFor(dateKey)?.trim());
  const d = startOfDay(date);
  const mask = model.periodMask;
  const isPhantomTail = Boolean(mask && d > mask.actualEnd && d >= mask.start && d <= mask.windowEnd);
  return {
    date,
    dateKey,
    day: date.getDate(),
    cycleDay,
    phase,
    isToday: dateKey === todayKey,
    isLogged,
    hasFlow: Boolean(entry?.flow && entry.flow !== "none"),
    isPredictedPeriod: phase === "period" && !isLogged && !isPhantomTail && d >= model.todayStart,
    isFertile: cycleDay >= model.ovulationDay - 5 && cycleDay <= model.ovulationDay + 1,
    isOvulation: cycleDay === model.ovulationDay,
  };
}

/** Monday-first grid for a month: leading nulls, then each day. Always 42 slots. */
export function monthSlots(monthDate: Date): (Date | null)[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const lead = getMondayFirstWeekday(new Date(year, month, 1));
  const days = new Date(year, month + 1, 0).getDate();
  const slots: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d += 1) slots.push(new Date(year, month, d));
  while (slots.length < 42) slots.push(null);
  return slots;
}
