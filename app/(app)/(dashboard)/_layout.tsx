import { Tabs, useRouter } from "expo-router";
import React, { useCallback, useRef, useState, useEffect } from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { requestRecordingPermissionsAsync } from "expo-audio";
import { useTheme } from "../../../components/theme";
import { genZLabel, useGenZMode } from "../../../components/genz-mode";
import { CenterAvatarTabIcon, TabBarItem } from "../../../components/TabBarItem";

import { useAuth } from "../../../components/auth-context";
import { OnboardingFlow, type OnboardingValues } from "../../../components/onboarding/OnboardingFlow";
import { submitCycleSettings, submitOnboarding, type AuthUser } from "../../../lib/auth";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showPermissionModal } from "../../../lib/modal-host";
import { useRealtimeSocket, type RealtimeMessage } from "../../../hooks/useRealtimeSocket";
import { authApi } from "../../../lib/api";



type DashboardTab = {
  name: string;
  label: string;
  iconFocused?: string;
  iconUnfocused?: string;
  /** The raised voice-assistant avatar instead of an icon. */
  center?: boolean;
};

const DASHBOARD_TABS: DashboardTab[] = [
  {
    name: "home",
    label: "Home",
    iconFocused: "home",
    iconUnfocused: "home-outline",
  },
  {
    name: "tracker",
    label: "Tracker",
    iconFocused: "calendar",
    iconUnfocused: "calendar-outline",
  },
  {
    name: "ai-chat",
    label: "AI Chat",
    center: true,
  },
  {
    name: "community",
    label: "Community",
    iconFocused: "people",
    iconUnfocused: "people-outline",
  },
  {
    name: "profile",
    label: "Profile",
    iconFocused: "person",
    iconUnfocused: "person-outline",
  },
];

