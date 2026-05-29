import { Ionicons } from "@expo/vector-icons";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { TouchableOpacity, View } from "react-native";

type ThemeMode = "light" | "dark";

type ThemeColors = {
  background: string;
  surface: string;
  primary: string;
  primaryLight: string;
  secondary: string;
  accent: string;
  foreground: string;
  border: string;
  button: string;
  buttonText: string;
  text: string;
  mutedText: string;
};

type ThemeContextValue = {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const THEME_STORAGE_KEY = "period-buddy.theme-mode";

type BrowserStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readStoredTheme);
  const isDark = mode === "dark";

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: isDark
        ? {
            background: "#111113",
            surface: "#1d1d22",
            primary: "#f472b6",
            primaryLight: "#4a1738",
            secondary: "#60a5fa",
            accent: "#fbbf24",
            foreground: "#ffffff",
            border: "#35353d",
            button: "#f472b6",
            buttonText: "#111113",
            text: "#e7e7ea",
            mutedText: "#a1a1aa",
          }
        : {
            background: "#fbfbfd",
            surface: "#ffffff",
            primary: "#c0267d",
            primaryLight: "#fde7f3",
            secondary: "#2563eb",
            accent: "#f59e0b",
            foreground: "#18181b",
            border: "#e4e4e7",
            button: "#c0267d",
            buttonText: "#ffffff",
            text: "#3f3f46",
            mutedText: "#71717a",
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
    writeStoredTheme(mode);
  }, [mode]);

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

function getStorage() {
  const globalWithStorage = globalThis as typeof globalThis & {
    localStorage?: BrowserStorage;
  };

  return globalWithStorage.localStorage;
}

function readStoredTheme(): ThemeMode {
  try {
    const storedMode = getStorage()?.getItem(THEME_STORAGE_KEY);

    return storedMode === "dark" || storedMode === "light"
      ? storedMode
      : "light";
  } catch {
    return "light";
  }
}

function writeStoredTheme(mode: ThemeMode) {
  try {
    getStorage()?.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Theme toggle still works in memory if storage is blocked.
  }
}

export function ThemeToggle() {
  const { colors, isDark, toggleTheme } = useTheme();

  return (
    <TouchableOpacity
      accessibilityLabel={`Switch to ${isDark ? "light" : "dark"} theme`}
      accessibilityRole="button"
      activeOpacity={0.85}
      className="flex-row items-center gap-2 rounded-full border px-3 py-2"
      onPress={toggleTheme}
      style={{
        backgroundColor: colors.button,
        borderColor: colors.border,
      }}
    >
      <Ionicons
        name={isDark ? "sunny-outline" : "sunny"}
        size={18}
        color={colors.buttonText}
      />

      <View
        className="h-4 w-[1px]"
        style={{ backgroundColor: colors.buttonText }}
      />

      <Ionicons
        name={isDark ? "moon" : "moon-outline"}
        size={18}
        color={colors.buttonText}
      />
    </TouchableOpacity>
  );
}
