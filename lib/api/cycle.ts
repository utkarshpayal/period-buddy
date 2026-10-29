import type { CyclePhase } from "../cycle";
import { fetchQuery } from "../queryCache";
import type { SymptomPredictionsResponse } from "./ai";
import { apiRequest, toQuery } from "./client";

export type MoodValue =
  | "anxious"
  | "apathetic"
  | "calm"
  | "confused"
  | "depressed"
  | "emotional"
  | "energetic"
  | "frisky"
  | "guilty"
  | "happy"
  | "irritable"
  | "lowEnergy"
  | "moodSwings"
  | "neutral"
  | "obsessive"
  | "sad"
  | "selfCritical"
  | "tired";
// NOTE: "apathetic" | "confused" | "depressed" | "frisky" | "guilty" |
// "lowEnergy" | "moodSwings" | "obsessive" | "selfCritical" are new — the
// day-log modal now offers the reference app's full mood grid. `mood`/`moods`
// are backend-owned enum fields (period-buddy-be, a separate repo not present
// here), so if that service validates this union strictly, it needs the same
// values added server-side or it will reject these new logs.

export type DayEntry = {
  _id?: string;
  cycleDay?: number;
  date?: string;
  dateKey: string;
  digestion?: "bloated" | "constipated" | "diarrhea" | "normal";
  // Multi-select counterparts for fields that can genuinely co-occur in a day
  // (e.g. bloated *and* constipated, acne *and* oily, several moods). Sent
  // additively alongside the scalar field — the scalar stays the primary/first
  // value for backward-compat, and the backend can adopt these arrays without
  // breaking existing clients. Prefer these in new UI.
  digestions?: ("bloated" | "constipated" | "diarrhea" | "normal")[];
  discharge?: "creamy" | "egg-white" | "none" | "sticky" | "watery";
  energy?: "high" | "low" | "medium" | "steady";
  exercise?: string[];
  flow?: "heavy" | "light" | "medium" | "none" | "spotting";
  isIntimate?: boolean;
  medication?: string[];
  mood?: MoodValue;
  moods?: MoodValue[];
  note?: string;
  phase?: CyclePhase | string;
  rewardPoints?: number;
  skin?: "acne" | "clear" | "dry" | "oily";
  skins?: ("acne" | "clear" | "dry" | "oily")[];
  sleepHours?: number;
  stressLevel?: number;
  symptoms?: string[];
  temperature?: number;
  /** @deprecated use rewardPoints */
  tokensEarned?: number;
  waterIntake?: number;
  weight?: number;
};

export type CycleSettings = {
  _id?: string;
  cycleLength: number;
  fertilityReminder?: boolean;
  lastPeriodStartDate: string;
  ovulationReminder?: boolean;
  periodLength: number;
  pregnancyMode?: boolean;
  reminderDaysBefore?: number;
  remindersEnabled?: boolean;
  trackingGoal?: "achieve_pregnancy" | "avoid_pregnancy" | "general_health" | "manage_symptoms" | "track_period";
};

