import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { TouchableOpacity, View } from "react-native";
import { useAppConfig } from "./app-config";
import { Icon } from "./Icon";

type ThemeMode = "light" | "dark";

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceSoft: string;
  surfaceStrong: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  secondaryLight: string;
  accent: string;
  accentLight: string;
  // Darkened mint for use as TEXT/icon-foreground on a light surface —
  // `accent` itself (~1.6:1 on white) is only safe as an icon/wash/gradient
  // color, never as body/label text (see getLogCategoryTints's mood/skin
  // entries and the section-header/badge text that consume this instead).
  accentText: string;
  foreground: string;
  border: string;
  button: string;
  buttonText: string;
  text: string;
  mutedText: string;
  input: string;
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  danger: string;
  dangerLight: string;
  info: string;
  infoLight: string;
  rose: string;
  roseLight: string;
  lavender: string;
  lavenderLight: string;
  mint: string;
  mintLight: string;
  // Two extra category accents (log-modal option groups, gradient stat
  // cards) — the base rose/lavender/mint trio doesn't cover blue or gold.
  sky: string;
  skyLight: string;
  gold: string;
  goldLight: string;
  shadow: string;
  overlay: string;
  // Neutral progress-ring/bar track color (the "unfilled" background behind
  // a stat like Home's cycle-day ring or water/sleep bars) — distinct from
  // surfaceStrong so a future surfaceStrong re-tint doesn't also shift every
  // progress track's color.
  track: string;
};

export type ThemeFonts = {
  heading: string;
  body: string;
  mono: string;
  monoSemiBold: string;
};

