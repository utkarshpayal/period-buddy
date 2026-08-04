import { Stack } from "expo-router";
import React, { useEffect, useState } from "react";
import { AppLockProvider, useAppLock } from "../components/AppLock";
import { AppLockScreen } from "../components/AppLockScreen";
import { AuthProvider } from "../components/auth-context";
import { AppModalHost } from "../components/modals/AppModalHost";
import {
  hasRequestedPermissions,
  PermissionsGate,
} from "../components/PermissionsGate";
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
  const { isLocked } = useAppLock();
  const [permissionsChecked, setPermissionsChecked] = useState(false);
  const [needsPermissionsGate, setNeedsPermissionsGate] = useState(false);

  useEffect(() => {
    hasRequestedPermissions().then((requested) => {
      setNeedsPermissionsGate(!requested);
      setPermissionsChecked(true);
    });
  }, []);

  useEffect(() => {
    if (hasHydrated && permissionsChecked) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [hasHydrated, permissionsChecked]);

  if (!hasHydrated || !permissionsChecked) {
    return null;
  }

  // Shown once, before the very first login/signup screen, on a fresh install.
  if (needsPermissionsGate) {
    return <PermissionsGate onDone={() => setNeedsPermissionsGate(false)} />;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {isLocked && <AppLockScreen />}
      <AppModalHost />
    </>
  );
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
        <AppLockProvider>
          <AppShell />
        </AppLockProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
