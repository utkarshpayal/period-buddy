import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { Loader } from "../../components/Loader";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useTheme } from "../../components/theme";
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { LockedFeatureCard } from "../../components/subscription/LockedFeatureCard";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import {
  getFriendlyErrorMessage,
  isNetworkError,
  schemesApi,
  type GovernmentBenefit,
  type GovernmentLevel,
  type SchemeCategoryMeta,
} from "../../lib/api";
import { SCHEME_ACTION_LABELS } from "../../lib/schemeHelpers";

// Government Schemes is a whole-screen premium feature — an admin can price
// it as locked, in which case browsing the list itself (not just applying)
// requires access. Reuses the same 'government_scheme_applications' key the
// detail screen already gates the apply action on, so no separate admin
// pricing entry is needed.
const SCHEMES_FEATURE_KEY = "government_scheme_applications";

const LEVEL_FILTERS: { key: "all" | GovernmentLevel; label: string }[] = [
  { key: "all", label: "All" },
  { key: "central", label: "Central" },
  { key: "state", label: "Rajasthan" },
];

function SchemeCard({ scheme }: { scheme: GovernmentBenefit }) {
  const { colors, fonts, isDark } = useTheme();
  const router = useRouter();
  const softTints = getSoftTints(colors);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() =>
        router.push(`/government-scheme-detail?id=${scheme.slug}`)
      }
      className="rounded-2xl p-4 mb-3"
      style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
    >
      <View className="flex-row items-start">
        <View
          className="p-2.5 rounded-xl mr-3"
          style={{ backgroundColor: softTints.pink }}
        >
          <Ionicons name="ribbon-outline" size={20} color={colors.primary} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center flex-wrap gap-1.5 mb-1">
            <View
              className="px-2 py-0.5 rounded-full"
              style={{ backgroundColor: softTints.lavender }}
            >
              <Text
                className="text-[10px] font-bold"
                style={{ color: colors.accentText, fontFamily: fonts.body }}
              >
                {scheme.governmentLevel === "central"
                  ? "Central"
                  : scheme.state || "State"}
              </Text>
            </View>
            {scheme.shortName ? (
              <View
                className="px-2 py-0.5 rounded-full"
                style={{ backgroundColor: softTints.amber }}
              >
                <Text
                  className="text-[10px] font-bold"
                  style={{ color: colors.warning, fontFamily: fonts.mono }}
                >
                  {scheme.shortName}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            className="text-sm font-bold"
            style={{ color: colors.foreground, fontFamily: fonts.heading }}
          >
            {scheme.name}
          </Text>
          <Text
            numberOfLines={2}
            className="text-xs mt-1"
            style={{ color: colors.mutedText, fontFamily: fonts.body }}
          >
            {scheme.description}
          </Text>
          <View className="flex-row items-center mt-2">
            <Text
              className="text-[11px] font-bold"
              style={{ color: colors.primary, fontFamily: fonts.body }}
            >
              {SCHEME_ACTION_LABELS[scheme.actionType] || "View"}
            </Text>
            <Feather
              name="chevron-right"
              size={14}
              color={colors.primary}
              style={{ marginLeft: 2 }}
            />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function GovernmentSchemes() {
  const { colors, fonts, isDark } = useTheme();
  const router = useRouter();
  const softTints = getSoftTints(colors);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [level, setLevel] = useState<"all" | GovernmentLevel>("all");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const [categories, setCategories] = useState<SchemeCategoryMeta[]>([]);
  const [recommended, setRecommended] = useState<GovernmentBenefit[]>([]);
  const [schemes, setSchemes] = useState<GovernmentBenefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const [paywallVisible, setPaywallVisible] = useState(false);
  const { hasAccess, isLoading: subscriptionLoading, refresh: refreshSubscriptionAccess } = useSubscriptionAccess();
  const locked = !subscriptionLoading && !hasAccess(SCHEMES_FEATURE_KEY);

  // Show the paywall the moment it's clear the user can't browse schemes at
  // all — don't wait for them to tap into a scheme first.
  useEffect(() => {
    if (locked) setPaywallVisible(true);
  }, [locked]);

  // Page-based pagination with a "Load More" button (mirrors blogs.tsx).
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Build the current filter payload for a given page.
  const listParams = useCallback(
    (targetPage: number) => ({
      search: debouncedSearch || undefined,
      category: activeCategory || undefined,
      state: level === "state" ? "Rajasthan" : undefined,
      governmentLevel: level === "central" ? ("central" as GovernmentLevel) : undefined,
      page: targetPage,
      limit: PAGE_SIZE,
    }),
    [debouncedSearch, activeCategory, level],
  );

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        setOffline(false);

        // Categories + recommended only need loading once (no active filters).
        const shouldLoadMeta = categories.length === 0 || isRefresh;
        const [listRes, catRes, recRes] = await Promise.all([
          schemesApi.list(listParams(1)),
          shouldLoadMeta ? schemesApi.getCategories() : Promise.resolve(null),
          shouldLoadMeta ? schemesApi.getRecommended() : Promise.resolve(null),
        ]);

        setSchemes(listRes.schemes);
        setPage(1);
        setHasMore(listRes.pagination.page < listRes.pagination.pages);
        if (catRes) setCategories(catRes.categories);
        if (recRes) setRecommended(recRes.schemes);
      } catch (err) {
        setError(getFriendlyErrorMessage(err));
        setOffline(isNetworkError(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listParams],
  );

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await schemesApi.list(listParams(nextPage));
      setSchemes((prev) => [...prev, ...res.schemes]);
      setPage(nextPage);
      setHasMore(res.pagination.page < res.pagination.pages);
    } catch {
      // Keep the button so the user can retry; don't wipe the list.
      setHasMore(true);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, listParams]);

  useEffect(() => {
    if (locked) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, activeCategory, level, locked]);

  const hasFilters = Boolean(debouncedSearch || activeCategory || level !== "all");
  const showRecommended = recommended.length > 0 && !hasFilters;

  // Avoid showing the same scheme in both "Recommended" and "All Schemes".
  const displaySchemes = useMemo(() => {
    if (!showRecommended) return schemes;
    const recommendedIds = new Set(recommended.map((s) => s._id));
    return schemes.filter((s) => !recommendedIds.has(s._id));
  }, [schemes, recommended, showRecommended]);

  const headerRight = useMemo(
    () => (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push("/scheme-applications")}
        className="px-3 py-1.5 rounded-full flex-row items-center"
        style={{ backgroundColor: softTints.pink }}
      >
        <Ionicons name="folder-open-outline" size={14} color={colors.primary} />
        <Text
          className="text-[11px] font-bold ml-1"
          style={{ color: colors.primary, fontFamily: fonts.body }}
        >
          My Applications
        </Text>
      </TouchableOpacity>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors, softTints],
  );

  if (subscriptionLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Govt. Schemes" />
        <Loader fullscreen />
      </SafeAreaView>
    );
  }

  if (locked) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Govt. Schemes" />
        <View className="flex-1 items-center justify-center px-6">
          <LockedFeatureCard
            title="Government Schemes & Benefits"
            description="Unlock access to browse and apply for women's reproductive & menstrual health schemes."
            onPress={() => setPaywallVisible(true)}
          />
        </View>
        <PaywallModal
          visible={paywallVisible}
          onClose={() => setPaywallVisible(false)}
          featureKey={SCHEMES_FEATURE_KEY}
          onUnlocked={refreshSubscriptionAccess}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScreenHeader title="Govt. Schemes" right={headerRight} />

      {/* Search box */}
      <View className="px-6 mt-4">
        <View
          className="flex-row items-center rounded-2xl px-3.5 h-12"
          style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
        >
          <Ionicons name="search-outline" size={18} color={colors.mutedText} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search schemes (e.g. PMMVY, maternity)"
            placeholderTextColor={colors.mutedText}
            className="flex-1 ml-2 text-sm"
            style={{ color: colors.foreground, fontFamily: fonts.body }}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={colors.mutedText} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Central / Rajasthan filters */}
      <View className="flex-row px-6 mt-3 gap-2">
        {LEVEL_FILTERS.map((f) => {
          const active = level === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              activeOpacity={0.8}
              onPress={() => setLevel(f.key)}
              className="px-4 py-2 rounded-full"
              style={{
                backgroundColor: active ? colors.primary : colors.surface,
                ...getShadow(colors, isDark),
              }}
            >
              <Text
                className="text-xs font-bold"
                style={{
                  color: active ? "#fff" : colors.mutedText,
                  fontFamily: fonts.body,
                }}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Category filter chips */}
      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3 max-h-10"
          contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
        >
          {categories.map((cat) => {
            const active = activeCategory === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                activeOpacity={0.8}
                onPress={() =>
                  setActiveCategory(active ? null : cat.key)
                }
                className="flex-row items-center px-3 py-1.5 rounded-full self-start"
                style={{
                  backgroundColor: active ? colors.accent : colors.surface,
                  ...getShadow(colors, isDark),
                }}
              >
                <Ionicons
                  name={cat.icon as never}
                  size={13}
                  color={active ? "#fff" : colors.mutedText}
                />
                <Text
                  className="text-[11px] font-bold ml-1"
                  style={{
                    color: active ? "#fff" : colors.mutedText,
                    fontFamily: fonts.body,
                  }}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      <LoadingErrorState
        loading={loading}
        error={error}
        offline={offline}
        onRetry={() => load()}
        loadingLabel="Loading schemes…"
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
          {showRecommended ? (
            <View className="mb-5">
              <Text
                className="text-sm font-black mb-2"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                ✨ Recommended for You
              </Text>
              {recommended.map((s) => (
                <SchemeCard key={`rec-${s._id}`} scheme={s} />
              ))}
            </View>
          ) : null}

          <Text
            className="text-sm font-black mb-2"
            style={{ color: colors.foreground, fontFamily: fonts.heading }}
          >
            {hasFilters ? "Results" : "All Schemes"}
          </Text>

          {schemes.length === 0 ? (
            <EmptyState
              icon="file-search-outline"
              title="No schemes found"
              message="Try a different search or clear the filters."
              actionLabel={hasFilters ? "Clear filters" : undefined}
              onAction={
                hasFilters
                  ? () => {
                      setSearch("");
                      setActiveCategory(null);
                      setLevel("all");
                    }
                  : undefined
              }
            />
          ) : (
            <>
              {displaySchemes.map((s) => <SchemeCard key={s._id} scheme={s} />)}
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
