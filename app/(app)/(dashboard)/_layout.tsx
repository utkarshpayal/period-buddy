import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../../../components/theme";

import { useAuth } from "../../../components/auth-context";
import { ProfileOnboarding } from "../../../components/profile-onboarding";
import { submitOnboarding } from "../../../lib/auth";
import { SafeAreaView } from "react-native-safe-area-context";
import { getWebSocketUrl } from "../../../lib/api";

export default function DashboardLayout() {
  const { colors, isDark, fonts } = useTheme();
  const { token, user, signIn } = useAuth();
  const router = useRouter();
  const [unreadCommunity, setUnreadCommunity] = useState(false);

  // Auth guard: if there's no session (never logged in, logged out, or the
  // session was cleared after a 401 from an expired/invalid token) bounce
  // back to login instead of rendering the dashboard with empty/stale data.
  useEffect(() => {
    if (!token) {
      router.replace("/(tabs)/login");
    } else if (user?.partnerRole === "viewer") {
      router.replace("/(app)/(partner-view)/home");
    }
  }, [token, user?.partnerRole, router]);

  useEffect(() => {
    if (!token || !user?._id) return;

    const userId = user._id;
    let socket: WebSocket | null = null;
    let isDisconnected = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    function connectWS() {
      if (isDisconnected) return;

      getWebSocketUrl()
        .then((wsUrl) => {
          if (isDisconnected) return;

          socket = new WebSocket(wsUrl);

          socket.onopen = () => {
            if (isDisconnected) return;
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
            console.log("Notification WebSocket closed, retrying in 3s...");
            reconnectTimeout = setTimeout(connectWS, 3000);
          };
        })
        .catch((err) => {
          console.warn("Failed to get WebSocket URL, retrying in 5s...", err);
          reconnectTimeout = setTimeout(connectWS, 5000);
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
        tabBarStyle: {
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderTopWidth: 1,
          borderLeftWidth: 0,
          borderRightWidth: 0,
          borderBottomWidth: 0,
          height: Platform.OS === "ios" ? 84 : 70,
          elevation: 0,
          shadowColor: "transparent",
          paddingBottom: Platform.OS === "ios" ? 24 : 12,
          paddingTop: 8,
        },
      }}
    >
      {[
        {
          name: "tracker",
          label: "Calendar",
          iconFocused: "calendar",
          iconUnfocused: "calendar-outline",
        },
        {
          name: "home",
          label: "Dashboard",
          iconFocused: "home",
          iconUnfocused: "home-outline",
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
      ].map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          listeners={{
            tabPress: () => {
              if (tab.name === "community") {
                setUnreadCommunity(false);
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
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                />
              );
            },
            tabBarIcon: ({ focused }) => (
              <View
                className="items-center justify-center relative"
                style={{
                  backgroundColor: focused ? (isDark ? "rgba(232, 166, 160, 0.12)" : "#FFF1ED") : "transparent",
                  borderRadius: 12,
                  paddingVertical: 5,
                  paddingHorizontal: 12,
                  minWidth: 64,
                  height: 48,
                  gap: 3,
                }}
              >
                <Ionicons
                  name={(focused ? tab.iconFocused : tab.iconUnfocused) as any}
                  size={17}
                  color={focused ? colors.primary : colors.mutedText}
                />
                {tab.name === "community" && unreadCommunity && (
                  <View
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 10,
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: colors.danger,
                    }}
                  />
                )}
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 9.5,
                    fontWeight: focused ? "700" : "600",
                    color: focused ? colors.primary : colors.mutedText,
                  }}
                >
                  {tab.label}
                </Text>
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
