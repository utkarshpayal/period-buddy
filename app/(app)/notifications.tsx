import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, LayoutAnimation, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/ScreenHeader";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { SkeletonList } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import { LoadMoreButton } from "../../components/LoadMoreButton";
import { partnerApi, type AppNotification } from "../../lib/api";
import { guardRoute } from "../../lib/launchGuard";
import { NOTIFICATIONS_LIST_ROUTE, openNotificationStoreLink, resolveNotificationTarget } from "../../lib/notifications";
import { notificationIcon, notificationImage } from "../../lib/notificationIcons";
import { useAuth } from "../../components/auth-context";

const DAY_MS = 24 * 60 * 60 * 1000;

const notifDate = (n: AppNotification) => n.createdAt ?? n.sentAt ?? undefined;

function timeAgo(dateStr?: string) {
  if (!dateStr) return "";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "Today" / "Yesterday" / "This week" / "Earlier", by calendar day. */
function sectionLabel(dateStr?: string) {
  if (!dateStr) return "Earlier";
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const t = new Date(dateStr).getTime();
  if (t >= startOfToday.getTime()) return "Today";
  if (t >= startOfToday.getTime() - DAY_MS) return "Yesterday";
  if (t >= startOfToday.getTime() - 6 * DAY_MS) return "This week";
  return "Earlier";
}

/** Consecutive runs of the (newest-first) list under the same day label. */
function groupByDay(list: AppNotification[]) {
  const groups: { label: string; items: AppNotification[] }[] = [];
  for (const n of list) {
    const label = sectionLabel(notifDate(n));
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }
  return groups;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, fonts, isDark } = useTheme();
  // Server-wide unread total (from page 1), so the count is right even when
  // most notifications haven't been loaded yet.
  const [serverUnread, setServerUnread] = useState<number | undefined>(undefined);
  const {
    items: list,
    setItems,
    loading,
    refreshing,
    error,
    offline,
    reload,
    hasMore,
    loadingMore,
    loadMore,
  } = usePaginatedList<AppNotification>(
    async (page) => {
      const res = await partnerApi.getNotificationsPage({ page, limit: 20 });
      if (page === 1) setServerUnread(res.unreadCount);
      return { items: res.notifications, hasMore: res.hasMore };
    },
    [],
    { refreshOn: ["notifications"] },
  );

  const unreadCount = serverUnread ?? list.filter((n) => !n.isRead).length;

  // Optimistic: flip the row and the count right away (reloading the list
  // would collapse any pages opened with "Show more"); roll back on failure.
  const markAsRead = async (id: string) => {
    setItems((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    setServerUnread((count) => (count === undefined ? count : Math.max(0, count - 1)));
    try {
      await partnerApi.markNotificationAsRead(id);
    } catch (err) {
      console.error(err);
      setItems((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: false } : n)));
      setServerUnread((count) => (count === undefined ? count : count + 1));
    }
  };

  const markAllAsRead = async () => {
    // Remember which rows were unread so a failure rolls back only those
    // (rows loaded by "Show more" meanwhile are kept).
    const wasUnread = new Set(list.filter((n) => !n.isRead).map((n) => n._id));
    const previousUnread = serverUnread;
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setServerUnread(0);
    try {
      await partnerApi.markAllNotificationsAsRead();
    } catch (err) {
      console.error(err);
      setItems((prev) => prev.map((n) => (wasUnread.has(n._id) ? { ...n, isRead: false } : n)));
      setServerUnread(previousUnread);
    }
  };

  // Same destination a tap on the push itself would open (e.g. an admin
  // broadcast's chosen screen, a period reminder → tracker). Rows whose
  // destination is this list just get marked read.
  const handlePress = (notif: AppNotification) => {
    if (!notif.isRead) markAsRead(notif._id);
    // An "Update the app" notification opens the Play Store / App Store.
    if (openNotificationStoreLink(notif.data)) return;
    const target = resolveNotificationTarget(
      { ...(notif.data ?? {}), type: notif.type },
      user?.partnerRole === "viewer",
      { joinCall: false },
    );
    // A feature the App CMS has Coming soon / paused opens its sheet instead.
    if (target !== NOTIFICATIONS_LIST_ROUTE && !guardRoute(target)) {
      router.push(target as Parameters<typeof router.push>[0]);
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
            <TouchableOpacity
              onPress={markAllAsRead}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`Mark all ${unreadCount} as read`}
            >
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>Mark all read</Text>
            </TouchableOpacity>
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
          className="flex-1"
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />
          }
        >
          {list.length === 0 ? (
            <View className="items-center justify-center px-10" style={{ paddingTop: 120 }}>
              <View
                className="items-center justify-center mb-5"
                style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight }}
              >
                <Ionicons name="notifications-outline" size={28} color={colors.primary} />
              </View>
              <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700", fontFamily: fonts.heading, textAlign: "center" }}>
                All quiet for now
              </Text>
              <Text style={{ color: colors.mutedText, fontSize: 13.5, lineHeight: 20, marginTop: 6, fontFamily: fonts.body, textAlign: "center" }}>
                Gentle reminders about your cycle and updates from Nura will appear here.
              </Text>
            </View>
          ) : (
            <>
              {groupByDay(list).map((group, gi) => (
                <View key={`${group.label}-${gi}`}>
                  <Text
                    accessibilityRole="header"
                    style={{
                      color: colors.mutedText,
                      fontSize: 13,
                      fontWeight: "600",
                      fontFamily: fonts.body,
                      paddingHorizontal: 20,
                      paddingTop: 20,
                      paddingBottom: 4,
                    }}
                  >
                    {group.label}
                  </Text>
                  {group.items.map((notif, i) => (
                    <NotificationRow key={notif._id} notif={notif} last={i === group.items.length - 1} onPress={handlePress} />
                  ))}
                </View>
              ))}
              <View className="px-6 mt-2">
                <LoadMoreButton hasMore={hasMore} loading={loadingMore} onPress={loadMore} />
              </View>
            </>
          )}
        </ScrollView>
      </LoadingErrorState>
    </SafeAreaView>
  );
}

