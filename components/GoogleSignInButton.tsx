import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
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
  role?: string;
};

// Env vars filled in per Google Cloud OAuth client — see .env.example on the
// backend for where the matching client IDs are registered for verification.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const EXPO_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID;

export function GoogleSignInButton({
  disabled,
  label = "Continue with Google",
  onError,
  onSuccess,
  role,
}: GoogleSignInButtonProps) {
  const { colors, fonts } = useTheme();
  const [isExchanging, setIsExchanging] = useState(false);

  const isConfigured = Boolean(WEB_CLIENT_ID || IOS_CLIENT_ID || ANDROID_CLIENT_ID || EXPO_CLIENT_ID);

  // On mobile expo-auth-session actually runs a code + PKCE flow (despite the
  // "IdToken" hook name) and auto-exchanges the code for a token internally —
  // but that internal exchange has no .catch, so if it fails (wrong client
  // type in Google Cloud, redirect mismatch, etc.) the promise rejection is
  // swallowed and the response just never resolves: the browser closes and
  // nothing happens, with no error shown. We do the exchange ourselves below
  // instead of relying on that, so failures actually reach onError.
  const [request, , promptAsync] = Google.useAuthRequest({
    androidClientId: ANDROID_CLIENT_ID,
    clientId: Platform.OS === "web" ? WEB_CLIENT_ID : (EXPO_CLIENT_ID || WEB_CLIENT_ID),
    iosClientId: IOS_CLIENT_ID,
    webClientId: WEB_CLIENT_ID,
    responseType: Platform.OS === "web" ? AuthSession.ResponseType.IdToken : AuthSession.ResponseType.Code,
    shouldAutoExchangeCode: false,
    // expo-auth-session defaults the native redirect to
    // `<applicationId>:/oauthredirect` (com.uvin124.thenura:/...), but Expo's
    // Android manifest generator only registers an intent filter for
    // app.json's `scheme` ("thenura") — never the applicationId — so on
    // Android that redirect lands nowhere and the browser just continues on
    // Google's own site instead of returning to the app. Forcing the
    // already-registered "thenura" scheme here fixes the handoff without
    // touching the manifest. iOS isn't affected (its Info.plist template
    // registers the bundle identifier as a URL scheme by default), so leave
    // it on the default applicationId-based redirect.
    ...(Platform.OS === "android"
      ? { redirectUri: AuthSession.makeRedirectUri({ scheme: "thenura", path: "oauthredirect" }) }
      : {}),
  });

  useEffect(() => {
    if (request) {
      console.log("DEBUG: Google Auth Redirect URI =", request.redirectUri);
    }
  }, [request]);

  const handlePress = async () => {
    try {
      const result = await promptAsync();

      if (result.type === "dismiss" || result.type === "cancel") return;

      if (result.type === "error") {
        console.log("DEBUG: Google Auth error =", result.error?.code, result.error?.message, result.params);

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
      onSuccess({ token: authResult.token, user: authResult.data });
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Unable to complete Google sign-in.",
      );
    } finally {
      setIsExchanging(false);
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
