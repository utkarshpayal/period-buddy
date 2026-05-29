import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import {
    ScrollView,
    StatusBar,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-context";
import {
    ProfileOnboarding,
    type ProfileOnboardingValues,
} from "../../components/profile-onboarding";
import { ThemeToggle, useTheme } from "../../components/theme";
import { submitOnboarding } from "../../lib/auth";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, signIn, signOut, token, user } = useAuth();
  const { colors, isDark } = useTheme();
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, router]);

  function handleLogout() {
    signOut();
    router.replace("/");
  }

  async function handleSubmitOnboarding(values: ProfileOnboardingValues) {
    if (!token) {
      throw new Error("Please login again before submitting your profile.");
    }

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
  }

  if (user?.isProfileComplete === false) {
    return (
      <>
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={colors.background}
        />

        <SafeAreaView
          className="flex-1"
          style={{ backgroundColor: colors.background }}
        >
          <View className="absolute right-6 top-4 z-10">
            <ThemeToggle />
          </View>

          <ScrollView
            contentContainerClassName="flex-grow justify-center px-6 py-10"
            keyboardShouldPersistTaps="handled"
          >
            <ProfileOnboarding onSubmit={handleSubmitOnboarding} />
          </ScrollView>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
      >
        <View className="absolute right-6 top-4 z-10">
          <ThemeToggle />
        </View>

        <View className="flex-1 justify-center px-6">
          <View className="mb-10 items-center">
            <View
              className="mb-5 h-20 w-20 items-center justify-center rounded-full border-2"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Ionicons
                name="home-outline"
                size={36}
                color={colors.foreground}
              />
            </View>

            <Text
              className="text-4xl font-bold"
              style={{ color: colors.foreground }}
            >
              Home
            </Text>

            <Text
              className="mt-3 text-center text-base leading-6"
              style={{ color: colors.foreground }}
            >
              {name ? `Welcome, ${name}` : "Welcome to FlowHer"}
            </Text>
          </View>

          <View
            className="rounded-2xl border-2 p-6"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <Text
              className="text-center text-lg font-bold"
              style={{ color: colors.foreground }}
            >
              You are logged in
            </Text>

            {user?.email ? (
              <Text
                className="mt-3 text-center text-base"
                style={{ color: colors.foreground }}
              >
                {user.email}
              </Text>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.85}
              className="mt-6 rounded-xl py-4"
              onPress={handleLogout}
              style={{ backgroundColor: colors.primary }}
            >
              <Text
                className="text-center text-lg font-bold"
                style={{ color: colors.buttonText }}
              >
                Logout
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}
