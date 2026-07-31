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

export const MOOD_OPTIONS: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: MoodValue;
}[] = [
  { icon: "happy-outline", label: "Happy", value: "happy" },
  { icon: "leaf-outline", label: "Calm", value: "calm" },
  { icon: "cloud-outline", label: "Emotional", value: "emotional" },
  { icon: "moon-outline", label: "Tired", value: "tired" },
  { icon: "sad-outline", label: "Sad", value: "sad" },
  { icon: "alert-circle-outline", label: "Anxious", value: "anxious" },
  { icon: "flash-outline", label: "Irritable", value: "irritable" },
  { icon: "remove-circle-outline", label: "Neutral", value: "neutral" },
  { icon: "sunny-outline", label: "Energetic", value: "energetic" },
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
  return isDark
    ? [colors.primaryDark, colors.primary, colors.secondary]
    : [colors.primary, colors.primaryDark, colors.secondary];
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
  };
}

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
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: isDark ? 0.28 : 0.08,
    shadowRadius: 24,
    elevation: 3,
  };
}
