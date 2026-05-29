import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  Share,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../components/theme";

export default function Partner() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"info" | "invite" | "messages">(
    "info",
  );
  const [inviteCode, setInviteCode] = useState("");
  const [hasSharedInvite, setHasSharedInvite] = useState(false);

  function createInviteCode() {
    return `FLOW-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  async function handleInvite() {
    const code = inviteCode || createInviteCode();

    if (!inviteCode) {
      setInviteCode(code);
      Alert.alert("Invite code generated", code);
      return;
    }

    await Share.share({
      message: `Join me on FlowHer as my partner support buddy. Invite code: ${code}`,
    });
    setHasSharedInvite(true);
  }

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
      >
        <ScrollView contentContainerClassName="pb-10">
          <View className="flex-row items-center gap-4 px-6 pt-6">
            <TouchableOpacity
              onPress={() => router.back()}
              accessibilityLabel="Back"
              style={{ padding: 8, margin: -8 }}
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={colors.foreground}
              />
            </TouchableOpacity>
            <Text
              className="flex-1 text-2xl font-bold"
              style={{ color: colors.foreground }}
            >
              Partner Options
            </Text>
          </View>

          {/* Tabs */}
          <View className="mt-6 flex-row gap-2 px-6">
            {["info", "invite", "messages"].map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab as any)}
                className="rounded-full px-4 py-2"
                style={{
                  backgroundColor:
                    activeTab === tab ? colors.primary : colors.surface,
                  borderWidth: activeTab === tab ? 0 : 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  className="text-sm font-semibold capitalize"
                  style={{
                    color:
                      activeTab === tab ? colors.buttonText : colors.foreground,
                  }}
                >
                  {tab === "info"
                    ? "For Partners"
                    : tab === "invite"
                      ? "Invite"
                      : "Chat"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="mx-6 mt-6">
            {activeTab === "info" && (
              <View className="gap-4">
                <Text
                  className="mb-2 text-base leading-6"
                  style={{ color: colors.text }}
                >
                  Help your partner understand your cycle and support you better
                </Text>

                <View
                  className="rounded-xl border-2 p-4"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <Text
                    className="font-bold"
                    style={{ color: colors.foreground }}
                  >
                    {"👥 What's Included"}
                  </Text>
                  <Text
                    className="mt-3 text-sm leading-5"
                    style={{ color: colors.text }}
                  >
                    • Share your cycle phases{"\n"}• Get simple tips for support
                    {"\n"}• Track intimate moments{"\n"}• Better communication
                  </Text>
                </View>

                <View
                  className="rounded-xl border-2 p-4"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <Text
                    className="font-bold"
                    style={{ color: colors.foreground }}
                  >
                    💡 Benefits
                  </Text>
                  <Text
                    className="mt-3 text-sm leading-5"
                    style={{ color: colors.text }}
                  >
                    Partners understand your needs better{"\n"}Better support
                    during different phases{"\n"}Reduced miscommunications
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  className="mt-6 rounded-xl py-4"
                  onPress={() => setActiveTab("invite")}
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text
                    className="text-center font-bold"
                    style={{ color: colors.buttonText }}
                  >
                    Learn More →
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {activeTab === "invite" && (
              <View className="gap-4">
                <View
                  className="rounded-xl border-2 p-6"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.primary,
                  }}
                >
                  <Ionicons
                    name="heart-circle"
                    size={48}
                    color={colors.primary}
                    style={{ alignSelf: "center", marginBottom: 12 }}
                  />
                  <Text
                    className="text-center text-lg font-bold"
                    style={{ color: colors.foreground }}
                  >
                    Invite Your Partner
                  </Text>
                  <Text
                    className="mt-3 text-center text-sm"
                    style={{ color: colors.mutedText }}
                  >
                    Share a unique code with your partner so they can connect
                    and provide support
                  </Text>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    className="mt-6 rounded-lg py-3"
                    onPress={handleInvite}
                    style={{ backgroundColor: colors.primary }}
                  >
                    <Text
                      className="text-center font-bold"
                      style={{ color: colors.buttonText }}
                    >
                      {inviteCode
                        ? "Share Invite Code"
                        : "Generate Invite Code"}
                    </Text>
                  </TouchableOpacity>

                  {inviteCode ? (
                    <View
                      className="mt-4 rounded-lg border px-4 py-3"
                      style={{
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      }}
                    >
                      <Text
                        className="text-center text-xs font-semibold"
                        style={{ color: colors.mutedText }}
                      >
                        Partner Code
                      </Text>
                      <Text
                        className="mt-1 text-center text-xl font-bold"
                        style={{ color: colors.primary }}
                      >
                        {inviteCode}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )}

            {activeTab === "messages" && (
              <View
                className="rounded-xl border-2 p-6"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Ionicons
                  name="chatbox-ellipses"
                  size={48}
                  color={colors.mutedText}
                  style={{ alignSelf: "center", marginBottom: 12 }}
                />
                <Text
                  className="text-center font-semibold"
                  style={{ color: colors.foreground }}
                >
                  {hasSharedInvite ? "Invite Sent" : "No Messages Yet"}
                </Text>
                <Text
                  className="mt-2 text-center text-sm"
                  style={{ color: colors.mutedText }}
                >
                  {hasSharedInvite
                    ? "Your partner can use the code to connect."
                    : "Invite a partner to start communicating"}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
