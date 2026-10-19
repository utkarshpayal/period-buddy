import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../../components/theme";
import { SkeletonRow } from "../../../components/Skeleton";
import { getFriendlyErrorMessage } from "../../../lib/api";
import { usePartnerViewState } from "../../../components/partner-view-state";
import { SendStatusLabel } from "../../../components/partner-view/SendStatusLabel";
import { usePartnerChat } from "../../../hooks/usePartnerChat";
import { partnerDisplayName } from "../../../lib/partnerChat";
import { useSecureScreen } from "../../../lib/screenPrivacy";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Icon } from "../../../components/Icon";

export default function PartnerViewChat() {
  useSecureScreen("partner-chat");
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const { prefill } = useLocalSearchParams<{ prefill?: string }>();
  const { profile, chatMessages, setChatMessages } = usePartnerViewState();
  // The tab bar in ./_layout.tsx floats via tabBarStyle position:"absolute",
  // so it doesn't reserve any layout space of its own — without this, the
  // message input footer below renders right underneath it, out of reach.
  const tabBarHeight = useBottomTabBarHeight();

  const [typedMessage, setTypedMessage] = useState("");
  const { loading, loadError, loadMessages, sendMessage, retryMessage } = usePartnerChat({
    setMessages: setChatMessages,
  });

  const isConnected = profile?.isConnected ?? false;
  const partnerName = partnerDisplayName(profile);
  // Inverted list: newest first, so it opens at the latest message with no
  // scroll-to-end timers.
  const newestFirst = useMemo(() => [...chatMessages].reverse(), [chatMessages]);

  useEffect(() => {
    if (isConnected) loadMessages();
  }, [isConnected, loadMessages]);

  // Arriving from Home's "Send a check-in" pre-fills a starter message —
  // consumed once via the `prefill` param instead of every re-render.
  useEffect(() => {
    if (prefill) {
      setTypedMessage((prev) => prev || "Thinking of you 💜 how are you feeling?");
      router.setParams({ prefill: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  function handleSendMessage() {
    if (!typedMessage.trim()) return;
    sendMessage(typedMessage);
    setTypedMessage("");
  }

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-center gap-3 px-5 pt-4 pb-2">
          <View
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.primaryLight }}
          >
            <Icon set="ion" name="chatbubble-ellipses-outline" size={16} color={colors.primary} />
          </View>
          <View className="flex-1 min-w-0">
            <Text
              className="text-base font-black"
              numberOfLines={1}
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              {partnerName ?? "Chat"}
            </Text>
            <Text
              className="text-xs font-semibold"
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              {isConnected ? "Connected" : "Not connected"}
            </Text>
          </View>
        </View>

        <KeyboardAvoidingView
          behavior="padding"
          className="flex-1"
          keyboardVerticalOffset={90}
        >
          {!isConnected ? (
            <View className="flex-1 items-center justify-center px-8">
              <Icon set="ion" name="chatbubble-ellipses-outline" size={22} color={colors.mutedText} style={{ marginBottom: 10 }} />
              <Text
                className="text-center text-xs font-semibold leading-5"
                style={{ color: colors.mutedText, fontFamily: fonts.body }}
              >
                No partner connected yet.
              </Text>
            </View>
          ) : loading && chatMessages.length === 0 ? (
            <View className="px-4 pt-4 gap-5">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : (
            <>
              {loadError && chatMessages.length === 0 ? (
                <View className="flex-1 items-center justify-center px-8">
                  <Text
                    className="text-center text-xs font-semibold leading-5"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    {getFriendlyErrorMessage(loadError)}
                  </Text>
                  <TouchableOpacity
                    onPress={loadMessages}
                    accessibilityRole="button"
                    className="mt-4 px-5 py-2.5 rounded-full"
                    style={{ backgroundColor: colors.primary }}
                  >
                    <Text className="text-xs font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                      Try again
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : chatMessages.length === 0 ? (
                <View className="flex-1 items-center justify-center px-8">
                  <Text
                    className="text-center text-xs font-semibold"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    Say hi to {partnerName ?? "your partner"}.
                  </Text>
                </View>
              ) : (
                <FlatList
                  inverted
                  data={newestFirst}
                  keyExtractor={(msg, idx) => msg.localId ?? msg._id ?? `${msg.sentAt}_${idx}`}
                  className="flex-1"
                  contentContainerStyle={{ padding: 16, paddingTop: 8 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item: msg }) => {
                    const mine = msg.sender === "user";
                    return (
                      <View className="mb-2" style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
                        <View
                          className="rounded-2xl px-3.5 py-2"
                          style={{
                            maxWidth: "80%",
                            backgroundColor: mine ? colors.primaryDark : colors.surface,
                            borderWidth: mine ? 0 : 1,
                            borderColor: colors.border,
                            opacity: msg.status === "failed" ? 0.6 : 1,
                          }}
                        >
                          <Text
                            className="text-xs font-semibold"
                            style={{
                              color: mine ? "#FFFFFF" : colors.foreground,
                              fontFamily: fonts.body,
                            }}
                          >
                            {msg.text}
                          </Text>
                        </View>
                        <SendStatusLabel status={msg.status} onRetry={() => retryMessage(msg)} />
                      </View>
                    );
                  }}
                />
              )}

              <View
                className="flex-row items-center px-4 pt-3 border-t gap-2"
                style={{
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  paddingBottom: tabBarHeight + 12,
                }}
              >
                <TextInput
                  value={typedMessage}
                  onChangeText={setTypedMessage}
                  placeholder="Message..."
                  placeholderTextColor={colors.mutedText}
                  onSubmitEditing={handleSendMessage}
                  className="flex-1 rounded-full px-4 py-2.5 text-xs font-semibold outline-none"
                  style={{
                    backgroundColor: colors.input,
                    color: colors.foreground,
                    fontFamily: fonts.body,
                  }}
                />
                <TouchableOpacity
                  disabled={!typedMessage.trim()}
                  onPress={handleSendMessage}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={{ backgroundColor: typedMessage.trim() ? colors.primary : colors.border }}
                >
                  <Icon set="feather" name="arrow-up" size={16} color={typedMessage.trim() ? colors.buttonText : colors.mutedText} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}
