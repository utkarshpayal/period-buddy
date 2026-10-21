import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Platform, RefreshControl, StatusBar, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import { useAuth } from "../../components/auth-context";
import OptionsModal from "../../components/OptionsModal";
import { useTheme } from "../../components/theme";
import { useCommunityFeed } from "../../hooks/useCommunityFeed";
import { useCommunityRealtime } from "../../hooks/useCommunityRealtime";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { alert } from "../../lib/alert";
import { communityApi, getFriendlyErrorMessage } from "../../lib/api";
import { sameCommunityTag } from "../../lib/communityTags";
import { CommunityCommentsSheet } from "../community/CommentsSheet";
import { CommunityHeader } from "../community/CommunityHeader";
import { ComposePostSheet } from "../community/ComposePostSheet";
import { mapCommunityPost } from "../community/mapCommunityPost";
import { PostRow, PostSeparator, postKeyExtractor } from "../community/PostRow";
import type { Comment, Post } from "../community/types";
import { EmptyState } from "../EmptyState";
import { LoadMoreButton } from "../LoadMoreButton";
import { SkeletonPostList } from "../Skeleton";
import { PaywallModal } from "../subscription/PaywallModal";
import { Icon } from "../Icon";
import Animated from "react-native-reanimated";
import { listEntering } from "../motion";
import { haptics } from "../../lib/haptics";
import { getGlow } from "../ui-tokens";

// How long the paywall's slide-down takes before compose may present: iOS
// can't present one Modal while another is still dismissing.
const PAYWALL_DISMISS_MS = 500;

function withComments(post: Post, comments: Comment[], commentsCount: number): Post {
  return { ...post, comments, commentsCount };
}

