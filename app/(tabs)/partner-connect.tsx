import { Ionicons, Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
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

export default function PartnerConnect() {
  const router = useRouter();
  const { token, user, updateUser } = useAuth();
  const { colors, isDark, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const [inviteCode, setInviteCode] = useState("");
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
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
          keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
        >
          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={{
              alignItems: "center",
              flexGrow: 1,
              justifyContent: "center",
              paddingBottom: 40,
              paddingHorizontal: 16,
              paddingTop: 20,
            }}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header / Back row */}
            <View className="mb-6 self-start" style={{ width: cardWidth }}>
              <TouchableOpacity
                onPress={() => router.back()}
                activeOpacity={0.7}
                className="flex-row items-center gap-1.5"
              >
                <Feather name="chevron-left" size={20} color={colors.foreground} />
                <Text
                  className="text-xl font-extrabold tracking-tight"
                  style={{ color: colors.foreground, fontFamily: fonts.heading }}
                >
                  Partner Connection
                </Text>
              </TouchableOpacity>
            </View>

            {/* Content card */}
            <View
              className="border overflow-hidden p-6"
              style={{
                width: cardWidth,
                borderRadius: 24,
                backgroundColor: colors.surface,
                borderColor: colors.border,
                ...getShadow(colors, isDark),
              }}
            >
              <View className="items-center mb-6">
                <View
                  className="mb-4 items-center justify-center"
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 18,
                    backgroundColor: colors.primaryLight,
                  }}
                >
                  <Feather name="heart" size={22} color={colors.primary} />
                </View>

                <Text
                  className="text-center font-extrabold tracking-tight"
                  style={{
                    fontSize: 22,
                    color: colors.foreground,
                    fontFamily: fonts.heading,
                    marginBottom: 8,
                  }}
                >
                  Connect with Partner
                </Text>

                <Text
                  className="text-center text-xs leading-5"
                  style={{
                    color: colors.mutedText,
                    maxWidth: 280,
                    fontFamily: fonts.body,
                  }}
                >
                  Enter the invite code shared with you to see their shared cycle logs.
                  {!isAuthenticated
                    ? " You'll need to log in or create an account first."
                    : " You will have view-only access."}
                </Text>
              </View>

              {/* Input & Action */}
              <View>
                <View
                  className="mb-4 flex-row items-center border"
                  style={{
                    backgroundColor: colors.input,
                    borderColor: codeFocused ? colors.primary : colors.border,
                    borderWidth: codeFocused ? 1.5 : 1,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    height: 48,
                  }}
                >
                  <Feather
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
                  className="mb-2 justify-center items-center rounded-2xl"
                  style={{
                    height: 48,
                    backgroundColor: colors.primary,
                    opacity: isSubmitting ? 0.75 : 1,
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
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
