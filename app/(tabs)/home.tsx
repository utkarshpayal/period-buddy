import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-context";
import { BearMascot } from "../../components/BearMascot";
import {
  ProfileOnboarding,
  type ProfileOnboardingValues,
} from "../../components/profile-onboarding";
import { ThemeToggle, useTheme } from "../../components/theme";
import { submitCycleSettings, submitOnboarding } from "../../lib/auth";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, signIn, signOut, token, user } = useAuth();
  const { colors, isDark } = useTheme();
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const [showOnboardingForm, setShowOnboardingForm] = React.useState(false);

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

    try {
      await submitCycleSettings(
        {
          cycleLength: values.cycleLength,
          lastPeriodStartDate: values.lastPeriodStartDate,
          periodLength: values.periodLength,
          trackingGoal: values.trackingGoal,
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
  }

  if (user?.isProfileComplete === false) {
    if (!showOnboardingForm) {
      // Welcome intro shown once before the profile-setup form, matching the
      // mascot / greeting / single-CTA mockup for first-run onboarding.
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
            <View className="absolute right-6 top-8 z-10">
              <ThemeToggle />
            </View>

            <View className="flex-1 items-center justify-center px-8">
              <View className="mb-7 items-center justify-center">
                <BearMascot
                  faceColor={isDark ? "#4A2E39" : "#F3B4CE"}
                  featureColor={isDark ? "#1A1216" : "#3A2530"}
                  noseColor={colors.primary}
                  size={72}
                />
              </View>

              <Text
                className="text-center font-black"
                style={{ fontSize: 22, lineHeight: 28, color: colors.foreground }}
              >
                {name ? `Hi ${name},` : "Hi there,"}
              </Text>
              <Text
                className="text-center font-black"
                style={{ fontSize: 22, lineHeight: 28, color: colors.foreground }}
              >
                welcome to Period Buddy
              </Text>

              <Text
                className="mt-3 text-center text-sm leading-6 font-semibold"
                style={{ color: colors.mutedText, maxWidth: 300 }}
              >
                I&apos;ll help you track, understand, and feel your best — every
                day of your cycle.
              </Text>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setShowOnboardingForm(true)}
                className="mt-8 w-full rounded-full py-4"
                style={{ backgroundColor: colors.primary }}
              >
                <Text
                  className="text-center text-base font-bold"
                  style={{ color: colors.buttonText }}
                >
                  Let&apos;s set up your cycle
                </Text>
              </TouchableOpacity>

              <View className="flex-row items-center gap-1.5 mt-5">
                <View
                  className="rounded-full"
                  style={{ width: 16, height: 6, backgroundColor: colors.primary }}
                />
                <View
                  className="rounded-full"
                  style={{ width: 6, height: 6, backgroundColor: colors.border }}
                />
                <View
                  className="rounded-full"
                  style={{ width: 6, height: 6, backgroundColor: colors.border }}
                />
              </View>
            </View>
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
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1"
            keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
          >
          <View className="absolute right-6 top-4 z-10">
            <ThemeToggle />
          </View>

          <ScrollView
            contentContainerClassName="flex-grow justify-center px-6 py-10"
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            <ProfileOnboarding onSubmit={handleSubmitOnboarding} />
          </ScrollView>
          </KeyboardAvoidingView>
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
        <View className="absolute right-6 top-8 z-10">
          <ThemeToggle />
        </View>

        <View className="flex-1 justify-center px-6">
          <View className="mb-10 items-center">
            <View
              className="mb-6 items-center justify-center rounded-full border overflow-hidden"
              style={{
                width: 120,
                height: 120,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Image
                source={require("../../assets/images/icon-logo-nobg.png")}
                resizeMode="contain"
                style={{
                  width: 90,
                  height: 90,
                }}
              />
            </View>

            <Text
              className="text-center font-black"
              style={{ fontSize: 30, lineHeight: 36, color: colors.foreground }}
            >
              {name ? `Hi ${name}, welcome to Nura` : "Welcome to Nura"}
            </Text>

            <Text
              className="mt-3 text-center text-base leading-6 font-semibold"
              style={{ color: colors.mutedText, maxWidth: 300 }}
            >
              I&apos;ll help you track, understand, and feel your best — every day
              of your cycle.
            </Text>
          </View>

          <View
            className="rounded-3xl border p-6"
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
                style={{ color: colors.mutedText }}
              >
                {user.email}
              </Text>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.85}
              className="mt-6 rounded-full py-4"
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
