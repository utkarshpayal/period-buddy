import { Tabs, useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
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
import { TabBarItem } from "../../../components/TabBarItem";

import { useAuth } from "../../../components/auth-context";
import { ProfileOnboarding } from "../../../components/profile-onboarding";
import { submitCycleSettings, submitOnboarding } from "../../../lib/auth";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { getWebSocketUrl } from "../../../lib/api";
import { showPermissionModal } from "../../../lib/modal-host";

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

  useEffect(() => {
    if (!token || !user?._id) return;

    const userId = user._id;
    let socket: WebSocket | null = null;
    let isDisconnected = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    // Capped exponential backoff with jitter — a fixed 3s retry means every
    // client reconnects in lockstep after a server restart (thundering herd).
    let reconnectAttempts = 0;
    function scheduleReconnect() {
      if (isDisconnected) return;
      const base = Math.min(30000, 1000 * 2 ** reconnectAttempts);
      const delay = base / 2 + Math.random() * (base / 2);
      reconnectAttempts += 1;
      reconnectTimeout = setTimeout(connectWS, delay);
    }

    function connectWS() {
      if (isDisconnected) return;

      getWebSocketUrl()
        .then((wsUrl) => {
          if (isDisconnected) return;

          socket = new WebSocket(wsUrl);

          socket.onopen = () => {
            if (isDisconnected) return;
            reconnectAttempts = 0; // reset backoff on a healthy connection
            console.log("WebSocket connected for global notifications");

            // Join personal room for comment/like notifications on our posts
            socket?.send(
              JSON.stringify({
                type: "join",
                room: `user_${userId}`,
              })
            );

            // Join general community room for new posts
            socket?.send(
              JSON.stringify({
                type: "join",
                room: "community",
              })
            );
          };

          socket.onmessage = (event) => {
            if (isDisconnected) return;
            try {
              const data = JSON.parse(event.data);
              if (data.type === "community_notification") {
                if (data.senderId !== userId) {
                  setUnreadCommunity(true);
                }
              }
            } catch (err) {
              console.error("Error parsing notification WS message:", err);
            }
          };

          socket.onerror = (err) => {
            console.warn("Notification WebSocket error:", err);
          };

          socket.onclose = () => {
            if (isDisconnected) return;
            console.log("Notification WebSocket closed, retrying with backoff…");
            scheduleReconnect();
          };
        })
        .catch((err) => {
          console.warn("Failed to get WebSocket URL, retrying with backoff…", err);
          scheduleReconnect();
        });
    }

    connectWS();

    return () => {
      isDisconnected = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socket) {
        try {
          socket.send(
            JSON.stringify({
              type: "leave",
              room: `user_${userId}`,
            })
          );
          socket.send(
            JSON.stringify({
              type: "leave",
              room: "community",
            })
          );
        } catch {}
        socket.close();
      }
    };
  }, [token, user?._id]);

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
                      router.push("/(app)/(dashboard)/ai-chat");
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
                  label={tab.label}
                  showBadge={tab.name === "community" && unreadCommunity}
                />
              ),
          }}
        />
      ))}
    </Tabs>
  );
}
