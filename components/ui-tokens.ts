import type { ThemeColors } from "./theme";

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
  return isDark
    ? [colors.surfaceStrong, colors.surface, colors.primaryLight]
    : [colors.surface, colors.roseLight, colors.secondaryLight];
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

export function getShadow(colors: ThemeColors, isDark: boolean) {
  return {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: isDark ? 0.28 : 0.08,
    shadowRadius: 24,
    elevation: 3,
  };
}
