import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Platform,
  RefreshControl,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItem,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { CommentsSheet } from "../../components/reels/CommentsSheet";
import { ReelPage, type ReelPageActions } from "../../components/reels/ReelPage";
import { CreatorSheet, FeedPicker, PollSheet } from "../../components/reels/ReelSheets";
import { SkeletonBlock } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { alert } from "../../lib/alert";
import { getFriendlyErrorMessage, isNetworkError, reelsApi, type Reel as ApiReel } from "../../lib/api";
import { useContentWidth } from "../../lib/layout";
import {
  appendUnique,
  applyLiked,
  applySaved,
  mapApiReel,
  REELS_PAGE_SIZE,
  shouldPrefetch,
  updateReel,
  withPinnedFirst,
  type ReelItem,
} from "../../lib/reels";
import { shareWithAppLink } from "../../lib/share";
import { Icon } from "../../components/Icon";

const MUTE_KEY = "period-buddy.reels.muted";
const SKELETON_TINT = { backgroundColor: "rgba(255,255,255,0.14)" };
const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

type LoadError = { message: string; offline: boolean };

function hasMore(pagination: { page: number; pages: number }) {
  return pagination.page < pagination.pages;
}

/**
 * Reels: a full-screen vertical pager (Instagram-style). Only the reel on
 * screen plays; the ones before and after it get paused players so swiping
 * either way is instant, and every other reel is just its thumbnail. A reel
 * that ends moves on to the next one (the last one, or one with comments or
 * the poll sheet open, loops). Playback pauses when
 * the screen loses focus, the app goes to the background or the creator
 * sheet covers it. Components live in components/reels/, pure logic in
 * lib/reels.ts.
 */
