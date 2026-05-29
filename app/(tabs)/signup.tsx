import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-context";
import { ThemeToggle, useTheme } from "../../components/theme";
import { signupUser } from "../../lib/auth";

export default function SignUp() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { colors, isDark } = useTheme();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignup() {
    setErrorMessage("");

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setErrorMessage("Please enter your name, email, and password.");
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

      router.replace("./home");
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

  function renderSignupForm() {
    return (
      <>
        <View className="mb-10 items-center">
          <View
            className="mb-5 h-20 w-20 items-center justify-center rounded-full border-2"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <Ionicons
              name="person-add-outline"
              size={34}
              color={colors.foreground}
            />
          </View>

          <Text
            className="text-4xl font-bold"
            style={{ color: colors.foreground }}
          >
            Sign Up
          </Text>

          <Text
            className="mt-3 text-center text-base leading-6"
            style={{ color: colors.foreground }}
          >
            Create your FlowHer account
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
              name="person-outline"
              size={20}
              color={colors.foreground}
            />

            <TextInput
              onChangeText={setFirstName}
              placeholder="First name"
              placeholderTextColor={colors.foreground}
              className="ml-3 flex-1 text-base outline-none"
              style={{ color: colors.foreground }}
              value={firstName}
            />
          </View>

          <View
            className="mb-5 flex-row items-center rounded-xl border px-4 py-4"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <Ionicons
              name="person-outline"
              size={20}
              color={colors.foreground}
            />

            <TextInput
              onChangeText={setLastName}
              placeholder="Last name"
              placeholderTextColor={colors.foreground}
              className="ml-3 flex-1 text-base outline-none"
              style={{ color: colors.foreground }}
              value={lastName}
            />
          </View>

          <View
            className="mb-5 flex-row items-center rounded-xl border px-4 py-4"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <Ionicons name="mail-outline" size={20} color={colors.foreground} />

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
            className="mb-5 flex-row items-center rounded-xl border px-4 py-4"
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
            activeOpacity={0.85}
            disabled={isSubmitting}
            onPress={handleSignup}
            className="rounded-xl py-4"
            style={{
              backgroundColor: colors.button,
              opacity: isSubmitting ? 0.65 : 1,
            }}
          >
            <Text
              className="text-center text-lg font-bold"
              style={{ color: colors.buttonText }}
            >
              {isSubmitting ? "Creating..." : "Create Account"}
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
        </View>

        <View className="mt-8 flex-row justify-center">
          <Text style={{ color: colors.foreground }}>
            Already have an account?
          </Text>

          <Link href="/login" asChild>
            <TouchableOpacity>
              <Text
                className="ml-2 font-bold underline"
                style={{ color: colors.foreground }}
              >
                Login
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
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

        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          {renderSignupForm()}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
