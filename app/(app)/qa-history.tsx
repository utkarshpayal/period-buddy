import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Image, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-context";
import { LoadMoreButton } from "../../components/LoadMoreButton";
import { ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import { SkeletonBlock } from "../../components/Skeleton";
import { LockedFeatureCard } from "../../components/subscription/LockedFeatureCard";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import { useTheme } from "../../components/theme";
import { getLogCategoryTints, getShadow, getSoftTints } from "../../components/ui-tokens";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { alert } from "../../lib/alert";
import { questionAnswerApi, type ChatTopicId, type QaChatSessionSummary } from "../../lib/api";
import { CHAT_TOPICS, getChatTopic, isTopicLocked } from "../../lib/chatTopics";
import { formatShortDate } from "../../lib/format";

/**
 * Nura AI home — the entry to the assistant. One primary action (start a new
 * chat), then topics to start from, then recent chats to pick back up.
 * Opening a chat or topic goes to app/(app)/qa.tsx (?new=1[&topic=id] or
 * ?sessionId=...). qa.tsx redirects a bare open here.
 */
export default function NuraAiHome() {
  const { colors, fonts, isDark } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const softTints = getSoftTints(colors);
  const categoryTints = getLogCategoryTints(colors);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [pendingTopic, setPendingTopic] = useState<ChatTopicId | null>(null);
  const { hasAccess, isLoading: subscriptionLoading, refresh: refreshSubscriptionAccess } = useSubscriptionAccess();
  // Persisted AI chat is the premium part of Nura AI, so gate the whole home.
  const locked = !subscriptionLoading && !hasAccess("ai_assistant");

  useEffect(() => {
    if (locked) setPaywallVisible(true);
  }, [locked]);

  const {
    items: sessions,
    setItems: setSessions,
    loading,
    refreshing,
    reload,
    hasMore,
    loadingMore,
    loadMore,
  } = usePaginatedList<QaChatSessionSummary>(
    async (page) => {
      const res = await questionAnswerApi.listSessionsPage({ page, limit: 20 });
      return { items: res.sessions, hasMore: res.hasMore };
    },
    [],
    // A chat opened from here (new or resumed) adds/updates sessions.
    { getKey: (session) => session.id, refreshOn: ["qaSessions"] },
  );

  function openNewChat(topicId?: ChatTopicId) {
    if (!hasAccess("ai_assistant")) {
      setPendingTopic(topicId ?? null);
      setPaywallVisible(true);
      return;
    }
    router.push({ pathname: "/(app)/qa", params: topicId ? { new: "1", topic: topicId } : { new: "1" } });
  }

  function handleDelete(session: QaChatSessionSummary) {
    alert("Delete this chat?", `"${session.title}" will be removed from your history.`, [
      { style: "cancel", text: "Cancel" },
      {
        onPress: async () => {
          setDeletingId(session.id);
          try {
            await questionAnswerApi.deleteSession(session.id);
            // Drop it in place; a reload would collapse pages opened with "Show more".
            setSessions((prev) => prev.filter((s) => s.id !== session.id));
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

  const paywall = (
    <PaywallModal
      visible={paywallVisible}
      onClose={() => setPaywallVisible(false)}
      featureKey="ai_assistant"
      onUnlocked={() => {
        refreshSubscriptionAccess();
        router.push({ pathname: "/(app)/qa", params: pendingTopic ? { new: "1", topic: pendingTopic } : { new: "1" } });
      }}
    />
  );

  if (locked) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Nura AI" />
        <View className="flex-1 items-center justify-center px-6">
          <LockedFeatureCard
            title="Nura AI"
            description="Private answers about your cycle, body and health, any time."
            onPress={() => setPaywallVisible(true)}
          />
        </View>
        {paywall}
      </SafeAreaView>
    );
  }

  const firstName = user?.firstName && user.firstName !== "Nura" ? user.firstName : "";

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScreenHeader title="Nura AI" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />}
      >
        {/* Primary action */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => openNewChat()}
          disabled={subscriptionLoading}
          accessibilityRole="button"
          accessibilityLabel="Start a new chat"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            padding: 18,
            borderRadius: 24,
            backgroundColor: colors.primary,
            ...getShadow(colors, isDark),
          }}
        >
          <View
            className="items-center justify-start overflow-hidden rounded-full"
            style={{ width: 52, height: 52, backgroundColor: softTints.pink, borderWidth: 2, borderColor: colors.buttonText }}
          >
            <Image
              source={require("../../assets/images/illustrations/nura-avatar.png")}
              style={{ width: 52, height: 52 * (1294 / 871) }}
              resizeMode="cover"
            />
          </View>
          <View className="flex-1">
            <Text style={{ color: colors.buttonText, fontSize: 17, fontWeight: "800", fontFamily: fonts.heading }}>
              {firstName ? `Ask anything, ${firstName}` : "Ask anything"}
            </Text>
            <Text style={{ color: colors.buttonText, opacity: 0.85, fontSize: 13, marginTop: 2, fontFamily: fonts.body }}>
              Private, anonymous answers
            </Text>
          </View>
          <View className="items-center justify-center rounded-full" style={{ width: 36, height: 36, backgroundColor: colors.buttonText }}>
            <Ionicons name="add" size={22} color={colors.primary} />
          </View>
        </TouchableOpacity>

        {/* Topics */}
        <SectionHeader title="Start with a topic" style={{ marginTop: 28 }} />
        <View className="flex-row flex-wrap" style={{ gap: 10 }}>
          {CHAT_TOPICS.map((topic) => {
            const tint = categoryTints[topic.tint];
            const topicLocked = isTopicLocked(topic, user?.dateOfBirth);
            return (
              <TouchableOpacity
                key={topic.id}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={topicLocked ? `${topic.label}, locked` : topic.label}
                onPress={() => {
                  if (topicLocked) {
                    alert(
                      "Age verification needed",
                      `${topic.label} unlocks once your profile shows you're ${topic.minAge}+. Add your birthday in Profile → Edit profile.`,
                    );
                    return;
                  }
                  openNewChat(topic.id);
                }}
                style={{ width: "47%", flexGrow: 1, padding: 14, borderRadius: 18, backgroundColor: colors.surface, opacity: topicLocked ? 0.55 : 1 }}
              >
                <View className="items-center justify-center rounded-xl" style={{ width: 36, height: 36, backgroundColor: tint.light }}>
                  <Feather name={topicLocked ? "lock" : topic.icon} size={17} color={tint.color} />
                </View>
                <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 14, lineHeight: 19, fontWeight: "700", marginTop: 10, fontFamily: fonts.body }}>
                  {topic.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Recent chats */}
        {loading ? (
          <View style={{ marginTop: 28, gap: 10 }}>
            <SkeletonBlock width={120} height={16} />
            <SkeletonBlock height={64} radius={18} />
            <SkeletonBlock height={64} radius={18} />
          </View>
        ) : sessions?.length ? (
          <>
            <SectionHeader title="Recent chats" barColor={colors.secondary} style={{ marginTop: 28 }} />
            <View style={{ borderRadius: 20, backgroundColor: colors.surface, overflow: "hidden" }}>
              {sessions.map((session, index) => {
                const topic = getChatTopic(session.topicId);
                const tint = topic ? categoryTints[topic.tint] : { color: colors.primary, light: softTints.pink };
                return (
                  <View key={session.id}>
                    {index > 0 ? <View style={{ height: 1, marginLeft: 68, backgroundColor: colors.border }} /> : null}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      disabled={deletingId === session.id}
                      onPress={() => router.push({ pathname: "/(app)/qa", params: { sessionId: session.id } })}
                      onLongPress={() => handleDelete(session)}
                      accessibilityRole="button"
                      accessibilityHint="Long press to delete"
                      className="flex-row items-center"
                      style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 14, opacity: deletingId === session.id ? 0.5 : 1 }}
                    >
                      <View className="items-center justify-center rounded-full" style={{ width: 40, height: 40, backgroundColor: tint.light }}>
                        <Feather name={topic?.icon ?? "message-circle"} size={17} color={tint.color} />
                      </View>
                      <View className="flex-1" style={{ minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14.5, fontWeight: "700", fontFamily: fonts.body }}>
                          {session.title}
                        </Text>
                        <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 13, marginTop: 2, fontFamily: fonts.body }}>
                          {session.topicLabel} · {formatShortDate(session.lastMessageAt)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleDelete(session)}
                        disabled={deletingId === session.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete chat ${session.title}`}
                        hitSlop={10}
                      >
                        <Ionicons name="trash-outline" size={17} color={colors.mutedText} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
            <LoadMoreButton hasMore={hasMore} loading={loadingMore} onPress={loadMore} />
          </>
        ) : null}
      </ScrollView>

      {paywall}
    </SafeAreaView>
  );
}
