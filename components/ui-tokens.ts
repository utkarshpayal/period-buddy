import { Ionicons } from "@expo/vector-icons";
import type { MoodValue } from "../lib/api";
import type { CyclePhase } from "../lib/cycle";
import type { ThemeColors } from "./theme";

// Wellness Forest scenery palette — ported 1:1 from the marketing website's
// forest simulator (Marketing website/src/pages/Home.jsx). Distinct from
// HEALTH_ISSUE_COLORS/HABIT_CATEGORY_COLORS below, which color unrelated
// concepts (issue severity / habit category), not cycle-phase scenery.
export const FOREST_PHASE_COLORS = {
  sky: {
    period: ["#e2e8f0", "#cbd5e1"],
    follicular: ["#e0f2fe", "#bae6fd"],
    ovulation: ["#ffedd5", "#fed7aa"],
    luteal: ["#fef3c7", "#fde68a"],
  } as Record<CyclePhase, [string, string]>,
  hills: {
    period: ["#cbd5e1", "#94a3b8"],
    follicular: ["#95d5b2", "#74c69d"],
    ovulation: ["#74c69d", "#52b788"],
    luteal: ["#d97706", "#b45309"],
  } as Record<CyclePhase, [string, string]>,
  sun: {
    period: { color: "#cbd5e1", glow: null },
    follicular: { color: "#fbbf24", glow: "#f59e0b" },
    ovulation: { color: "#fbbf24", glow: "#f59e0b" },
    luteal: { color: "#f97316", glow: "#ea580c" },
  } as Record<CyclePhase, { color: string; glow: string | null }>,
};

// Full mood taxonomy shown in the day-log modal's Mood section. Order matches
// the reference tracker app's grid. "emotional"/"tired"/"neutral" stay valid
// MoodValues (older logs may hold them) but aren't offered as chips anymore —
// their closest replacements ("moodSwings"/"lowEnergy"/"apathetic") are.
export const MOOD_OPTIONS: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: MoodValue;
}[] = [
  { icon: "leaf-outline", label: "Calm", value: "calm" },
  { icon: "happy-outline", label: "Happy", value: "happy" },
  { icon: "sunny-outline", label: "Energetic", value: "energetic" },
  { icon: "flame-outline", label: "Frisky", value: "frisky" },
  { icon: "shuffle-outline", label: "Mood swings", value: "moodSwings" },
  { icon: "flash-outline", label: "Irritated", value: "irritable" },
  { icon: "sad-outline", label: "Sad", value: "sad" },
  { icon: "alert-circle-outline", label: "Anxious", value: "anxious" },
  { icon: "rainy-outline", label: "Depressed", value: "depressed" },
  { icon: "cloudy-outline", label: "Feeling guilty", value: "guilty" },
  { icon: "repeat-outline", label: "Obsessive thoughts", value: "obsessive" },
  { icon: "battery-dead-outline", label: "Low energy", value: "lowEnergy" },
  { icon: "remove-circle-outline", label: "Apathetic", value: "apathetic" },
  { icon: "help-circle-outline", label: "Confused", value: "confused" },
  { icon: "thumbs-down-outline", label: "Very self-critical", value: "selfCritical" },
];

// Health issue accent-color source hexes (health-issues.tsx) — maps a fixed
// content hex tag to a theme color for the issue card accent.
export const HEALTH_ISSUE_COLORS = {
  red: "#ef4444",
  orange: "#f97316",
  amber: "#fbbf24",
  pink: "#ec4899",
  purple: "#8b5cf6",
};

// Habit-idea category colors (habits.tsx) — tags a suggested habit's card
// accent and is pattern-matched back to a theme color when rendering.
export const HABIT_CATEGORY_COLORS = {
  sleep: "#7c3aed",
  nutrition: "#d97706",
  movement: "#0f766e",
};

export function getScreenGradient(colors: ThemeColors, isDark: boolean) {
  return isDark
    ? [colors.background, "#1b1522", colors.background]
    : [colors.background, colors.primaryLight, colors.background];
}

export function getSurfaceGradient(colors: ThemeColors, isDark: boolean) {
  return isDark
    ? [colors.surface, colors.surfaceSoft]
    : [colors.surface, "#fbfdff"];
}

export function getHeroGradient(colors: ThemeColors, isDark: boolean) {
  // Saturated in both themes — this card always carries white text, so it
  // can't use the pale *Light tint tokens (dark mode already avoided that;
  // light mode used to use them and the text became unreadable).
  // Light: rose into a deeper berry, so the card stays one warm colour.
  return isDark
    ? [colors.primaryDark, colors.primary, colors.secondary]
    : [colors.primary, colors.primaryDark, "#B23D80"];
}

export function getActionGradient(colors: ThemeColors) {
  return [colors.primary, colors.accent];
}

export function getSoftTints(colors: ThemeColors) {
  return {
    rose: colors.roseLight,
    pink: colors.primaryLight,
    lavender: colors.lavenderLight,
    purple: colors.accentLight,
    mint: colors.mintLight,
    emerald: colors.successLight,
    teal: colors.secondaryLight,
    amber: colors.warningLight,
    blue: colors.infoLight,
    danger: colors.dangerLight,
    sky: colors.skyLight,
    gold: colors.goldLight,
  };
}

// Colorful category accents for the day-log modal's option groups (Flow,
// Mood, Physical symptoms, ...) — each pairs a solid icon/text color with its
// pale background wash so every symptom category reads as its own color,
// mirroring how the reference tracker app color-codes its logging chips.
export function getLogCategoryTints(colors: ThemeColors) {
  // `fill` is the solid color for a filled shape (a selected option's icon
  // circle) — everywhere else defaults to the same value as `color`. mood/
  // skin are the one place `color` and `fill` diverge, and both need
  // `accentText`: `accent` itself is a ~1.6:1 pale mint wash, unreadable
  // either as the icon/text foreground (`color`) OR as a filled circle's
  // background with a white icon drawn on top (`fill`) — accentText is the
  // same mint hue darkened for contrast, so it works for both roles.
  return {
    flow: { color: colors.rose, light: colors.roseLight, fill: colors.rose },
    ovulation: { color: colors.success, light: colors.successLight, fill: colors.success },
    sex: { color: colors.danger, light: colors.dangerLight, fill: colors.danger },
    mood: { color: colors.accentText, light: colors.accentLight, fill: colors.accentText },
    symptoms: { color: colors.warning, light: colors.warningLight, fill: colors.warning },
    discharge: { color: colors.sky, light: colors.skyLight, fill: colors.sky },
    digestion: { color: colors.secondary, light: colors.secondaryLight, fill: colors.secondary },
    pregnancy: { color: colors.gold, light: colors.goldLight, fill: colors.gold },
    activity: { color: colors.success, light: colors.successLight, fill: colors.success },
    energy: { color: colors.secondary, light: colors.secondaryLight, fill: colors.secondary },
    skin: { color: colors.accentText, light: colors.accentLight, fill: colors.accentText },
  };
}

export type LogCategoryTint = ReturnType<typeof getLogCategoryTints>[keyof ReturnType<typeof getLogCategoryTints>];

export function getSeverityColor(
  value: number,
  colors: ThemeColors,
  thresholds: { warning: number; danger: number } = { warning: 33, danger: 66 },
) {
  if (value >= thresholds.danger) return colors.danger;
  if (value >= thresholds.warning) return colors.warning;
  return colors.success;
}

export function getShadow(colors: ThemeColors, isDark: boolean) {
  return {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: isDark ? 0.28 : 0.06,
    shadowRadius: 24,
    elevation: 3,
  };
}
