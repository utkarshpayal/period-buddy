import { useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SupportStatusPill } from "../../components/SupportStatusPill";
import { useTheme } from "../../components/theme";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { getFriendlyErrorMessage, supportApi, type SupportTicket } from "../../lib/api";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { REPLY_MAX, ticketTimeLabel } from "../../lib/support";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Icon } from "../../components/Icon";

/** One support ticket: the original message, the reply thread and a composer. */
export default function SupportTicketScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors, fonts, isDark } = useTheme();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [override, setOverride] = useState<SupportTicket | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  useSecureScreen("support-ticket");

  const { data, loading, refreshing, error, offline, reload } = useAsyncLoad(
    async () => {
      if (!id) throw new Error("Ticket not found");
      const res = await supportApi.getTicket(id);
      setOverride(null);
      return res.ticket;
    },
    [id],
    { refreshOn: ["notifications"] },
  );
  const ticket = override ?? data;

  const send = async () => {
    const message = draft.trim();
    if (!ticket || !message || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await supportApi.reply(ticket._id, message);
      setOverride(res.ticket);
      setDraft("");
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (err) {
      setSendError(getFriendlyErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const bubble = (key: string, from: "user" | "admin", text: string, at: string) => {
    const mine = from === "user";
    return (
      <View key={key} style={{ alignItems: mine ? "flex-end" : "flex-start", marginBottom: 12 }}>
        <View
          style={{
            maxWidth: "86%",
            borderRadius: 18,
            borderBottomRightRadius: mine ? 6 : 18,
            borderBottomLeftRadius: mine ? 18 : 6,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: mine ? colors.primaryLight : colors.surface,
            borderWidth: mine ? 0 : 1,
            borderColor: colors.border,
          }}
        >
          {!mine ? (
            <Text style={{ color: colors.primary, fontSize: 12.5, fontWeight: "800", fontFamily: fonts.body, marginBottom: 3 }}>
              Nura support
            </Text>
          ) : null}
          <Text selectable style={{ color: colors.foreground, fontSize: 15, lineHeight: 22, fontFamily: fonts.body }}>
            {text}
          </Text>
        </View>
        <Text style={{ color: colors.mutedText, fontSize: 12, marginTop: 4, fontFamily: fonts.body }}>{ticketTimeLabel(at)}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom"]} style={{ backgroundColor: colors.background }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <ScreenHeader title={ticket?.ticketNumber ?? "Ticket"} subtitle={ticket?.categoryLabel} />

      <LoadingErrorState loading={loading && !ticket} error={ticket ? null : error} offline={offline} onRetry={() => reload()}>
        {ticket ? (
          <KeyboardAvoidingView className="flex-1" behavior="padding">
            <ScrollView
              ref={scrollRef}
              className="flex-1"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />}
            >
              <View
                className="rounded-3xl p-4 mb-5"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 8 }}
              >
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <SupportStatusPill status={ticket.status} />
                  <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }}>
                    Opened {ticketTimeLabel(ticket.createdAt)}
                  </Text>
                </View>
                <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "700", fontFamily: fonts.heading }}>{ticket.subject}</Text>
                {ticket.meta ? (
                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    <Icon set="ion" name="phone-portrait-outline" size={14} color={colors.mutedText} />
                    <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, flexShrink: 1 }}>
                      App info attached
                      {ticket.meta.appVersion ? ` · v${ticket.meta.appVersion}` : ""}
                      {ticket.meta.platform ? ` · ${ticket.meta.platform}` : ""}
                    </Text>
                  </View>
                ) : null}
              </View>

              {bubble("original", "user", ticket.message, ticket.createdAt)}
              {ticket.replies.map((r) => bubble(r._id, r.from, r.message, r.at))}

              {ticket.replies.every((r) => r.from === "user") ? (
                <Text className="text-center mt-2" style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }}>
                  Our team will reply here. We&apos;ll notify you when they do.
                </Text>
              ) : null}
            </ScrollView>

            {ticket.canReply ? (
              <View className="px-4 pt-2 pb-2" style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
                {sendError ? (
                  <Text className="mb-2 text-center" style={{ color: colors.danger, fontSize: 13, fontFamily: fonts.body }}>
                    {sendError}
                  </Text>
                ) : null}
                <View className="flex-row items-end" style={{ gap: 10 }}>
                  <TextInput
                    value={draft}
                    onChangeText={(t) => setDraft(t.slice(0, REPLY_MAX))}
                    accessibilityLabel="Reply to support"
                    placeholder={ticket.status === "resolved" ? "Still need help? Reply to reopen" : "Write a reply"}
                    placeholderTextColor={colors.mutedText}
                    multiline
                    className="flex-1 rounded-3xl border px-4"
                    style={{
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      color: colors.foreground,
                      fontFamily: fonts.body,
                      fontSize: 15,
                      minHeight: 46,
                      maxHeight: 140,
                      paddingTop: 12,
                      paddingBottom: 12,
                    }}
                  />
                  <TouchableOpacity
                    onPress={send}
                    disabled={!draft.trim() || sending}
                    accessibilityRole="button"
                    accessibilityLabel="Send reply"
                    className="items-center justify-center"
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 23,
                      backgroundColor: colors.primary,
                      opacity: !draft.trim() || sending ? 0.5 : 1,
                    }}
                  >
                    {sending ? <ActivityIndicator color={colors.buttonText} /> : <Icon set="ion" name="send" size={18} color={colors.buttonText} />}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Text className="text-center px-6 py-4" style={{ color: colors.mutedText, fontSize: 13.5, fontFamily: fonts.body }}>
                This ticket is closed. Open a new request from Help & support if you still need help.
              </Text>
            )}
          </KeyboardAvoidingView>
        ) : (
          <View />
        )}
      </LoadingErrorState>
    </SafeAreaView>
  );
}
