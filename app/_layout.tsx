import * as Notifications from "expo-notifications";
import { Stack, usePathname, useRootNavigationState, useRouter } from "expo-router";
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Platform, Text, TextInput } from "react-native";
import { AppLockProvider, useAppLock } from "../components/AppLock";
import { AppConfigProvider } from "../components/app-config";
import { AppGate } from "../components/AppGate";
import { AppLockScreen } from "../components/AppLockScreen";
import { AuthProvider, useAuth } from "../components/auth-context";
import { GenZModeProvider } from "../components/genz-mode";
import { AppModalHost } from "../components/modals/AppModalHost";
import {
  hasRequestedPermissions,
  PermissionsGate,
} from "../components/PermissionsGate";
import { ThemeProvider, useTheme } from "../components/theme";
import {
  clearPendingDeepLink,
  getPendingDeepLink,
  PUBLIC_DEEP_LINK_PATHS,
  subscribePendingDeepLink,
} from "../lib/deeplink";
import { resolveNotificationTarget } from "../lib/notifications";
import { emitDataChange } from "../lib/data-sync";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import "../global.css";

// The payload's data fields. The type normally arrives in content.data, but
// on Android a notification displayed by the FCM SDK itself (app
// killed/backgrounded) may only carry it in the raw RemoteMessage data.
function notificationData(response: Notifications.NotificationResponse): Record<string, unknown> {
  const { content, trigger } = response.notification.request;
  const remoteData =
    (trigger as { remoteMessage?: { data?: Record<string, unknown> } } | null)?.remoteMessage
      ?.data ?? {};
  return { ...remoteData, ...((content.data as Record<string, unknown> | null) ?? {}) };
}

// Entry screens that immediately router.replace() into the app once a
// session exists — a queued notification must wait until they've done so,
// or that replace would overwrite it. /partner-connect only counts while
// logged out: a signed-in user can sit on it (it doesn't auto-redirect), and
// treating it as an entry screen then left queued links waiting forever.
const ENTRY_PATHS = new Set(["/", "/login", "/signup"]);

