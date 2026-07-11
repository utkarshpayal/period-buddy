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

type ThemeContextValue = {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const THEME_STORAGE_KEY = "period-buddy.theme-mode";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [hasHydrated, setHasHydrated] = useState(false);
  const isDark = mode === "dark";

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: isDark
        ? {
            background: "#141118",
            surface: "#211c29",
            surfaceSoft: "#2b2534",
            surfaceStrong: "#31283c",
            primary: "#f472a6",
            primaryDark: "#d9467d",
            primaryLight: "#3f2332",
            secondary: "#5eead4",
            secondaryLight: "#173c3a",
            accent: "#a78bfa",
            accentLight: "#2f264f",
            foreground: "#faf7fb",
            border: "#373040",
            button: "#f472a6",
            buttonText: "#ffffff",
            text: "#f4eef6",
            mutedText: "#b8aebe",
            input: "#2a2432",
            success: "#34d399",
            successLight: "#173b2d",
            warning: "#fbbf24",
            warningLight: "#3f2f14",
            danger: "#fb7185",
            dangerLight: "#42212b",
            info: "#7dd3fc",
            infoLight: "#17344a",
            rose: "#fb7185",
            roseLight: "#3c202c",
            lavender: "#c4b5fd",
            lavenderLight: "#30274d",
            mint: "#6ee7b7",
            mintLight: "#173a2b",
            shadow: "#050408",
            overlay: "rgba(7, 5, 12, 0.58)",
          }
        : {
            background: "#f8fafc",
            surface: "#ffffff",
            surfaceSoft: "#f1f5f9",
            surfaceStrong: "#eef2ff",
            primary: "#d9467d",
            primaryDark: "#be185d",
            primaryLight: "#fce7f0",
            secondary: "#0f766e",
            secondaryLight: "#dff7f1",
            accent: "#7c3aed",
            accentLight: "#eee7ff",
            foreground: "#172033",
            border: "#e2e8f0",
            button: "#d9467d",
            buttonText: "#ffffff",
            text: "#263244",
            mutedText: "#64748b",
            input: "#f8fafc",
            success: "#059669",
            successLight: "#dcfce7",
            warning: "#d97706",
            warningLight: "#fef3c7",
            danger: "#e11d48",
            dangerLight: "#ffe4e6",
            info: "#2563eb",
            infoLight: "#dbeafe",
            rose: "#e11d48",
            roseLight: "#ffe4ec",
            lavender: "#7c3aed",
            lavenderLight: "#f1edff",
            mint: "#0d9488",
            mintLight: "#ccfbf1",
            shadow: "#0f172a",
            overlay: "rgba(15, 23, 42, 0.36)",
          },
      isDark,
      mode,
      toggleTheme: () => {
        setMode((currentMode) => (currentMode === "dark" ? "light" : "dark"));
      },
    }),
    [isDark, mode],
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
