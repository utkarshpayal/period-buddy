import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SocketState } from "../../hooks/useConsultationChat";
import { alert } from "../../lib/alert";
import type { Consultation, Doctor } from "../../lib/api";
import { getDoctorDisplayName, refundLabel, type ChatMessage, type ChatStatusTone } from "../../lib/consultationModel";
import { DoctorPhoto } from "../DoctorPhoto";
import { EmptyState } from "../EmptyState";
import { AppModalHost } from "../modals/AppModalHost";
import { PrescriptionCard } from "../PrescriptionCard";
import { SkeletonRow } from "../Skeleton";
import { useTheme } from "../theme";
import { Icon } from "../Icon";
import { SendButton } from "../SendButton";

/**
 * A consultation's chat, as a page sheet: header with the session's state and
 * the video button, the prescription, the messages (an inverted list, so it
 * opens on the newest and stays there as messages arrive) and the composer,
 * or a note once the session is over.
 */
export function ConsultationChatSheet({
  visible,
  consultation,
  doctor,
  status,
  live,
  socketState,
  messages,
  loading,
  error,
  sending,
  onClose,
  onSend,
  onRetryMessage,
  onRetryLoad,
  onStartVideo,
}: {
  visible: boolean;
  consultation: Consultation | null;
  doctor: Doctor | null;
  status: { text: string; tone: ChatStatusTone };
  live: boolean;
  socketState: SocketState;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  sending: boolean;
  onClose: () => void;
  /** False when nothing was sent, so the typed text stays. */
  onSend: (text: string) => boolean;
  onRetryMessage: (message: ChatMessage) => void;
  onRetryLoad: () => void;
  onStartVideo: () => void;
}) {
  const { colors, fonts, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [typed, setTyped] = useState("");
  const doctorName = doctor ? getDoctorDisplayName(doctor) : null;
  const statusColor = status.tone === "success" ? colors.success : status.tone === "primary" ? colors.primary : colors.mutedText;
  const newestFirst = useMemo(() => [...messages].reverse(), [messages]);

  const send = () => {
    if (onSend(typed)) setTyped("");
  };

  const renderMessage = useCallback(
    ({ item: msg }: { item: ChatMessage }) => {
      const isDoctor = msg.sender === "doctor";
      const attachment = msg.attachmentUrl && /^https:\/\//i.test(msg.attachmentUrl) ? msg.attachmentUrl : null;
      return (
        <View className={isDoctor ? "self-start max-w-[80%]" : "self-end max-w-[80%]"} style={{ marginTop: 16 }}>
          <View
            className={`p-4 rounded-2xl ${isDoctor ? "rounded-tl-none border" : "rounded-tr-none"}`}
            style={{
              backgroundColor: isDoctor ? colors.surface : isDark ? colors.surfaceStrong : "#17212E",
              borderColor: isDoctor ? colors.border : undefined,
              opacity: msg.failed ? 0.6 : 1,
            }}
          >
            <Text className="text-xs font-semibold leading-5" style={{ color: isDoctor ? colors.foreground : "#FFFFFF", fontFamily: fonts.body }}>
              {msg.text}
            </Text>
            {attachment ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(attachment).catch(() => alert("Couldn't open the attachment"))}
                accessibilityRole="link"
                accessibilityLabel="Open attachment"
                className="flex-row items-center gap-1.5 mt-2"
              >
                <Icon set="feather" name="paperclip" size={13} color={isDoctor ? colors.primary : "#FFFFFF"} />
                <Text className="text-xs font-bold underline" style={{ color: isDoctor ? colors.primary : "#FFFFFF", fontFamily: fonts.body }}>
                  Open attachment
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {msg.failed ? (
            <TouchableOpacity
              onPress={() => onRetryMessage(msg)}
              disabled={!live}
              accessibilityRole="button"
              accessibilityLabel="Message not sent. Retry"
              className="flex-row items-center gap-1 self-end mt-1"
            >
              <Icon set="feather" name="alert-circle" size={12} color={colors.danger} />
              <Text className="text-[11.5px] font-bold" style={{ color: colors.danger, fontFamily: fonts.body }}>
                {live ? "Not sent · Tap to retry" : "Not sent"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    },
    [colors, fonts, isDark, live, onRetryMessage],
  );

  const prescription = consultation?.prescription ? (
    <PrescriptionCard consultation={consultation} doctorName={doctor?.name} />
  ) : null;

  let body: React.ReactNode;
  if (loading) {
    body = (
      <View className="px-6 pt-4">
        {prescription}
        <View className="gap-5 pt-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </View>
    );
  } else if (error && messages.length === 0) {
    body = (
      <View className="px-6 pt-4">
        {prescription}
        <EmptyState compact icon="message-alert-outline" title="Couldn't load messages" message={error} actionLabel="Retry" onAction={onRetryLoad} />
      </View>
    );
  } else if (messages.length === 0) {
    body = (
      <View className="px-6 pt-4">
        {prescription}
        <View className="items-center pt-16 px-8">
          <Text className="text-xs font-semibold text-center leading-5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
            {live ? "No messages yet. Say hello to your specialist." : "No messages in this session."}
          </Text>
        </View>
      </View>
    );
  } else {
    body = (
      <FlatList
        inverted
        data={newestFirst}
        keyExtractor={(m, i) => m._id ?? m.localId ?? `m${i}`}
        renderItem={renderMessage}
        // Inverted: the footer sits above the oldest message.
        ListFooterComponent={prescription}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        windowSize={11}
      />
    );
  }

  const ended = consultation ? refundLabel(consultation) : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
          <View
            className="px-6 pb-4 border-b flex-row justify-between items-center"
            style={{ backgroundColor: colors.surface, borderColor: colors.border, paddingTop: Math.max(16, insets.top + 8) }}
          >
            <View className="flex-row items-center gap-3 flex-1">
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close chat" className="p-1 -ml-1">
                <Icon set="feather" name="chevron-down" size={20} color={colors.foreground} />
              </TouchableOpacity>
              <DoctorPhoto
                name={doctorName ?? "Doctor"}
                uri={doctor?.avatarUrl}
                size={32}
                backgroundColor={colors.primaryLight}
                textColor={colors.primary}
                fontFamily={fonts.heading}
              />
              <View className="flex-1">
                <Text numberOfLines={1} className="text-sm font-extrabold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                  {doctorName ?? "Clinical Specialist"}
                </Text>
                <View className="flex-row items-center gap-1.5 mt-0.5">
                  <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
                  <Text className="text-[11.5px] font-bold uppercase tracking-widest" style={{ color: colors.mutedText, fontFamily: fonts.body }} numberOfLines={1}>
                    {status.text}
                  </Text>
                </View>
              </View>
            </View>

            {live && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={onStartVideo}
                accessibilityRole="button"
                accessibilityLabel={`Start video call with ${doctorName ?? "your doctor"}`}
                className="p-2 rounded-full"
                style={{ backgroundColor: colors.surfaceSoft }}
              >
                <Icon set="feather" name="video" size={18} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {live && socketState === "reconnecting" && (
            <View className="flex-row items-center justify-center gap-2 py-1.5" style={{ backgroundColor: colors.warningLight }} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={colors.foreground} />
              <Text className="text-xs font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                Reconnecting…
              </Text>
            </View>
          )}

          <View className="flex-1">{body}</View>

          {live ? (
            <View
              className="px-4 py-3 border-t flex-row items-center gap-3"
              style={{ backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(14, insets.bottom + 8) }}
            >
              <TextInput
                placeholder="Type a message..."
                placeholderTextColor={colors.mutedText}
                value={typed}
                onChangeText={setTyped}
                accessibilityLabel="Message"
                className="flex-1 px-4 py-3 rounded-xl text-sm"
                style={{ backgroundColor: colors.input, color: colors.foreground, fontFamily: fonts.body }}
                onSubmitEditing={send}
                submitBehavior="submit"
                returnKeyType="send"
              />
              <SendButton onPress={send} disabled={!typed.trim()} loading={sending} size={40} accessibilityLabel="Send message" />
            </View>
          ) : consultation ? (
            <View
              className="px-6 py-4 border-t items-center"
              style={{ backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(16, insets.bottom + 8) }}
              accessibilityLiveRegion="polite"
            >
              <Text className="text-sm font-extrabold text-center" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                {consultation.status === "cancelled" ? "This booking was cancelled" : "This session has ended"}
              </Text>
              <Text className="text-xs mt-1 text-center" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                {ended ? `${ended}. You can still read your messages here.` : "You can still read your messages here."}
              </Text>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
      {/* Alerts raised in the chat (e.g. a failed prescription download) draw over it. */}
      {visible ? <AppModalHost inline /> : null}
    </Modal>
  );
}
