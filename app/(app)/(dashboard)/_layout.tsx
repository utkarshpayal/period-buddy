import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
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

export default function DashboardLayout() {
  const { colors, isDark } = useTheme();
  const { token, user, signIn } = useAuth();

  async function handleOnboardingSubmit(values: any) {
    if (!token) return;
    try {
      const response = await submitOnboarding(values, token);
      const updatedUser = response.data ?? response.user;
      const isProfileComplete =
        response.isProfileComplete ?? updatedUser?.isProfileComplete ?? true;
      signIn({
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
          bottom: Platform.OS === "ios" ? 28 : 20,
          left: 20,
          right: 20,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 24,
          height: 68,
          elevation: 4,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.22 : 0.08,
          shadowRadius: 12,
          paddingBottom: 0,
        },
      }}
    >
      {[
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
                className="items-center justify-center rounded-2xl px-2"
                style={{
                  backgroundColor: focused ? colors.primaryLight : "transparent",
                  minWidth: 64,
                  height: 52,
                }}
              >
                <Ionicons
                  name={(focused ? tab.iconFocused : tab.iconUnfocused) as any}
                  size={21}
                  color={focused ? colors.primary : colors.mutedText}
                />
                <Text
                  className="mt-1 text-[10px] font-black"
                  numberOfLines={1}
                  style={{ color: focused ? colors.primary : colors.mutedText }}
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
