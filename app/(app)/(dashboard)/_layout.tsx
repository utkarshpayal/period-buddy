import { Tabs, useRouter } from "expo-router";
import React, { useCallback, useState, useEffect } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { requestRecordingPermissionsAsync } from "expo-audio";
import { useTheme } from "../../../components/theme";
import { genZLabel, useGenZMode } from "../../../components/genz-mode";
import { TabBarItem } from "../../../components/TabBarItem";

import { useAuth } from "../../../components/auth-context";
import { ProfileOnboarding } from "../../../components/profile-onboarding";
import { submitCycleSettings, submitOnboarding } from "../../../lib/auth";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { showPermissionModal } from "../../../lib/modal-host";
import { useRealtimeSocket, type RealtimeMessage } from "../../../hooks/useRealtimeSocket";

const CENTER_AVATAR_SOURCE = require("../../../assets/images/icon.png");

// Center avatar tab: a full circular avatar floats above the tab bar,
// overlapping its bottom edge slightly (tabBarStyle has overflow: "visible").
const AVATAR_SIZE = 76;
const AVATAR_WRAP_SIZE = 100;
const AVATAR_WRAP_TOP = -54;

type DashboardTab = {
  name: string;
  label: string;
  iconFocused?: string;
  iconUnfocused?: string;
  image?: any;
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
    image: CENTER_AVATAR_SOURCE,
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

function CenterAvatarTabIcon({ image }: { image: any }) {
  return (
    <View style={styles.avatarWrap} pointerEvents="none">
      <Image source={image} style={styles.avatarImage} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  avatarWrap: {
    position: "absolute",
    top: AVATAR_WRAP_TOP,
    width: AVATAR_WRAP_SIZE,
    height: AVATAR_WRAP_SIZE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    elevation: 10,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default function DashboardLayout() {
  const { colors, isDark } = useTheme();
  const { enabled: genZModeEnabled } = useGenZMode();
  const { token, user, signIn } = useAuth();
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

  async function handleOnboardingSubmit(values: any) {
    if (!token) return;
    try {
      const response = await submitOnboarding(values, token);
      const updatedUser = response.data ?? response.user;
      const isProfileComplete =
        response.isProfileComplete ?? updatedUser?.isProfileComplete ?? true;

      try {
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
      } catch (error) {
        console.error("Failed to save cycle settings:", error);
      }

      await signIn({
        token,
        user: {
          ...user,
          ...values,
          ...updatedUser,
          isProfileComplete,
        },
      });
    } catch (err) {
      console.error("Onboarding failed:", err);
      throw err;
    }
  }

  if (user && user.isProfileComplete === false) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={colors.background}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 40 }}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            <ProfileOnboarding onSubmit={handleOnboardingSubmit} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
          shadowOpacity: isDark ? 0.45 : 0.12,
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
              tab.image ? (
                <CenterAvatarTabIcon image={tab.image} />
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