// Shared between the owner dashboard (app/(app)/(dashboard)/community.tsx)
// and the partner view (app/(app)/(partner-view)/forum.tsx) — both
// route files just re-export this so the community forum looks and behaves
// identically for both roles instead of drifting into two implementations.
export default function CommunityScreen() {
  const { colors, isDark } = useTheme();
  const { token, user } = useAuth();
  // Partners are read-only viewers of the account owner's data — they can
  // browse the community for support/knowledge, but shouldn't be able to
  // post threads or replies under the owner's connected account.
  const canPost = user?.partnerRole !== "viewer";
  // `openedAt` is stamped by the deep-link handler in app/_layout.tsx so the
  // same shared link tapped twice re-opens the post even though this tab
  // stays mounted (postId alone wouldn't change).
  const { postId: deepLinkedPostId, openedAt: deepLinkOpenedAt } = useLocalSearchParams<{
    postId?: string;
    openedAt?: string;
  }>();

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  // Set by tapping a post's #tag; filters the feed alongside the category.
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const feed = useCommunityFeed({ category: activeCategory, tag: activeTag, search });
  const { posts, setPosts, likedPostIds, setLikedPostIds } = feed;

  const [optionsVisible, setOptionsVisible] = useState(false);
  const [createPostVisible, setCreatePostVisible] = useState(false);
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const { hasAccess, refresh: refreshSubscriptionAccess } = useSubscriptionAccess();

  // The post the options menu or comments sheet is about.
  const [activePost, setActivePost] = useState<Post | null>(null);
  const activePostIdRef = useRef<string | null>(null);
  const [isCommentsLoading, setIsCommentsLoading] = useState(false);
  const [unreadCommentPostIds, setUnreadCommentPostIds] = useState<Set<string>>(new Set());
  // Tracks polls a vote is in flight for, so options can't be double-tapped.
  const [votingPollIds, setVotingPollIds] = useState<Set<string>>(new Set());
  const votingRef = useRef(new Set<string>());
  // Like is a server-side toggle, so a second tap while one is in flight
  // could land out of order and leave the heart out of step with the server.
  const likingRef = useRef(new Set<string>());
  // Read through a ref so toggleLike (a memoized row's prop) stays stable.
  const likedIdsRef = useRef(likedPostIds);
  likedIdsRef.current = likedPostIds;
  // Long post bodies are capped; the reader can expand them in place.
  const [expandedPostIds, setExpandedPostIds] = useState<Set<string>>(new Set());
  const composeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { reportPost, sharePost, savedPosts, reportedPosts, toggleSavedPost } =
    useAppState();

  useEffect(
    () => () => {
      if (composeTimerRef.current) clearTimeout(composeTimerRef.current);
    },
    [],
  );

  function showActivePost(post: Post | null) {
    activePostIdRef.current = post?.id ?? null;
    setActivePost(post);
  }

  // Changes one post in the feed and, if it's open, in the sheet too.
  const updatePost = useCallback(
    (postId: string, change: (post: Post) => Post) => {
      setPosts((current) => current.map((p) => (p.id === postId ? change(p) : p)));
      setActivePost((prev) => (prev && prev.id === postId ? change(prev) : prev));
    },
    [setPosts],
  );

  // Read by the realtime handler, which is subscribed once.
  const filtersRef = useRef({ activeCategory, activeTag, search });
  filtersRef.current = { activeCategory, activeTag, search };

  useCommunityRealtime({
    enabled: Boolean(token && user?._id),
    userId: user?._id,
    onPost: (post) => {
      const filters = filtersRef.current;
      // Only show a live post in the feed it belongs to; searches are
      // matched server-side, so a live post never joins search results.
      if (filters.search.trim()) return;
      if (filters.activeCategory && post.category !== filters.activeCategory) return;
      if (filters.activeTag && !post.tags.some((t) => sameCommunityTag(t, filters.activeTag!)))
        return;
      setPosts((current) => (current.some((p) => p.id === post.id) ? current : [post, ...current]));
    },
    onComment: (postId, comment) => {
      updatePost(postId, (item) =>
        item.comments.some((c) => c.id === comment.id)
          ? item
          : withComments(item, [...item.comments, comment], item.commentsCount + 1),
      );
      if (activePostIdRef.current !== postId) {
        setUnreadCommentPostIds((prev) => new Set(prev).add(postId));
      }
    },
  });

  // --- Comments sheet ---

  // `loaded` = the post came from getPostById, so it already has every
  // comment. Feed posts only carry a count (plus any realtime comments), so
  // their thread is always fetched.
  const openCommentsSheet = useCallback(
    async (post: Post, loaded = false) => {
      showActivePost(post);
      setCommentsModalVisible(true);
      setUnreadCommentPostIds((prev) => {
        if (!prev.has(post.id)) return prev;
        const next = new Set(prev);
        next.delete(post.id);
        return next;
      });
      if (loaded) return;
      setIsCommentsLoading(true);
      try {
        const full = mapCommunityPost(await communityApi.getPostById(post.id));
        if (activePostIdRef.current !== post.id) return;
        setActivePost((current) =>
          current && current.id === full.id
            ? withComments(current, full.comments, full.commentsCount)
            : current,
        );
      } catch {
        // The sheet shows what it has; reopening it tries again.
      } finally {
        if (activePostIdRef.current === post.id) setIsCommentsLoading(false);
      }
    },
    [],
  );

  function closeCommentsSheet() {
    setCommentsModalVisible(false);
    setIsCommentsLoading(false);
    showActivePost(null);
  }

  const handleReplied = useCallback(
    (postId: string, comment: Comment, commentsCount: number) => {
      updatePost(postId, (item) => withComments(item, [...item.comments, comment], commentsCount));
    },
    [updatePost],
  );

  const handleDeleteComment = useCallback(
    (postId: string, commentId: string) => {
      const performDelete = async () => {
        updatePost(postId, (item) =>
          withComments(
            item,
            item.comments.filter((c) => c.id !== commentId),
            Math.max(0, item.commentsCount - 1),
          ),
        );
        try {
          await communityApi.deleteComment(postId, commentId);
        } catch {
          alert("Couldn't delete comment", "Please check your connection and try again.");
          // Resync just this post (comments + count) in place, instead of
          // refetching page 1 of the feed, which would collapse loaded pages.
          try {
            const fresh = mapCommunityPost(await communityApi.getPostById(postId));
            updatePost(postId, (item) => withComments(item, fresh.comments, fresh.commentsCount));
          } catch {
            // Best-effort resync; local state stays as-is until next reload.
          }
        }
      };
      alert("Delete Comment", "Remove this comment permanently?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: performDelete },
      ]);
    },
    [updatePost],
  );

  // Opens straight to the shared post when the app was launched via a
  // "community?postId=..." deep link (see shareCommunityPost below).
  useEffect(() => {
    if (!deepLinkedPostId) return;
    let isMounted = true;
    communityApi
      .getPostById(deepLinkedPostId)
      .then((post) => {
        if (isMounted) void openCommentsSheet(mapCommunityPost(post), true);
      })
      .catch(() => {
        if (isMounted) alert("Couldn't open that post", "It may have been removed.");
      });
    return () => {
      isMounted = false;
    };
  }, [deepLinkedPostId, deepLinkOpenedAt, openCommentsSheet]);

  // --- Post actions ---

  const openOptions = useCallback((post: Post) => {
    showActivePost(post);
    setOptionsVisible(true);
  }, []);

  function closeOptions() {
    setOptionsVisible(false);
    showActivePost(null);
  }

  const toggleLike = useCallback(
    async (post: Post) => {
      if (likingRef.current.has(post.id)) return;
      likingRef.current.add(post.id);
      haptics.tap();
      const wasLiked = likedIdsRef.current.has(post.id);
      const setLiked = (liked: boolean) =>
        setLikedPostIds((current) => {
          const next = new Set(current);
          if (liked) next.add(post.id);
          else next.delete(post.id);
          return next;
        });
      const setLikes = (likes: number) =>
        setPosts((current) => current.map((item) => (item.id === post.id ? { ...item, likes } : item)));

      setLiked(!wasLiked);
      setLikes(Math.max(0, post.likes + (wasLiked ? -1 : 1)));
      try {
        const result = await communityApi.toggleLike(post.id);
        setLiked(result.likedByMe);
        setLikes(result.likes);
      } catch {
        setLiked(wasLiked);
        setLikes(post.likes);
      } finally {
        likingRef.current.delete(post.id);
      }
    },
    [setLikedPostIds, setPosts],
  );

  // Cast a vote on a post's poll, then show the server's counts.
  const handleVotePoll = useCallback(
    async (post: Post, optionIds: string[]) => {
      if (
        !canPost || // partner viewers are read-only here too, see PostPollView's readOnly
        !post.poll ||
        post.poll.myVote.length > 0 ||
        optionIds.length === 0 ||
        votingRef.current.has(post.id)
      )
        return;
      haptics.tap();
      votingRef.current.add(post.id);
      setVotingPollIds((current) => new Set(current).add(post.id));
      try {
        const { poll } = await communityApi.votePoll(post.id, optionIds);
        setPosts((current) =>
          current.map((item) => (item.id === post.id ? { ...item, poll } : item)),
        );
      } catch (error) {
        alert("Couldn't record your vote", getFriendlyErrorMessage(error));
      } finally {
        votingRef.current.delete(post.id);
        setVotingPollIds((current) => {
          const next = new Set(current);
          next.delete(post.id);
          return next;
        });
      }
    },
    [canPost, setPosts],
  );

  const shareCommunityPost = useCallback(
    async (post: Post) => {
      await sharePost(`${post.author}: ${post.content}`, `community?postId=${post.id}`);
    },
    [sharePost],
  );

  async function saveActivePost() {
    if (!activePost) return;
    const postId = activePost.id;
    const wasSaved = savedPosts.has(postId);
    closeOptions();
    toggleSavedPost(postId);
    try {
      const result = await communityApi.toggleSave(postId);
      // The endpoint toggles; if the server ended up elsewhere (an earlier
      // save from another device), follow it.
      if (result.savedByMe === wasSaved) toggleSavedPost(postId);
    } catch (error) {
      toggleSavedPost(postId);
      alert(wasSaved ? "Couldn't unsave the post" : "Couldn't save the post", getFriendlyErrorMessage(error));
    }
  }

  // Marked reported only once the server has it: for a safety feature the
  // badge must never claim moderators were told when they weren't.
  async function reportActivePost() {
    if (!activePost) return;
    const postId = activePost.id;
    try {
      await communityApi.report(postId, "Reported from mobile app");
      reportPost(postId);
      closeOptions();
    } catch (error) {
      alert("Couldn't send the report", getFriendlyErrorMessage(error));
    }
  }

  function handleDeletePost() {
    if (!activePost) return;
    const postId = activePost.id;
    closeOptions();
    alert("Delete this post?", "This permanently removes the post from the community feed.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => confirmDeletePost(postId) },
    ]);
  }

  async function confirmDeletePost(postId: string) {
    const index = posts.findIndex((p) => p.id === postId);
    const removed = posts[index];
    setPosts((current) => current.filter((p) => p.id !== postId));
    try {
      await communityApi.deletePost(postId);
    } catch {
      alert("Couldn't delete post", "Please check your connection and try again.");
      // Put it back where it was rather than reloading the whole feed.
      if (removed) {
        setPosts((current) => {
          if (current.some((p) => p.id === postId)) return current;
          const next = [...current];
          next.splice(Math.min(index, next.length), 0, removed);
          return next;
        });
      }
    }
  }

  const handlePublished = useCallback(
    (post: Post) => {
      setPosts((current) => [post, ...current]);
    },
    [setPosts],
  );

  async function refreshFeed() {
    const ok = await feed.refresh();
    if (!ok) alert("Couldn't refresh", "Check your connection and try again.");
  }

  const toggleExpandedPost = useCallback(
    (postId: string) =>
      setExpandedPostIds((prev) => {
        const next = new Set(prev);
        if (next.has(postId)) next.delete(postId);
        else next.add(postId);
        return next;
      }),
    [],
  );

  const renderPost = useCallback(
    ({ item: post, index }: { item: Post; index: number }) => (
      // First screenful fades up on load; rows scrolled into view later just appear.
      <Animated.View entering={index < 8 ? listEntering(index) : undefined}>
        <PostRow
          post={post}
          isFirst={index === 0}
          isLiked={likedPostIds.has(post.id)}
          isSaved={savedPosts.has(post.id)}
          isReported={reportedPosts.has(post.id)}
          isExpanded={expandedPostIds.has(post.id)}
          isVoting={votingPollIds.has(post.id)}
          hasUnreadComments={unreadCommentPostIds.has(post.id)}
          activeTag={post.tags.length > 0 ? activeTag : null}
          readOnly={!canPost}
          onOpenOptions={openOptions}
          onToggleLike={toggleLike}
          onOpenComments={openCommentsSheet}
          onShare={shareCommunityPost}
          onToggleExpanded={toggleExpandedPost}
          onTagPress={setActiveTag}
          onVote={handleVotePoll}
        />
      </Animated.View>
    ),
    [
      likedPostIds,
      savedPosts,
      reportedPosts,
      expandedPostIds,
      votingPollIds,
      unreadCommentPostIds,
      activeTag,
      canPost,
      openOptions,
      toggleLike,
      openCommentsSheet,
      shareCommunityPost,
      toggleExpandedPost,
      handleVotePoll,
    ],
  );

  const showList = !feed.isLoading && !feed.error;

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-1 relative">
          <FlatList
            data={showList ? posts : []}
            keyExtractor={postKeyExtractor}
            renderItem={renderPost}
            ItemSeparatorComponent={PostSeparator}
            // Post cards are tall (media, polls), so a small first batch and
            // window keep mount cost and memory down on budget phones.
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={7}
            // Android only: on iOS this can blank rows mid-scroll.
            removeClippedSubviews={Platform.OS === "android"}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1, backgroundColor: colors.background }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 140 }}
            onEndReached={() => {
              if (!feed.loadMoreFailed) void feed.loadMore();
            }}
            onEndReachedThreshold={0.5}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={feed.isRefreshing}
                onRefresh={refreshFeed}
                tintColor={colors.primary}
              />
            }
            ListFooterComponent={
              showList && posts.length > 0 ? (
                <View className="py-4">
                  <LoadMoreButton
                    hasMore={feed.isLoadingMore || feed.loadMoreFailed}
                    loading={feed.isLoadingMore}
                    onPress={() => void feed.loadMore()}
                    label="Couldn't load more · Try again"
                  />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View className="mt-6">
                {feed.isLoading ? (
                  // Post-shaped skeletons while the feed loads.
                  <SkeletonPostList count={5} />
                ) : feed.error ? (
                  <EmptyState
                    compact
                    icon="cloud-off-outline"
                    title="Could not load posts"
                    message="Check your connection and try again."
                    actionLabel="Retry"
                    onAction={() => void feed.reload()}
                  />
                ) : (
                  <EmptyState
                    compact
                    icon="chat-outline"
                    title="No anonymous posts yet"
                    message="Start the first thread when you are ready to share."
                  />
                )}
              </View>
            }
            ListHeaderComponent={
              <CommunityHeader
                search={search}
                onSearch={setSearch}
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
                activeTag={activeTag}
                onClearTag={() => setActiveTag(null)}
              />
            }
          />

          {/* New post (owners only, see canPost) */}
          {canPost && (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {
                if (!hasAccess("community_posting")) {
                  setPaywallVisible(true);
                  return;
                }
                setCreatePostVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Create a new post"
              className="absolute bottom-28 right-6 w-14 h-14 rounded-full items-center justify-center"
              style={{
                backgroundColor: colors.primary,
                ...getGlow(colors.primary, isDark, "strong"),
              }}
            >
              <Icon set="ion" name="add" size={26} color={colors.buttonText} />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        featureKey="community_posting"
        onUnlocked={() => {
          refreshSubscriptionAccess();
          // Wait for the paywall to finish sliding away before presenting.
          if (composeTimerRef.current) clearTimeout(composeTimerRef.current);
          composeTimerRef.current = setTimeout(() => setCreatePostVisible(true), PAYWALL_DISMISS_MS);
        }}
      />

      <ComposePostSheet
        visible={createPostVisible}
        onClose={() => setCreatePostVisible(false)}
        onPublished={handlePublished}
        onLocked={() => setPaywallVisible(true)}
      />

      <CommunityCommentsSheet
        visible={commentsModalVisible}
        post={commentsModalVisible ? activePost : null}
        isLoading={isCommentsLoading}
        canPost={canPost}
        onClose={closeCommentsSheet}
        onDeleteComment={handleDeleteComment}
        onReplied={handleReplied}
      />

      <OptionsModal
        visible={optionsVisible}
        onClose={closeOptions}
        onShare={async () => {
          if (activePost) await shareCommunityPost(activePost);
          closeOptions();
        }}
        onSave={saveActivePost}
        onReport={reportActivePost}
        onDelete={activePost?.isOwner ? handleDeletePost : undefined}
        isSaved={activePost ? savedPosts.has(activePost.id) : false}
        isReported={activePost ? reportedPosts.has(activePost.id) : false}
      />
    </>
  );
}
