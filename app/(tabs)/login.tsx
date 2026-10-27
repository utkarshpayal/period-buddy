import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Linking,
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
  AuthField,
  AuthPrimaryButton,
  AuthTopBar,
} from "../../components/auth-ui";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import { Loader } from "../../components/Loader";
import { useTheme } from "../../components/theme";
import { connectPartnerAndResolveRoute, loginUser } from "../../lib/auth";
import type { AuthUser } from "../../lib/api";
import { alert } from "../../lib/alert";
import { getScreenGradient, getShadow } from "../../components/ui-tokens";
import { getFriendlyErrorMessage } from "../../lib/api";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { showErrorToast } from "../../lib/toast";

const SUPPORT_EMAIL = "hello@thenura.care";

export default function Login() {
  const router = useRouter();
  const { partnerCode } = useLocalSearchParams<{ partnerCode?: string }>();
  const { signIn, updateUser } = useAuth();
  const { colors, isDark, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleBusy, setIsGoogleBusy] = useState(false);
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

  // The backend has no password-reset endpoint yet, so this must not claim
  // an email was sent: point to support (who can reset it) or Google sign-in.
  function handlePasswordReset() {
    const address = email.trim().toLowerCase();
    const subject = encodeURIComponent("Password reset");
    const body = encodeURIComponent(`Please help me reset the password for ${address || "my account"}.`);
    alert(
      "Forgot password?",
      `Email us at ${SUPPORT_EMAIL} from the address you signed up with and we'll help you reset it. If you signed up with Google, use "Continue with Google" instead.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Email support",
          onPress: () => {
            Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`).catch(() => {});
          },
        },
      ],
    );
  }

  // After a successful login (password or Google), finish connecting the
  // pending partner invite code (if any) and route based on the resolved
  // partner role instead of always landing on the normal dashboard.
  async function finishSignIn(user: AuthUser | undefined, fallbackEmail?: string) {
    const { connectError, partnerRole, destination } =
      await connectPartnerAndResolveRoute(partnerCode);

    // A modal alert survives this screen unmounting on the router.replace()
    // below — an inline error would just flash and
    // disappear, leaving no trace of why the partner connection failed.
    if (connectError) {
      alert("Couldn't connect as a partner", connectError);
    }

    updateUser({
      ...(user ?? (fallbackEmail ? { email: fallbackEmail } : {})),
      partnerRole,
    } as AuthUser);
    // Same as signup: drop the welcome/login screens underneath, so Back
    // can't return to them after signing in.
    if (router.canDismiss()) router.dismissAll();
    router.replace(destination);
  }

  async function handleGoogleSignInSuccess({ token, user }: { token: string; user: AuthUser }) {
    try {
      await signIn({ token, user });
      await finishSignIn(user);
    } catch (error) {
      setIsGoogleBusy(false);
      showErrorToast(
        getFriendlyErrorMessage(error),
      );
    }
  }

  async function handleLogin() {

    if (!email.trim() || !password) {
      showErrorToast("Please enter your email and password.");
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await loginUser({
        email: email.trim().toLowerCase(),
        password,
      });

      if (!response.token) {
        showErrorToast("Login succeeded, but no auth token was returned.");
        return;
      }

      const user = response.data ?? response.user;
      const isProfileComplete =
        response.isProfileComplete ?? user?.isProfileComplete;
      const normalizedEmail = email.trim().toLowerCase();

      await signIn({
        token: response.token,
        user: user
          ? { ...user, isProfileComplete }
          : { email: normalizedEmail, isProfileComplete },
      });
      await finishSignIn(user, normalizedEmail);
    } catch (error) {
      showErrorToast(
        getFriendlyErrorMessage(error),
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
              {/* Header */}
              <View className="items-center mb-8">
                <Text
                  className="text-center font-black tracking-tight"
                  style={{ fontSize: 27, color: colors.foreground, fontFamily: fonts.heading }}
                >
                  Welcome back
                </Text>
                <Text
                  className="mt-2 text-center text-sm font-semibold"
                  style={{ color: colors.mutedText, fontFamily: fonts.body, maxWidth: 280 }}
                >
                  Good to see you. Let&apos;s pick up your cycle where you left off.
                </Text>
              </View>

              {/* Card-free field stack */}
              <View style={{ gap: 14 }}>
                <AuthField
                  icon="mail-outline"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  onChangeText={setEmail}
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
                  onChangeText={setPassword}
                  onSubmitEditing={handleLogin}
                  placeholder="Password"
                  returnKeyType="done"
                  textContentType="password"
                  value={password}
                />
              </View>

              <TouchableOpacity
                className="mt-3 mb-5 self-end"
                onPress={handlePasswordReset}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: colors.primary,
                    fontFamily: fonts.body,
                  }}
                >
                  Forgot password?
                </Text>
              </TouchableOpacity>

              <View
                style={{
                  borderRadius: 999,
                  ...getShadow(colors, isDark),
                }}
              >
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
                onBusyChange={setIsGoogleBusy}
                onError={showErrorToast}
                onSuccess={handleGoogleSignInSuccess}
              />

              {/* Bottom Sign Up text */}
              <View className="flex-row justify-center mt-7">
                <Text
                  style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}
                >
                  New here?{" "}
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
                        fontSize: 13.5,
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
                <TouchableOpacity
                  className="mt-4 flex-row justify-center items-center"
                  accessibilityRole="link"
                  hitSlop={{ top: 12, bottom: 12 }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: colors.mutedText,
                      fontFamily: fonts.body,
                    }}
                  >
                    Joining a partner? Use your invite code
                  </Text>
                </TouchableOpacity>
              </Link>
            </Animated.View>
          </KeyboardAwareScrollView>
        </View>
      </SafeAreaView>

      {/* While credentials are verified and the partner role is resolved,
          cover the form with the branded loader instead of leaving the
          login page on screen until navigation happens. Rendered as an
          overlay (not an early return) so the form — and the Google
          button's in-flight handler — stay mounted underneath. */}
      {isSubmitting || isGoogleBusy ? (
        <View style={StyleSheet.absoluteFill}>
          <Loader fullscreen label="Signing you in…" />
        </View>
      ) : null}
    </LinearGradient>
  );
}
