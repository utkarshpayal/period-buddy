import type { ThemeColors } from "../theme";

/**
 * One colour per measure, everywhere in the app (colour follows the thing,
 * never its rank). Validated with the dataviz skill's validate_palette.js:
 * light uses the theme's accents (pass on #FFFFFF); dark has its own deeper
 * steps (the theme's dark accents are pastel UI tints that fail the
 * lightness/chroma checks on #2A2136 as chart marks).
 */
export type ChartMeasure = "cycle" | "water" | "temperature" | "sleep" | "weight";

const LIGHT: Record<ChartMeasure, string> = {
  cycle: "#E8618F",
  water: "#3D6BB5",
  temperature: "#A15D18",
  sleep: "#7550D5",
  weight: "#2B7A51",
};
const DARK: Record<ChartMeasure, string> = {
  cycle: "#E55A8E",
  water: "#4F8FE6",
  temperature: "#BC851F",
  sleep: "#8E74EE",
  weight: "#229C76",
};

export function chartColor(measure: ChartMeasure, isDark: boolean) {
  return (isDark ? DARK : LIGHT)[measure];
}

/** Recessive chrome: hairline solid gridlines one step off the surface, muted tick text. */
export function chartChrome(colors: ThemeColors, isDark: boolean) {
  return {
    grid: isDark ? "rgba(255,255,255,0.08)" : "rgba(36,26,32,0.07)",
    axisText: { color: colors.mutedText, fontSize: 11.5 },
    tooltipBg: isDark ? colors.surfaceStrong : "#241A20",
    tooltipText: isDark ? colors.text : "#FFFFFF",
    tooltipMuted: isDark ? colors.mutedText : "rgba(255,255,255,0.72)",
  };
}
