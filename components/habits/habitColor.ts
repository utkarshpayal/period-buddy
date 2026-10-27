import type { ThemeColors } from "../theme";
import { HABIT_CATEGORY_COLORS } from "../ui-tokens";
import type { HabitSuggestion } from "../../lib/api";

/** Maps a stored habit colour onto the theme's matching accent. */
export function resolveHabitColor(hex: string, colors: ThemeColors) {
  if (!hex) return colors.primary;
  const h = hex.toLowerCase();
  if (h === "#7c3aed" || h.includes("7c")) return colors.lavender;
  if (h === "#d97706" || h.includes("d9")) return colors.warning;
  if (h === "#0f766e" || h.includes("0f")) return colors.success;
  if (h === "#0284c7") return colors.sky;
  return colors.primary;
}

/** The colour a suggestion is stored with once added. */
export const suggestionColor = (idea: HabitSuggestion) => HABIT_CATEGORY_COLORS[idea.category];
