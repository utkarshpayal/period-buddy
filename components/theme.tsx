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
      heading: isDark ? "PlayfairDisplay" : "Manrope",
      body: isDark ? "WorkSans" : "Manrope",
      mono: "IBM Plex Mono",
      monoSemiBold: "IBMPlexMono-SemiBold",
    }),
    [isDark]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: isDark
        ? {
            background: "#211722",
            surface: "#332538",
            surfaceSoft: "rgba(255, 255, 255, 0.05)",
            surfaceStrong: "rgba(255, 255, 255, 0.08)",
            primary: "#E8A6A0",
            primaryDark: "#D28C86",
            primaryLight: "rgba(232, 166, 160, 0.14)",
            secondary: "#B49CAE",
            secondaryLight: "rgba(255, 255, 255, 0.06)",
            accent: "#D9B26B",
            accentLight: "rgba(217, 178, 107, 0.12)",
            foreground: "#F3E9EE",
            border: "rgba(255, 255, 255, 0.13)",
            button: "#E8A6A0",
            buttonText: "#2C1F2E",
            text: "#F3E9EE",
            mutedText: "#B49CAE",
            input: "rgba(255, 255, 255, 0.05)",
            success: "#6FA89A",
            successLight: "rgba(111, 168, 154, 0.15)",
            warning: "#D9B26B",
            warningLight: "rgba(217, 178, 107, 0.12)",
            danger: "#E8A6A0",
            dangerLight: "rgba(232, 166, 160, 0.14)",
            info: "#B49CAE",
            infoLight: "rgba(180, 156, 174, 0.15)",
            rose: "#E8A6A0",
            roseLight: "rgba(232, 166, 160, 0.14)",
            lavender: "#B49CAE",
            lavenderLight: "rgba(180, 156, 174, 0.15)",
            mint: "#6FA89A",
            mintLight: "rgba(111, 168, 154, 0.15)",
            shadow: "rgba(0, 0, 0, 0.4)",
            overlay: "rgba(33, 23, 34, 0.6)",
          }
        : {
            background: "#F5F7FA",
            surface: "#FFFFFF",
            surfaceSoft: "#F0F2F6",
            surfaceStrong: "#E3E7ED",
            primary: "#E4694F",
            primaryDark: "#C24C34",
            primaryLight: "#FFF1ED",
            secondary: "#66748A",
            secondaryLight: "#E8EAEF",
            accent: "#2E8B7A",
            accentLight: "#EAF6F4",
            foreground: "#17212E",
            border: "#E3E7ED",
            button: "#E4694F",
            buttonText: "#FFFFFF",
            text: "#17212E",
            mutedText: "#66748A",
            input: "#F0F2F6",
            success: "#2E8B7A",
            successLight: "#EAF6F4",
            warning: "#D9B26B",
            warningLight: "#FCF6EA",
            danger: "#E53E3E",
            dangerLight: "#FED7D7",
            info: "#3182CE",
            infoLight: "#EBF8FF",
            rose: "#E4694F",
            roseLight: "#FFF1ED",
            lavender: "#805AD5",
            lavenderLight: "#FAF5FF",
            mint: "#2E8B7A",
            mintLight: "#EAF6F4",
            shadow: "rgba(23, 33, 46, 0.08)",
            overlay: "rgba(23, 33, 46, 0.4)",
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
