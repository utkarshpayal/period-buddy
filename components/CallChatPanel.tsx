import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type CallChat } from "../lib/jitsiCall";
import { formatTime } from "../lib/consultationFormat";
import { useTheme } from "./theme";
import { Icon } from "./Icon";

const MAX_LENGTH = 2000;

/**
 * The existing consultation / buddy chat as a sheet over the video call
 * (components/JitsiCall). Same messages and the same send path as the normal
 * chat screen, so everything written here is saved there too.
 */
export function CallChatPanel({
  chat,
  peerName,
  onClose,
}: {
  chat: CallChat;
  peerName: string;
  onClose: () => void;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState("");

  // Newest at the bottom, like the chat screen.
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [chat.messages.length]);

  const send = () => {
    const text = draft.trim();
    if (!text || !chat.canSend || chat.sending) return;
    setDraft("");
    chat.onSend(text);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="absolute left-0 right-0 bottom-0"
      style={{ top: "38%" }}
    >
      <View
        className="flex-1 rounded-t-3xl overflow-hidden"
        style={{ backgroundColor: colors.background, paddingBottom: insets.bottom }}
        accessibilityViewIsModal
      >
        <View className="flex-row items-center justify-between px-5 pt-4 pb-3" style={{ borderBottomWidth: 1, borderColor: colors.border }}>
          <View className="flex-1 pr-3">
            <Text className="text-base font-extrabold" style={{ color: colors.foreground, fontFamily: fonts.heading }} accessibilityRole="header">
              Chat with {peerName}
            </Text>
            <Text className="text-xs mt-0.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              Saved in your chat. The call keeps going.
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close chat"
            className="p-2 rounded-full"
            style={{ backgroundColor: colors.surfaceSoft }}
          >
            <Icon set="feather" name="chevron-down" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
          {chat.loading && chat.messages.length === 0 ? (
            <ActivityIndicator color={colors.primary} />
          ) : chat.messages.length === 0 ? (
            <Text className="text-sm text-center mt-6" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              No messages yet. Anything you write here is saved in your chat.
            </Text>
          ) : (
            chat.messages.map((m) => (
              <View
                key={m.id}
                className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${m.mine ? "self-end" : "self-start"}`}
                style={{
                  backgroundColor: m.mine ? colors.primary : colors.surface,
                  borderWidth: m.mine ? 0 : 1,
                  borderColor: colors.border,
                }}
              >
                <Text className="text-sm" style={{ color: m.mine ? "#FFFFFF" : colors.foreground, fontFamily: fonts.body }}>
                  {m.text}
                </Text>
                <Text
                  className="text-[11.5px] mt-1"
                  style={{ color: m.mine ? "rgba(255,255,255,0.8)" : colors.mutedText, fontFamily: fonts.body }}
                >
                  {m.failed ? "Not sent · retry from the chat" : m.sentAt ? formatTime(new Date(m.sentAt)) : ""}
                </Text>
              </View>
            ))
          )}
        </ScrollView>

        {chat.canSend ? (
          <View className="flex-row items-end gap-2 px-4 py-3" style={{ borderTopWidth: 1, borderColor: colors.border }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a message…"
              placeholderTextColor={colors.mutedText}
              multiline
              maxLength={MAX_LENGTH}
              accessibilityLabel={`Message ${peerName}`}
              className="flex-1 rounded-2xl px-4 py-2.5 text-sm"
              style={{ backgroundColor: colors.surface, color: colors.foreground, fontFamily: fonts.body, maxHeight: 110 }}
            />
            <TouchableOpacity
              onPress={send}
              disabled={!draft.trim() || chat.sending}
              accessibilityRole="button"
              accessibilityLabel="Send"
              className="h-11 w-11 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.primary, opacity: draft.trim() && !chat.sending ? 1 : 0.5 }}
            >
              {chat.sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon set="feather" name="send" size={18} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>
        ) : (
          <Text className="text-xs text-center px-4 py-3" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
            This chat is closed.
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
