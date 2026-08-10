import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/ScreenHeader";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { SkeletonList } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { partnerApi, type AppNotification } from "../../lib/api";

const NOTIFICATION_META: Record<
  AppNotification["type"],
  { icon: keyof typeof Ionicons.glyphMap; tint: keyof ReturnType<typeof getSoftTints> }
> = {
  buddy_message: { icon: "chatbubble-ellipses", tint: "lavender" },
  community_reply: { icon: "people", tint: "teal" },
  consultation_update: { icon: "medkit", tint: "blue" },
  habit_reminder: { icon: "checkmark-circle", tint: "mint" },
  ovulation_reminder: { icon: "flower", tint: "purple" },
  partner_message: { icon: "heart", tint: "rose" },
  period_reminder: { icon: "water", tint: "pink" },
  reward_earned: { icon: "gift", tint: "amber" },
  streak_bonus: { icon: "flame", tint: "danger" },
  system: { icon: "megaphone", tint: "emerald" },
};

function timeAgo(dateStr?: string) {
  if (!dateStr) return "";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors, fonts, isDark } = useTheme();
  const softTints = getSoftTints(colors);
  const {
    data: notifications,
    loading,
    refreshing,
    error,
    offline,
    reload,
  } = useAsyncLoad<AppNotification[]>(() => partnerApi.getNotifications());

  const list = notifications ?? [];
  const unreadCount = list.filter((n) => !n.isRead).length;

  const markAsRead = async (id: string) => {
    try {
      await partnerApi.markNotificationAsRead(id);
      reload(true);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      <ScreenHeader
        title="Notifications"
        onBack={() => router.back()}
        right={
          unreadCount > 0 ? (
            <View
              className="px-2.5 py-1 rounded-full"
              style={{ backgroundColor: colors.primaryLight }}
            >
              <Text
                className="text-[11px] font-black"
                style={{ color: colors.primary, fontFamily: fonts.body }}
              >
                {unreadCount} new
              </Text>
            </View>
          ) : null
        }
      />

      <LoadingErrorState
        loading={loading}
        error={error}
        offline={offline}
        onRetry={() => reload()}
        loadingLabel="Loading notifications..."
        skeleton={<SkeletonList count={6} style={{ paddingTop: 16 }} />}
      >
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />
          }
        >
          {list.length === 0 ? (
            <View className="items-center justify-center py-24">
              <View
                className="w-16 h-16 rounded-full items-center justify-center mb-4"
                style={{ backgroundColor: colors.surfaceSoft }}
              >
                <Ionicons name="notifications-off-outline" size={26} color={colors.mutedText} />
              </View>
              <Text
                className="text-sm font-bold text-center"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                You&apos;re all caught up
              </Text>
              <Text
                className="text-xs text-center mt-1"
                style={{ color: colors.mutedText, fontFamily: fonts.body }}
              >
                New reminders and updates will show up here.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {list.map((notif) => {
                const meta = NOTIFICATION_META[notif.type] ?? NOTIFICATION_META.system;
                return (
                  <TouchableOpacity
                    key={notif._id}
                    activeOpacity={0.8}
                    onPress={() => !notif.isRead && markAsRead(notif._id)}
                    className="flex-row p-3.5 rounded-2xl"
                    style={{
                      backgroundColor: notif.isRead ? colors.surface : colors.primaryLight,
                      ...getShadow(colors, isDark),
                    }}
                  >
                    <View
                      className="w-11 h-11 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: softTints[meta.tint] }}
                    >
                      <Ionicons name={meta.icon} size={18} color={colors.primary} />
                    </View>

                    <View className="flex-1">
                      <View className="flex-row items-start justify-between">
                        <Text
                          className="text-[13px] font-black flex-1 mr-2"
                          style={{ color: colors.foreground, fontFamily: fonts.body }}
                        >
                          {notif.title}
                        </Text>
                        {!notif.isRead && (
                          <View
                            className="w-2 h-2 rounded-full mt-1"
                            style={{ backgroundColor: colors.primary }}
                          />
                        )}
                      </View>
                      {notif.body ? (
                        <Text
                          className="text-xs mt-0.5"
                          style={{ color: colors.mutedText, fontFamily: fonts.body }}
                          numberOfLines={2}
                        >
                          {notif.body}
                        </Text>
                      ) : null}
                      <Text
                        className="text-[10px] font-semibold mt-1.5"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
                      >
                        {timeAgo(notif.createdAt ?? notif.sentAt ?? undefined)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      </LoadingErrorState>
    </SafeAreaView>
  );
}
