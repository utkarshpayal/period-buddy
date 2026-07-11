import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  StatusBar,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-context";
import { ThemeToggle, useTheme } from "../../components/theme";
import { loginUser } from "../../lib/auth";
import { LinearGradient } from "expo-linear-gradient";
import {
  getActionGradient,
  getScreenGradient,
  getShadow,
  getSoftTints,
} from "../../components/ui-tokens";

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const contentWidth = Math.min(Math.max(width - 40, 280), 460);
  const screenGradient = getScreenGradient(colors, isDark) as [
    string,
    string,
    string,
  ];
  const actionGradient = getActionGradient(colors) as [string, string];
  const softTints = getSoftTints(colors);

  function handlePasswordReset() {
    setErrorMessage(
      email.trim()
        ? `Instructions sent to ${email.trim().toLowerCase()}.`
        : "Enter your email first to reset password.",
    );
  }

  function handleGoogleSignIn() {
    signIn({
      token: "demo-google-session",
      user: {
        email: "demo@nura.app",
        firstName: "Nura",
        isProfileComplete: true,
        lastName: "Sister",
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
    <LinearGradient
      colors={screenGradient}
      className="flex-1"
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      <SafeAreaView className="flex-1">
        <View className="absolute right-6 top-6 z-10">
          <ThemeToggle />
        </View>

        <ScrollView
          contentContainerStyle={{
            alignItems: "center",
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 20,
            paddingVertical: 40,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: contentWidth }}>
            <View className="mb-7 items-center">
              <View
                className="mb-4 h-14 w-14 items-center justify-center rounded-2xl border"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Ionicons name="sparkles" size={22} color={colors.primary} />
              </View>

              <Text
                className="text-3xl font-black tracking-tight text-center"
                style={{ color: colors.foreground }}
              >
                Welcome back
              </Text>

              <Text
                className="mt-2.5 text-center text-sm font-semibold leading-5"
                style={{ color: colors.mutedText }}
              >
                Continue your private wellness routine with your tracker,
                community, and care tools.
              </Text>
            </View>

          <View
            className="rounded-3xl border p-5 mb-6"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              ...getShadow(colors, isDark),
            }}
          >
            <View className="mb-5 flex-row items-center justify-between">
              <View>
                <Text
                  className="text-sm font-black"
                  style={{ color: colors.foreground }}
                >
                  Sign in
                </Text>
                <Text
                  className="mt-1 text-[11px] font-semibold"
                  style={{ color: colors.mutedText }}
                >
                  Your care space is ready.
                </Text>
              </View>
              <View
                className="h-10 w-10 items-center justify-center rounded-2xl"
                style={{ backgroundColor: softTints.mint }}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={colors.secondary}
                />
              </View>
            </View>

            <View
              className="mb-4 flex-row items-center rounded-2xl border px-4 py-4"
              style={{
                backgroundColor: colors.input,
                borderColor: emailFocused ? colors.primary : colors.border,
                borderWidth: emailFocused ? 1.5 : 1,
              }}
            >
              <Ionicons
                name="mail-outline"
                size={18}
                color={emailFocused ? colors.primary : colors.mutedText}
              />
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={(text) => {
                  setErrorMessage("");
                  setEmail(text);
                }}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                placeholder="Email address"
                placeholderTextColor={colors.mutedText}
                className="ml-3 flex-1 text-sm outline-none font-semibold"
                style={{ color: colors.foreground }}
                value={email}
              />
            </View>

            <View
              className="mb-4 flex-row items-center rounded-2xl border px-4 py-4"
              style={{
                backgroundColor: colors.input,
                borderColor: passwordFocused ? colors.primary : colors.border,
                borderWidth: passwordFocused ? 1.5 : 1,
              }}
            >
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={passwordFocused ? colors.primary : colors.mutedText}
              />
              <TextInput
                onChangeText={(text) => {
                  setErrorMessage("");
                  setPassword(text);
                }}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                placeholder="Password"
                placeholderTextColor={colors.mutedText}
                secureTextEntry
                className="ml-3 flex-1 text-sm outline-none font-semibold"
                style={{ color: colors.foreground }}
                value={password}
              />
            </View>

            <TouchableOpacity
              className="mb-6 self-end px-1"
              onPress={handlePasswordReset}
            >
              <Text
                className="text-xs font-bold"
                style={{ color: colors.primary }}
              >
                Forgot Password?
              </Text>
            </TouchableOpacity>

            {/* Submit Button */}
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={isSubmitting}
              onPress={handleLogin}
              className="rounded-full overflow-hidden"
              style={{ opacity: isSubmitting ? 0.75 : 1 }}
            >
              <LinearGradient
                colors={actionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                className="py-4 items-center justify-center"
              >
                <Text
                  className="text-center text-sm font-black tracking-wide"
                  style={{ color: colors.buttonText }}
                >
                  {isSubmitting ? "Logging in..." : "Log In"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {errorMessage ? (
              <View
                className="mt-4 rounded-2xl border px-4 py-3"
                style={{
                  backgroundColor: colors.dangerLight,
                  borderColor: colors.danger,
                }}
              >
                <Text
                  className="text-center text-xs font-bold"
                  style={{ color: colors.danger }}
                >
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            <View className="my-6 flex-row items-center">
              <View
                className="h-[1px] flex-1"
                style={{ backgroundColor: colors.border }}
              />
              <Text
                className="mx-3 text-[10px] font-black tracking-wider"
                style={{ color: colors.mutedText }}
              >
                OR
              </Text>
              <View
                className="h-[1px] flex-1"
                style={{ backgroundColor: colors.border }}
              />
            </View>

            {/* Google Sign In */}
            <TouchableOpacity
              className="flex-row rounded-full py-4 items-center border justify-center"
              onPress={handleGoogleSignIn}
              style={{
                backgroundColor: colors.input,
                borderColor: colors.border,
              }}
            >
              <Ionicons
                name="logo-google"
                size={18}
                color={colors.foreground}
              />
              <Text
                className="ml-3 text-sm font-bold"
                style={{ color: colors.foreground }}
              >
                Continue with Google
              </Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row justify-center flex-wrap">
            <Text className="text-xs font-semibold" style={{ color: colors.mutedText }}>
              {"Don't have an account?"}
            </Text>
            <Link href="/(tabs)/signup" asChild>
              <TouchableOpacity>
                <Text
                  className="ml-2 text-xs font-bold underline"
                  style={{ color: colors.primary }}
                >
                  Sign Up
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}
