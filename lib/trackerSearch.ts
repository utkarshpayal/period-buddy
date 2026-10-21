import { FEATURE_REGISTRY } from "./appConfig";
import { PHASE_COPY } from "./cycleCopy";
import type { LogFocus } from "./logFocus";

/**
 * What the Tracker's search can find: things to log today, the cycle
 * settings, the phases, and the app's features. Features come from
 * FEATURE_REGISTRY (title, description, route), so the App CMS decides
 * whether they show (`isFeatureVisible`) and a locked one opens its launch
 * sheet instead of the screen (`runTapAction` → `guardRoute`).
 */

export type TrackerSearchAction =
  /** Opens today's day log, scrolled to `focus` when set. */
  | { type: "logToday"; focus?: LogFocus }
  | { type: "settings" }
  /** A FEATURE_REGISTRY key; its route opens through the launch guard. */
  | { type: "feature"; key: string }
  /** An in-app screen the CMS doesn't control (tabs). */
  | { type: "route"; route: string };

export type TrackerSearchItem = {
  key: string;
  /** Feather icon name. */
  icon: string;
  title: string;
  desc: string;
  action: TrackerSearchAction;
};

const log = (key: string, icon: string, title: string, desc: string, focus?: LogFocus): TrackerSearchItem => ({
  key,
  icon,
  title,
  desc,
  action: { type: "logToday", focus },
});

// Phases open Predictions, which shows when each one falls. Plain names first
// (lib/cycleCopy.ts), the medical one as the description, so both match.
const phase = (key: keyof typeof PHASE_COPY, icon: string): TrackerSearchItem => ({
  key: `phase-${key}`,
  icon,
  title: PHASE_COPY[key].title,
  desc: `${PHASE_COPY[key].medical} · ${PHASE_COPY[key].note}`,
  action: { type: "feature", key: "predictions" },
});

const FEATURE_ICONS: Record<string, string> = {
  predictions: "trending-up",
  insights: "sun",
  symptomTrends: "activity",
  symptomChecker: "clipboard",
  graphsReports: "bar-chart-2",
  documents: "file-text",
  consultation: "message-circle",
  nuraAi: "help-circle",
  healthConcerns: "alert-triangle",
  hygiene: "feather",
  sexualWellbeing: "heart",
  checkinCall: "phone",
  forest: "wind",
  blogs: "book-open",
  videos: "play-circle",
  partnerSync: "git-merge",
  habits: "toggle-left",
  buddyNomination: "star",
  wrapped: "film",
  cycleEra: "globe",
  badges: "award",
  circles: "users",
};

export const TRACKER_SEARCH_ITEMS: TrackerSearchItem[] = [
  log("log-today", "droplet", "Log today's entry", "Record flow, mood, symptoms and notes"),
  log("log-flow", "heart", "Flow intensity", "Track spotting, light, medium or heavy flow", "flow"),
  log("log-cramps", "thermometer", "Cramps", "Log menstrual cramps as a symptom", "symptoms"),
  log("log-bloating", "alert-circle", "Bloating", "Log bloating as a symptom", "symptoms"),
  log("log-headache", "cloud", "Headache", "Log headache as a symptom", "symptoms"),
  log("log-mood", "frown", "Mood tracking", "Log your mood: happy, sad, irritable, calm…", "mood"),
  log("log-energy", "zap", "Energy level", "Record daily energy from low to high", "energy"),
  log("log-note", "edit-3", "Add a note", "Write a private journal entry for today", "notes"),
  { key: "settings", icon: "settings", title: "Cycle settings", desc: "Edit cycle length, period length, reminders", action: { type: "settings" } },
  phase("period", "calendar"),
  phase("follicular", "sun"),
  phase("ovulation", "activity"),
  phase("luteal", "moon"),
  { key: "next-period", icon: "trending-up", title: "Next period prediction", desc: "See when your next period is expected", action: { type: "feature", key: "predictions" } },
  { key: "cycle-trend", icon: "bar-chart-2", title: "Cycle trend", desc: "View cycle length history and averages", action: { type: "feature", key: "graphsReports" } },
  ...FEATURE_REGISTRY.map((f) => ({
    key: `feature-${f.key}`,
    icon: FEATURE_ICONS[f.key] ?? "grid",
    title: f.title,
    desc: f.description,
    action: { type: "feature" as const, key: f.key },
  })),
  { key: "community", icon: "users", title: "Community", desc: "Posts, discussions, and support", action: { type: "route", route: "/(app)/(dashboard)/community" } },
];

/**
 * Items matching `query` (title or description, case-insensitive). Empty
 * query → nothing. Features the CMS doesn't show this person are left out.
 */
export function searchTrackerItems(
  query: string,
  isFeatureShown: (key: string) => boolean,
  items: TrackerSearchItem[] = TRACKER_SEARCH_ITEMS,
): TrackerSearchItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return items.filter(
    (item) =>
      (item.action.type !== "feature" || isFeatureShown(item.action.key)) &&
      (item.title.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q)),
  );
}
