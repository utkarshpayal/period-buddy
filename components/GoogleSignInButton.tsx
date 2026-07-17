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
}: GoogleSignInButtonProps) {
  const { colors, fonts } = useTheme();
  const [isExchanging, setIsExchanging] = useState(false);

  const isConfigured = Boolean(WEB_CLIENT_ID || IOS_CLIENT_ID || ANDROID_CLIENT_ID || EXPO_CLIENT_ID);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId: ANDROID_CLIENT_ID,
    clientId: Platform.OS === "web" ? WEB_CLIENT_ID : (EXPO_CLIENT_ID || WEB_CLIENT_ID),
    iosClientId: IOS_CLIENT_ID,
    webClientId: WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (request) {
      console.log("DEBUG: Google Auth Redirect URI =", request.redirectUri);
    }
  }, [request]);

  useEffect(() => {
    if (response?.type !== "success") return;

    const idToken = response.params?.id_token;
    if (!idToken) {
      onError("Google did not return an ID token. Please try again.");
      return;
    }

    (async () => {
      try {
        setIsExchanging(true);
        const result = await googleAuth({ idToken });
        if (!result.token || !result.data) {
          onError("Signed in with Google, but no session was returned.");
          return;
        }
        onSuccess({ token: result.token, user: result.data });
      } catch (error) {
        onError(
          error instanceof Error ? error.message : "Unable to complete Google sign-in.",
        );
      } finally {
        setIsExchanging(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  if (!isConfigured) return null;

  const isBusy = disabled || isExchanging || !request;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={isBusy}
      onPress={() => promptAsync()}
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
