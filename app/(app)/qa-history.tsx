import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { Loader } from "../../components/Loader";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useTheme } from "../../components/theme";
import { getLogCategoryTints, getShadow, getSoftTints } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { LockedFeatureCard } from "../../components/subscription/LockedFeatureCard";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import { alert } from "../../lib/alert";
import { formatShortDate } from "../../lib/format";
import { questionAnswerApi, type QaChatSessionSummary } from "../../lib/api";
import { getChatTopic } from "../../lib/chatTopics";

// Chat history — every past Nura AI conversation, most recent first. Opening
// one resumes it (app/(app)/qa.tsx loads the session via ?sessionId=...);
// "New chat" drops back into qa.tsx fresh so the topic-picker grid there
// handles starting a chat on any topic.
export default function QaHistory() {
  const { colors, fonts, isDark } = useTheme();
  const router = useRouter();
  const softTints = getSoftTints(colors);
  const categoryTints = getLogCategoryTints(colors);
  const shadow = getShadow(colors, isDark);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const {
    hasAccess,
    isLoading: subscriptionLoading,
    refresh: refreshSubscriptionAccess,
  } = useSubscriptionAccess();
  // Whole-screen gate — Nura AI (persisted chat) is the premium part of Ask
  // Nura AI, so block reaching the history list at all when locked, not
  // just starting a new chat.
  const locked = !subscriptionLoading && !hasAccess("ai_assistant");

  useEffect(() => {
    if (locked) setPaywallVisible(true);
  }, [locked]);

  const { data: sessions, loading, refreshing, error, offline, reload } = useAsyncLoad<QaChatSessionSummary[]>(
    () => questionAnswerApi.listSessions(),
  );

  // Gated right here, before ever navigating into qa.tsx — "New chat" is an
  // explicit request to start a *persisted* AI session (the premium part of
  // Ask Nura AI), so this is the earliest point to show the paywall instead
  // of letting the user open the topic picker and type a message first.
  function startNewChat() {
    if (!hasAccess("ai_assistant")) {
      setPaywallVisible(true);
      return;
    }
    router.push({ pathname: "/(app)/qa", params: { new: "1" } });
  }

  function handleDelete(session: QaChatSessionSummary) {
    alert("Delete this chat?", `"${session.title}" will be removed from your history.`, [
      { style: "cancel", text: "Cancel" },
      {
        onPress: async () => {
          setDeletingId(session.id);
          try {
            await questionAnswerApi.deleteSession(session.id);
            reload();
          } catch (err) {
            alert("Couldn't delete chat", err instanceof Error ? err.message : "Please try again.");
          } finally {
            setDeletingId(null);
          }
        },
        style: "destructive",
        text: "Delete",
      },
    ]);
  }

  if (subscriptionLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Chat History" />
        <Loader fullscreen />
      </SafeAreaView>
    );
  }

  if (locked) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Chat History" />
        <View className="flex-1 items-center justify-center px-6">
          <LockedFeatureCard
            title="Nura AI Chat"
            description="Unlock persisted, topic-scoped chats with Nura AI, saved so you can pick up any conversation later."
            onPress={() => setPaywallVisible(true)}
          />
        </View>
        <PaywallModal
          visible={paywallVisible}
          onClose={() => setPaywallVisible(false)}
          featureKey="ai_assistant"
          onUnlocked={refreshSubscriptionAccess}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScreenHeader
        title="Chat History"
        right={
          <TouchableOpacity
            onPress={startNewChat}
            activeOpacity={0.8}
            className="flex-row items-center gap-1.5 px-3.5 py-2 rounded-full"
            style={{ backgroundColor: colors.primary }}
          >
            <Feather name="plus" size={14} color={colors.buttonText} />
            <Text className="text-xs font-black" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
              New
            </Text>
          </TouchableOpacity>
        }
      />

      <LoadingErrorState loading={loading} error={error} offline={offline} onRetry={() => reload()}>
        {!sessions?.length ? (
          <EmptyState
            icon="chat-question-outline"
            title="No chats yet"
            message="Start a conversation with Nura AI and it'll show up here so you can pick it back up any time."
            actionLabel="Start a chat"
            onAction={startNewChat}
          />
        ) : (
          <ScrollView
            className="flex-1 px-5 pt-4"
            contentContainerStyle={{ paddingBottom: 32 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />}
          >
            <View className="gap-3">
              {sessions.map((session) => {
                const topic = getChatTopic(session.topicId);
                const tint = topic ? categoryTints[topic.tint] : { color: colors.primary, light: softTints.pink };
                return (
                  <TouchableOpacity
                    key={session.id}
                    activeOpacity={0.75}
                    disabled={deletingId === session.id}
                    onPress={() => router.push({ pathname: "/(app)/qa", params: { sessionId: session.id } })}
                    className="flex-row items-center gap-3 p-4 rounded-3xl border"
                    style={[{ backgroundColor: colors.surface, borderColor: colors.border }, shadow]}
                  >
                    <View
                      className="w-11 h-11 items-center justify-center rounded-full"
                      style={{ backgroundColor: tint.light }}
                    >
                      <Feather name={topic?.icon ?? "message-circle"} size={18} color={tint.color} />
                    </View>

                    <View className="flex-1 min-w-0">
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        className="text-sm font-black"
                        style={{ color: colors.foreground, fontFamily: fonts.heading }}
                      >
                        {session.title}
                      </Text>
                      <Text
                        numberOfLines={1}
                        className="text-[11px] font-bold mt-0.5"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
                      >
                        {session.topicLabel} · {formatShortDate(session.lastMessageAt)} · {session.messageCount} msg
                        {session.messageCount === 1 ? "" : "s"}
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleDelete(session)}
                      disabled={deletingId === session.id}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Delete chat"
                      className="w-8 h-8 items-center justify-center rounded-full"
                      style={{ backgroundColor: colors.input }}
                    >
                      <Feather name="trash-2" size={13} color={colors.mutedText} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}
      </LoadingErrorState>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        featureKey="ai_assistant"
        onUnlocked={() => {
          refreshSubscriptionAccess();
          router.push({ pathname: "/(app)/qa", params: { new: "1" } });
        }}
      />
    </SafeAreaView>
  );
}
