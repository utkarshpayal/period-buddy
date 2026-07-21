import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
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
import {
  AuthBrandMark,
  AuthDivider,
  AuthErrorBanner,
  AuthField,
  AuthPrimaryButton,
  AuthTopBar,
} from "../../components/auth-ui";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import { useTheme } from "../../components/theme";
import { connectPartnerAndResolveRoute, loginUser } from "../../lib/auth";
import type { AuthUser } from "../../lib/api";
import { getScreenGradient, getShadow } from "../../components/ui-tokens";

export default function Login() {
  const router = useRouter();
  const { partnerCode } = useLocalSearchParams<{ partnerCode?: string }>();
  const { signIn, updateUser } = useAuth();
  const { colors, isDark, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const cardWidth = Math.min(Math.max(width - 40, 280), 400);
  const screenGradient = getScreenGradient(colors, isDark) as [string, string, string];

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  function handlePasswordReset() {
    setErrorMessage(
      email.trim()
        ? `Instructions sent to ${email.trim().toLowerCase()}.`
        : "Enter your email first to reset password.",
    );
  }

  // After a successful login (password or Google), finish connecting the
  // pending partner invite code (if any) and route based on the resolved
  // partner role instead of always landing on the normal dashboard.
  async function finishSignIn(user: AuthUser | undefined, fallbackEmail?: string) {
    const { connectError, partnerRole, destination } =
      await connectPartnerAndResolveRoute(partnerCode);

    if (connectError) setErrorMessage(connectError);

    updateUser({
      ...(user ?? (fallbackEmail ? { email: fallbackEmail } : {})),
      partnerRole,
    } as AuthUser);
    router.replace(destination);
  }

  async function handleGoogleSignInSuccess({ token, user }: { token: string; user: AuthUser }) {
    setErrorMessage("");
    signIn({ token, user });
    await finishSignIn(user);
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
      const normalizedEmail = email.trim().toLowerCase();

      signIn({
        token: response.token,
        user: user
          ? { ...user, isProfileComplete }
          : { email: normalizedEmail, isProfileComplete },
      });
      await finishSignIn(user, normalizedEmail);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to login right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <LinearGradient colors={screenGradient} className="flex-1">
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
          <AuthTopBar />

          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={{
              alignItems: "center",
              flexGrow: 1,
              justifyContent: "center",
              paddingBottom: 32,
              paddingHorizontal: 20,
            }}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={{
                width: cardWidth,
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              }}
            >
              {/* Brand header */}
              <View className="items-center mb-7">
                <AuthBrandMark />
                <Text
                  className="mt-4 text-center font-black tracking-tight"
                  style={{ fontSize: 26, color: colors.foreground, fontFamily: fonts.heading }}
                >
                  Welcome back
                </Text>
                <Text
                  className="mt-2 text-center text-sm font-semibold"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  Sign in to continue your cycle tracking
                </Text>
              </View>

              {/* Form card */}
              <View
                className="border overflow-hidden"
                style={{
                  borderRadius: 26,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  padding: 20,
                  ...getShadow(colors, isDark),
                }}
              >
                <View style={{ gap: 12 }}>
                  <AuthField
                    icon="mail-outline"
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    onChangeText={(text) => {
                      setErrorMessage("");
                      setEmail(text);
                    }}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    placeholder="Email address"
                    returnKeyType="next"
                    submitBehavior="submit"
                    textContentType="emailAddress"
                    value={email}
                  />

                  <AuthField
                    ref={passwordRef}
                    icon="lock-closed-outline"
                    isPassword
                    onChangeText={(text) => {
                      setErrorMessage("");
                      setPassword(text);
                    }}
                    onSubmitEditing={handleLogin}
                    placeholder="Password"
                    returnKeyType="done"
                    textContentType="password"
                    value={password}
                  />
                </View>

                <TouchableOpacity
                  className="mt-3 mb-1 self-end"
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

                <View style={{ marginTop: 14 }}>
                  <AuthPrimaryButton
                    isLoading={isSubmitting}
                    label="Log in"
                    loadingLabel="Logging in..."
                    onPress={handleLogin}
                  />
                </View>

                <AuthDivider />

                <GoogleSignInButton
                  disabled={isSubmitting}
                  onError={setErrorMessage}
                  onSuccess={handleGoogleSignInSuccess}
                />

                {errorMessage ? (
                  <View style={{ marginTop: 16 }}>
                    <AuthErrorBanner message={errorMessage} />
                  </View>
                ) : null}
              </View>

              {/* Bottom Sign Up text */}
              <View className="flex-row justify-center mt-6">
                <Text
                  style={{ fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body }}
                >
                  Don&apos;t have an account?{" "}
                </Text>
                <Link
                  href={{
                    pathname: "/(tabs)/signup",
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
                      Sign up
                    </Text>
                  </TouchableOpacity>
                </Link>
              </View>

              {/* Partner Connect Link */}
              <Link href="/(tabs)/partner-connect" asChild>
                <TouchableOpacity className="mt-4 flex-row justify-center items-center">
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: colors.mutedText,
                      fontFamily: fonts.body,
                    }}
                  >
                    Connecting as a partner? Tap here
                  </Text>
                </TouchableOpacity>
              </Link>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