export type Predictions = {
  analyticsData: { daysLogged?: number; length: number; month: string }[];
  currentCycleDay: number;
  currentPhase: string;
  /** ISO start of the cycle currently in progress — the history-aware anchor
   *  the calendar should project future phases from (not the stale settings
   *  lastPeriodStartDate). */
  currentPeriodStartDateISO?: string;
  currentPeriodEndDateISO?: string;
  fertileWindowDuration: string;
  fertileWindowRange: string;
  isDataHighlyAccurate: boolean;
  nextPeriodDate: string;
  nextPeriodDateISO: string;
  nextPeriodDateKey?: string;
  nextPeriodDaysAway: number;
  ovulationDate: string;
  ovulationDateISO?: string;
  ovulationDaysAway: number;
  /** false for highly irregular cycles, where calendar ovulation is unreliable */
  ovulationReliable?: boolean;
  fertileWindowReliable?: boolean;
  periodLength: number;
  cycleLength: number;

  // Predicted vs. actual data model. The anchor for future predictions is the
  // most recent *actual* logged period start, never a stale predicted date.
  predictedPeriodStartISO?: string;
  predictedPeriodEndISO?: string;
  predictedPeriodStartEarliestISO?: string;
  predictedPeriodStartLatestISO?: string;
  predictedWindowRange?: string;
  actualPeriodStartISO?: string | null;
  actualPeriodEndISO?: string | null;

  // Prediction quality metadata.
  predictionMethod?:
    | "configured_cycle"
    | "historical_median"
    | "historical_weighted"
    | "irregular_range";
  confidence?: "low" | "medium" | "high";
  variability?: "low" | "medium" | "high" | "unknown";
  isRegular?: boolean | null;
  /** true when the date is a rough estimate (high variability) — show a window */
  isEstimate?: boolean;
  cyclesAnalyzed?: number;
  cycleLengthHistory?: number[];
  medianCycleLength?: number | null;
  minCycleLength?: number | null;
  maxCycleLength?: number | null;
  /** count of implausible "double cycle" lengths excluded from the estimate */
  outliersRemoved?: number;

  /** Days since the period was due with none logged; isLate from 1 day. */
  isLate?: boolean;
  daysLate?: number;
  /** FIGO normal range for this person's age (24–38 adults, 21–45 teens). */
  normalCycleRange?: { min: number; max: number };
  /** Typical cycle length is outside normalCycleRange. */
  outsideNormalRange?: boolean;
  /** Days the last logged period lasted; longPeriod when > 8 (FIGO). */
  lastPeriodDays?: number | null;
  longPeriod?: boolean;
  /** No period for 90+ days while still logging. */
  noPeriodTooLong?: boolean;
  peakFertileStartISO?: string;
  peakFertileEndISO?: string;
  fertileWindowStartISO?: string;
  fertileWindowEndISO?: string;

  // Staleness — set when the user has stopped logging for 2+ predicted cycles,
  // so the projection is a guess rather than a measurement.
  daysSinceLastActualPeriod?: number | null;
  skippedCycles?: number;
  isStale?: boolean;
};

export type HabitDay = { dateKey: string; done: boolean };

export type Habit = {
  _id?: string;
  color: string;
  completed: boolean;
  frequency?: "custom" | "daily" | "weekly";
  icon: string;
  id: string;
  reminderTime?: string;
  rewardPoints?: number;
  streak: number;
  target?: number;
  title: string;
  /** @deprecated use rewardPoints */
  tokens: number;
  /** Why it was suggested, for habits added from a suggestion. */
  reason?: string;
  /** The last 7 local days, oldest first, ending today. */
  week?: HabitDay[];
};

export type HabitSuggestion = {
  key: string;
  title: string;
  /** Ionicons name, drawn through components/Icon.tsx. */
  icon: string;
  category: "care" | "mind" | "movement" | "nutrition" | "sleep";
  rewardPoints: number;
  /** One line on why it was picked, from the person's logs. */
  reason: string;
};

export type HabitSuggestions = {
  dateKey: string;
  source: "ai" | "rules";
  /** Nothing logged lately, so nothing to pick from: ask her to log instead. */
  needsLogs?: boolean;
  suggestions: HabitSuggestion[];
};

export type ForestTree = {
  health: number;
  month: string;
  status: "dead" | "healthy" | "wilted" | string;
};

export type ForestTaskKey = "log" | "habit" | "water";
export type ForestGrowthStage = "seed" | "sprout" | "seedling" | "sapling" | "young" | "mature" | "bloom";
export type ForestVitality = "new" | "thriving" | "thirsty" | "wilting" | "dry";

/** Seed → tree growth from daily tasks (backend utils/forestGrowth.js). */
export type ForestGrowth = {
  stage: ForestGrowthStage;
  stageIndex: number;
  stageCount: number;
  stageProgress: number;
  nextStage: ForestGrowthStage | null;
  pointsToNextStage: number;
  points: number;
  pointsPerTree: number;
  /** 0..1 along seed → full tree. */
  growth: number;
  totalPoints: number;
  treesGrown: number;
  grownTrees: { number: number; grownOn: string }[];
  vitality: ForestVitality;
  vitalityLevel: number;
  daysSinceActive: number | null;
  today: { dateKey: string; tasks: { key: ForestTaskKey; done: boolean }[]; done: number; total: number };
  week: { dateKey: string; done: number }[];
};

