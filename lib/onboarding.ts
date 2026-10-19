import type { Ionicons } from "@expo/vector-icons";
import { getDateKey } from "./format";

// Pure data and date math for the first-run setup flow
// (components/onboarding/OnboardingFlow.tsx). No React, no I/O, so it's
// unit-tested in lib/__tests__/onboarding.test.ts.

export type TrackingGoal =
  | "track_period"
  | "achieve_pregnancy"
  | "avoid_pregnancy"
  | "manage_symptoms"
  | "general_health";

export const GOAL_OPTIONS: {
  value: TrackingGoal;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: "track_period", label: "Track my period", hint: "Know what's coming, every cycle", icon: "water-outline" },
  { value: "manage_symptoms", label: "Understand my symptoms", hint: "Cramps, moods, skin, energy", icon: "pulse-outline" },
  { value: "achieve_pregnancy", label: "Trying to conceive", hint: "Spot my fertile days", icon: "heart-outline" },
  { value: "avoid_pregnancy", label: "Avoid pregnancy", hint: "See my estimated fertile days", icon: "shield-checkmark-outline" },
  { value: "general_health", label: "Feel better overall", hint: "Sleep, habits and wellbeing", icon: "leaf-outline" },
];

export const DEFAULT_PERIOD_LENGTH = 5;
export const DEFAULT_CYCLE_LENGTH = 28;
export const PERIOD_LENGTH_RANGE = { min: 1, max: 10 } as const;
export const CYCLE_LENGTH_RANGE = { min: 20, max: 45 } as const;
/** The backend's age gate: the date-of-birth wheel stops at this age. */
export const MIN_AGE_YEARS = 13;

/** "I'm not sure" answers for the last-period question, newest first. */
export type PeriodRange = "this_week" | "1_2_weeks" | "3_4_weeks" | "over_month";

export const PERIOD_RANGE_OPTIONS: { value: PeriodRange; label: string; daysAgo: number }[] = [
  { value: "this_week", label: "In the last week", daysAgo: 3 },
  { value: "1_2_weeks", label: "1–2 weeks ago", daysAgo: 10 },
  { value: "3_4_weeks", label: "3–4 weeks ago", daysAgo: 24 },
  { value: "over_month", label: "Over a month ago", daysAgo: 35 },
];

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** A rough start date for a "not sure" answer, as a YYYY-MM-DD key. */
export function approximatePeriodStart(range: PeriodRange, today: Date = new Date()): string {
  const option = PERIOD_RANGE_OPTIONS.find((item) => item.value === range) ?? PERIOD_RANGE_OPTIONS[0];
  return getDateKey(addDays(today, -option.daysAgo));
}

export function clampLength(value: number, range: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return range.min;
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

/**
 * First predicted period start on or after `today`, rolling the cycle
 * forward from the last start. Mirrors the backend's simple prediction for a
 * brand-new account (no logs yet), so the finish screen's date matches what
 * the tracker shows a moment later.
 */
export function estimateNextPeriod(
  lastPeriodStartKey: string,
  cycleLength: number,
  today: Date = new Date(),
): { date: Date; daysAway: number } {
  const length = clampLength(cycleLength, CYCLE_LENGTH_RANGE);
  const start = parseDateKey(lastPeriodStartKey);
  const todayStart = addDays(today, 0);
  let next = addDays(start, length);
  while (next < todayStart) next = addDays(next, length);
  const daysAway = Math.round((next.getTime() - todayStart.getTime()) / 86_400_000);
  return { date: next, daysAway };
}

/** Day of the current cycle (1-based) given the last start, for the ring. */
export function currentCycleDay(lastPeriodStartKey: string, cycleLength: number, today: Date = new Date()): number {
  const length = clampLength(cycleLength, CYCLE_LENGTH_RANGE);
  const elapsed = Math.round((addDays(today, 0).getTime() - parseDateKey(lastPeriodStartKey).getTime()) / 86_400_000);
  return (((elapsed % length) + length) % length) + 1;
}

export const MAX_AGE_YEARS = 80;

/** Whole years between `birth` and `today`. */
export function ageFrom(birth: Date, today: Date = new Date()): number {
  let age = today.getFullYear() - birth.getFullYear();
  const hadBirthday =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}

/**
 * Whole-year age from a profile `dateOfBirth` ("YYYY-MM-DD" or an ISO time),
 * or null if unset or unreadable. Calendar-exact (not 365.25-day years), so
 * it's never a day off around a birthday. The date part is read as a local
 * calendar day: `new Date("2008-10-18")` is UTC midnight, which is the
 * previous day in timezones behind UTC. Every client age check uses this.
 */
export function ageFromDateOfBirth(dateOfBirth?: string | null, now: Date = new Date()): number | null {
  if (!dateOfBirth) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth);
  const birth = parts ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])) : new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  const age = ageFrom(birth, now);
  return age >= 0 && age < 130 ? age : null;
}

