import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { SkeletonCardList } from "../../components/Skeleton";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useTheme } from "../../components/theme";
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import { alert } from "../../lib/alert";
import { formatShortDate } from "../../lib/format";
import {
  getFriendlyErrorMessage,
  isNetworkError,
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

const PAGE_SIZE = 20;

export default function SchemeApplications() {
  const { colors, fonts, isDark } = useTheme();
  const router = useRouter();
  const softTints = getSoftTints(colors);

  const [applications, setApplications] = useState<SchemeApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setOffline(false);
      const res = await schemeApplicationsApi.list({ page: 1, limit: PAGE_SIZE });
      setApplications(res.applications);
      setPage(1);
      setHasMore(res.pagination.page < res.pagination.pages);
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
      setOffline(isNetworkError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await schemeApplicationsApi.list({
        page: nextPage,
        limit: PAGE_SIZE,
      });
      setApplications((prev) => [...prev, ...res.applications]);
      setPage(nextPage);
      setHasMore(res.pagination.page < res.pagination.pages);
    } catch {
      setHasMore(true);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page]);

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
  }, []);

  const confirmWithdraw = useCallback(
    (app: SchemeApplication) => {
      alert(
        "Withdraw application?",
        `${applicationDisplayName(app)} will be marked as withdrawn. You can’t undo this.`,
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
      <ScreenHeader title="My Applications" />
      <LoadingErrorState
        loading={loading}
        error={error}
        offline={offline}
        onRetry={() => load()}
        loadingLabel="Loading applications…"
        skeleton={<SkeletonCardList count={4} style={{ paddingTop: 16 }} />}
      >
        <ScrollView
          className="flex-1 mt-4"
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
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
              title="No applications yet"
              message="When you save or start an application for a scheme, it will show up here so you can track it."
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
                return (
                  <View
                    key={app._id}
                    className="rounded-2xl p-4 mb-3"
                    style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
                  >
                    <View className="flex-row items-center">
                      <View
                        className="p-2.5 rounded-xl mr-3"
                        style={{ backgroundColor: softTints.pink }}
                      >
                        <Ionicons
                          name="document-attach-outline"
                          size={18}
                          color={colors.primary}
                        />
                      </View>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        disabled={!slug}
                        onPress={() =>
                          slug && router.push(`/government-scheme-detail?id=${slug}`)
                        }
                        className="flex-1"
                      >
                        <Text
                          className="text-sm font-bold"
                          style={{ color: colors.foreground, fontFamily: fonts.heading }}
                        >
                          {name}
                        </Text>
                        <Text
                          className="text-[11px] mt-0.5"
                          style={{ color: colors.mutedText, fontFamily: fonts.body }}
                        >
                          Started {formatShortDate(app.createdAt)}
                        </Text>
                      </TouchableOpacity>
                      <View
                        className="px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: `${tintColor}22` }}
                      >
                        <Text
                          className="text-[10px] font-bold"
                          style={{ color: tintColor, fontFamily: fonts.body }}
                        >
                          {meta.label}
                        </Text>
                      </View>
                    </View>

                    {/* Manage row */}
                    <View className="flex-row items-center justify-between mt-3">
                      {slug ? (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => router.push(`/government-scheme-detail?id=${slug}`)}
                          className="flex-row items-center"
                        >
                          <Text
                            className="text-[11px] font-bold"
                            style={{ color: colors.primary, fontFamily: fonts.body }}
                          >
                            View details
                          </Text>
                          <Feather
                            name="chevron-right"
                            size={13}
                            color={colors.primary}
                          />
                        </TouchableOpacity>
                      ) : (
                        <View />
                      )}
                      {canWithdraw(app.status) ? (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => confirmWithdraw(app)}
                          disabled={updatingId === app._id}
                          className="flex-row items-center px-3 py-1.5 rounded-full"
                          style={{ backgroundColor: colors.surfaceSoft ?? colors.surface }}
                        >
                          {updatingId === app._id ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : (
                            <>
                              <Ionicons
                                name="close-circle-outline"
                                size={14}
                                color={colors.danger}
                              />
                              <Text
                                className="text-[11px] font-bold ml-1"
                                style={{ color: colors.danger, fontFamily: fonts.body }}
                              >
                                Withdraw
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      ) : (
                        <View />
                      )}
                    </View>
                  </View>
                );
              })}

              {hasMore ? (
                <View className="w-full items-center mt-2">
                  <TouchableOpacity
                    onPress={handleLoadMore}
                    disabled={loadingMore}
                    activeOpacity={0.8}
                    className="items-center justify-center px-6 py-3 rounded-2xl border"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    {loadingMore ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text
                        className="text-xs font-bold"
                        style={{ color: colors.primary, fontFamily: fonts.body }}
                      >
                        Load More
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </LoadingErrorState>
    </SafeAreaView>
  );
}
