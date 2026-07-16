import { Stack } from "expo-router";
import React, { useEffect } from "react";
import { AuthProvider } from "../components/auth-context";
import { ThemeProvider, useTheme } from "../components/theme";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import "../global.css";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Mounted only once AuthProvider has finished hydrating (it withholds children
// until then). Waiting on theme hydration here too, and hiding the splash
// screen only once both are ready, stops the app from ever painting a screen
// with the wrong/default theme.
function AppShell() {
  const { hasHydrated } = useTheme();

  useEffect(() => {
    if (hasHydrated) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [hasHydrated]);

  if (!hasHydrated) {
    return null;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "Manrope": require("../assets/fonts/Manrope-Variable.ttf"),
    "WorkSans": require("../assets/fonts/WorkSans-Variable.ttf"),
    "PlayfairDisplay": require("../assets/fonts/PlayfairDisplay-Variable.ttf"),
    "IBM Plex Mono": require("../assets/fonts/IBMPlexMono-Regular.ttf"),
    "IBMPlexMono-SemiBold": require("../assets/fonts/IBMPlexMono-SemiBold.ttf"),
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}
