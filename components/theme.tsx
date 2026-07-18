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
            // Warm dark — deep charcoal with rose-gold accents. Clear and soothing.
            background: "#100E14",       // Deep warm near-black
            surface: "#1C1825",          // Slightly lifted warm dark card
            surfaceSoft: "#251F30",      // Subtle interactive surface
            surfaceStrong: "#2E2840",    // Strong surface for inputs/selected
            primary: "#F4927A",          // Rose-gold primary — warm and visible
            primaryDark: "#D97060",
            primaryLight: "rgba(244, 146, 122, 0.18)",
            secondary: "#A78BCA",        // Soft violet secondary
            secondaryLight: "rgba(167, 139, 202, 0.14)",
            accent: "#6DC8A8",           // Clear sage/mint accent
            accentLight: "rgba(109, 200, 168, 0.14)",
            foreground: "#F0EBF5",       // Warm cream-white — very readable
            border: "rgba(240, 235, 245, 0.12)",
            button: "#F4927A",
            buttonText: "#16101E",       // Near-black for high contrast on buttons
            text: "#F0EBF5",
            mutedText: "#A096B8",        // Clear muted — not too dim
            input: "#1C1825",
            success: "#6DC8A8",
            successLight: "rgba(109, 200, 168, 0.16)",
            warning: "#F2C97A",
            warningLight: "rgba(242, 201, 122, 0.14)",
            danger: "#F4927A",
            dangerLight: "rgba(244, 146, 122, 0.16)",
            info: "#A78BCA",
            infoLight: "rgba(167, 139, 202, 0.16)",
            rose: "#F4927A",
            roseLight: "rgba(244, 146, 122, 0.16)",
            lavender: "#C4AEE8",
            lavenderLight: "rgba(196, 174, 232, 0.16)",
            mint: "#6DC8A8",
            mintLight: "rgba(109, 200, 168, 0.16)",
            shadow: "rgba(0, 0, 0, 0.45)",
            overlay: "rgba(16, 14, 20, 0.72)",
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
