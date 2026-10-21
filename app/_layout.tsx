import * as Notifications from "expo-notifications";
import { Stack, usePathname, useRootNavigationState, useRouter } from "expo-router";
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Platform, View } from "react-native";
import { AppLockProvider, useAppLock } from "../components/AppLock";
import { AppConfigProvider } from "../components/app-config";
import { AppConfigSync } from "../components/AppConfigSync";
import { TodayWatcher } from "../hooks/useTodayKey";
import { AppGate } from "../components/AppGate";
import { AppLockScreen } from "../components/AppLockScreen";
import { AuthProvider, useAuth } from "../components/auth-context";
import { GenZModeProvider } from "../components/genz-mode";
import { IncomingCallOverlay } from "../components/IncomingCallOverlay";
import { AppModalHost } from "../components/modals/AppModalHost";
import { ToastHost } from "../components/ToastHost";
import { ThemeProvider, useTheme } from "../components/theme";
import {
  clearPendingDeepLink,
  getPendingDeepLink,
  PUBLIC_DEEP_LINK_PATHS,
  subscribePendingDeepLink,
} from "../lib/deeplink";
import { guardRoute } from "../lib/launchGuard";
import { openNotificationStoreLink, resolveNotificationTarget } from "../lib/notifications";
import { emitDataChange } from "../lib/data-sync";
import "../lib/queryCachePersist";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import "../global.css";
import { LinearGradient } from "expo-linear-gradient";
import { cssInterop } from "nativewind";
import { MAX_CONTENT_WIDTH } from "../lib/layout";
import { ScreenPrivacySync } from "../lib/screenPrivacy";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { Image as ExpoImage } from "expo-image";
import { stackScreenOptions } from "../components/motion";

// The payload's data fields. The type normally arrives in content.data, but
// on Android a notification displayed by the FCM SDK itself (app
// killed/backgrounded) may only carry it in the raw RemoteMessage data.
function notificationData(response: Notifications.NotificationResponse): Record<string, unknown> {
  const { content, trigger } = response.notification.request;
  const remoteData =
    (trigger as { remoteMessage?: { data?: Record<string, unknown> } } | null)?.remoteMessage
      ?.data ?? {};
  return {
    ...remoteData,
    ...((content.data as Record<string, unknown> | null) ?? {}),
  };
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

// NativeWind only turns `className` into styles for components it knows about;
// on anything else the prop is silently ignored. Register third-party
// components that take className here.
cssInterop(LinearGradient, { className: "style" });
cssInterop(ExpoImage, { className: "style" });

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync().catch(() => {});
// Cross-fade from the splash into the first screen instead of cutting to it.
// The splash colour (app.json: blush #FBF6F8) is the light theme's
// own `background` tokens, so the fade never passes through black or white.
SplashScreen.setOptions({ fade: true, duration: 350 });

// The app standardizes on exactly two typefaces (see ThemeFonts in
// components/theme.tsx): Manrope for all headings/body copy, and IBM Plex
// Mono for numeric/code-like content. Text without an explicit fontFamily
// still gets Manrope from lib/react-native-shim.tsx (wired in metro.config.js);
// `Text.defaultProps` can't do it, React 19 ignores it on function components.

// Mounted only once AuthProvider has finished hydrating (it withholds children
// until then). Waiting on theme hydration here too, and hiding the splash
// screen only once both are ready, stops the app from ever painting a screen
// with the wrong/default theme.
function AppShell() {
  const { colors, hasHydrated: themeHydrated } = useTheme();
  const { isLocked, hasHydrated: lockHydrated } = useAppLock();
  // The App Lock settings gate the first paint too: otherwise the dashboard
  // renders (and starts its fetches) for a frame before the lock appears.
  const hasHydrated = themeHydrated && lockHydrated;
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const pathname = usePathname();
  const navigatorReady = Boolean(useRootNavigationState()?.key);
  const [pendingNotification, setPendingNotification] = useState<Record<string, unknown> | null>(
    null,
  );
  const handledNotificationIds = useRef(new Set<string>());

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
    // A feature the App CMS has Coming soon / paused opens its sheet instead.
    if (guardRoute(targetPath)) return;
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
      const data = notificationData(response);
      // An "Update the app" push opens the Play Store / App Store straight
      // away: it needs no navigator or sign-in.
      if (openNotificationStoreLink(data)) return;
      setPendingNotification(data);
    }

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleResponse(response);
      })
      .catch(() => {});
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
    if (guardRoute(target)) return;
    // A consultation link reuses an open consultation screen (it reacts to
    // the new ?id= / &call= params) instead of stacking a second copy.
    if (String(target).startsWith("/(app)/consultation")) {
      router.navigate(target as Parameters<typeof router.navigate>[0]);
    } else {
      router.push(target as Parameters<typeof router.push>[0]);
    }
  }, [pendingNotification, navigatorReady, isAuthenticated, pathname, router, user?.partnerRole]);

  useEffect(() => {
    if (hasHydrated) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [hasHydrated]);

  // Keep the native root/window background on the theme's background, so
  // screen transitions, the keyboard gap and rotations never flash the
  // system's default white/black behind the app (expo-system-ui).
  useEffect(() => {
    if (!hasHydrated) return;
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [hasHydrated, colors.background]);

  if (!hasHydrated) {
    return null;
  }

  return (
    <>
      {/* Phone-width column on tablets / wide web windows, so screens built
          for phones don't stretch edge to edge. No effect on phones. */}
      {/* While locked, screen readers must not reach the content under the lock. */}
      <View
        style={{ flex: 1, backgroundColor: colors.background }}
        accessibilityElementsHidden={isLocked}
        importantForAccessibility={isLocked ? "no-hide-descendants" : "auto"}
      >
        <View
          style={{
            flex: 1,
            width: "100%",
            maxWidth: MAX_CONTENT_WIDTH,
            alignSelf: "center",
          }}
        >
          <Stack screenOptions={stackScreenOptions(colors.background)} />
        </View>
      </View>
      {isLocked && <AppLockScreen />}
      {/* App CMS maintenance mode / update prompts; renders nothing by default. */}
      <AppGate />
      {/* Refetches the App CMS config on sign-in/out; feeds the launch route guard. */}
      <AppConfigSync />
      <TodayWatcher />
      <ScreenPrivacySync />
      {/* "Your doctor is calling" — rings over the personal socket room. */}
      <IncomingCallOverlay
        userId={user?._id}
        enabled={isAuthenticated && user?.partnerRole !== "viewer"}
        hidden={isLocked}
      />
      <AppModalHost />
      <ToastHost />
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
    // Native builds embed Manrope as one family with a file per weight
    // (expo-font plugin in app.json), so fontWeight picks the right file.
    // Android can't select weights from a variable font, and loading one here
    // under the same name would replace that family. Browsers handle the
    // variable font fine, so web loads it at runtime.
    ...(Platform.OS === "web" ? { Manrope: require("../assets/fonts/Manrope-Variable.ttf") } : {}),
    "IBM Plex Mono": require("../assets/fonts/IBMPlexMono-Regular.ttf"),
    "IBMPlexMono-SemiBold": require("../assets/fonts/IBMPlexMono-SemiBold.ttf"),
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    // AppConfigProvider (App CMS layout) is outermost: ThemeProvider reads
    // its colour overrides, and it needs no auth (the config is public).
    // Tracks the software keyboard for every screen: with Android edge-to-edge
    // the window no longer resizes, so inputs are lifted by this instead.
    <KeyboardProvider>
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
    </KeyboardProvider>
  );
}
