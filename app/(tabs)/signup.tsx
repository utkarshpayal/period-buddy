import { Ionicons } from "@expo/vector-icons";
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
  AuthDivider,
  AuthErrorBanner,
  AuthField,
  AuthPrimaryButton,
  AuthTopBar,
} from "../../components/auth-ui";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import { OtpModal } from "../../components/OtpModal";
import { useTheme } from "../../components/theme";
import { connectPartnerAndResolveRoute, signupUser } from "../../lib/auth";
import type { AuthUser } from "../../lib/api";
import { alert } from "../../lib/alert";
import { getScreenGradient, getShadow } from "../../components/ui-tokens";

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
  const [agreedToPrivacyPolicy, setAgreedToPrivacyPolicy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOtpModalVisible, setIsOtpModalVisible] = useState(false);

  const lastNameRef = useRef<TextInput>(null);
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

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setErrorMessage("All fields are required.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (!agreedToPrivacyPolicy) {
      setErrorMessage("Please agree to the Privacy Policy to continue.");
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
        agreedToPrivacyPolicy,
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
    await signIn({ token, user: signedInUser });
    await finishSignIn(signedInUser);
  }

  async function handleGoogleSignInSuccess({ token, user }: { token: string; user: AuthUser }) {
    setErrorMessage("");
    await signIn({ token, user });
    await finishSignIn(user);
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
                  Takes 2 minutes. Your data stays private, always.
                </Text>
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
                    Connecting to your partner&apos;s account after sign up.
                  </Text>
                </View>
              ) : null}

              {/* Card-free field stack */}
              <View style={{ gap: 14 }}>
                <View className="flex-row" style={{ gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <AuthField
                      icon="person-outline"
                      autoComplete="given-name"
                      onChangeText={(text) => {
                        setErrorMessage("");
                        setFirstName(text);
                      }}
                      onSubmitEditing={() => lastNameRef.current?.focus()}
                      placeholder="First name"
                      returnKeyType="next"
                      submitBehavior="submit"
                      textContentType="givenName"
                      value={firstName}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <AuthField
                      ref={lastNameRef}
                      icon="person-outline"
                      autoComplete="family-name"
                      onChangeText={(text) => {
                        setErrorMessage("");
                        setLastName(text);
                      }}
                      onSubmitEditing={() => emailRef.current?.focus()}
                      placeholder="Last name"
                      returnKeyType="next"
                      submitBehavior="submit"
                      textContentType="familyName"
                      value={lastName}
                    />
                  </View>
                </View>

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
                  onChangeText={(text) => {
                    setErrorMessage("");
                    setPassword(text);
                  }}
                  onSubmitEditing={handleSignup}
                  placeholder="Password"
                  returnKeyType="done"
                  textContentType="newPassword"
                  value={password}
                />
              </View>

              <Text
                className="mt-4"
                style={{
                  fontSize: 11,
                  lineHeight: 15,
                  color: colors.mutedText,
                  fontFamily: fonts.body,
                }}
              >
                Use at least 8 characters and keep your password private.
              </Text>

              <TouchableOpacity
                activeOpacity={0.8}
                className="mt-4 flex-row items-start"
                onPress={() => {
                  setErrorMessage("");
                  setAgreedToPrivacyPolicy((prev) => !prev);
                }}
                style={{ gap: 10 }}
              >
                <View
                  className="items-center justify-center rounded-md border"
                  style={{
                    width: 20,
                    height: 20,
                    marginTop: 1,
                    backgroundColor: agreedToPrivacyPolicy ? colors.primary : colors.input,
                    borderColor: agreedToPrivacyPolicy ? colors.primary : colors.border,
                    borderWidth: 1.5,
                  }}
                >
                  {agreedToPrivacyPolicy ? (
                    <Ionicons name="checkmark" size={13} color={colors.buttonText} />
                  ) : null}
                </View>
                <Text
                  className="flex-1"
                  style={{
                    fontSize: 12,
                    lineHeight: 17,
                    color: colors.foreground,
                    fontFamily: fonts.body,
                  }}
                >
                  I agree to the{" "}
                  <Text style={{ fontWeight: "800", color: colors.primary }}>
                    Terms &amp; Privacy Policy
                  </Text>
                  .
                </Text>
              </TouchableOpacity>

              <View
                style={{
                  marginTop: 14,
                  borderRadius: 999,
                  ...getShadow(colors, isDark),
                }}
              >
                <AuthPrimaryButton
                  disabled={!agreedToPrivacyPolicy}
                  isLoading={isSubmitting}
                  label="Create account"
                  loadingLabel="Creating account..."
                  onPress={handleSignup}
                />
              </View>

              {errorMessage ? (
                <View style={{ marginTop: 16 }}>
                  <AuthErrorBanner message={errorMessage} />
                </View>
              ) : null}

              <AuthDivider />

              <GoogleSignInButton
                disabled={isSubmitting}
                onError={setErrorMessage}
                onSuccess={handleGoogleSignInSuccess}
                role={role}
              />

              {/* Bottom Sign In text */}
              <View className="flex-row justify-center mt-7">
                <Text
                  style={{ fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body }}
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
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <OtpModal
        email={email.trim().toLowerCase()}
        onClose={() => setIsOtpModalVisible(false)}
        onVerified={handleOtpVerified}
        visible={isOtpModalVisible}
      />
    </LinearGradient>
  );
}