export default function Reels() {
  const { colors, fonts } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const width = useContentWidth();
  // "reels?reelId=..." deep link (Share on a reel, or a reel card in blogs.tsx):
  // that reel is fetched and pinned first. `openedAt` (app/_layout.tsx) makes
  // the same link tapped twice count as new.
  const { reelId: deepLinkedReelId, openedAt: deepLinkOpenedAt } = useLocalSearchParams<{
    reelId?: string;
    openedAt?: string;
  }>();
  const handledDeepLinkKeyRef = useRef<string | null>(null);

  const [pageHeight, setPageHeight] = useState(0);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [feed, setFeed] = useState("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Browsers block autoplay with sound, so web always starts muted.
  const [muted, setMuted] = useState(Platform.OS === "web");
  const [soundHint, setSoundHint] = useState(Platform.OS === "web");
  const [focused, setFocused] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const [followingCreatorIds, setFollowingCreatorIds] = useState<Set<string>>(new Set());
  const [creator, setCreator] = useState<ReelItem | null>(null);
  const [pollReelId, setPollReelId] = useState<string | null>(null);
  const [commentsReelId, setCommentsReelId] = useState<string | null>(null);

  const listRef = useRef<FlatList<ReelItem>>(null);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const reelsRef = useRef(reels);
  reelsRef.current = reels;
  const pageRef = useRef(1);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const requestRef = useRef(0);
  const likeSeqRef = useRef(new Map<string, number>());
  const saveSeqRef = useRef(new Map<string, number>());
  const viewedRef = useRef(new Set<string>());

  // --- playback gates -------------------------------------------------------
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setAppActive(state === "active"));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    AsyncStorage.getItem(MUTE_KEY)
      .then((value) => {
        if (value !== null) setMuted(value === "1");
      })
      .catch(() => {});
  }, []);

  const playbackAllowed = focused && appActive && !creator;

  // --- loading ---------------------------------------------------------------
  const fetchPage = useCallback(
    (page: number) =>
      feed === "saved"
        ? reelsApi.getSaved({ page, limit: REELS_PAGE_SIZE })
        : reelsApi.getReels({ page, limit: REELS_PAGE_SIZE, category: feed === "all" ? undefined : feed }),
    [feed],
  );

  const rememberFollows = useCallback((apiReels: ApiReel[]) => {
    setFollowingCreatorIds((current) => {
      const next = new Set(current);
      let changed = false;
      for (const reel of apiReels) {
        if (reel.followedByMe === undefined) continue;
        const had = next.has(reel.creatorId);
        if (reel.followedByMe && !had) {
          next.add(reel.creatorId);
          changed = true;
        } else if (!reel.followedByMe && had) {
          next.delete(reel.creatorId);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);

  const loadFirst = useCallback(
    async (mode: "initial" | "refresh") => {
      const request = ++requestRef.current;
      if (mode === "refresh") setRefreshing(true);
      else setInitialLoading(true);
      setLoadMoreFailed(false);

      const deepLinkKey = deepLinkedReelId ? `${deepLinkedReelId}|${deepLinkOpenedAt ?? ""}` : null;
      const wantsLinkedReel = Boolean(deepLinkKey) && feed === "all" && handledDeepLinkKeyRef.current !== deepLinkKey;

      try {
        const [response, linked] = await Promise.all([
          fetchPage(1),
          wantsLinkedReel ? reelsApi.getReelById(String(deepLinkedReelId)).catch(() => null) : Promise.resolve(null),
        ]);
        if (request !== requestRef.current) return;
        if (wantsLinkedReel) {
          handledDeepLinkKeyRef.current = deepLinkKey;
          if (!linked) alert("Couldn't open that video", "It may have been removed.");
        }

        const items = withPinnedFirst(response.reels.map(mapApiReel), linked ? mapApiReel(linked) : null);
        rememberFollows(linked ? [linked, ...response.reels] : response.reels);
        if (feed === "all") {
          setCategories(Array.from(new Set(response.reels.map((reel) => reel.category).filter(Boolean))));
        }
        pageRef.current = 1;
        hasMoreRef.current = hasMore(response.pagination);
        viewedRef.current.clear();
        setReels(items);
        setLoadError(null);
        setActiveIndex(0);
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      } catch (err) {
        if (request !== requestRef.current) return;
        if (mode === "refresh" && reelsRef.current.length > 0) {
          alert("Couldn't refresh", getFriendlyErrorMessage(err));
        } else {
          setReels([]);
          setLoadError({ message: getFriendlyErrorMessage(err), offline: isNetworkError(err) });
        }
      } finally {
        if (request === requestRef.current) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    },
    [deepLinkOpenedAt, deepLinkedReelId, feed, fetchPage, rememberFollows],
  );

  useEffect(() => {
    void loadFirst("initial");
  }, [loadFirst]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const request = requestRef.current;
    try {
      const nextPage = pageRef.current + 1;
      const response = await fetchPage(nextPage);
      if (request !== requestRef.current) return;
      pageRef.current = nextPage;
      hasMoreRef.current = hasMore(response.pagination);
      rememberFollows(response.reels);
      setReels((current) => appendUnique(current, response.reels.map(mapApiReel)));
      setLoadMoreFailed(false);
    } catch {
      if (request === requestRef.current) setLoadMoreFailed(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [fetchPage, rememberFollows]);

  // Prefetch a few reels before the end (onEndReached also covers fast flings).
  useEffect(() => {
    if (!loadMoreFailed && shouldPrefetch(activeIndex, reels.length)) void loadMore();
  }, [activeIndex, loadMore, loadMoreFailed, reels.length]);

  // --- pager -------------------------------------------------------------------
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((token) => token.isViewable && token.index != null);
    if (first?.index != null) setActiveIndex(first.index);
  }).current;

  const scrollToReel = useCallback((id: string) => {
    const index = reelsRef.current.findIndex((reel) => reel.id === id);
    if (index < 0) return;
    listRef.current?.scrollToIndex({ index, animated: false });
    setActiveIndex(index);
  }, []);

  // --- actions (stable, read the latest state through refs) -------------------
  const setLike = useCallback(async (id: string, liked: boolean) => {
    const current = reelsRef.current.find((reel) => reel.id === id);
    if (!current || current.isLiked === liked) return;
    const before = { isLiked: current.isLiked, likeCount: current.likeCount };
    const seq = (likeSeqRef.current.get(id) ?? 0) + 1;
    likeSeqRef.current.set(id, seq);
    setReels((list) => updateReel(list, id, (reel) => applyLiked(reel, liked)));
    try {
      const result = await reelsApi.setLike(id, liked);
      if (likeSeqRef.current.get(id) !== seq) return;
      setReels((list) =>
        updateReel(list, id, (reel) =>
          reel.isLiked === result.liked && reel.likeCount === result.likeCount
            ? reel
            : { ...reel, isLiked: result.liked, likeCount: result.likeCount },
        ),
      );
    } catch {
      // Roll back only if no newer tap superseded this one.
      if (likeSeqRef.current.get(id) !== seq) return;
      setReels((list) => updateReel(list, id, (reel) => ({ ...reel, ...before })));
    }
  }, []);

  const setSaved = useCallback(async (id: string, saved: boolean) => {
    const current = reelsRef.current.find((reel) => reel.id === id);
    if (!current || current.isSaved === saved) return;
    const before = { isSaved: current.isSaved, saveCount: current.saveCount };
    const seq = (saveSeqRef.current.get(id) ?? 0) + 1;
    saveSeqRef.current.set(id, seq);
    setReels((list) => updateReel(list, id, (reel) => applySaved(reel, saved)));
    try {
      const result = await reelsApi.setSaved(id, saved);
      if (saveSeqRef.current.get(id) !== seq) return;
      setReels((list) =>
        updateReel(list, id, (reel) =>
          reel.isSaved === result.saved && reel.saveCount === result.saveCount
            ? reel
            : { ...reel, isSaved: result.saved, saveCount: result.saveCount },
        ),
      );
    } catch (err) {
      if (saveSeqRef.current.get(id) !== seq) return;
      setReels((list) => updateReel(list, id, (reel) => ({ ...reel, ...before })));
      alert(saved ? "Couldn't save" : "Couldn't remove from saved", getFriendlyErrorMessage(err));
    }
  }, []);

  const toggleFollow = useCallback(
    async (id: string, creatorId: string) => {
      const wasFollowing = followingCreatorIds.has(creatorId);
      setFollowingCreatorIds((prev) => {
        const next = new Set(prev);
        if (wasFollowing) next.delete(creatorId);
        else next.add(creatorId);
        return next;
      });
      try {
        const result = await reelsApi.toggleFollowCreator(id);
        setFollowingCreatorIds((prev) => {
          if (prev.has(creatorId) === result.followedByMe) return prev;
          const next = new Set(prev);
          if (result.followedByMe) next.add(creatorId);
          else next.delete(creatorId);
          return next;
        });
      } catch (err) {
        // Put the button back the way it was, so the tap can be tried again.
        setFollowingCreatorIds((prev) => {
          if (prev.has(creatorId) === wasFollowing) return prev;
          const next = new Set(prev);
          if (wasFollowing) next.add(creatorId);
          else next.delete(creatorId);
          return next;
        });
        alert(wasFollowing ? "Couldn't unfollow" : "Couldn't follow", getFriendlyErrorMessage(err));
      }
    },
    [followingCreatorIds],
  );
  const toggleFollowRef = useRef(toggleFollow);
  toggleFollowRef.current = toggleFollow;

  const share = useCallback(async (reel: ReelItem) => {
    try {
      await shareWithAppLink(`Watch "${reel.title}" by ${reel.creatorName} on Nura.`, `reels?reelId=${encodeURIComponent(reel.id)}`);
    } catch {
      alert("Error", "Unable to open the share sheet right now.");
    }
  }, []);

  const recordView = useCallback(async (id: string) => {
    if (viewedRef.current.has(id)) return;
    viewedRef.current.add(id);
    try {
      const result = await reelsApi.recordView(id);
      const viewCount = result.viewCount ?? result.views;
      if (typeof viewCount === "number") {
        setReels((list) => updateReel(list, id, (reel) => (reel.viewCount === viewCount ? reel : { ...reel, viewCount })));
      }
    } catch {
      // Playback doesn't depend on view tracking; allow a retry next time.
      viewedRef.current.delete(id);
    }
  }, []);

  const vote = useCallback(
    async (reelId: string, optionId: string) => {
      const current = reelsRef.current.find((reel) => reel.id === reelId);
      if (!current || current.votedOptionId) return;
      const before = { votedOptionId: current.votedOptionId, pollOptions: current.pollOptions };
      setReels((list) =>
        updateReel(list, reelId, (reel) => ({
          ...reel,
          votedOptionId: optionId,
          pollOptions: reel.pollOptions.map((option) => (option.id === optionId ? { ...option, votes: option.votes + 1 } : option)),
        })),
      );
      try {
        const result = await reelsApi.votePoll(reelId, optionId);
        setReels((list) =>
          updateReel(list, reelId, (reel) => ({
            ...reel,
            votedOptionId: optionId,
            pollOptions: result.pollOptions.map((option) => ({ id: option.optionId, topic: option.topic, votes: option.votes })),
          })),
        );
      } catch (err) {
        // Undo, so the vote isn't stuck as "done" and can be cast again.
        setReels((list) => updateReel(list, reelId, (reel) => ({ ...reel, ...before })));
        alert("Couldn't save your vote", getFriendlyErrorMessage(err));
      }
    },
    [],
  );

  // A reel that played to the end moves on to the next one.
  const advanceFrom = useCallback((id: string) => {
    const index = reelsRef.current.findIndex((reel) => reel.id === id);
    if (index < 0 || index !== activeIndexRef.current || index >= reelsRef.current.length - 1) return;
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    setActiveIndex(index + 1);
  }, []);

  const toggleMute = useCallback(() => {
    setSoundHint(false);
    setMuted((value) => {
      const next = !value;
      AsyncStorage.setItem(MUTE_KEY, next ? "1" : "0").catch(() => {});
      return next;
    });
  }, []);

  const actions = useMemo<ReelPageActions>(
    () => ({
      onToggleMute: toggleMute,
      onSetLike: (id, liked) => void setLike(id, liked),
      onSetSaved: (id, saved) => void setSaved(id, saved),
      onShare: (reel) => void share(reel),
      onOpenComments: setCommentsReelId,
      onFollow: (id, creatorId) => void toggleFollowRef.current(id, creatorId),
      onOpenCreator: setCreator,
      onOpenPoll: setPollReelId,
      onVote: (id, optionId) => void vote(id, optionId),
      onViewed: (id) => void recordView(id),
      onEnded: advanceFrom,
    }),
    [advanceFrom, recordView, setLike, setSaved, share, toggleMute, vote],
  );

  const handleCommentCount = useCallback((id: string, count: number) => {
    setReels((list) => updateReel(list, id, (reel) => (reel.commentCount === count ? reel : { ...reel, commentCount: count })));
  }, []);

  // Loop instead of advancing while comments or the poll sheet is open.
  const autoAdvance = !commentsReelId && !pollReelId;

  const renderItem = useCallback<ListRenderItem<ReelItem>>(
    ({ item, index }) => (
      <ReelPage
        reel={item}
        width={width}
        height={pageHeight}
        isActive={index === activeIndex}
        isPreload={index === activeIndex + 1 || index === activeIndex - 1}
        playbackAllowed={playbackAllowed}
        autoAdvance={autoAdvance && index < reels.length - 1}
        muted={muted}
        following={followingCreatorIds.has(item.creatorId)}
        topInset={insets.top}
        bottomInset={insets.bottom}
        actions={actions}
      />
    ),
    [
      actions,
      activeIndex,
      autoAdvance,
      followingCreatorIds,
      insets.bottom,
      insets.top,
      muted,
      pageHeight,
      playbackAllowed,
      reels.length,
      width,
    ],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<ReelItem> | null | undefined, index: number) => ({ length: pageHeight, offset: pageHeight * index, index }),
    [pageHeight],
  );

  const pollReel = pollReelId ? (reels.find((reel) => reel.id === pollReelId) ?? null) : null;
  const commentsReel = commentsReelId ? reels.find((reel) => reel.id === commentsReelId) : undefined;
  const feedLabel = feed === "all" ? "For You" : feed === "saved" ? "Saved" : feed;

  // --- render ------------------------------------------------------------------
  let body: React.ReactNode;
  if (initialLoading && reels.length === 0) {
    // Reel-shaped skeleton (caption bottom-left, action rail right) for the dark player.
    body = (
      <View className="flex-1 flex-row items-end px-5" style={{ paddingBottom: insets.bottom + 28 }}>
        <View className="flex-1 pr-6" style={{ gap: 12 }}>
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <SkeletonBlock width={40} height={40} radius={20} style={SKELETON_TINT} />
            <SkeletonBlock width={120} height={14} style={SKELETON_TINT} />
          </View>
          <SkeletonBlock width="90%" height={16} style={SKELETON_TINT} />
          <SkeletonBlock width="65%" height={12} style={SKELETON_TINT} />
        </View>
        <View className="items-center" style={{ gap: 20 }}>
          {[0, 1, 2, 3].map((key) => (
            <SkeletonBlock key={key} width={40} height={40} radius={20} style={SKELETON_TINT} />
          ))}
        </View>
      </View>
    );
  } else if (reels.length === 0) {
    body = (
      <View className="flex-1 justify-center px-6">
        <View className="rounded-3xl" style={{ backgroundColor: colors.surface }}>
          {loadError ? (
            <EmptyState
              compact
              icon={loadError.offline ? "wifi-off" : "alert-circle-outline"}
              title={loadError.offline ? "You're offline" : "Couldn't load reels"}
              message={loadError.message}
              actionLabel="Try again"
              onAction={() => void loadFirst("initial")}
            />
          ) : feed === "saved" ? (
            <EmptyState
              compact
              icon="bookmark-outline"
              title="No saved reels yet"
              message="Tap the bookmark on any reel to keep it here."
              actionLabel="Browse reels"
              onAction={() => setFeed("all")}
            />
          ) : (
            <EmptyState
              compact
              icon="movie-open-outline"
              title="No reels here yet"
              message="New videos from our experts will show up here."
              actionLabel={feed === "all" ? "Refresh" : "Show all reels"}
              onAction={() => (feed === "all" ? void loadFirst("initial") : setFeed("all"))}
            />
          )}
        </View>
      </View>
    );
  } else if (pageHeight > 0) {
    body = (
      <FlatList
        ref={listRef}
        data={reels}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        pagingEnabled
        snapToInterval={pageHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        // Android only: on iOS clipping can blank a video surface mid-swipe.
        removeClippedSubviews={Platform.OS === "android"}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY}
        onEndReached={() => {
          if (!loadMoreFailed) void loadMore();
        }}
        onEndReachedThreshold={2}
        onScrollToIndexFailed={({ index }) => listRef.current?.scrollToOffset({ offset: index * pageHeight, animated: false })}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadFirst("refresh")}
            tintColor="white"
            colors={[colors.primary]}
            progressViewOffset={insets.top + 48}
          />
        }
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }} onLayout={(event) => setPageHeight(Math.round(event.nativeEvent.layout.height))}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" />
      {body}

      {/* Top bar, drawn once over the pager. */}
      <View
        pointerEvents="box-none"
        className="absolute left-0 right-0 flex-row items-center px-4"
        style={{ top: insets.top + 6, gap: 12 }}
      >
        <TouchableOpacity
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="h-10 w-10 items-center justify-center rounded-full bg-black/30"
          onPress={() => router.back()}
        >
          <Icon set="feather" name="arrow-left" size={20} color="white" />
        </TouchableOpacity>
        <Text className="flex-1 text-xl font-extrabold text-white" style={{ fontFamily: fonts.heading }}>
          Reels
        </Text>
        <TouchableOpacity
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel={`Showing ${feedLabel}. Change what's shown`}
          onPress={() => setPickerOpen(true)}
          className="flex-row items-center rounded-full bg-black/30 px-3 py-1.5"
          style={{ gap: 4, maxWidth: 170 }}
        >
          <Text numberOfLines={1} className="text-[13px] font-bold text-white" style={{ flexShrink: 1, fontFamily: fonts.body }}>
            {feedLabel}
          </Text>
          <Icon set="feather" name="chevron-down" size={14} color="white" />
        </TouchableOpacity>
      </View>

      {soundHint && muted && reels.length > 0 ? (
        <View
          pointerEvents="none"
          className="absolute self-center flex-row items-center rounded-full bg-black/55 px-4 py-2"
          style={{ top: insets.top + 60, gap: 6 }}
        >
          <Icon set="feather" name="volume-x" size={14} color="white" />
          <Text className="text-[13px] font-bold text-white" style={{ fontFamily: fonts.body }}>
            Tap for sound
          </Text>
        </View>
      ) : null}

      {loadingMore ? (
        <View pointerEvents="none" className="absolute self-center rounded-full bg-black/50 px-4 py-2" style={{ bottom: insets.bottom + 90 }}>
          <ActivityIndicator color="white" />
        </View>
      ) : loadMoreFailed && activeIndex >= reels.length - 1 && reels.length > 0 ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Couldn't load more reels. Try again"
          onPress={() => {
            setLoadMoreFailed(false);
            void loadMore();
          }}
          className="absolute self-center flex-row items-center rounded-full bg-black/60 px-4 py-2"
          style={{ top: insets.top + 60, gap: 6 }}
        >
          <Icon set="feather" name="refresh-cw" size={14} color="white" />
          <Text className="text-[13px] font-bold text-white" style={{ fontFamily: fonts.body }}>
            Couldn&apos;t load more · Try again
          </Text>
        </TouchableOpacity>
      ) : null}

      <CommentsSheet
        reelId={commentsReelId}
        initialCount={commentsReel?.commentCount ?? 0}
        onClose={() => setCommentsReelId(null)}
        onCountChange={handleCommentCount}
      />
      <PollSheet reel={pollReel} onVote={vote} onClose={() => setPollReelId(null)} />
      <CreatorSheet
        creator={creator}
        reels={reels}
        following={creator ? followingCreatorIds.has(creator.creatorId) : false}
        onToggleFollow={(reel) => void toggleFollow(reel.id, reel.creatorId)}
        onPlayReel={(id) => {
          setCreator(null);
          scrollToReel(id);
        }}
        onClose={() => setCreator(null)}
      />
      <FeedPicker
        visible={pickerOpen}
        value={feed}
        categories={categories}
        onSelect={(value) => {
          setPickerOpen(false);
          setFeed(value);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}
