import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-context";
import {
  AuthDivider,
  AuthErrorBanner,
  AuthField,
  AuthPrimaryButton,
  AuthTopBar,
} from "../../components/auth-ui";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import { Loader } from "../../components/Loader";
import { OtpModal } from "../../components/OtpModal";
import { useTheme } from "../../components/theme";
import { connectPartnerAndResolveRoute, signupUser } from "../../lib/auth";
import { isStrongPassword, PASSWORD_RULES } from "../../lib/password";
import type { AuthUser } from "../../lib/api";
import { alert } from "../../lib/alert";
import { getScreenGradient, getShadow } from "../../components/ui-tokens";
import { getFriendlyErrorMessage } from "../../lib/api";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Icon } from "../../components/Icon";

const TERMS_URL = "https://thenura.care/terms";
const PRIVACY_URL = "https://thenura.care/privacy";

export default function SignUp() {
  const router = useRouter();
  const { partnerCode } = useLocalSearchParams<{ partnerCode?: string }>();
  const { signIn, updateUser } = useAuth();
  const { colors, isDark, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const role: "user" | "partner" = partnerCode ? "partner" : "user";
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOtpModalVisible, setIsOtpModalVisible] = useState(false);
  // The rule checklist appears once the user starts on the password, so the
  // form starts short and the rules show exactly when they matter.
  const [showPasswordRules, setShowPasswordRules] = useState(false);
  // Covers the form from the moment the account is verified (OTP or Google)
  // until finishSignIn navigates away, so the signup page doesn't reappear
  // while the session/partner role is being resolved.
  const [isFinishing, setIsFinishing] = useState(false);

  const emailRef = useRef<TextInput>(null);
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

  async function handleSignup() {
    setErrorMessage("");

    if (firstName.trim().length < 2) {
      setErrorMessage("Please enter your first name.");
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    if (!isStrongPassword(password)) {
      setShowPasswordRules(true);
      setErrorMessage("Your password needs a few more things — see the checklist.");
      return;
    }

    try {
      setIsSubmitting(true);

      // Signup no longer creates the account directly — it stashes the
      // details and emails an OTP. The account is only created once the
      // code is verified in the modal below.
      await signupUser({
        firstName: firstName.trim(),
        lastName: "",
        email: email.trim().toLowerCase(),
        password,
        role,
        // Consent is given by tapping "Create account" under the notice
        // that links both documents.
        agreedToPrivacyPolicy: true,
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

    // A modal alert survives this screen unmounting on the router.replace()
    // below — an inline banner (setErrorMessage) would just flash and
    // disappear, leaving no trace of why the partner connection failed.
    if (connectError) {
      alert("Couldn't connect as a partner", connectError);
    }

    updateUser({ ...user, partnerRole });
    // Drop the signed-out screens (welcome, login) under this one, so Android
    // Back from the dashboard can't return to them while signed in.
    if (router.canDismiss()) router.dismissAll();
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
    setIsFinishing(true);
    setIsOtpModalVisible(false);
    try {
      await signIn({ token, user: signedInUser });
      await finishSignIn(signedInUser);
    } catch (error) {
      setIsFinishing(false);
      setErrorMessage(getFriendlyErrorMessage(error));
    }
  }

  async function handleGoogleSignInSuccess({ token, user }: { token: string; user: AuthUser }) {
    setErrorMessage("");
    try {
      await signIn({ token, user });
      await finishSignIn(user);
    } catch (error) {
      setIsFinishing(false);
      setErrorMessage(
        getFriendlyErrorMessage(error),
      );
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
        <View
          className="flex-1"
        >
          <AuthTopBar />

          <KeyboardAwareScrollView bottomOffset={24}
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
              {/* Header (back button handled by AuthTopBar above) */}
              <View className="items-center mb-7">
                <Text
                  className="text-center font-black tracking-tight"
                  style={{ fontSize: 27, color: colors.foreground, fontFamily: fonts.heading }}
                >
                  Create your account
                </Text>
                <Text
                  className="mt-2 text-center text-sm font-semibold"
                  style={{ color: colors.mutedText, fontFamily: fonts.body, maxWidth: 280 }}
                >
                  Free, private, and ready in under a minute.
                </Text>
              </View>

              {/* Info banner shown only when arriving with a partner invite code */}
              {partnerCode ? (
                <View
                  className="mb-4 flex-row items-center gap-2.5 p-3.5 rounded-2xl border"
                  style={{ backgroundColor: colors.primaryLight, borderColor: colors.border }}
                >
                  <Icon set="ion" name="heart-outline" size={15} color={colors.primary} />
                  <Text
                    className="flex-1 text-xs font-semibold leading-4"
                    style={{ color: colors.foreground, fontFamily: fonts.body }}
                  >
                    Connecting to your partner&apos;s account after sign up.
                  </Text>
                </View>
              ) : null}

              {/* Fastest path first: one tap with Google. */}
              <GoogleSignInButton
                disabled={isSubmitting}
                onBusyChange={setIsFinishing}
                onError={setErrorMessage}
                onSuccess={handleGoogleSignInSuccess}
                role={role}
              />

              <AuthDivider label="OR SIGN UP WITH EMAIL" />

              <View style={{ gap: 12 }}>
                <AuthField
                  icon="person-outline"
                  autoCapitalize="words"
                  autoComplete="given-name"
                  onChangeText={(text) => {
                    setErrorMessage("");
                    setFirstName(text);
                  }}
                  onSubmitEditing={() => emailRef.current?.focus()}
                  placeholder="First name"
                  returnKeyType="next"
                  submitBehavior="submit"
                  textContentType="givenName"
                  value={firstName}
                />

                <AuthField
                  ref={emailRef}
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
                  autoComplete="new-password"
                  onFocus={() => setShowPasswordRules(true)}
                  onChangeText={(text) => {
                    setErrorMessage("");
                    setPassword(text);
                  }}
                  onSubmitEditing={handleSignup}
                  placeholder="Create a password"
                  returnKeyType="done"
                  textContentType="newPassword"
                  value={password}
                />
              </View>

              {showPasswordRules ? (
                <View className="flex-row flex-wrap" style={{ gap: 6, marginTop: 10 }}>
                  {PASSWORD_RULES.map((rule) => {
                    const met = rule.test(password);
                    return (
                      <View
                        key={rule.id}
                        accessible
                        accessibilityLabel={`${rule.label}: ${met ? "done" : "missing"}`}
                        className="flex-row items-center rounded-full"
                        style={{
                          gap: 4,
                          paddingHorizontal: 9,
                          paddingVertical: 5,
                          backgroundColor: met ? colors.successLight : colors.surface,
                          borderWidth: 1,
                          borderColor: met ? colors.successLight : colors.border,
                        }}
                      >
                        <Icon set="ion"
                          name={met ? "checkmark-circle" : "ellipse-outline"}
                          size={13}
                          color={met ? colors.success : colors.mutedText}
                        />
                        <Text
                          style={{
                            fontSize: 12.5,
                            fontWeight: "700",
                            color: met ? colors.success : colors.mutedText,
                            fontFamily: fonts.body,
                          }}
                        >
                          {rule.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <View
                style={{
                  marginTop: 18,
                  borderRadius: 999,
                  ...getShadow(colors, isDark),
                }}
              >
                <AuthPrimaryButton
                  isLoading={isSubmitting}
                  label="Create account"
                  loadingLabel="Creating account..."
                  onPress={handleSignup}
                />
              </View>

              {errorMessage ? (
                <View style={{ marginTop: 14 }}>
                  <AuthErrorBanner message={errorMessage} />
                </View>
              ) : null}

              <Text
                className="text-center"
                style={{
                  marginTop: 14,
                  fontSize: 12.5,
                  lineHeight: 17,
                  color: colors.mutedText,
                  fontFamily: fonts.body,
                }}
              >
                By continuing, you agree to our{" "}
                <Text
                  accessibilityRole="link"
                  onPress={() => WebBrowser.openBrowserAsync(TERMS_URL).catch(() => {})}
                  style={{ fontWeight: "800", color: colors.primary }}
                >
                  Terms
                </Text>{" "}
                and{" "}
                <Text
                  accessibilityRole="link"
                  onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {})}
                  style={{ fontWeight: "800", color: colors.primary }}
                >
                  Privacy Policy
                </Text>
                .
              </Text>

              {/* Bottom Sign In text */}
              <View className="flex-row justify-center mt-7">
                <Text
                  style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}
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
            </Animated.View>
          </KeyboardAwareScrollView>
        </View>
      </SafeAreaView>

      <OtpModal
        email={email.trim().toLowerCase()}
        onClose={() => setIsOtpModalVisible(false)}
        onVerified={handleOtpVerified}
        visible={isOtpModalVisible}
      />

      {isFinishing ? (
        <View style={StyleSheet.absoluteFill}>
          <Loader fullscreen label="Setting up your account…" />
        </View>
      ) : null}
    </LinearGradient>
  );
}
