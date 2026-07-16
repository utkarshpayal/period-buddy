import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
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
import { getShadow } from "../../components/ui-tokens";

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { colors, isDark, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const cardWidth = Math.min(Math.max(width - 32, 280), 360);

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
    <View
      className="flex-1"
      style={{ backgroundColor: colors.background }}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
          keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
        >
          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={{
              alignItems: "center",
              flexGrow: 1,
              justifyContent: "center",
              paddingBottom: 40,
              paddingHorizontal: 16,
              paddingTop: 40,
            }}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Card Container */}
            <View
              className="border overflow-hidden"
              style={{
                width: cardWidth,
                borderRadius: 28,
                backgroundColor: colors.background,
                borderColor: colors.border,
                ...getShadow(colors, isDark),
              }}
            >
              {/* Header Section (Light background / Dark background) */}
              <View
                style={{
                  paddingHorizontal: 24,
                  paddingTop: 24,
                  paddingBottom: 28,
                  alignItems: "center",
                  backgroundColor: colors.background,
                }}
              >
                {/* Theme Switcher */}
                <View className="self-end mb-6">
                  <ThemeToggle />
                </View>

                {/* Logo Icon */}
                <View
                  className="mb-4.5 items-center justify-center"
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 15,
                    backgroundColor: colors.primaryLight,
                  }}
                >
                  {isDark ? (
                    <Ionicons name="moon" size={22} color={colors.primary} />
                  ) : (
                    <Text
                      style={{
                        fontFamily: fonts.heading,
                        fontWeight: "800",
                        fontSize: 20,
                        color: colors.primary,
                      }}
                    >
                      L
                    </Text>
                  )}
                </View>

                {/* Welcome Back Text */}
                <Text
                  className="text-center font-black tracking-tight"
                  style={{
                    fontSize: 25,
                    color: colors.foreground,
                    fontFamily: fonts.heading,
                    letterSpacing: -0.3,
                    marginBottom: 8,
                  }}
                >
                  Welcome back
                </Text>

                {/* Subtitle */}
                <Text
                  className="text-center text-xs leading-5"
                  style={{
                    color: colors.mutedText,
                    maxWidth: 250,
                    fontFamily: fonts.body,
                  }}
                >
                  {isDark
                    ? "Sign in to continue your cycle tracking, insights, and care."
                    : "Sign in to continue tracking your cycle, insights, and care."}
                </Text>
              </View>

              {/* Form Section (Surface / Solid background) */}
              <View
                style={{
                  backgroundColor: colors.surface,
                  padding: 22,
                }}
              >
                {/* Section header info */}
                <View className="mb-4 flex-row items-center justify-between">
                  <View>
                    <Text
                      className="font-black"
                      style={{ fontSize: 14.5, color: colors.foreground, fontFamily: fonts.body }}
                    >
                      Sign in
                    </Text>
                    <Text
                      className="mt-0.5"
                      style={{ fontSize: 11.5, color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      {isDark ? "Your space, always private" : "Your data stays private"}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: colors.surfaceSoft,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons
                      name="lock-closed-outline"
                      size={14}
                      color={colors.mutedText}
                    />
                  </View>
                </View>

                {/* Email Field */}
                <View
                  className="mb-2.5 flex-row items-center border"
                  style={{
                    backgroundColor: colors.input,
                    borderColor: emailFocused ? colors.primary : colors.border,
                    borderWidth: emailFocused ? 1.5 : 1,
                    borderRadius: 12,
                    paddingHorizontal: 13,
                    paddingVertical: Platform.OS === "ios" ? 12 : 6,
                  }}
                >
                  <Ionicons
                    name="mail-outline"
                    size={16}
                    color={emailFocused ? colors.primary : colors.mutedText}
                    style={{ marginRight: 9 }}
                  />
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    onChangeText={(text) => {
                      setErrorMessage("");
                      setEmail(text);
                    }}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    placeholder="Email address"
                    placeholderTextColor={colors.mutedText}
                    returnKeyType="next"
                    className="flex-1 text-sm outline-none font-semibold"
                    style={{ color: colors.foreground, fontFamily: fonts.body }}
                    textContentType="emailAddress"
                    value={email}
                  />
                </View>

                {/* Password Field */}
                <View
                  className="mb-2 flex-row items-center border"
                  style={{
                    backgroundColor: colors.input,
                    borderColor: passwordFocused ? colors.primary : colors.border,
                    borderWidth: passwordFocused ? 1.5 : 1,
                    borderRadius: 12,
                    paddingHorizontal: 13,
                    paddingVertical: Platform.OS === "ios" ? 12 : 6,
                  }}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={16}
                    color={passwordFocused ? colors.primary : colors.mutedText}
                    style={{ marginRight: 9 }}
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
                    returnKeyType="done"
                    secureTextEntry
                    className="flex-1 text-sm outline-none font-semibold"
                    style={{ color: colors.foreground, fontFamily: fonts.body }}
                    textContentType="password"
                    value={password}
                  />
                </View>

                {/* Forgot Password Link */}
                <TouchableOpacity
                  className="mb-4 align-self-end"
                  style={{ alignSelf: "flex-end" }}
                  onPress={handlePasswordReset}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: colors.primary,
                      fontFamily: fonts.body,
                    }}
                  >
                    Forgot password?
                  </Text>
                </TouchableOpacity>

                {/* Log In Button */}
                <TouchableOpacity
                  activeOpacity={0.9}
                  disabled={isSubmitting}
                  onPress={handleLogin}
                  className="mb-4 justify-center items-center"
                  style={{
                    height: 46,
                    borderRadius: 12,
                    backgroundColor: colors.primary,
                    opacity: isSubmitting ? 0.75 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "800",
                      color: colors.buttonText,
                      fontFamily: fonts.body,
                    }}
                  >
                    {isSubmitting ? "Logging in..." : "Log in"}
                  </Text>
                </TouchableOpacity>

                {/* Continue with Google Divider */}
                <View className="mb-4 flex-row items-center">
                  <View
                    className="h-[1px] flex-1"
                    style={{ backgroundColor: colors.border }}
                  />
                  <Text
                    className="mx-2 font-semibold"
                    style={{ fontSize: 10, color: colors.mutedText, letterSpacing: 0.3, fontFamily: fonts.body }}
                  >
                    OR CONTINUE WITH
                  </Text>
                  <View
                    className="h-[1px] flex-1"
                    style={{ backgroundColor: colors.border }}
                  />
                </View>

                {/* Google Button */}
                <TouchableOpacity
                  className="mb-5 flex-row items-center justify-center border"
                  onPress={handleGoogleSignIn}
                  style={{
                    height: 44,
                    borderRadius: 12,
                    borderColor: colors.border,
                    backgroundColor: isDark ? colors.surfaceStrong : colors.surface,
                  }}
                >
                  <Ionicons
                    name="logo-google"
                    size={15}
                    color={colors.foreground}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: colors.foreground,
                      fontFamily: fonts.body,
                    }}
                  >
                    Continue with Google
                  </Text>
                </TouchableOpacity>

                {/* Error Message block */}
                {errorMessage ? (
                  <View
                    className="mb-4 rounded-xl border px-3 py-2"
                    style={{
                      backgroundColor: colors.dangerLight,
                      borderColor: colors.danger,
                    }}
                  >
                    <Text
                      className="text-center text-xs font-bold"
                      style={{ color: colors.danger, fontFamily: fonts.body }}
                    >
                      {errorMessage}
                    </Text>
                  </View>
                ) : null}

                {/* Bottom Sign Up text */}
                <View className="flex-row justify-center">
                  <Text
                    style={{
                      fontSize: 12.5,
                      color: colors.mutedText,
                      fontFamily: fonts.body,
                    }}
                  >
                    {isDark ? "New to Lunara? " : "Don't have an account? "}
                  </Text>
                  <Link href="/(tabs)/signup" asChild>
                    <TouchableOpacity>
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: "800",
                          color: colors.primary,
                          fontFamily: fonts.body,
                        }}
                      >
                        {isDark ? "Create account" : "Sign up"}
                      </Text>
                    </TouchableOpacity>
                  </Link>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
