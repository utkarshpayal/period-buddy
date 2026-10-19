import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-context";
import { useTheme } from "../../components/theme";
import { connectPartnerAndResolveRoute } from "../../lib/auth";
import { getShadow } from "../../components/ui-tokens";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Icon } from "../../components/Icon";

const BENEFITS = [
  "Share your cycle phase, gently",
  "Daily nudges on how to help",
  "Read-only — you control what's shared",
];

export default function PartnerConnect() {
  const router = useRouter();
  const { code: prefilledCode } = useLocalSearchParams<{ code?: string }>();
  const { token, user, updateUser } = useAuth();
  const { colors, isDark, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const [inviteCode, setInviteCode] = useState(prefilledCode?.toUpperCase() ?? "");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);

  const cardWidth = Math.min(Math.max(width - 32, 280), 380);
  const isAuthenticated = Boolean(token);

  async function handleConnect() {
    setErrorMessage("");

    const code = inviteCode.trim();
    if (!code) {
      setErrorMessage("Enter the invite code your partner shared with you.");
      return;
    }

    if (!isAuthenticated) {
      router.push({
        pathname: "/(tabs)/login",
        params: { partnerCode: code.toUpperCase() },
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const { connectError, partnerRole, destination } =
        await connectPartnerAndResolveRoute(code);

      if (connectError) {
        setErrorMessage(connectError);
        return;
      }

      updateUser({ ...(user ?? {}), partnerRole });
      router.replace(destination);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      <SafeAreaView className="flex-1">
        <View
          className="flex-1"
        >
          <KeyboardAwareScrollView bottomOffset={24}
            contentContainerStyle={{
              alignItems: "center",
              flexGrow: 1,
              paddingBottom: 40,
            }}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Hero gradient band */}
            <View className="w-full" style={{ height: 220 }}>
              <LinearGradient
                colors={[colors.lavenderLight, colors.primaryLight, colors.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
              >
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back"
                  onPress={() => router.back()}
                  activeOpacity={0.7}
                  className="absolute left-4 items-center justify-center rounded-full"
                  style={{
                    top: 8,
                    width: 38,
                    height: 38,
                    backgroundColor: colors.surface,
                    ...getShadow(colors, isDark),
                  }}
                >
                  <Icon set="feather" name="chevron-left" size={20} color={colors.foreground} />
                </TouchableOpacity>

                <View
                  className="items-center justify-center rounded-full border"
                  style={{
                    width: 78,
                    height: 78,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    ...getShadow(colors, isDark),
                  }}
                >
                  <Icon set="feather" name="heart" size={30} color={colors.primary} />
                </View>
              </LinearGradient>
            </View>

            <View
              style={{ width: cardWidth, paddingTop: 24, paddingHorizontal: 16 }}
            >
              <Text
                className="text-center font-black tracking-tight"
                style={{
                  fontSize: 24,
                  color: colors.foreground,
                  fontFamily: fonts.heading,
                  marginBottom: 8,
                }}
              >
                Bring your partner closer
              </Text>

              <Text
                className="text-center text-xs leading-5 self-center"
                style={{
                  color: colors.mutedText,
                  maxWidth: 280,
                  fontFamily: fonts.body,
                  marginBottom: 20,
                }}
              >
                Link a partner so they can support you through every phase.
                {!isAuthenticated
                  ? " You'll need to log in or create an account first."
                  : " You will have view-only access."}
              </Text>

              {/* Benefit checklist */}
              <View className="mb-7" style={{ gap: 12 }}>
                {BENEFITS.map((benefit) => (
                  <View key={benefit} className="flex-row items-center" style={{ gap: 10 }}>
                    <View
                      className="items-center justify-center rounded-full"
                      style={{ width: 22, height: 22, backgroundColor: colors.accentLight }}
                    >
                      <Icon set="feather" name="check" size={13} color={colors.accent} />
                    </View>
                    <Text
                      className="flex-1 text-xs font-semibold"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                    >
                      {benefit}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Input & Action */}
              <View>
                <View
                  className="mb-4 flex-row items-center border"
                  style={{
                    backgroundColor: colors.input,
                    borderColor: codeFocused ? colors.primary : colors.border,
                    borderWidth: codeFocused ? 1.5 : 1,
                    borderRadius: 26,
                    paddingHorizontal: 18,
                    height: 52,
                  }}
                >
                  <Icon set="feather"
                    name="key"
                    size={16}
                    color={codeFocused ? colors.primary : colors.mutedText}
                    style={{ marginRight: 10 }}
                  />
                  <TextInput
                    autoCapitalize="characters"
                    autoCorrect={false}
                    onChangeText={(text) => {
                      setErrorMessage("");
                      setInviteCode(text);
                    }}
                    onFocus={() => setCodeFocused(true)}
                    onBlur={() => setCodeFocused(false)}
                    placeholder="Invite code"
                    placeholderTextColor={colors.mutedText}
                    returnKeyType="done"
                    className="flex-1 text-sm outline-none font-bold"
                    style={{
                      color: colors.foreground,
                      fontFamily: fonts.body,
                      letterSpacing: 2,
                    }}
                    value={inviteCode}
                  />
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={isSubmitting}
                  onPress={handleConnect}
                  className="mb-2 justify-center items-center"
                  style={{
                    height: 52,
                    borderRadius: 999,
                    backgroundColor: colors.primary,
                    opacity: isSubmitting ? 0.75 : 1,
                    ...getShadow(colors, isDark),
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "800",
                      color: colors.buttonText,
                      fontFamily: fonts.body,
                    }}
                  >
                    {isSubmitting
                      ? "Connecting..."
                      : isAuthenticated
                        ? "Connect Now"
                        : "Continue"}
                  </Text>
                </TouchableOpacity>

                {errorMessage ? (
                  <View
                    className="mt-3 rounded-2xl border px-4 py-3"
                    style={{
                      backgroundColor: colors.dangerLight,
                      borderColor: colors.danger,
                    }}
                  >
                    <Text
                      className="text-center text-xs font-bold"
                      style={{ color: colors.danger, fontFamily: fonts.body }}
                    >
                      {errorMessage}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}