export type BirthdayCheck =
  | { status: "incomplete" }
  | { status: "invalid"; message: string }
  | { status: "ok"; dateKey: string; age: number };

/**
 * Validates typed day / month / year boxes. Incomplete input is not an
 * error yet (the user is still typing); a finished but impossible date is.
 */
export function checkBirthday(day: string, month: string, year: string, today: Date = new Date()): BirthdayCheck {
  if (day.length < 1 || month.length < 1 || year.length < 4) return { status: "incomplete" };
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) {
    return { status: "invalid", message: "Use numbers only." };
  }
  if (m < 1 || m > 12) return { status: "invalid", message: "Month should be between 1 and 12." };
  const date = new Date(y, m - 1, d);
  if (d < 1 || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return { status: "invalid", message: "That day doesn't exist in that month." };
  }
  const age = ageFrom(date, today);
  if (date > today) return { status: "invalid", message: "That date is in the future." };
  if (age < MIN_AGE_YEARS) return { status: "invalid", message: `You need to be at least ${MIN_AGE_YEARS} to use Nura.` };
  if (age > MAX_AGE_YEARS) return { status: "invalid", message: "Please check the year." };
  return { status: "ok", dateKey: getDateKey(date), age };
}

/** Loose client-side phone check, so a typo is caught on the spot instead of
 *  failing the server's isMobilePhone() later. Empty is valid: phone is
 *  optional everywhere. */
export function isPlausiblePhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^\+?\d{10,15}$/.test(trimmed.replace(/[\s()-]/g, ""));
}

export function normalizePhone(value: string): string {
  return value.trim().replace(/[\s()-]/g, "");
}

// ---- Saved progress --------------------------------------------------------

export type OnboardingDraft = {
  stepIndex: number;
  goals: TrackingGoal[];
  lastPeriodStartDate: string;
  periodRange: PeriodRange | null;
  periodLength: number;
  cycleLength: number;
  dateOfBirth: string;
};

export const EMPTY_DRAFT: OnboardingDraft = {
  stepIndex: 0,
  goals: [],
  lastPeriodStartDate: "",
  periodRange: null,
  periodLength: DEFAULT_PERIOD_LENGTH,
  cycleLength: DEFAULT_CYCLE_LENGTH,
  dateOfBirth: "",
};

export function onboardingDraftKey(userId: string | undefined): string {
  return `period-buddy.onboarding-draft.${userId ?? "anon"}`;
}

/** Reads a stored draft defensively: anything malformed falls back to the
 *  empty draft field by field, so an old or corrupt value can't crash setup. */
export function parseDraft(raw: string | null, stepCount: number): OnboardingDraft {
  if (!raw) return EMPTY_DRAFT;
  let value: Partial<OnboardingDraft>;
  try {
    value = JSON.parse(raw);
  } catch {
    return EMPTY_DRAFT;
  }
  if (!value || typeof value !== "object") return EMPTY_DRAFT;

  const goalValues = new Set(GOAL_OPTIONS.map((goal) => goal.value));
  const rangeValues = new Set(PERIOD_RANGE_OPTIONS.map((range) => range.value));
  const isDateKey = (input: unknown) => typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input);

  return {
    stepIndex:
      typeof value.stepIndex === "number" && value.stepIndex >= 0 && value.stepIndex < stepCount
        ? Math.floor(value.stepIndex)
        : 0,
    goals: Array.isArray(value.goals) ? value.goals.filter((goal) => goalValues.has(goal)) : [],
    lastPeriodStartDate: isDateKey(value.lastPeriodStartDate) ? (value.lastPeriodStartDate as string) : "",
    periodRange: value.periodRange && rangeValues.has(value.periodRange) ? value.periodRange : null,
    periodLength:
      typeof value.periodLength === "number"
        ? clampLength(value.periodLength, PERIOD_LENGTH_RANGE)
        : DEFAULT_PERIOD_LENGTH,
    cycleLength:
      typeof value.cycleLength === "number"
        ? clampLength(value.cycleLength, CYCLE_LENGTH_RANGE)
        : DEFAULT_CYCLE_LENGTH,
    dateOfBirth: isDateKey(value.dateOfBirth) ? (value.dateOfBirth as string) : "",
  };
}
