import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import { EmptyState } from "../../components/EmptyState";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { LoadMoreButton } from "../../components/LoadMoreButton";
import { SkeletonCardList } from "../../components/Skeleton";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useTheme } from "../../components/theme";
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import { alert } from "../../lib/alert";
import { formatShortDate } from "../../lib/format";
import {
  getFriendlyErrorMessage,
  schemeApplicationsApi,
  type SchemeApplication,
  type SchemeApplicationStatus,
} from "../../lib/api";
import {
  APPLICATION_STATUS_META,
  STATUS_TINT_TO_COLOR_KEY,
  applicationDisplayName,
  schemeSlugOf,
} from "../../lib/schemeHelpers";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { Icon } from "../../components/Icon";

const PAGE_SIZE = 20;

export default function SchemeApplications() {
  useSecureScreen("scheme-applications");
  const { colors, fonts, isDark } = useTheme();
  const router = useRouter();
  const softTints = getSoftTints(colors);

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // A refresh (an application saved from a scheme screen, or this screen's
  // own withdraw) re-fetches the pages already shown instead of collapsing
  // the list back to page 1, and a stale "Load more" is dropped.
  const {
    items: applications,
    setItems: setApplications,
    loading,
    refreshing,
    error,
    offline,
    hasMore,
    loadingMore,
    loadMore: handleLoadMore,
    reload: load,
  } = usePaginatedList(
    async (page) => {
      const res = await schemeApplicationsApi.list({ page, limit: PAGE_SIZE });
      return { items: res.applications, hasMore: res.pagination.page < res.pagination.pages };
    },
    [],
    { refreshOn: ["schemeApplications"] },
  );

  // Users can only withdraw their own application — approval/decline is an
  // admin action handled in the admin portal, never self-served here.
  const withdraw = useCallback(async (app: SchemeApplication) => {
    setUpdatingId(app._id);
    try {
      const res = await schemeApplicationsApi.update(app._id, {
        status: "withdrawn",
      });
      setApplications((prev) =>
        prev.map((a) => (a._id === app._id ? res.application : a)),
      );
    } catch (err) {
      alert("Couldn't withdraw", getFriendlyErrorMessage(err));
    } finally {
      setUpdatingId(null);
    }
  }, [setApplications]);

  const confirmWithdraw = useCallback(
    (app: SchemeApplication) => {
      alert(
        "Withdraw application?",
        `${applicationDisplayName(app)} will be marked as withdrawn. You can't undo this.`,
        [
          { text: "Withdraw", style: "destructive", onPress: () => withdraw(app) },
          { text: "Cancel", style: "cancel" },
        ],
      );
    },
    [withdraw],
  );

  // Terminal states can't be withdrawn.
  const canWithdraw = (status: SchemeApplicationStatus) =>
    status === "draft" || status === "submitted" || status === "in_review";

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScreenHeader title="My applications" subtitle="Schemes you saved to follow up" />
      <LoadingErrorState
        loading={loading}
        error={error}
        offline={offline}
        onRetry={() => load()}
        loadingLabel="Loading applications…"
        skeleton={<SkeletonCardList count={4} style={{ paddingTop: 16 }} />}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={colors.primary}
            />
          }
        >
          {applications.length === 0 ? (
            <EmptyState
              icon="folder-outline"
              title="Nothing saved yet"
              message="Tap “Track this scheme” on any scheme to follow it here."
              actionLabel="Browse schemes"
              onAction={() => router.push("/government-schemes")}
            />
          ) : (
            <>
              {applications.map((app) => {
                const meta = APPLICATION_STATUS_META[app.status];
                const tintColor = colors[STATUS_TINT_TO_COLOR_KEY[meta.tint]];
                const name = applicationDisplayName(app);
                const slug = schemeSlugOf(app);
                const busy = updatingId === app._id;
                const openDetail = () =>
                  slug && router.push(`/government-scheme-detail?id=${slug}`);
                return (
                  <View
                    key={app._id}
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: 24, borderCurve: "continuous",
                      marginBottom: 12,
                      overflow: "hidden",
                      ...getShadow(colors, isDark),
                    }}
                  >
                    {/* The whole top of the card opens the scheme */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      disabled={!slug}
                      onPress={openDetail}
                      accessibilityRole={slug ? "button" : undefined}
                      accessibilityLabel={`${name}. ${meta.label}. ${meta.next}`}
                      accessibilityHint={slug ? "Opens the scheme details" : undefined}
                      style={{ padding: 16, paddingBottom: canWithdraw(app.status) ? 12 : 16 }}
                    >
                      <View className="flex-row items-start" style={{ gap: 12 }}>
                        <View
                          className="items-center justify-center"
                          style={{ width: 42, height: 42, borderRadius: 14, borderCurve: "continuous", backgroundColor: softTints.pink }}
                        >
                          <Icon set="ion"
                            name="document-attach-outline"
                            size={19}
                            color={colors.primaryDark}
                          />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            numberOfLines={2}
                            style={{ flexShrink: 1, fontSize: 15, lineHeight: 21, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}
                          >
                            {name}
                          </Text>
                          <Text
                            maxFontSizeMultiplier={1.4}
                            style={{ marginTop: 2, fontSize: 13, fontWeight: "400", color: colors.mutedText, fontFamily: fonts.body }}
                          >
                            Saved {formatShortDate(app.createdAt)}
                          </Text>
                        </View>
                        {slug ? (
                          <Icon set="feather" name="chevron-right" size={18} color={colors.mutedText} style={{ marginTop: 2 }} />
                        ) : null}
                      </View>

                      {/* Status + what happens next */}
                      <View
                        className="flex-row items-center self-start"
                        style={{ marginTop: 12, gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: softTints[meta.tint] }}
                      >
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tintColor }} />
                        <Text
                          numberOfLines={1}
                          maxFontSizeMultiplier={1.3}
                          style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}
                        >
                          {meta.label}
                        </Text>
                      </View>
                      <Text
                        style={{ marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: "400", color: colors.foreground, fontFamily: fonts.body }}
                      >
                        {meta.next}
                      </Text>
                      {app.reviewNote ? (
                        <Text
                          numberOfLines={4}
                          style={{ marginTop: 6, fontSize: 13, lineHeight: 18, fontWeight: "400", color: colors.mutedText, fontFamily: fonts.body }}
                        >
                          Note: {app.reviewNote}
                        </Text>
                      ) : null}
                    </TouchableOpacity>

                    {canWithdraw(app.status) ? (
                      <View
                        className="flex-row justify-end"
                        style={{ borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: 8 }}
                      >
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => confirmWithdraw(app)}
                          disabled={busy}
                          accessibilityRole="button"
                          accessibilityLabel={`Withdraw ${name}`}
                          accessibilityState={{ disabled: busy, busy }}
                          className="flex-row items-center justify-center"
                          style={{ minHeight: 44, paddingHorizontal: 12, gap: 6 }}
                        >
                          {busy ? (
                            <ActivityIndicator size="small" color={colors.danger} />
                          ) : (
                            <>
                              <Icon set="ion"
                                name="close-circle-outline"
                                size={18}
                                color={colors.danger}
                              />
                              <Text
                                maxFontSizeMultiplier={1.3}
                                style={{ fontSize: 14, fontWeight: "700", color: colors.danger, fontFamily: fonts.body }}
                              >
                                Withdraw
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })}

              <LoadMoreButton hasMore={hasMore} loading={loadingMore} onPress={handleLoadMore} />
            </>
          )}
        </ScrollView>
      </LoadingErrorState>
    </SafeAreaView>
  );
}
