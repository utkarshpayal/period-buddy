import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { ListGroup, ListRow } from "../../components/ListGroup";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { LoadMoreButton } from "../../components/LoadMoreButton";
import { HeaderIconButton, ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonList } from "../../components/Skeleton";
import { SupportStatusPill } from "../../components/SupportStatusPill";
import { SupportTicketSheet } from "../../components/SupportTicketSheet";
import { useTheme } from "../../components/theme";
import { getSoftTints } from "../../components/ui-tokens";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import { hasMorePages, supportApi, type SupportTicketSummary } from "../../lib/api";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { SUPPORT_CATEGORIES, ticketTimeLabel } from "../../lib/support";

type Filter = "all" | "active" | "resolved" | "closed";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Open" },
  { id: "resolved", label: "Resolved" },
  { id: "closed", label: "Closed" },
];

/**
 * My tickets (Profile → Help & support → My tickets). `?id=<ticket>` (a
 * support reply's push) opens that ticket on top of this list.
 */
export default function SupportTicketsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors, fonts, isDark } = useTheme();
  const tints = getSoftTints(colors);
  const [filter, setFilter] = useState<Filter>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  useSecureScreen("support-tickets");

  // A push / notification row lands here with ?id=: open the thread once.
  const openedId = useRef<string | null>(null);
  useEffect(() => {
    if (!id || openedId.current === id) return;
    openedId.current = id;
    router.push({ pathname: "/support-ticket", params: { id } });
  }, [id, router]);

  const { items, loading, refreshing, error, offline, reload, hasMore, loadingMore, loadMore } =
    usePaginatedList<SupportTicketSummary>(
      async (page) => {
        const res = await supportApi.listTickets({
          page,
          limit: 20,
          status: filter === "all" ? undefined : filter,
        });
        return { items: res.tickets, hasMore: hasMorePages(res.pagination) };
      },
      [filter],
      { refreshOn: ["support", "notifications"] },
    );

  const categoryIcon = (category: string) =>
    (SUPPORT_CATEGORIES.find((c) => c.id === category)?.icon ?? "chatbubble-ellipses-outline") as React.ComponentProps<
      typeof ListRow
    >["icon"];

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <ScreenHeader
        title="My tickets"
        subtitle="Your requests to Nura support"
        right={<HeaderIconButton icon="add" accessibilityLabel="New request" onPress={() => setSheetOpen(true)} />}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 8, gap: 8 }}
      >
        {FILTERS.map((f) => {
          const selected = filter === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              onPress={() => setFilter(f.id)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className="rounded-full px-4 justify-center"
              style={{
                height: 36,
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.primaryLight : colors.surface,
              }}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                style={{ color: selected ? colors.primary : colors.foreground, fontSize: 13.5, fontWeight: "700", fontFamily: fonts.body }}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <LoadingErrorState
        loading={loading}
        error={error}
        offline={offline}
        onRetry={() => reload()}
        loadingLabel="Loading your tickets..."
        skeleton={<SkeletonList count={4} style={{ paddingTop: 12 }} />}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />}
        >
          {items.length === 0 ? (
            <EmptyState
              icon="lifebuoy"
              title={filter === "all" ? "No requests yet" : "Nothing here"}
              message={
                filter === "all"
                  ? "If something isn't working or you have a question, our team is here to help."
                  : "No tickets with this status."
              }
              actionLabel={filter === "all" ? "Contact support" : undefined}
              onAction={filter === "all" ? () => setSheetOpen(true) : undefined}
            />
          ) : (
            <>
              <ListGroup>
                {items.map((t) => (
                  <ListRow
                    key={t._id}
                    icon={categoryIcon(t.category)}
                    iconColor={colors.info}
                    iconBg={tints.blue}
                    title={t.subject}
                    description={`${t.ticketNumber} · ${t.unread ? "New reply · " : ""}${ticketTimeLabel(t.lastActivityAt)}`}
                    accessibilityLabel={`${t.subject}, ${t.ticketNumber}, ${t.status.replace("_", " ")}${t.unread ? ", new reply" : ""}`}
                    titleAccessory={<SupportStatusPill status={t.status} />}
                    iconAccessory={
                      t.unread ? (
                        <View
                          style={{
                            position: "absolute",
                            top: -2,
                            right: -2,
                            width: 12,
                            height: 12,
                            borderRadius: 6,
                            backgroundColor: colors.primary,
                            borderWidth: 2,
                            borderColor: colors.surface,
                          }}
                        />
                      ) : undefined
                    }
                    onPress={() => router.push({ pathname: "/support-ticket", params: { id: t._id } })}
                  />
                ))}
              </ListGroup>
              <LoadMoreButton hasMore={hasMore} loading={loadingMore} onPress={loadMore} />
            </>
          )}
        </ScrollView>
      </LoadingErrorState>

      <SupportTicketSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onOpenTickets={() => undefined} />
    </SafeAreaView>
  );
}
