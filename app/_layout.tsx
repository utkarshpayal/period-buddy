import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, Text, TextInput } from "react-native";
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
import type { AppNotification } from "../lib/api";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import "../global.css";

// Where tapping a push notification (or its in-app banner) should land,
// keyed by Notification.type (see period-buddy-be's models/Notification.js
// — sent through FCM as a stringified `data.type` field, see utils/fcm.js).
// Types with no unambiguous, role-agnostic destination (buddy_message,
// partner_message — the right chat screen depends on owner vs. partner-view
// role, which isn't in the payload) fall back to the notifications list
// below rather than risk navigating somewhere wrong.
const NOTIFICATION_TAP_ROUTES: Partial<Record<AppNotification["type"], string>> = {
  community_reply: "/(app)/(dashboard)/community",
  consultation_update: "/(app)/consultation",
  habit_reminder: "/(app)/habits",
  ovulation_reminder: "/(app)/(dashboard)/tracker",
  period_reminder: "/(app)/(dashboard)/tracker",
  reward_earned: "/(app)/(dashboard)/home",
  streak_bonus: "/(app)/(dashboard)/home",
};

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

  // Tapping a push notification (banner or from the OS tray) previously did
  // nothing beyond opening the app to wherever it happened to be — this
  // routes to whatever that notification is actually about, falling back to
  // the full notifications list for types without an unambiguous
  // destination. Mirrors the deep-link effect above: check once for the tap
  // that may have cold-launched the app, then keep listening for one
  // received while already running.
  useEffect(() => {
    if (Platform.OS === "web") return;

    function handleResponse(response: Notifications.NotificationResponse) {
      const data = response.notification.request.content.data as { type?: string } | undefined;
      const target =
        (data?.type && NOTIFICATION_TAP_ROUTES[data.type as AppNotification["type"]]) ||
        "/(app)/notifications";
      router.push(target as Parameters<typeof router.push>[0]);
    }

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
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