const ICON_SIZE = 38;
const SIDE = 20;
const GAP = 12;

/**
 * One notification: open, full-width row on the page background (no card),
 * soft round icon, one-line title with the time, up to two lines of message
 * and, for admin "banner" pushes, a chevron beside the time that opens the
 * image under the text (collapsed by default). Unread is
 * a quiet dot and a slightly stronger title rather than a coloured block.
 */
function NotificationRow({
  notif,
  last,
  onPress,
}: {
  notif: AppNotification;
  last: boolean;
  onPress: (n: AppNotification) => void;
}) {
  const { colors, fonts } = useTheme();
  const { icon, color } = notificationIcon(notif);
  const image = notificationImage(notif);
  const unread = !notif.isRead;
  // Banner images start collapsed so the list stays compact.
  const [expanded, setExpanded] = useState(false);

  const toggleImage = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={() => onPress(notif)}
      accessibilityRole="button"
      accessibilityLabel={[unread ? "Unread" : null, notif.title, notif.body, timeAgo(notifDate(notif))].filter(Boolean).join(". ")}
      style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: SIDE, paddingVertical: 12, gap: GAP }}
    >
      <View>
        <View
          style={{
            width: ICON_SIZE,
            height: ICON_SIZE,
            borderRadius: ICON_SIZE / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${color}1A`,
          }}
        >
          <Ionicons name={icon} size={18} color={color} />
        </View>
        {unread ? (
          <View
            style={{
              position: "absolute",
              top: -1,
              right: -1,
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: colors.primary,
              borderWidth: 2,
              borderColor: colors.background,
            }}
          />
        ) : null}
      </View>

      <View style={{ flex: 1, minHeight: ICON_SIZE, justifyContent: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: colors.foreground,
              fontSize: 14.5,
              fontWeight: unread ? "700" : "500",
              fontFamily: fonts.body,
            }}
          >
            {notif.title}
          </Text>
          {image ? (
            // Its own touchable, so toggling doesn't open the notification.
            <TouchableOpacity
              onPress={toggleImage}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={expanded ? "Hide image" : "Show image"}
              style={{ alignSelf: "center" }}
            >
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.primary} />
            </TouchableOpacity>
          ) : null}
          <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, opacity: 0.8 }}>{timeAgo(notifDate(notif))}</Text>
        </View>
        {notif.body ? (
          <Text
            numberOfLines={2}
            style={{ color: colors.mutedText, fontSize: 13.5, lineHeight: 19, marginTop: 2, fontFamily: fonts.body, opacity: unread ? 1 : 0.85 }}
          >
            {notif.body}
          </Text>
        ) : null}
        {image ? (
          expanded ? (
            <Image
              source={{ uri: image }}
              accessibilityIgnoresInvertColors
              resizeMode="cover"
              style={{ width: "100%", aspectRatio: 2, borderRadius: 12, marginTop: 8, backgroundColor: colors.surfaceSoft }}
            />
          ) : null
        ) : null}
      </View>

      {/* Soft divider, starting under the text so the icons read as one column. */}
      {!last ? (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: SIDE + ICON_SIZE + GAP,
            right: SIDE,
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.border,
          }}
        />
      ) : null}
    </TouchableOpacity>
  );
}
