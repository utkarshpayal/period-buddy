import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { LoadMoreButton } from "../../components/LoadMoreButton";
import { SkeletonCardList } from "../../components/Skeleton";
import { HeaderIconButton, ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import { FilterChips, type FilterChipOption } from "../../components/FilterChips";
import { SearchBar } from "../../components/SearchBar";
import { useAuth } from "../../components/auth-context";
import { useTheme } from "../../components/theme";
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
import { fetchQuery, hydrateQuery, peekQuery } from "../../lib/queryCache";
import { SchemeCard } from "../../components/schemes/SchemeCard";
import { Icon } from "../../components/Icon";

// Government Schemes is a whole-screen premium feature — an admin can price
// it as locked, in which case browsing the list itself (not just applying)
// requires access. Reuses the same 'government_scheme_applications' key the
// detail screen already gates the apply action on, so no separate admin
// pricing entry is needed.
const SCHEMES_FEATURE_KEY = "government_scheme_applications";

// Only the first page of the unfiltered list (plus categories) is cached and
// kept on the device, so a revisit or cold start paints at once; later pages
// and filtered/searched lists stay live. The recommended strip is ranked from
// the user's profile, so it is cached in memory only and profile edits mark
// it stale.
type SchemeListResponse = Awaited<ReturnType<typeof schemesApi.list>>;
const SCHEMES_CACHE_KEY = "schemes:list:default:p1";
const SCHEME_CATEGORIES_CACHE_KEY = "schemes:categories";
const SCHEMES_RECOMMENDED_CACHE_KEY = "schemes:recommended";
const SCHEMES_STALE_MS = 5 * 60_000;
const ALL_CATEGORIES = "__all__";

type LevelKey = "all" | GovernmentLevel;

const isIoniconName = (name: string): name is keyof typeof Ionicons.glyphMap =>
  Object.prototype.hasOwnProperty.call(Ionicons.glyphMap, name);

export default function GovernmentSchemes() {
  const { colors, fonts } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  // The state chip filters to the signed-in user's own state; no state on
  // the profile means no state chip (Central + All still work).
  const userState = user?.state?.trim() || "";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [level, setLevel] = useState<LevelKey>("all");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const [categories, setCategories] = useState<SchemeCategoryMeta[]>(
    () => peekQuery<{ categories: SchemeCategoryMeta[] }>(SCHEME_CATEGORIES_CACHE_KEY)?.categories ?? [],
  );
  const [recommended, setRecommended] = useState<GovernmentBenefit[]>(
    () => peekQuery<{ schemes: GovernmentBenefit[] }>(SCHEMES_RECOMMENDED_CACHE_KEY)?.schemes ?? [],
  );
  const [schemes, setSchemes] = useState<GovernmentBenefit[]>(
    () => peekQuery<SchemeListResponse>(SCHEMES_CACHE_KEY)?.schemes ?? [],
  );
  const [loading, setLoading] = useState(() => peekQuery(SCHEMES_CACHE_KEY) === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const [paywallVisible, setPaywallVisible] = useState(false);
  const { hasAccess, isLoading: subscriptionLoading, refresh: refreshSubscriptionAccess } = useSubscriptionAccess();
  const locked = !subscriptionLoading && !hasAccess(SCHEMES_FEATURE_KEY);

  // A locked user sees the locked card first; the paywall opens only when
  // they tap it (not the moment the screen opens).

  // Shown when a quiet revalidation fails and the saved list stays on screen.
  const [showingSaved, setShowingSaved] = useState(false);
  const schemesCountRef = useRef(schemes.length);
  schemesCountRef.current = schemes.length;

  // If the profile's state is cleared, drop the now-hidden state filter.
  useEffect(() => {
    if (!userState && level === "state") setLevel("all");
  }, [userState, level]);

  // Page-based pagination with a "Load More" button (mirrors blogs.tsx).
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(() => {
    const cached = peekQuery<SchemeListResponse>(SCHEMES_CACHE_KEY);
    return cached ? cached.pagination.page < cached.pagination.pages : false;
  });
  const [loadingMore, setLoadingMore] = useState(false);
  // Bumped by every load(): a slow answer for an older search/filter, or a
  // "Load more" that started before the filter changed, is dropped instead of
  // overwriting (or being appended to) the newer list.
  const generationRef = useRef(0);
  const loadingMoreRef = useRef(false);

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
      state: level === "state" && userState ? userState : undefined,
      governmentLevel: level === "central" ? ("central" as GovernmentLevel) : undefined,
      page: targetPage,
      limit: PAGE_SIZE,
    }),
    [debouncedSearch, activeCategory, level, userState],
  );

  const load = useCallback(
    async (isRefresh = false) => {
      const generation = ++generationRef.current;
      const current = () => generation === generationRef.current;
      const isDefaultList = !debouncedSearch && !activeCategory && level === "all";
      let hasCachedList = false;
      try {
        if (isDefaultList && !isRefresh) {
          // Paint the cached (or device-saved) first page, then revalidate quietly.
          const [cachedList, cachedCats, cachedRec] = await Promise.all([
            hydrateQuery<SchemeListResponse>(SCHEMES_CACHE_KEY),
            hydrateQuery<{ categories: SchemeCategoryMeta[] }>(SCHEME_CATEGORIES_CACHE_KEY),
            hydrateQuery<{ schemes: GovernmentBenefit[] }>(SCHEMES_RECOMMENDED_CACHE_KEY),
          ]);
          if (!current()) return;
          if (cachedList) {
            hasCachedList = true;
            setSchemes(cachedList.schemes);
            setPage(1);
            setHasMore(cachedList.pagination.page < cachedList.pagination.pages);
            setLoading(false);
          }
          if (cachedCats) setCategories(cachedCats.categories);
          if (cachedRec) setRecommended(cachedRec.schemes);
        }

        if (isRefresh) setRefreshing(true);
        else if (!hasCachedList) setLoading(true);
        setError(null);
        setOffline(false);
        setShowingSaved(false);

        // Categories + recommended only need loading once (no active filters).
        const shouldLoadMeta = categories.length === 0 || isRefresh || hasCachedList;
        const cacheOptions = { staleMs: SCHEMES_STALE_MS, persist: true, force: isRefresh };
        const [listRes, catRes, recRes] = await Promise.all([
          isDefaultList
            ? fetchQuery(SCHEMES_CACHE_KEY, () => schemesApi.list(listParams(1)), cacheOptions)
            : schemesApi.list(listParams(1)),
          shouldLoadMeta
            ? fetchQuery(SCHEME_CATEGORIES_CACHE_KEY, () => schemesApi.getCategories(), cacheOptions)
            : Promise.resolve(null),
          shouldLoadMeta
            ? fetchQuery(SCHEMES_RECOMMENDED_CACHE_KEY, () => schemesApi.getRecommended(), {
                ...cacheOptions,
                // Per-account (ranked from the profile): memory only, never on the device.
                persist: false,
                topics: ["profile"],
              })
            : Promise.resolve(null),
        ]);
        if (!current()) return;

        setSchemes(listRes.schemes);
        setPage(1);
        setHasMore(listRes.pagination.page < listRes.pagination.pages);
        if (catRes) setCategories(catRes.categories);
        if (recRes) setRecommended(recRes.schemes);
      } catch (err) {
        if (!current()) return;
        // A failed quiet revalidation (or pull-to-refresh over a list that's
        // already showing) keeps that list on screen with a small notice.
        if (hasCachedList || (isRefresh && schemesCountRef.current > 0)) {
          setShowingSaved(true);
        } else {
          setError(getFriendlyErrorMessage(err));
          setOffline(isNetworkError(err));
        }
      } finally {
        if (current()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listParams],
  );

  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    const generation = generationRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await schemesApi.list(listParams(nextPage));
      if (generation !== generationRef.current) return;
      setSchemes((prev) => {
        // Page boundaries shift when schemes are added; skip repeats.
        const seen = new Set(prev.map((s) => s._id));
        return [...prev, ...res.schemes.filter((s) => !seen.has(s._id))];
      });
      setPage(nextPage);
      setHasMore(res.pagination.page < res.pagination.pages);
    } catch {
      // Keep the button so the user can retry; don't wipe the list.
      setHasMore(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, page, listParams]);

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

  // "All schemes" minus the recommended ones can come back empty: hide that
  // section then, unless another page could still fill it.
  const showAllSection = !showRecommended || displaySchemes.length > 0 || hasMore;

  const levelOptions = useMemo<FilterChipOption<LevelKey>[]>(
    () => [
      { key: "all", label: "All" },
      { key: "central", label: "Central" },
      ...(userState ? [{ key: "state" as const, label: userState }] : []),
    ],
    [userState],
  );

  const categoryOptions = useMemo<FilterChipOption<string>[]>(
    () => [
      { key: ALL_CATEGORIES, label: "All topics" },
      ...categories.map((cat) => ({
        key: cat.key,
        label: cat.label,
        icon: isIoniconName(cat.icon) ? cat.icon : undefined,
      })),
    ],
    [categories],
  );

  const clearFilters = () => {
    setSearch("");
    setActiveCategory(null);
    setLevel("all");
  };

  const headerRight = (
    <HeaderIconButton
      icon="folder-open-outline"
      accessibilityLabel="My applications"
      onPress={() => router.push("/scheme-applications")}
    />
  );

  if (subscriptionLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Govt. schemes" />
        <SkeletonCardList count={4} style={{ paddingTop: 16 }} />
      </SafeAreaView>
    );
  }

  if (locked) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Govt. schemes" />
        <View className="flex-1 items-center justify-center px-6">
          <LockedFeatureCard
            title="Government schemes and benefits"
            description="See health schemes you may be able to get, and keep track of them."
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
      <ScreenHeader
        title="Govt. schemes"
        subtitle="Health benefits you may be able to get"
        right={headerRight}
      />

      <View style={{ paddingHorizontal: 24, marginTop: 8 }}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search schemes (e.g. PMMVY, maternity)"
        />
      </View>

      {/* All / Central / the user's own state */}
      <FilterChips
        options={levelOptions}
        value={level}
        onChange={setLevel}
        style={{ marginTop: 12, flexGrow: 0 }}
      />

      {categories.length > 0 ? (
        <FilterChips
          options={categoryOptions}
          value={activeCategory ?? ALL_CATEGORIES}
          onChange={(key) => setActiveCategory(key === ALL_CATEGORIES ? null : key)}
          style={{ marginTop: 8, flexGrow: 0 }}
        />
      ) : null}

      <LoadingErrorState
        loading={loading}
        error={error}
        offline={offline}
        onRetry={() => load()}
        loadingLabel="Loading schemes…"
        skeleton={<SkeletonCardList count={4} style={{ paddingTop: 16 }} />}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={colors.primary}
            />
          }
        >
          {showingSaved ? (
            <View
              className="flex-row items-center"
              style={{ gap: 8, marginBottom: 14, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, borderCurve: "continuous", backgroundColor: colors.surfaceSoft }}
            >
              <Icon set="ion" name="cloud-offline-outline" size={16} color={colors.mutedText} />
              <Text style={{ flex: 1, color: colors.mutedText, fontSize: 13, lineHeight: 18, fontWeight: "400", fontFamily: fonts.body }}>
                Showing saved schemes. Pull down to refresh.
              </Text>
            </View>
          ) : null}

          {showRecommended ? (
            <View style={{ marginBottom: showAllSection ? 28 : 0 }}>
              <SectionHeader title="Recommended for you" subtitle="Based on your profile" />
              {recommended.map((s) => (
                <SchemeCard key={`rec-${s._id}`} scheme={s} />
              ))}
            </View>
          ) : null}

          {schemes.length === 0 ? (
            <EmptyState
              compact
              icon="file-search-outline"
              title="No schemes found"
              message={hasFilters ? "Try a different search or clear the filters." : "Pull down to check again."}
              actionLabel={hasFilters ? "Clear filters" : undefined}
              onAction={hasFilters ? clearFilters : undefined}
            />
          ) : showAllSection ? (
            <>
              <SectionHeader title={hasFilters ? "Results" : "All schemes"} />
              {displaySchemes.map((s) => <SchemeCard key={s._id} scheme={s} />)}
              <LoadMoreButton hasMore={hasMore} loading={loadingMore} onPress={handleLoadMore} />
            </>
          ) : null}
        </ScrollView>
      </LoadingErrorState>
    </SafeAreaView>
  );
}