function isEntryPath(pathname: string, isAuthenticated: boolean) {
  return ENTRY_PATHS.has(pathname) || (!isAuthenticated && pathname === "/partner-connect");
}

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
  const { isAuthenticated, user } = useAuth();
  const pathname = usePathname();
  const navigatorReady = Boolean(useRootNavigationState()?.key);
  const [pendingNotification, setPendingNotification] = useState<Record<string, unknown> | null>(
    null,
  );
  const handledNotificationIds = useRef(new Set<string>());
  const [permissionsChecked, setPermissionsChecked] = useState(false);
  const [needsPermissionsGate, setNeedsPermissionsGate] = useState(false);

  useEffect(() => {
    hasRequestedPermissions().then((requested) => {
      setNeedsPermissionsGate(!requested);
      setPermissionsChecked(true);
    });
  }, []);

  // Shared content links (blogs, community posts, reels, schemes, partner
  // invites, ...) are intercepted by app/+native-intent.tsx before
  // expo-router routes them, and queued in lib/deeplink.ts. Open the queued
  // target once the navigator exists, the user is signed in (public targets
  // like partner-connect don't wait for that — a logged-out tap on anything
  // else opens login once and stays queued until after sign-in), and the entry screens have already
  // redirected to the dashboard, so it lands on top of it (Back returns there)
  // instead of being replaced by that redirect. Same gating as notifications.
  const pendingDeepLink = useSyncExternalStore(subscribePendingDeepLink, getPendingDeepLink);
  // The queued link we already sent a logged-out user to /login for, so
  // backing out of login (or re-renders) doesn't push it again.
  const loginPromptedDeepLink = useRef<typeof pendingDeepLink>(null);
  useEffect(() => {
    if (!pendingDeepLink || !navigatorReady) return;
    const isPublic = PUBLIC_DEEP_LINK_PATHS.has(pendingDeepLink.pathname);
    if (!isAuthenticated && !isPublic) {
      // Show login once; the link stays queued and opens after sign-in.
      if (
        loginPromptedDeepLink.current !== pendingDeepLink &&
        pathname !== "/login" &&
        pathname !== "/signup"
      ) {
        loginPromptedDeepLink.current = pendingDeepLink;
        router.push("/login");
      }
      return;
    }
    if (isAuthenticated && isEntryPath(pathname, isAuthenticated)) return;
    clearPendingDeepLink();
    // Partner "viewers" see the forum at /forum, not the owner's /community tab.
    const targetPath =
      pendingDeepLink.pathname === "/community" && user?.partnerRole === "viewer"
        ? "/forum"
        : pendingDeepLink.pathname;
    // `openedAt` makes every link tap a distinct param change, so a screen
    // that's already mounted (e.g. the community tab) re-opens the same item
    // again if the same link is tapped twice. Typed routes can't know the
    // pathname ahead of time since it comes from an external link.
    router.push({
      pathname: targetPath,
      params: { ...pendingDeepLink.params, openedAt: String(Date.now()) },
    } as unknown as Parameters<typeof router.push>[0]);
  }, [pendingDeepLink, navigatorReady, isAuthenticated, pathname, router, user?.partnerRole]);

  // Tapping a push notification (banner or from the OS tray) routes to
  // whatever that notification is about, falling back to the notifications
  // list. A tap only *queues* its destination; the effect below performs it.
  // Navigating straight from the tap handler silently failed on a cold start:
  // it fired before the Stack below was mounted, and index.tsx's redirect to
  // the dashboard (router.replace) then overwrote anything that did land.
  useEffect(() => {
    if (Platform.OS === "web") return;

    function handleResponse(response: Notifications.NotificationResponse) {
      const id = response.notification.request.identifier;
      if (handledNotificationIds.current.has(id)) return;
      handledNotificationIds.current.add(id);
      // Otherwise getLastNotificationResponseAsync() keeps returning this
      // same tap on every later launch.
      Notifications.clearLastNotificationResponse();
      setPendingNotification(notificationData(response));
    }

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    // A push arriving while the app is open means the server-side list
    // changed — refresh unread badges and the notifications screen.
    const received = Notifications.addNotificationReceivedListener(() => {
      emitDataChange("notifications");
    });
    return () => {
      subscription.remove();
      received.remove();
    };
  }, []);

  // Open a queued notification only once the navigator exists, the user is
  // signed in (a logged-out tap waits until after login), and the app has
  // left the entry screens — i.e. index/login has already sent them to their
  // dashboard, so this lands on top of it (Back returns to the dashboard)
  // instead of being replaced by that redirect.
  useEffect(() => {
    if (
      !pendingNotification ||
      !navigatorReady ||
      !isAuthenticated ||
      isEntryPath(pathname, isAuthenticated)
    ) {
      return;
    }
    const target = resolveNotificationTarget(pendingNotification, user?.partnerRole === "viewer");
    setPendingNotification(null);
    router.push(target as Parameters<typeof router.push>[0]);
  }, [pendingNotification, navigatorReady, isAuthenticated, pathname, router, user?.partnerRole]);

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
      {/* App CMS maintenance mode / update prompts; renders nothing by default. */}
      <AppGate />
      <AppModalHost />
    </>
  );
}

export default function RootLayout() {
  // Only the two standard app fonts are loaded — Manrope (headings/body) and
  // IBM Plex Mono (numeric/code-like content). Don't add more without also
  // updating ThemeFonts in components/theme.tsx.
  // The three icon families the app uses are preloaded here too, while the
  // splash screen is still up — otherwise @expo/vector-icons loads each icon
  // font lazily on its first render, so icons show blank and pop in a moment
  // after the first screen appears. Add a family here if you start using a new one.
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    ...Feather.font,
    ...MaterialCommunityIcons.font,
    "Manrope": require("../assets/fonts/Manrope-Variable.ttf"),
    "IBM Plex Mono": require("../assets/fonts/IBMPlexMono-Regular.ttf"),
    "IBMPlexMono-SemiBold": require("../assets/fonts/IBMPlexMono-SemiBold.ttf"),
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    // AppConfigProvider (App CMS layout) is outermost: ThemeProvider reads
    // its colour overrides, and it needs no auth (the config is public).
    <AppConfigProvider>
      <ThemeProvider>
        <GenZModeProvider>
          <AuthProvider>
            <AppLockProvider>
              <AppShell />
            </AppLockProvider>
          </AuthProvider>
        </GenZModeProvider>
      </ThemeProvider>
    </AppConfigProvider>
  );
}