export type ForestStatus = {
  /** Missing from backends older than the growth feature. */
  growth?: ForestGrowth;
  activeHabits: number;
  averageHealth: number;
  careActions: number;
  currentHealth: number;
  forestTier: string;
  healthyTreeCount: number;
  todayCareLogged: boolean;
  tokens: number;
  trackedDays: number;
  trees: ForestTree[];
};

export type ForestLog = {
  _id: string;
  careType: "habit_completion" | "manual" | "reflection" | "symptom_log" | "water";
  completed?: boolean;
  dateKey: string;
  duration?: number;
  healthDelta: number;
  note?: string;
  rewardPoints?: number;
  treeType?: string;
};

export const cycleApi = {
  saveSettings: (payload: Partial<CycleSettings>) =>
    apiRequest<CycleSettings>("/api/cycle/settings", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  /** Shared through lib/queryCache.ts (30 s, stale on `cycle` writes); `force` for pull-to-refresh. */
  getSettings: (opts: { force?: boolean } = {}) =>
    fetchQuery("cycle:settings", () => apiRequest<CycleSettings | null>("/api/cycle/settings"), {
      staleMs: 30_000,
      topics: ["cycle"],
      force: opts.force,
    }),

  /**
   * Home, Tracker, the calendar, Predictions and Graphs all read this; the
   * cache makes them share one request (30 s, stale on `cycle` writes and at
   * midnight via TodayWatcher). `force` for pull-to-refresh.
   */
  getPredictions: (opts: { force?: boolean } = {}) =>
    fetchQuery("cycle:predictions", () => apiRequest<Predictions>("/api/cycle/predictions"), {
      staleMs: 30_000,
      topics: ["cycle"],
      force: opts.force,
    }),

  getSymptomPredictions: () =>
    apiRequest<SymptomPredictionsResponse>("/api/cycle/symptom-predictions"),

  /**
   * `replace: true` sends the day's whole log: fields left out are cleared on
   * the server instead of keeping their old value. Partial saves omit it.
   */
  saveLog: (
    payload: Omit<DayEntry, "cycleDay" | "phase" | "tokensEarned"> & { replace?: boolean },
  ) =>
    apiRequest<{ cycleLog: DayEntry; tokensEarned: number }>("/api/cycle/log", {
      // Send the client's timezone offset so the backend anchors the tracking
      // streak to the user's *local* "today", not server UTC (avoids near-
      // midnight off-by-one for users far from UTC).
      body: JSON.stringify({
        ...payload,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      }),
      method: "POST",
    }),

  /**
   * Day logs read from a Clue or Flo export (`lib/cycleImport.ts`). New days
   * are added; a day already logged here only gets what it's missing. No
   * reward points. Send at most 5000 days per call; the screen sends 500.
   */
  importLogs: (source: "clue" | "flo", logs: Omit<DayEntry, "cycleDay" | "phase" | "tokensEarned">[]) =>
    apiRequest<{ received: number; added: number; updated: number; unchanged: number; skipped: number }>(
      "/api/cycle/import",
      { body: JSON.stringify({ source, logs }), method: "POST", timeoutMs: 60_000 },
    ),

  getMonthLogs: (month?: string) =>
    apiRequest<DayEntry[]>(`/api/cycle/logs${toQuery({ month })}`),

  /**
   * A whole year's day logs in one request (`?year=`), instead of twelve
   * month calls. A backend that predates `year` ignores it and returns every
   * log, so the result is filtered here too. Shared through lib/queryCache.ts
   * (30 s, stale on `cycle` writes); memory only, never persisted.
   */
  getYearLogs: (year: number, opts: { force?: boolean } = {}) =>
    fetchQuery(
      `cycle:year:${year}`,
      async () => {
        const prefix = `${year}-`;
        const logs = await apiRequest<DayEntry[]>(`/api/cycle/logs${toQuery({ year: String(year) })}`);
        return logs.filter((log) => log.dateKey?.startsWith(prefix));
      },
      { staleMs: 30_000, topics: ["cycle"], force: opts.force },
    ),

  getDayLog: (dateKey: string) =>
    apiRequest<DayEntry | null>(`/api/cycle/log/${dateKey}`),

  /** Removes a day's log entirely — for a day logged on the wrong date. */
  deleteLog: (dateKey: string) =>
    apiRequest<{ deleted: boolean }>(
      `/api/cycle/log/${dateKey}${toQuery({ timezoneOffsetMinutes: String(new Date().getTimezoneOffset()) })}`,
      { method: "DELETE" },
    ),

};

export const habitsApi = {
  getHabits: () => apiRequest<Habit[]>("/api/habits"),

  /**
   * Today's picks from recent logs, phase and goal. The server makes them on
   * the first call of the local day (AI when allowed, else rules) and serves
   * the same set all day, minus habits already added.
   */
  getSuggestions: () =>
    // The day's first call waits on the AI.
    apiRequest<HabitSuggestions>("/api/habits/suggestions", { timeoutMs: 45_000 }),

  /** "Not for me": hidden today and not suggested again for two weeks. */
  dismissSuggestion: (key: string) =>
    apiRequest<null>(`/api/habits/suggestions/${encodeURIComponent(key)}/dismiss`, { method: "POST" }),

  createHabit: (payload: {
    color?: string;
    icon?: string;
    rewardPoints?: number;
    /** The suggestion's reason, kept on the habit so its card can say why. */
    reason?: string;
    /** The suggestion it came from, for the backend's acceptance stats. */
    suggestionKey?: string;
    suggestionSource?: HabitSuggestions["source"];
    title: string;
    tokens?: number;
  }) =>
    apiRequest<Habit>("/api/habits", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  toggleHabit: (id: string) =>
    apiRequest<{
      completed: boolean;
      id: string;
      streak: number;
      tokensAwarded: number;
    }>(`/api/habits/${id}/toggle`, { method: "PATCH" }),

  /** Removes a habit (the server keeps its past completions). */
  deleteHabit: (id: string) =>
    apiRequest<null>(`/api/habits/${id}`, { method: "DELETE" }),

};

/** The tree-care game (backend utils/garden.js), advanced to now by the server. */
export type GardenActionType = "water" | "weed" | "shoo" | "prune" | "fertilize" | "mulch";
export type ForestGardenState = {
  moisture: number;
  nutrients: number;
  health: number;
  soggy: boolean;
  mulched: boolean;
  mulchHoursLeft: number;
  hoursUntilThirsty: number;
  weeds: { id: number; x: number; z: number }[];
  /** `leaf` is a slot (0–999) the app maps onto one of its tree's leaves. */
  pests: { id: number; leaf: number }[];
  deadLeaves: { id: number; leaf: number }[];
  compost: number;
  mulch: number;
  xp: number;
  level: number;
  levelProgress: number;
  xpToNextLevel: number;
  xpToday: number;
  dailyXpCap: number;
  decorations: string[];
  nextDecoration: { key: string; level: number; label: string } | null;
  needs: { key: string; label: string; urgent: boolean }[];
};
export type GardenActionResult = {
  garden: ForestGardenState;
  xp: number;
  message: string;
  tokensEarned: number;
  /** Set after watering (it also counts as the day's water task). */
  status: ForestStatus | null;
};

export const forestApi = {
  getGarden: (today?: string) => apiRequest<ForestGardenState>(`/api/forest/garden${toQuery({ today })}`),

  gardenAction: (action: { type: GardenActionType; id?: number; seconds?: number; today?: string }) =>
    apiRequest<GardenActionResult>("/api/forest/garden/action", { body: JSON.stringify(action), method: "POST" }),


  /** `today` is the device's local YYYY-MM-DD, so "today's tasks" match the day logs are saved under. */
  getStatus: (today?: string, options?: { timeoutMs?: number }) =>
    apiRequest<ForestStatus>(`/api/forest/status${toQuery({ today })}`, options),

  logCare: (
    payload: {
      careType?: ForestLog["careType"];
      dateKey: string;
      note?: string;
      today?: string;
    },
    options?: { timeoutMs?: number },
  ) =>
    apiRequest<{
      log: ForestLog;
      status: ForestStatus;
      tokensEarned: number;
    }>("/api/forest/care", {
      ...options,
      body: JSON.stringify(payload),
      method: "POST",
    }),

};
