import { Ionicons } from "@expo/vector-icons";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-context";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import { OtpModal } from "../../components/OtpModal";
import { ThemeToggle, useTheme } from "../../components/theme";
import { connectPartnerAndResolveRoute, signupUser } from "../../lib/auth";
import type { AuthUser } from "../../lib/api";
import { getShadow } from "../../components/ui-tokens";

export default function SignUp() {
  const router = useRouter();
  const { partnerCode } = useLocalSearchParams<{ partnerCode?: string }>();
  const { signIn, updateUser } = useAuth();
  const { colors, isDark, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const role: "user" | "partner" = partnerCode ? "partner" : "user";
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOtpModalVisible, setIsOtpModalVisible] = useState(false);

  // Focus states
  const [fnameFocused, setFnameFocused] = useState(false);
  const [lnameFocused, setLnameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  const cardWidth = Math.min(Math.max(width - 32, 280), 360);

  async function handleSignup() {
    setErrorMessage("");

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setErrorMessage("All fields are required.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    try {
      setIsSubmitting(true);

      // Signup no longer creates the account directly — it stashes the
      // details and emails an OTP. The account is only created once the
      // code is verified in the modal below.
      await signupUser({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
      });

      setIsOtpModalVisible(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to create your account right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // After the account exists (OTP verified or Google signup), finish
  // connecting the pending partner invite code (if any) and route based on
  // the resolved partner role instead of always landing on the dashboard.
  async function finishSignIn(user: AuthUser) {
    const { connectError, partnerRole, destination } =
      await connectPartnerAndResolveRoute(partnerCode);

    if (connectError) setErrorMessage(connectError);

    updateUser({ ...user, partnerRole });
    router.replace(destination);
  }

  async function handleOtpVerified({
    token,
    user,
  }: {
    token: string;
    user: Record<string, unknown>;
  }) {
    const signedInUser = user as AuthUser;
    setIsOtpModalVisible(false);
    signIn({ token, user: signedInUser });
    await finishSignIn(signedInUser);
  }

  async function handleGoogleSignInSuccess({ token, user }: { token: string; user: AuthUser }) {
    setErrorMessage("");
    signIn({ token, user });
    await finishSignIn(user);
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

                {/* Create Account Text */}
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
                  {isDark ? "Create your space" : "Create your account"}
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
                    ? "A private place for tracking, insights, and care."
                    : "Set up your private space for tracking, insights, and care."}
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
                      Account details
                    </Text>
                    <Text
                      className="mt-0.5"
                      style={{ fontSize: 11.5, color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      You can personalize this later
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
                      name="person-outline"
                      size={14}
                      color={colors.mutedText}
                    />
                  </View>
                </View>

                {/* Info banner shown only when arriving with a partner invite code */}
                {partnerCode ? (
                  <View
                    className="mb-4 flex-row items-center gap-2.5 p-3.5 rounded-2xl border"
                    style={{ backgroundColor: colors.primaryLight, borderColor: colors.border }}
                  >
                    <Ionicons name="heart-outline" size={15} color={colors.primary} />
                    <Text
                      className="flex-1 text-[11px] font-semibold leading-4"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                    >
                      Connecting to your partner's account after sign up.
                    </Text>
                  </View>
                ) : null}

                {/* First name & Last name row */}
                <View className="flex-row mb-2.5" style={{ gap: 8 }}>
                  <View
                    className="flex-1 flex-row items-center border"
                    style={{
                      backgroundColor: colors.input,
                      borderColor: fnameFocused ? colors.primary : colors.border,
                      borderWidth: fnameFocused ? 1.5 : 1,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: Platform.OS === "ios" ? 12 : 6,
                    }}
                  >
                    <TextInput
                      autoComplete="given-name"
                      onChangeText={(text) => {
                        setErrorMessage("");
                        setFirstName(text);
                      }}
                      onFocus={() => setFnameFocused(true)}
                      onBlur={() => setFnameFocused(false)}
                      placeholder="First name"
                      placeholderTextColor={colors.mutedText}
                      returnKeyType="next"
                      className="flex-1 text-sm outline-none font-semibold"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                      textContentType="givenName"
                      value={firstName}
                    />
                  </View>

                  <View
                    className="flex-1 flex-row items-center border"
                    style={{
                      backgroundColor: colors.input,
                      borderColor: lnameFocused ? colors.primary : colors.border,
                      borderWidth: lnameFocused ? 1.5 : 1,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: Platform.OS === "ios" ? 12 : 6,
                    }}
                  >
                    <TextInput
                      autoComplete="family-name"
                      onChangeText={(text) => {
                        setErrorMessage("");
                        setLastName(text);
                      }}
                      onFocus={() => setLnameFocused(true)}
                      onBlur={() => setLnameFocused(false)}
                      placeholder="Last name"
                      placeholderTextColor={colors.mutedText}
                      returnKeyType="next"
                      className="flex-1 text-sm outline-none font-semibold"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                      textContentType="familyName"
                      value={lastName}
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
                    borderColor: passFocused ? colors.primary : colors.border,
                    borderWidth: passFocused ? 1.5 : 1,
                    borderRadius: 12,
                    paddingHorizontal: 13,
                    paddingVertical: Platform.OS === "ios" ? 12 : 6,
                  }}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={16}
                    color={passFocused ? colors.primary : colors.mutedText}
                    style={{ marginRight: 9 }}
                  />
                  <TextInput
                    onChangeText={(text) => {
                      setErrorMessage("");
                      setPassword(text);
                    }}
                    onFocus={() => setPassFocused(true)}
                    onBlur={() => setPassFocused(false)}
                    placeholder="Password"
                    placeholderTextColor={colors.mutedText}
                    returnKeyType="done"
                    secureTextEntry
                    className="flex-1 text-sm outline-none font-semibold"
                    style={{ color: colors.foreground, fontFamily: fonts.body }}
                    textContentType="newPassword"
                    value={password}
                  />
                </View>

                {/* Password Hint */}
                <Text
                  className="mb-5"
                  style={{
                    fontSize: 11,
                    lineHeight: 15,
                    color: colors.mutedText,
                    fontFamily: fonts.body,
                  }}
                >
                  Use at least 8 characters. Keep it private and easy to remember.
                </Text>

                {/* Create Account Button */}
                <TouchableOpacity
                  activeOpacity={0.9}
                  disabled={isSubmitting}
                  onPress={handleSignup}
                  className="mb-5 justify-center items-center"
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
                    {isSubmitting ? "Creating account..." : "Create account"}
                  </Text>
                </TouchableOpacity>

                {/* Continue with Google Divider */}
                <View className="mb-4 flex-row items-center">
                  <View className="h-[1px] flex-1" style={{ backgroundColor: colors.border }} />
                  <Text
                    className="mx-2 font-semibold"
                    style={{ fontSize: 10, color: colors.mutedText, letterSpacing: 0.3, fontFamily: fonts.body }}
                  >
                    OR CONTINUE WITH
                  </Text>
                  <View className="h-[1px] flex-1" style={{ backgroundColor: colors.border }} />
                </View>

                <View className="mb-5">
                  <GoogleSignInButton
                    disabled={isSubmitting}
                    onError={setErrorMessage}
                    onSuccess={handleGoogleSignInSuccess}
                    role={role}
                  />
                </View>

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

                {/* Bottom Sign In text */}
                <View className="flex-row justify-center">
                  <Text
                    style={{
                      fontSize: 12.5,
                      color: colors.mutedText,
                      fontFamily: fonts.body,
                    }}
                  >
                    Already have an account?{" "}
                  </Text>
                  <Link
                    href={{
                      pathname: "/(tabs)/login",
                      params: partnerCode ? { partnerCode } : undefined,
                    }}
                    asChild
                  >
                    <TouchableOpacity>
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: "800",
                          color: colors.primary,
                          fontFamily: fonts.body,
                        }}
                      >
                        Log in
                      </Text>
                    </TouchableOpacity>
                  </Link>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <OtpModal
        email={email.trim().toLowerCase()}
        onClose={() => setIsOtpModalVisible(false)}
        onVerified={handleOtpVerified}
        visible={isOtpModalVisible}
      />
    </View>
  );
}
