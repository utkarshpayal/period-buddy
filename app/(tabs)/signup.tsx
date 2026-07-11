import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
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
import { ThemeToggle, useTheme } from "../../components/theme";
import { signupUser } from "../../lib/auth";
import { LinearGradient } from "expo-linear-gradient";
import {
  getActionGradient,
  getScreenGradient,
  getShadow,
  getSoftTints,
} from "../../components/ui-tokens";

export default function SignUp() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Focus states
  const [fnameFocused, setFnameFocused] = useState(false);
  const [lnameFocused, setLnameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);
  const contentWidth = Math.min(Math.max(width - 40, 280), 480);
  const screenGradient = getScreenGradient(colors, isDark) as [
    string,
    string,
    string,
  ];
  const actionGradient = getActionGradient(colors) as [string, string];
  const softTints = getSoftTints(colors);

  async function handleSignup() {
    setErrorMessage("");

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setErrorMessage("Please fill out all fields.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await signupUser({
        confirmPassword: password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      if (!response.token) {
        setErrorMessage("Account created, but no auth token was returned.");
        return;
      }

      const user = response.data ?? response.user;
      const isProfileComplete =
        response.isProfileComplete ?? user?.isProfileComplete;
      const signedInUser = user ?? {
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      };

      signIn({
        token: response.token,
        user: { ...signedInUser, isProfileComplete },
      });

      router.replace("/(app)/(dashboard)/home");
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
            <View className="mb-7 items-center mt-4">
              <View
                className="mb-4 h-14 w-14 items-center justify-center rounded-2xl border"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Ionicons name="heart-circle-outline" size={24} color={colors.primary} />
              </View>

              <Text
                className="text-3xl font-black tracking-tight text-center"
                style={{ color: colors.foreground }}
              >
                Create your space
              </Text>

              <Text
                className="mt-2.5 text-center text-sm font-semibold leading-5"
                style={{ color: colors.mutedText }}
              >
                Set up a private account for tracking, insights, community, and
                care when you need it.
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
                  Account details
                </Text>
                <Text
                  className="mt-1 text-[11px] font-semibold"
                  style={{ color: colors.mutedText }}
                >
                  You can personalize more later.
                </Text>
              </View>
              <View
                className="h-10 w-10 items-center justify-center rounded-2xl"
                style={{ backgroundColor: softTints.lavender }}
              >
                <Ionicons name="person-add-outline" size={18} color={colors.accent} />
              </View>
            </View>

            <View
              className="mb-4 flex-row items-center rounded-2xl border px-4 py-4"
              style={{
                backgroundColor: colors.input,
                borderColor: fnameFocused ? colors.primary : colors.border,
                borderWidth: fnameFocused ? 1.5 : 1,
              }}
            >
              <Ionicons
                name="person-outline"
                size={18}
                color={fnameFocused ? colors.primary : colors.mutedText}
              />
              <TextInput
                onChangeText={(text) => {
                  setErrorMessage("");
                  setFirstName(text);
                }}
                onFocus={() => setFnameFocused(true)}
                onBlur={() => setFnameFocused(false)}
                placeholder="First name"
                placeholderTextColor={colors.mutedText}
                className="ml-3 flex-1 text-sm outline-none font-semibold"
                style={{ color: colors.foreground }}
                value={firstName}
              />
            </View>

            <View
              className="mb-4 flex-row items-center rounded-2xl border px-4 py-4"
              style={{
                backgroundColor: colors.input,
                borderColor: lnameFocused ? colors.primary : colors.border,
                borderWidth: lnameFocused ? 1.5 : 1,
              }}
            >
              <Ionicons
                name="person-outline"
                size={18}
                color={lnameFocused ? colors.primary : colors.mutedText}
              />
              <TextInput
                onChangeText={(text) => {
                  setErrorMessage("");
                  setLastName(text);
                }}
                onFocus={() => setLnameFocused(true)}
                onBlur={() => setLnameFocused(false)}
                placeholder="Last name"
                placeholderTextColor={colors.mutedText}
                className="ml-3 flex-1 text-sm outline-none font-semibold"
                style={{ color: colors.foreground }}
                value={lastName}
              />
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
              className="mb-3 flex-row items-center rounded-2xl border px-4 py-4"
              style={{
                backgroundColor: colors.input,
                borderColor: passFocused ? colors.primary : colors.border,
                borderWidth: passFocused ? 1.5 : 1,
              }}
            >
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={passFocused ? colors.primary : colors.mutedText}
              />
              <TextInput
                onChangeText={(text) => {
                  setErrorMessage("");
                  setPassword(text);
                }}
                onFocus={() => setPassFocused(true)}
                onBlur={() => setPassFocused(false)}
                placeholder="Password (min. 8 characters)"
                placeholderTextColor={colors.mutedText}
                secureTextEntry
                className="ml-3 flex-1 text-sm outline-none font-semibold"
                style={{ color: colors.foreground }}
                value={password}
              />
            </View>

            <Text
              className="mb-6 px-1 text-[11px] font-semibold leading-4"
              style={{ color: colors.mutedText }}
            >
              Use at least 8 characters. Keep it private and easy for you to
              remember.
            </Text>

            <TouchableOpacity
              activeOpacity={0.9}
              disabled={isSubmitting}
              onPress={handleSignup}
              className="rounded-full overflow-hidden"
              style={{ opacity: isSubmitting ? 0.65 : 1 }}
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
                  {isSubmitting ? "Creating..." : "Create Account"}
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
          </View>

          <View className="flex-row justify-center flex-wrap">
            <Text className="text-xs font-semibold" style={{ color: colors.mutedText }}>
              Already have an account?
            </Text>
            <Link href="/(tabs)/login" asChild>
              <TouchableOpacity>
                <Text
                  className="ml-2 text-xs font-bold underline"
                  style={{ color: colors.primary }}
                >
                  Log In
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
