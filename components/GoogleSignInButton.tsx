import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View, Platform } from "react-native";
import { googleAuth } from "../lib/auth";
import type { AuthUser } from "../lib/api";
import { useTheme } from "./theme";

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
  const { colors, fonts } = useTheme();
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
        error instanceof Error ? error.message : "Unable to complete Google sign-in.",
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
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={isBusy}
      onPress={handlePress}
      className="flex-row items-center justify-center rounded-full border py-3.5"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        opacity: isBusy ? 0.65 : 1,
      }}
    >
      {isExchanging ? (
        <ActivityIndicator color={colors.foreground} />
      ) : (
        <View className="flex-row items-center gap-2.5">
          <GoogleGlyph />
          <Text
            className="text-sm font-bold"
            style={{ color: colors.foreground, fontFamily: fonts.body }}
          >
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// Minimal 4-color "G" glyph so we don't need to bundle a Google brand asset.
function GoogleGlyph() {
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "800", color: "#4285F4" }}>G</Text>
    </View>
  );
}
