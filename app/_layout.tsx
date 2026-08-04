import * as Linking from "expo-linking";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Text, TextInput } from "react-native";
import { AppLockProvider, useAppLock } from "../components/AppLock";
import { AppLockScreen } from "../components/AppLockScreen";
import { AuthProvider } from "../components/auth-context";
import { AppModalHost } from "../components/modals/AppModalHost";
import {
  hasRequestedPermissions,
  PermissionsGate,
} from "../components/PermissionsGate";
import { ThemeProvider, useTheme } from "../components/theme";
import { resolveDeepLink } from "../lib/deeplink";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import "../global.css";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync().catch(() => {});

// The app standardizes on exactly two typefaces (see ThemeFonts in
// components/theme.tsx): Manrope for all headings/body copy, and IBM Plex
// Mono for numeric/code-like content (streaks, OTPs, stats). NativeWind's
// `font-*` utility classes only set fontWeight, not fontFamily, so any Text
// that forgets an explicit `fontFamily: fonts.body` would silently fall back
// to the OS default font and read as inconsistent. Setting Manrope as the
// default here closes that gap app-wide — screens that already set
// `fontFamily` explicitly (heading/body/mono) are unaffected, since an
// explicit style always wins over these defaults.
(Text as unknown as { defaultProps: Record<string, unknown> }).defaultProps = {
  ...(Text as unknown as { defaultProps?: Record<string, unknown> }).defaultProps,
  style: [{ fontFamily: "Manrope" }],
};
(TextInput as unknown as { defaultProps: Record<string, unknown> }).defaultProps = {
  ...(TextInput as unknown as { defaultProps?: Record<string, unknown> }).defaultProps,
  style: [{ fontFamily: "Manrope" }],
};

// Mounted only once AuthProvider has finished hydrating (it withholds children
// until then). Waiting on theme hydration here too, and hiding the splash
// screen only once both are ready, stops the app from ever painting a screen
// with the wrong/default theme.
function AppShell() {
  const { hasHydrated } = useTheme();
  const { isLocked } = useAppLock();
  const router = useRouter();
  const [permissionsChecked, setPermissionsChecked] = useState(false);
  const [needsPermissionsGate, setNeedsPermissionsGate] = useState(false);

  useEffect(() => {
    hasRequestedPermissions().then((requested) => {
      setNeedsPermissionsGate(!requested);
      setPermissionsChecked(true);
    });
  }, []);

  // Shared content links (community posts, blogs, partner invites, ...) all
  // go out as https://thenura.care/app?deeplink=<path> — see lib/share.ts.
  // The bare custom scheme (thenura://community?postId=…) is already routed
  // straight through by expo-router, but the https "/app" wrapper needs one
  // extra unwrap onto the real path/params — see lib/deeplink.ts.
  useEffect(() => {
    function handleUrl(url: string) {
      const target = resolveDeepLink(url);
      // Typed routes can't know the pathname ahead of time since it comes
      // from an external link at runtime, not a literal in this file.
      if (target) router.push(target as Parameters<typeof router.push>[0]);
    }

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    const subscription = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, [router]);

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
  // Only the two standard app fonts are loaded — Manrope (headings/body) and
  // IBM Plex Mono (numeric/code-like content). Don't add more without also
  // updating ThemeFonts in components/theme.tsx.
  const [fontsLoaded, fontError] = useFonts({
    "Manrope": require("../assets/fonts/Manrope-Variable.ttf"),
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
