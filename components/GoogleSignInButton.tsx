import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { ActivityIndicator, Text, View, Platform } from "react-native";
import Svg, { Path } from "react-native-svg";
import { PressableScale } from "./PressableScale";
import { getShadow } from "./ui-tokens";
import { googleAuth } from "../lib/auth";
import type { AuthUser } from "../lib/api";
import { useTheme } from "./theme";
import { getFriendlyErrorMessage } from "../lib/api";

WebBrowser.maybeCompleteAuthSession();

export type GoogleSignInButtonProps = {
  disabled?: boolean;
  label?: string;
  onError: (message: string) => void;
  onSuccess: (result: { token: string; user: AuthUser }) => void;
  // Fires true once Google hands control back and the backend exchange
  // starts, false when it fails — lets the screen cover itself with a
  // loader instead of re-showing the form while the session is verified.
  onBusyChange?: (busy: boolean) => void;
  role?: string;
};

// One Google Cloud OAuth client per platform — the backend's GOOGLE_*_CLIENT_ID
// must list the same IDs to verify tokens. An EXPO_PUBLIC_* env var wins,
// else app.json's `extra.googleClientIds` (public IDs, safe to ship).
const configClientIds = (Constants.expoConfig?.extra?.googleClientIds ?? {}) as Partial<
  Record<"web" | "ios" | "android" | "expo", string>
>;
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || configClientIds.web;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || configClientIds.ios;
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || configClientIds.android;
const EXPO_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID || configClientIds.expo;

// See the comment at its use below: a non-undefined stand-in fed to
// Google.useAuthRequest so it doesn't throw during render when the real
// client id for the current platform isn't configured.
const PLACEHOLDER_CLIENT_ID = "google-oauth-not-configured";

export function GoogleSignInButton({
  disabled,
  label = "Continue with Google",
  onError,
  onSuccess,
  onBusyChange,
  role,
}: GoogleSignInButtonProps) {
  const { colors, fonts, isDark } = useTheme();
  const [isExchanging, setIsExchanging] = useState(false);

  const isConfigured = Boolean(WEB_CLIENT_ID || IOS_CLIENT_ID || ANDROID_CLIENT_ID || EXPO_CLIENT_ID);

  // expo-auth-session's Google provider throws synchronously — during
  // render, crashing the whole screen this button is on, not just this
  // component — if the client-id property for the current platform is
  // `undefined` (see invariantClientId in expo-auth-session/providers/
  // ProviderUtils). That's the normal state in local dev without Google
  // OAuth env vars filled in (.env.example ships them blank), so feed it the
  // harmless placeholder above instead of a real id; `isConfigured` below
  // (driven by the real env vars, not the placeholder) hides the button
  // whenever none are set, so the placeholder is never actually used to
  // prompt.

  // On mobile expo-auth-session actually runs a code + PKCE flow (despite the
  // "IdToken" hook name) and auto-exchanges the code for a token internally —
  // but that internal exchange has no .catch, so if it fails (wrong client
  // type in Google Cloud, redirect mismatch, etc.) the promise rejection is
  // swallowed and the response just never resolves: the browser closes and
  // nothing happens, with no error shown. We do the exchange ourselves below
  // instead of relying on that, so failures actually reach onError.
  const [request, , promptAsync] = Google.useAuthRequest({
    androidClientId: ANDROID_CLIENT_ID || PLACEHOLDER_CLIENT_ID,
    clientId:
      Platform.OS === "web"
        ? WEB_CLIENT_ID || PLACEHOLDER_CLIENT_ID
        : EXPO_CLIENT_ID || WEB_CLIENT_ID || PLACEHOLDER_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID || PLACEHOLDER_CLIENT_ID,
    webClientId: WEB_CLIENT_ID || PLACEHOLDER_CLIENT_ID,
    responseType: Platform.OS === "web" ? AuthSession.ResponseType.IdToken : AuthSession.ResponseType.Code,
    shouldAutoExchangeCode: false,
    // Google's Android-type OAuth client only accepts the default
    // `<applicationId>:/oauthredirect` redirect (com.uvin124.thenura:/...) —
    // it has no configurable redirect URI whitelist like the Web client
    // does, so it can't be pointed at a custom scheme. app.json's `scheme`
    // array now also registers an intent filter for that applicationId
    // scheme (see app.json), so the default redirect routes back into the
    // app correctly without needing an override here.
  });

  const handlePress = async () => {
    let succeeded = false;
    try {
      const result = await promptAsync();

      if (result.type === "dismiss" || result.type === "cancel") return;

      if (result.type === "error") {
        // Google's OAuth server returns error=access_denied both when the
        // user taps "Cancel"/"Deny" on the consent screen AND when the app
        // itself isn't authorized (unverified consent screen with no test
        // users added, or the Android/iOS client's SHA-1/bundle ID doesn't
        // match what's registered in Google Cloud Console). We can't tell
        // those apart client-side, so point at both.
        if (result.error?.code === "access_denied") {
          onError(
            "Google denied this sign-in. If you tapped \"Cancel\" or \"Deny\", try again and allow access. Otherwise this app's Google sign-in isn't authorized yet for your account — contact support.",
          );
        } else {
          onError(result.error?.message || "Google sign-in failed. Please try again.");
        }
        return;
      }

      if (result.type !== "success") {
        onError("Google sign-in didn't complete. Please try again.");
        return;
      }

      setIsExchanging(true);
      onBusyChange?.(true);

      let idToken: string | undefined = result.params?.id_token;
      if (!idToken && result.params?.code) {
        const tokenResult = await AuthSession.exchangeCodeAsync(
          {
            clientId: request!.clientId,
            code: result.params.code,
            redirectUri: request!.redirectUri,
            extraParams: { code_verifier: request!.codeVerifier || "" },
          },
          Google.discovery,
        );
        idToken = tokenResult.idToken ?? undefined;
      }

      if (!idToken) {
        onError("Google did not return an ID token. Please try again.");
        return;
      }

      const authResult = await googleAuth({ idToken, role });
      if (!authResult.token || !authResult.data) {
        onError("Signed in with Google, but no session was returned.");
        return;
      }
      succeeded = true;
      onSuccess({ token: authResult.token, user: authResult.data });
    } catch (error) {
      onError(
        getFriendlyErrorMessage(error),
      );
    } finally {
      setIsExchanging(false);
      // On success the screen's own onSuccess flow owns the loader from here
      // (partner-role lookup + navigation), so only release it on failure.
      if (!succeeded) onBusyChange?.(false);
    }
  };

  if (!isConfigured) return null;

  const isBusy = disabled || isExchanging || !request;

  return (
    <PressableScale
      disabled={isBusy}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isBusy, busy: isExchanging }}
      style={{
        height: 54,
        borderRadius: 27,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surface,
        opacity: isBusy && !isExchanging ? 0.6 : 1,
        ...getShadow(colors, isDark),
      }}
    >
      {isExchanging ? (
        <ActivityIndicator color={colors.foreground} />
      ) : (
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <GoogleGlyph />
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ fontSize: 15, fontWeight: "700", letterSpacing: -0.1, color: colors.foreground, fontFamily: fonts.body }}
          >
            {label}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

// Google's four-colour "G" mark (their sign-in branding guidelines ask for it).
function GoogleGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </Svg>
  );
}
