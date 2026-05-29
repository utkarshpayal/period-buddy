import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-context";
import { ThemeToggle, useTheme } from "../../components/theme";
import { loginUser } from "../../lib/auth";

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handlePasswordReset() {
    setErrorMessage(
      email.trim()
        ? `Password reset instructions were prepared for ${email.trim().toLowerCase()}.`
        : "Enter your email first so we know where to send reset instructions.",
    );
  }

  function handleGoogleSignIn() {
    signIn({
      token: "demo-google-session",
      user: {
        email: "demo@flowher.app",
        firstName: "Flow",
        isProfileComplete: true,
        lastName: "User",
      },
    });
    router.replace("/(app)/(dashboard)/home");
  }

  async function handleLogin() {
    setErrorMessage("");

    if (!email.trim() || !password) {
      setErrorMessage("Please enter your email and password.");
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await loginUser({
        email: email.trim().toLowerCase(),
        password,
      });

      if (!response.token) {
        setErrorMessage("Login succeeded, but no auth token was returned.");
        return;
      }

      const user = response.data ?? response.user;
      const isProfileComplete =
        response.isProfileComplete ?? user?.isProfileComplete;

      signIn({
        token: response.token,
        user: user
          ? { ...user, isProfileComplete }
          : { email: email.trim().toLowerCase(), isProfileComplete },
      });
      router.replace("/(app)/(dashboard)/home");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to login right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
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
                name="water-outline"
                size={38}
                color={colors.foreground}
              />
            </View>

            <Text
              className="text-4xl font-bold"
              style={{ color: colors.foreground }}
            >
              Login
            </Text>

            <Text
              className="mt-3 text-center text-base leading-6"
              style={{ color: colors.foreground }}
            >
              Welcome back to FlowHer
            </Text>
          </View>

          <View
            className="rounded-2xl border-2 p-6"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <View
              className="mb-5 flex-row items-center rounded-xl border px-4 py-4"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Ionicons
                name="mail-outline"
                size={20}
                color={colors.foreground}
              />

              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="Email address"
                placeholderTextColor={colors.foreground}
                className="ml-3 flex-1 text-base outline-none"
                style={{ color: colors.foreground }}
                value={email}
              />
            </View>

            <View
              className="mb-4 flex-row items-center rounded-xl border px-4 py-4"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={colors.foreground}
              />

              <TextInput
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={colors.foreground}
                secureTextEntry
                className="ml-3 flex-1 text-base outline-none"
                style={{ color: colors.foreground }}
                value={password}
              />
            </View>

            <TouchableOpacity
              className="mb-6 self-end"
              onPress={handlePasswordReset}
            >
              <Text
                className="text-sm font-medium underline"
                style={{ color: colors.primary }}
              >
                Forgot Password?
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              disabled={isSubmitting}
              onPress={handleLogin}
              className="rounded-xl py-4"
              style={{
                backgroundColor: colors.primary,
                opacity: isSubmitting ? 0.65 : 1,
              }}
            >
              <Text
                className="text-center text-lg font-bold"
                style={{ color: colors.buttonText }}
              >
                {isSubmitting ? "Logging in..." : "Login"}
              </Text>
            </TouchableOpacity>

            {errorMessage ? (
              <Text
                className="mt-4 text-center text-sm font-medium"
                style={{ color: colors.foreground }}
              >
                {errorMessage}
              </Text>
            ) : null}

            <View className="my-6 flex-row items-center">
              <View
                className="h-[1px] flex-1"
                style={{ backgroundColor: colors.border }}
              />
              <Text
                className="mx-3 text-sm"
                style={{ color: colors.foreground }}
              >
                OR
              </Text>
              <View
                className="h-[1px] flex-1"
                style={{ backgroundColor: colors.border }}
              />
            </View>

            <TouchableOpacity
              className="flex-row items-center justify-center rounded-xl border py-4"
              onPress={handleGoogleSignIn}
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Ionicons
                name="logo-google"
                size={22}
                color={colors.foreground}
              />

              <Text
                className="ml-3 text-base font-semibold"
                style={{ color: colors.foreground }}
              >
                Continue with Google
              </Text>
            </TouchableOpacity>
          </View>

          <View className="mt-8 flex-row justify-center">
            <Text style={{ color: colors.foreground }}>No account yet?</Text>

            <Link href="/(tabs)/signup" asChild>
              <TouchableOpacity>
                <Text
                  className="ml-2 font-bold underline"
                  style={{ color: colors.primary }}
                >
                  Sign Up
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}
