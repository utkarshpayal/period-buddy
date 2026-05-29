import { Ionicons } from "@expo/vector-icons";
import React, { createContext, useContext, useMemo, useState } from "react";
import { TouchableOpacity, View } from "react-native";

type ThemeMode = "light" | "dark";

type ThemeColors = {
  background: string;
  border: string;
  button: string;
  buttonText: string;
  foreground: string;
  surface: string;
};

type ThemeContextValue = {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");
  const isDark = mode === "dark";

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: {
        background: isDark ? "#000000" : "#FFFFFF",
        border: isDark ? "#FFFFFF" : "#000000",
        button: isDark ? "#FFFFFF" : "#000000",
        buttonText: isDark ? "#000000" : "#FFFFFF",
        foreground: isDark ? "#FFFFFF" : "#000000",
        surface: isDark ? "#000000" : "#FFFFFF",
      },
      isDark,
      mode,
      toggleTheme: () => {
        setMode((currentMode) => (currentMode === "dark" ? "light" : "dark"));
      },
    }),
    [isDark, mode],
  );

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
