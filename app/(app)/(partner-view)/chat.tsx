import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../../components/theme";
import { SkeletonRow } from "../../../components/Skeleton";
import { partnerApi } from "../../../lib/api";
import { usePartnerViewState } from "./_state";

export default function PartnerViewChat() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const { prefill } = useLocalSearchParams<{ prefill?: string }>();
  const { profile, chatMessages, setChatMessages } = usePartnerViewState();
  const scrollRef = useRef<ScrollView>(null);
  // The tab bar in ./_layout.tsx floats via tabBarStyle position:"absolute",
  // so it doesn't reserve any layout space of its own — without this, the
  // message input footer below renders right underneath it, out of reach.
  const tabBarHeight = useBottomTabBarHeight();

  const [typedMessage, setTypedMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(true);

  const isConnected = profile?.isConnected ?? false;
  const partnerName =
    profile?.partnerId && typeof profile.partnerId === "object"
      ? `${profile.partnerId.firstName ?? ""} ${profile.partnerId.lastName ?? ""}`.trim()
      : "your partner";

  const loadMessages = useCallback(async () => {
    try {
      const msgs = await partnerApi.getMessages();
      setChatMessages(msgs);
    } catch {
      // keep whatever's already in shared state
    } finally {
      setLoadingMessages(false);
    }
  }, [setChatMessages]);

  useEffect(() => {
    if (isConnected) loadMessages();
    else setLoadingMessages(false);
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

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
  }, [chatMessages.length]);

  async function handleSendMessage() {
    if (!typedMessage.trim() || sendingMessage) return;
    const text = typedMessage.trim();
    setTypedMessage("");
    setSendingMessage(true);

    setChatMessages((prev) => [...prev, { sender: "user", text, sentAt: new Date().toISOString() }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      await partnerApi.sendMessage(text);
    } catch {
      // stays optimistically
    } finally {
      setSendingMessage(false);
    }
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
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} />
          </View>
          <View className="flex-1 min-w-0">
            <Text
              className="text-base font-black"
              numberOfLines={1}
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              {partnerName !== "your partner" ? partnerName : "Chat"}
            </Text>
            <Text
              className="text-[11px] font-semibold"
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              {isConnected ? "Connected" : "Not connected"}
            </Text>
          </View>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
          {!isConnected ? (
            <View className="flex-1 items-center justify-center px-8">
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.mutedText} style={{ marginBottom: 10 }} />
              <Text
                className="text-center text-xs font-semibold leading-5"
                style={{ color: colors.mutedText, fontFamily: fonts.body }}
              >
                No partner connected yet.
              </Text>
            </View>
          ) : loadingMessages ? (
            <View className="px-4 pt-4 gap-5">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : (
            <>
              <ScrollView
                ref={scrollRef}
                className="flex-1"
                contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
              >
                {chatMessages.length === 0 ? (
                  <Text
                    className="text-center text-xs font-semibold mt-8"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    Say hi to {partnerName || "your partner"}.
                  </Text>
                ) : (
                  chatMessages.map((msg, idx) => {
                    const mine = msg.sender === "user";
                    return (
                      <View
                        key={msg._id ?? idx}
                        className="mb-2"
                        style={{ alignItems: mine ? "flex-end" : "flex-start" }}
                      >
                        <View
                          className="rounded-2xl px-3.5 py-2"
                          style={{
                            maxWidth: "80%",
                            backgroundColor: mine ? colors.primaryDark : colors.surface,
                            borderWidth: mine ? 0 : 1,
                            borderColor: colors.border,
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
                      </View>
                    );
                  })
                )}
              </ScrollView>

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
                  disabled={!typedMessage.trim() || sendingMessage}
                  onPress={handleSendMessage}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={{ backgroundColor: typedMessage.trim() ? colors.primary : colors.border }}
                >
                  {sendingMessage ? (
                    <ActivityIndicator size="small" color={colors.buttonText} />
                  ) : (
                    <Feather name="arrow-up" size={16} color={typedMessage.trim() ? colors.buttonText : colors.mutedText} />
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}