type ThemeContextValue = {
  colors: ThemeColors;
  fonts: ThemeFonts;
  isDark: boolean;
  mode: ThemeMode;
  hasHydrated: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const THEME_STORAGE_KEY = "period-buddy.theme-mode";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [hasHydrated, setHasHydrated] = useState(false);
  const isDark = mode === "dark";
  // Colour overrides from the App CMS (already validated in lib/appConfig.ts,
  // and limited to brand/surface/text tokens — never danger or overlays).
  const { config } = useAppConfig();
  const overrides = config.theme[mode];

  const fonts = useMemo<ThemeFonts>(
    () => ({
      heading: "Manrope",
      body: "Manrope",
      mono: "IBM Plex Mono",
      monoSemiBold: "IBMPlexMono-SemiBold",
    }),
    []
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: {
        ...(isDark
        ? {
            // Plum night — dark doesn't mean black: layered shades of one deep
            // aubergine, each step clearly lighter (page → card → raised →
            // borders), so every surface and edge is easy to see. Bright but
            // not pure-white text, and clear accents that stay soft (no neon).
            // Every text token clears ≥5.4:1 on surfaceStrong, ≥4.8:1 on its tint.
            background: "#1B1424",
            surface: "#2A2136",
            surfaceSoft: "#322840",
            surfaceStrong: "#3D3149",
            primary: "#F48FB5",
            primaryDark: "#F9A9C7",
            primaryLight: "rgba(244, 143, 181, 0.18)",
            secondary: "#C3B3F5",         // lavender
            secondaryLight: "rgba(195, 179, 245, 0.16)",
            accent: "#8FD9C4",            // mint
            accentLight: "rgba(143, 217, 196, 0.16)",
            // Dark-mode accent already clears ~9:1 on surface as text, so no
            // separate darkened variant is needed.
            accentText: "#8FD9C4",
            foreground: "#F5EFF8",
            border: "#4A3D58",
            button: "#F48FB5",
            buttonText: "#2A1020",
            text: "#F5EFF8",
            mutedText: "#C2B5CC",
            input: "#30263D",
            success: "#8ED6A8",
            successLight: "rgba(142, 214, 168, 0.17)",
            warning: "#F2C87E",
            warningLight: "rgba(242, 200, 126, 0.16)",
            danger: "#F48C9F",
            dangerLight: "rgba(244, 140, 159, 0.17)",
            info: "#B6A6F0",
            infoLight: "rgba(182, 166, 240, 0.17)",
            rose: "#F48FB5",
            roseLight: "rgba(244, 143, 181, 0.18)",
            lavender: "#C3B3F5",
            lavenderLight: "rgba(195, 179, 245, 0.17)",
            mint: "#8FD9C4",
            mintLight: "rgba(143, 217, 196, 0.17)",
            sky: "#92BDF0",
            skyLight: "rgba(146, 189, 240, 0.17)",
            gold: "#E9C97A",
            goldLight: "rgba(233, 201, 122, 0.18)",
            shadow: "rgba(8, 4, 14, 0.6)",
            overlay: "rgba(12, 8, 18, 0.7)",
            track: "#3D3149",
          }
        : {
            // Buddy light — soft blush with lavender & mint accents (the
            // "Cycle App Home" design: deep rose primary, warm plum text).
            background: "#FBF6F8",
            surface: "#FFFFFF",
            surfaceSoft: "#FCF5F7",
            surfaceStrong: "#F3DEE6",
            // ~4.5:1 on the blush background and under white button text
            // (WCAG AA for normal-size text).
            primary: "#D22E66",
            // Text-safe rose: ~4.5:1 even on primaryLight tints (chips, badges).
            primaryDark: "#C32A5D",
            primaryLight: "#FCE3EC",
            secondary: "#7550D5",          // lavender
            secondaryLight: "#EFE9FA",
            accent: "#9FD8C9",             // mint
            accentLight: "#E5F4EC",
            // ~6.1:1 on white / ~5.1:1 on accentLight — accent itself is
            // only ~1.6:1 as text, so this darkened mint is what actually
            // reads as text/label color while accent stays for icon/wash use.
            accentText: "#1F6E5B",
            foreground: "#241A20",
            // Soft line for cards and outlined buttons; still visible as an
            // input outline on the blush background.
            border: "#EADCE2",
            button: "#D22E66",
            buttonText: "#FFFFFF",
            text: "#241A20",
            // ~5.6:1 on white: clears WCAG AA for the 400+ places it's used
            // as helper text and placeholders.
            mutedText: "#75666D",
            input: "#FCF5F7",
            // success/warning/sky/lavender (and their mint/gold aliases) clear
            // 4.5:1 as text on background, surface and their own Light tints.
            success: "#2B7A51",
            successLight: "#E5F4EC",
            warning: "#A15D18",
            warningLight: "#FDF0DD",
            danger: "#B03A56",
            dangerLight: "#FADCE1",
            info: "#6B4FB8",
            infoLight: "#EFE9FA",
            rose: "#E8618F",
            roseLight: "#FCE3EC",
            lavender: "#7550D5",
            lavenderLight: "#EFE9FA",
            mint: "#2B7A51",
            mintLight: "#E5F4EC",
            sky: "#3D6BB5",
            skyLight: "#E6EEFA",
            gold: "#A15D18",
            goldLight: "#FDF0DD",
            shadow: "rgba(60, 20, 40, 1)",
            overlay: "rgba(36, 26, 32, 0.4)",
            track: "#F4ECF0",
          }),
        ...overrides,
      } as ThemeColors,
      fonts,
      isDark,
      mode,
      hasHydrated,
      toggleTheme: () => {
        setMode((currentMode) => (currentMode === "dark" ? "light" : "dark"));
      },
    }),
    [isDark, mode, fonts, hasHydrated, overrides],
  );

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((storedMode) => {
        if (
          isMounted &&
          (storedMode === "dark" || storedMode === "light")
        ) {
          setMode(storedMode);
        }
      })
      // Unreadable storage: keep the default theme rather than an unhandled rejection.
      .catch(() => {})
      .finally(() => {
        if (isMounted) setHasHydrated(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;

    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {
      // Theme toggle still works in memory if storage is unavailable.
    });
  }, [hasHydrated, mode]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return value;
}

export function ThemeToggle() {
  const { colors, isDark, toggleTheme } = useTheme();

  return (
    <TouchableOpacity
      hitSlop={5}
      accessibilityLabel={`Switch to ${isDark ? "light" : "dark"} theme`}
      accessibilityRole="button"
      activeOpacity={0.9}
      onPress={toggleTheme}
      className="flex-row items-center relative rounded-full p-1"
      style={{
        backgroundColor: isDark ? colors.surface : colors.track,
        width: 74,
        height: 38,
      }}
    >
      <View
        className="absolute top-1 bottom-1 rounded-full"
        style={{
          // Raised thumb, like components/SegmentedControl.tsx.
          backgroundColor: isDark ? colors.surfaceStrong : colors.surface,
          boxShadow: isDark
            ? "0 0 0 1px rgba(255, 255, 255, 0.06), 0 2px 6px rgba(0, 0, 0, 0.4)"
            : "0 0 0 1px rgba(60, 20, 40, 0.04), 0 2px 6px rgba(60, 20, 40, 0.12)",
          left: isDark ? 40 : 4,
          width: 30,
          height: 30,
        }}
      />

      <View className="flex-1 items-center justify-center z-10">
        <Icon set="ion"
          name="sunny"
          size={16}
          color={!isDark ? colors.primary : colors.mutedText}
        />
      </View>

      <View className="flex-1 items-center justify-center z-10">
        <Icon set="ion"
          name="moon"
          size={16}
          color={isDark ? colors.primary : colors.mutedText}
        />
      </View>
    </TouchableOpacity>
  );
}
