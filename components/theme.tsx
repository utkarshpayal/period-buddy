import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { TouchableOpacity, View } from "react-native";

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
      colors: isDark
        ? {
            // Buddy dark — warm plum-black with soft rose, lavender & mint accents.
            background: "#221A20",
            surface: "#2E2530",
            surfaceSoft: "#3A2C34",
            surfaceStrong: "#4A2E3A",
            primary: "#F28FB0",
            primaryDark: "#E8618F",
            primaryLight: "rgba(242, 143, 176, 0.18)",
            secondary: "#C7B8E8",         // lavender
            secondaryLight: "rgba(199, 184, 232, 0.14)",
            accent: "#8FCDBB",            // mint
            accentLight: "rgba(143, 205, 187, 0.14)",
            foreground: "#F3E8ED",
            border: "#3D2E36",
            button: "#F28FB0",
            buttonText: "#221A20",
            text: "#F3E8ED",
            mutedText: "#B39AA6",
            input: "#2E2530",
            success: "#8FD1A8",
            successLight: "rgba(143, 209, 168, 0.16)",
            warning: "#F0C377",
            warningLight: "rgba(240, 195, 119, 0.14)",
            danger: "#E88098",
            dangerLight: "rgba(232, 128, 152, 0.16)",
            info: "#C7B8E8",
            infoLight: "rgba(199, 184, 232, 0.16)",
            rose: "#F28FB0",
            roseLight: "rgba(242, 143, 176, 0.16)",
            lavender: "#C7B8E8",
            lavenderLight: "rgba(199, 184, 232, 0.16)",
            mint: "#8FCDBB",
            mintLight: "rgba(143, 205, 187, 0.16)",
            sky: "#8FB3E0",
            skyLight: "rgba(143, 179, 224, 0.16)",
            gold: "#E0BE6F",
            goldLight: "rgba(224, 190, 111, 0.18)",
            shadow: "rgba(0, 0, 0, 0.5)",
            overlay: "rgba(34, 26, 32, 0.72)",
          }
        : {
            // Buddy light — soft rose/blush with lavender & mint accents.
            background: "#F6EEF1",
            surface: "#FFFFFF",
            surfaceSoft: "#FCF5F7",
            surfaceStrong: "#F3DEE6",
            primary: "#E8618F",
            primaryDark: "#C94A78",
            primaryLight: "#F7CADA",
            secondary: "#B9A6E0",          // lavender
            secondaryLight: "#EEE6FA",
            accent: "#9FD8C9",             // mint
            accentLight: "#DDF0E2",
            foreground: "#3A2A32",
            border: "#F3DEE6",
            button: "#E8618F",
            buttonText: "#FFFFFF",
            text: "#3A2A32",
            mutedText: "#8B7680",
            input: "#FCF5F7",
            success: "#3E8A5A",
            successLight: "#DDF0E2",
            warning: "#B4711F",
            warningLight: "#FCE3C4",
            danger: "#B03A56",
            dangerLight: "#FADCE1",
            info: "#6B5CA5",
            infoLight: "#EEE6FA",
            rose: "#E8618F",
            roseLight: "#F7CADA",
            lavender: "#B9A6E0",
            lavenderLight: "#EEE6FA",
            mint: "#9FD8C9",
            mintLight: "#DDF0E2",
            sky: "#5B8FCE",
            skyLight: "#E1EBFA",
            gold: "#C99A2E",
            goldLight: "#FBF0D4",
            shadow: "rgba(230, 110, 150, 0.16)",
            overlay: "rgba(58, 42, 50, 0.4)",
          },
      fonts,
      isDark,
      mode,
      hasHydrated,
      toggleTheme: () => {
        setMode((currentMode) => (currentMode === "dark" ? "light" : "dark"));
      },
    }),
    [isDark, mode, fonts, hasHydrated],
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
      accessibilityLabel={`Switch to ${isDark ? "light" : "dark"} theme`}
      accessibilityRole="button"
      activeOpacity={0.9}
      onPress={toggleTheme}
      className="flex-row items-center relative rounded-full p-1 border"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        width: 74,
        height: 38,
      }}
    >
      <View
        className="absolute top-1 bottom-1 rounded-full"
        style={{
          backgroundColor: colors.primary,
          left: isDark ? 38 : 6,
          width: 28,
          height: 28,
        }}
      />

      <View className="flex-1 items-center justify-center z-10">
        <Ionicons
          name="sunny"
          size={16}
          color={!isDark ? colors.buttonText : colors.mutedText}
        />
      </View>

      <View className="flex-1 items-center justify-center z-10">
        <Ionicons
          name="moon"
          size={16}
          color={isDark ? colors.buttonText : colors.mutedText}
        />
      </View>
    </TouchableOpacity>
  );
}