const styles = StyleSheet.create({
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default function DashboardLayout() {
  const { colors, isDark } = useTheme();
  const { enabled: genZModeEnabled } = useGenZMode();
  const { token, user, signIn, updateUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [unreadCommunity, setUnreadCommunity] = useState(false);

  // Auth guard: if there's no session (never logged in, logged out, or the
  // session was cleared after a 401 from an expired/invalid token) bounce
  // back to login instead of rendering the dashboard with empty/stale data.
  useEffect(() => {
    if (!token) {
      router.replace("/(tabs)/login");
    } else if (user?.partnerRole === "viewer") {
      router.replace("/(app)/(partner-view)/overview");
    }
  }, [token, user?.partnerRole, router]);

  const userId = user?._id;
  useRealtimeSocket({
    enabled: Boolean(token && userId),
    onMessage: useCallback(
      (data: RealtimeMessage) => {
        if (data.type === "community_notification" && data.senderId !== userId) {
          setUnreadCommunity(true);
        }
      },
      [userId],
    ),
    // Personal room for comment/like notifications on our posts, plus the
    // general community room for new-post notifications.
    rooms: token && userId ? [`user_${userId}`, "community"] : [],
  });

  // The local flag can be stale: setup may have been finished on another
  // device, or the app closed after the answers saved but before the finish
  // screen. Ask the server once so setup never runs twice.
  const setupPending = Boolean(token) && user?.isProfileComplete === false;
  useEffect(() => {
    if (!setupPending) return;
    let cancelled = false;
    authApi
      .getProfile()
      .then((fresh) => {
        if (!cancelled && fresh?.isProfileComplete) updateUser(fresh);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Only on entering setup, not on every profile change during it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupPending]);

  // Saved by the onboarding flow's last question; applied to the session only
  // when the user taps through its finish screen, since flipping
  // isProfileComplete swaps this layout straight to the tabs.
  const onboardedUserRef = useRef<Partial<AuthUser> | null>(null);

  async function handleOnboardingSubmit(values: OnboardingValues) {
    if (!token) throw new Error("Your session has expired. Please log in again.");

    const response = await submitOnboarding(
      // Gender isn't asked; the backend requires a value, so send its
      // "prefer not to say" default. Phone and photo are optional and
      // collected later from Profile → Edit profile.
      { dateOfBirth: values.dateOfBirth, gender: "prefer_not_to_say" },
      token,
    );
    const updatedUser = response.data ?? response.user;

    // Predictions depend on this, so a failure is surfaced (with a retry)
    // rather than logged and skipped.
    await submitCycleSettings(
      {
        cycleLength: values.cycleLength,
        lastPeriodStartDate: values.lastPeriodStartDate,
        periodLength: values.periodLength,
        trackingGoal: values.trackingGoal,
        trackingGoals: values.trackingGoals,
      },
      token,
    );

    onboardedUserRef.current = {
      ...updatedUser,
      dateOfBirth: values.dateOfBirth,
      isProfileComplete: response.isProfileComplete ?? updatedUser?.isProfileComplete ?? true,
    };
  }

  async function handleOnboardingFinish() {
    if (!token) return;
    await signIn({
      token,
      user: { ...user, ...onboardedUserRef.current, isProfileComplete: true },
    });
  }

  // Partner viewers never do setup (the guard above sends them to their view).
  if (user && user.isProfileComplete === false && user.partnerRole !== "viewer") {
    return (
      <OnboardingFlow
        userId={user._id}
        firstName={user.firstName}
        onSubmit={handleOnboardingSubmit}
        onFinish={handleOnboardingFinish}
      />
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        // Soft & airy: a full-width bar with a generous rounded top (like a
        // raised bottom sheet) and a soft upward shadow — roomier and more
        // premium than a flat strip, without the cramped feel of a fully
        // detached pill around the protruding center avatar.
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 62 + Math.max(insets.bottom, 12),
          paddingBottom: Math.max(insets.bottom, 12),
          paddingTop: 12,
          backgroundColor: colors.surface,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          borderTopWidth: 0,
          overflow: "visible",
          // Soft upward ambient shadow so the sheet lifts off the content.
          elevation: 22,
          shadowColor: isDark ? "#000000" : colors.shadow,
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: isDark ? 0.45 : 0.08,
          shadowRadius: 20,
        },
        tabBarItemStyle: { height: 48 },
      }}
    >
      {DASHBOARD_TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          listeners={{
            tabPress: (e) => {
              if (tab.name === "community") {
                setUnreadCommunity(false);
              }
              if (tab.name === "ai-chat") {
                // Voice chat needs the mic before it's useful, and Android can
                // crash natively if recording is touched without it granted —
                // gate navigation on the permission instead of letting the
                // screen open and fail silently. There's no OS-level
                // "speaker" permission to request; playback just works.
                e.preventDefault();
                requestRecordingPermissionsAsync()
                  .then(({ granted }) => {
                    if (granted) {
                      // Go straight to the voice screen rather than pushing the
                      // ai-chat tab (which only <Redirect>s here) — redirecting
                      // mid-render from a prevented tab press corrupts the nav
                      // stack on Android and can pop the whole app.
                      router.push({
                        pathname: "/(app)/qa",
                        params: { voiceMode: "1" },
                      });
                    } else {
                      showPermissionModal({
                        title: "Microphone access needed",
                        message: "Enable microphone access in Settings to use voice chat with Buddy.",
                        icon: "mic-outline",
                      });
                    }
                  })
                  .catch(() => {
                    showPermissionModal({
                      title: "Microphone access needed",
                      message: "Enable microphone access in Settings to use voice chat with Buddy.",
                      icon: "mic-outline",
                    });
                  });
              }
            },
          }}
          options={{
            tabBarButton: (props) => {
              const cleanProps = Object.fromEntries(
                Object.entries(props).filter(([_, value]) => value !== null)
              );
              return (
                <TouchableOpacity
                  {...cleanProps}
                  activeOpacity={0.9}
                  style={styles.tabButton}
                />
              );
            },
            tabBarIcon: ({ focused }) =>
              tab.center ? (
                <CenterAvatarTabIcon />
              ) : (
                <TabBarItem
                  focused={focused}
                  iconFocused={tab.iconFocused as string}
                  iconUnfocused={tab.iconUnfocused as string}
                  label={genZLabel(tab.label, genZModeEnabled)}
                  showBadge={tab.name === "community" && unreadCommunity}
                />
              ),
          }}
        />
      ))}
    </Tabs>
  );
}
