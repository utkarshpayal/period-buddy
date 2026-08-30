import { Feather, Ionicons } from "@expo/vector-icons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import { useAuth } from "../../components/auth-context";
import OptionsModal from "../../components/OptionsModal";
import { alert } from "../../lib/alert";
import { showPermissionModal } from "../../lib/modal-host";
import { useTheme } from "../../components/theme";
import { SkeletonPostList, SkeletonRow } from "../../components/Skeleton";
import { getShadow } from "../../components/ui-tokens";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { PaywallModal } from "../subscription/PaywallModal";
import { isFeatureLockedError } from "../../lib/api";
import {
  communityApi,
  getWebSocketUrl,
  uploadApi,
  type CommunityAttachment,
  type CommunityPoll,
  type CommunityPost,
} from "../../lib/api";

// --- BACKEND API LAYER SCHEMAS & INTERFACES ---
type PendingAttachment = {
  uri: string;
  type: "audio" | "image" | "video";
  mimeType: string;
};

interface Comment {
  id: string;
  author: string;
  avatar: string;
  content: string;
  attachment?: CommunityAttachment;
  time: string;
  isOwner: boolean; // true when this comment belongs to the logged-in user
}

interface Post {
  id: string;
  author: string;
  avatar: string;
  content: string;
  attachment?: CommunityAttachment;
  poll?: CommunityPoll;
  category?: string;
  likes: number;
  commentsCount: number;
  comments: Comment[];
  time: string;
  isOwner: boolean; // true when this post belongs to the logged-in user
}

// Matches the filter chips in the design; posts can carry any category
// string, but composing only ever offers these so filtering stays in sync.
const COMMUNITY_CATEGORIES = ["PCOS", "Fitness", "Skin"];
const POLL_MIN_OPTIONS = 2;
const POLL_MAX_OPTIONS = 6;

function mapCommunityPost(post: CommunityPost): Post {
  // Backend resolveAuthor sets isOwn:true on userId when requester is the author
  const isOwner = typeof post.userId === "object" && post.userId?.isOwn === true;

  return {
    id: post.id ?? post._id,
    author: isOwner ? "You" : post.isAnonymous ? "Anonymous member" : "Community member",
    avatar: isOwner ? "✨" : "NU",
    content: post.content,
    attachment: post.attachments?.[0],
    poll: post.poll,
    category: post.category,
    likes: post.likeCount ?? post.likes,
    commentsCount: post.commentCount ?? post.commentsCount ?? post.comments?.length ?? 0,
    time: formatRelativeTime(post.createdAt),
    isOwner,
    comments:
      post.comments?.map((comment) => {
        const isCommentOwner =
          typeof comment.userId === "object" && comment.userId?.isOwn === true;
        return {
          id: comment.id ?? comment._id ?? `comment_${Math.random()}`,
          author: isCommentOwner ? "You" : comment.isAnonymous ? "Anonymous member" : "Community member",
          avatar: isCommentOwner ? "U" : "AU",
          content: comment.content,
          attachment: comment.attachments?.[0],
          time: formatRelativeTime(comment.createdAt),
          isOwner: isCommentOwner,
        };
      }) ?? [],
  };
}

function formatRelativeTime(value?: string) {
  if (!value) return "Just now";
  const diffMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffMinutes < 1440) return `${Math.round(diffMinutes / 60)}h ago`;
  return `${Math.round(diffMinutes / 1440)}d ago`;
}

function PostAttachmentView({ attachment }: { attachment: CommunityAttachment }) {
  const { colors } = useTheme();
  const [fullscreenVisible, setFullscreenVisible] = useState(false);

  if (attachment.type === "image") {
    return (
      <>
        <Pressable onPress={() => setFullscreenVisible(true)}>
          <Image
            source={{ uri: attachment.url }}
            className="mt-4 w-full rounded-2xl"
            style={{ aspectRatio: 4 / 3, backgroundColor: colors.surfaceSoft }}
            resizeMode="cover"
          />
        </Pressable>
        <FullscreenMediaModal
          visible={fullscreenVisible}
          onClose={() => setFullscreenVisible(false)}
          attachment={attachment}
        />
      </>
    );
  }

  if (attachment.type === "video") {
    return <PostVideoAttachment url={attachment.url} attachment={attachment} />;
  }

  return <PostAudioAttachment url={attachment.url} />;
}

// Renders a post's poll. Before voting: tappable options (single-select votes
// immediately; multi-select accumulates a local selection + a Vote button).
// After voting (or when results should show): percentage bars with counts.
function PostPollView({
  poll,
  isVoting,
  onVote,
  readOnly,
}: {
  poll: CommunityPoll;
  isVoting: boolean;
  onVote: (optionIds: string[]) => void;
  // A partner viewer can see community content but, like posting/commenting,
  // shouldn't be able to cast a vote on someone else's poll — only see the
  // current results.
  readOnly?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const [selected, setSelected] = useState<string[]>([]);
  const hasVoted = poll.myVote.length > 0;
  const showResults = hasVoted || readOnly;

  const toggleSelect = (optionId: string) => {
    if (readOnly) return;
    if (poll.allowMultiple) {
      setSelected((current) =>
        current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      );
    } else {
      // Single-select: tap casts the vote right away.
      onVote([optionId]);
    }
  };

  return (
    <View
      className="mt-4 rounded-2xl border p-4"
      style={{ borderColor: colors.border, backgroundColor: colors.surfaceSoft }}
    >
      <View className="flex-row items-center gap-2 mb-3">
        <Ionicons name="stats-chart" size={15} color={colors.primary} />
        <Text
          className="text-[13px] font-bold flex-1"
          style={{ color: colors.foreground, fontFamily: fonts.body }}
        >
          {poll.question?.trim() || "Poll"}
        </Text>
        {poll.allowMultiple ? (
          <Text
            className="text-[9px] font-black uppercase tracking-wide"
            style={{ color: colors.mutedText, fontFamily: fonts.body }}
          >
            Multi
          </Text>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        {poll.options.map((option) => {
          const pct =
            poll.totalVotes > 0 ? Math.round((option.votes / poll.totalVotes) * 100) : 0;
          const isMine = poll.myVote.includes(option.optionId);
          const isSelected = selected.includes(option.optionId);

          if (showResults) {
            return (
              <View
                key={option.optionId}
                className="rounded-xl overflow-hidden border"
                style={{ borderColor: isMine ? colors.primary : colors.border }}
              >
                <View
                  className="absolute top-0 left-0 bottom-0"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: isMine ? colors.primaryLight : colors.surface,
                  }}
                />
                <View className="flex-row items-center justify-between px-3 py-2.5">
                  <View className="flex-row items-center gap-1.5 flex-1">
                    {isMine ? (
                      <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                    ) : null}
                    <Text
                      className="text-[13px] font-semibold"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                      numberOfLines={1}
                    >
                      {option.topic}
                    </Text>
                  </View>
                  <Text
                    className="text-[12px] font-bold"
                    style={{ color: colors.mutedText, fontFamily: fonts.mono }}
                  >
                    {pct}%
                  </Text>
                </View>
              </View>
            );
          }

          return (
            <TouchableOpacity
              key={option.optionId}
              activeOpacity={0.85}
              disabled={isVoting}
              onPress={() => toggleSelect(option.optionId)}
              className="flex-row items-center gap-2 rounded-xl border px-3 py-2.5"
              style={{
                borderColor: isSelected ? colors.primary : colors.border,
                backgroundColor: isSelected ? colors.primaryLight : colors.surface,
              }}
            >
              <Ionicons
                name={
                  poll.allowMultiple
                    ? isSelected
                      ? "checkbox"
                      : "square-outline"
                    : "radio-button-off"
                }
                size={16}
                color={isSelected ? colors.primary : colors.mutedText}
              />
              <Text
                className="text-[13px] font-semibold flex-1"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
                numberOfLines={1}
              >
                {option.topic}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {poll.allowMultiple && !showResults ? (
        <TouchableOpacity
          activeOpacity={0.9}
          disabled={isVoting || selected.length === 0}
          onPress={() => onVote(selected)}
          className="mt-3 rounded-full items-center justify-center py-2.5 flex-row gap-2"
          style={{
            backgroundColor: colors.primary,
            opacity: isVoting || selected.length === 0 ? 0.5 : 1,
          }}
        >
          {isVoting ? <ActivityIndicator size="small" color={colors.buttonText} /> : null}
          <Text
            className="text-xs font-bold"
            style={{ color: colors.buttonText, fontFamily: fonts.body }}
          >
            Vote
          </Text>
        </TouchableOpacity>
      ) : null}

      <Text
        className="mt-3 text-[11px] font-semibold"
        style={{ color: colors.mutedText, fontFamily: fonts.body }}
      >
        {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
        {hasVoted ? " · You voted" : ""}
      </Text>
    </View>
  );
}

function PostVideoAttachment({
  url,
  attachment,
}: {
  url: string;
  attachment: CommunityAttachment;
}) {
  const { colors } = useTheme();
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = false;
  });

  return (
    <>
      <Pressable onPress={() => setFullscreenVisible(true)}>
        <View
          className="mt-4 w-full rounded-2xl overflow-hidden"
          style={{ aspectRatio: 16 / 9, backgroundColor: colors.surfaceSoft }}
        >
          <VideoView
            player={player}
            style={{ height: "100%", width: "100%" }}
            contentFit="cover"
            nativeControls={false}
            pointerEvents="none"
          />
          <View
            pointerEvents="none"
            className="absolute inset-0 items-center justify-center"
          >
            <View className="h-12 w-12 items-center justify-center rounded-full border border-white/50 bg-black/35">
              <Ionicons name="play" size={22} color="white" />
            </View>
          </View>
        </View>
      </Pressable>
      <FullscreenMediaModal
        visible={fullscreenVisible}
        onClose={() => setFullscreenVisible(false)}
        attachment={attachment}
      />
    </>
  );
}

function FullscreenMediaModal({
  attachment,
  onClose,
  visible,
}: {
  attachment: CommunityAttachment;
  onClose: () => void;
  visible: boolean;
}) {
  const player = useVideoPlayer(attachment.type === "video" ? attachment.url : null, (instance) => {
    instance.loop = false;
  });

  useEffect(() => {
    if (attachment.type !== "video") return;
    if (visible) player.play();
    else player.pause();
  }, [visible, player, attachment.type]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "black" }}>
        <TouchableOpacity
          onPress={onClose}
          className="absolute right-5 top-14 z-10 h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={22} color="white" />
        </TouchableOpacity>

        {attachment.type === "image" ? (
          <Image
            source={{ uri: attachment.url }}
            style={{ width: "100%", height: "80%" }}
            resizeMode="contain"
          />
        ) : (
          <VideoView
            player={player}
            style={{ width: "100%", height: "60%" }}
            contentFit="contain"
            nativeControls
          />
        )}
      </View>
    </Modal>
  );
}

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function PostAudioAttachment({ url }: { url: string }) {
  const { colors, fonts } = useTheme();
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const [trackWidth, setTrackWidth] = useState(0);

  const progress = status.duration > 0 ? status.currentTime / status.duration : 0;

  function seekToRatio(ratio: number) {
    const clamped = Math.min(1, Math.max(0, ratio));
    if (status.duration > 0) player.seekTo(clamped * status.duration);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        if (trackWidth > 0) seekToRatio(event.nativeEvent.locationX / trackWidth);
      },
      onPanResponderMove: (event) => {
        if (trackWidth > 0) seekToRatio(event.nativeEvent.locationX / trackWidth);
      },
    }),
  ).current;

  function togglePlayback() {
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish || status.currentTime >= status.duration) player.seekTo(0);
      player.play();
    }
  }

  return (
    <View
      className="mt-4 flex-row items-center gap-3 rounded-2xl px-4 py-3"
      style={{ backgroundColor: colors.surfaceSoft }}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={togglePlayback}
        className="w-9 h-9 rounded-full items-center justify-center"
        style={{ backgroundColor: colors.primary }}
      >
        <Ionicons
          name={status.playing ? "pause" : "play"}
          size={16}
          color={colors.buttonText}
        />
      </TouchableOpacity>

      <View className="flex-1">
        <View
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
          {...panResponder.panHandlers}
          className="h-4 justify-center"
        >
          <View
            className="h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: colors.border }}
          >
            <View
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, Math.max(0, progress * 100))}%`,
                backgroundColor: colors.primary,
              }}
            />
          </View>
          <View
            pointerEvents="none"
            className="absolute h-3 w-3 rounded-full"
            style={{
              left: `${Math.min(100, Math.max(0, progress * 100))}%`,
              marginLeft: -6,
              backgroundColor: colors.primary,
            }}
          />
        </View>
        <View className="flex-row justify-between mt-1">
          <Text
            className="text-[10px] font-bold"
            style={{ color: colors.mutedText, fontFamily: fonts.mono }}
          >
            {formatAudioTime(status.currentTime)}
          </Text>
          <Text
            className="text-[10px] font-bold"
            style={{ color: colors.mutedText, fontFamily: fonts.mono }}
          >
            {formatAudioTime(status.duration)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// Shared between the owner dashboard (app/(app)/(dashboard)/community.tsx)
// and the partner view (app/(app)/(partner-view)/forum.tsx) — both
// route files just re-export this so the community forum looks and behaves
// identically for both roles instead of drifting into two implementations.
export default function CommunityScreen() {
  const { colors, isDark, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  // Partners are read-only viewers of the account owner's data — they can
  // browse the community for support/knowledge, but shouldn't be able to
  // post threads or replies under the owner's connected account.
  const canPost = user?.partnerRole !== "viewer";
  const { postId: deepLinkedPostId } = useLocalSearchParams<{ postId?: string }>();
  const [unreadCommentPostIds, setUnreadCommentPostIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!token || !user?._id) return;

    const userId = user._id;
    let socket: WebSocket | null = null;
    let isDisconnected = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    function connectWS() {
      if (isDisconnected) return;

      getWebSocketUrl()
        .then((wsUrl) => {
          if (isDisconnected) return;

          socket = new WebSocket(wsUrl);

          socket.onopen = () => {
            if (isDisconnected) return;
            console.log("WebSocket connected in community screen");

            // Join community room for real-time posts and comments updates
            socket?.send(
              JSON.stringify({
                type: "join",
                room: "community",
              })
            );
          };

          socket.onmessage = (event) => {
            if (isDisconnected) return;
            try {
              const data = JSON.parse(event.data);
              if (data.type === "community_notification") {
                if (data.notificationType === "post") {
                  if (data.senderId !== userId) {
                    setPosts((current) => {
                      const alreadyExists = current.some((p) => p.id === (data.post.id ?? data.post._id));
                      if (alreadyExists) return current;
                      return [mapCommunityPost(data.post), ...current];
                    });
                  }
                } else if (data.notificationType === "comment") {
                  const { postId, comment, senderId } = data;
                  if (!postId || !comment) return;

                  // Ignore comment notifications sent by ourselves since they are handled locally and synced via HTTP
                  if (senderId === userId) return;

                  const isCommentOwner = senderId === userId;
                  const syncedComment: Comment = {
                    id: comment.id ?? comment._id ?? `c_${Date.now()}`,
                    author: isCommentOwner
                      ? "You"
                      : comment.isAnonymous
                        ? "Anonymous member"
                        : "Community member",
                    avatar: isCommentOwner ? "U" : "AU",
                    content: comment.content,
                    time: formatRelativeTime(comment.createdAt),
                    isOwner: isCommentOwner,
                  };

                  setPosts((current) =>
                    current.map((item) => {
                      if (item.id === postId) {
                        const commentExists = item.comments.some((c) => c.id === syncedComment.id);
                        if (commentExists) return item;

                        return {
                          ...item,
                          commentsCount: item.commentsCount + 1,
                          comments: [...item.comments, syncedComment],
                        };
                      }
                      return item;
                    })
                  );

                  setActivePost((prevActive) => {
                    if (prevActive && prevActive.id === postId) {
                      const commentExists = prevActive.comments.some((c) => c.id === syncedComment.id);
                      if (commentExists) return prevActive;

                      return {
                        ...prevActive,
                        commentsCount: prevActive.commentsCount + 1,
                        comments: [...prevActive.comments, syncedComment],
                      };
                    }
                    return prevActive;
                  });

                  if (senderId !== userId) {
                    setActivePost((currentActive) => {
                      const isSheetOpenForThisPost = currentActive && currentActive.id === postId;
                      if (!isSheetOpenForThisPost) {
                        setUnreadCommentPostIds((prev) => {
                          const next = new Set(prev);
                          next.add(postId);
                          return next;
                        });
                      }
                      return currentActive;
                    });
                  }
                }
              }
            } catch (err) {
              console.error("Error parsing WS message in community:", err);
            }
          };

          socket.onerror = (err) => {
            console.warn("Community screen WebSocket error:", err);
          };

          socket.onclose = () => {
            if (isDisconnected) return;
            console.log("Community screen WebSocket closed, retrying in 3s...");
            reconnectTimeout = setTimeout(connectWS, 3000);
          };
        })
        .catch((err) => {
          console.warn("Failed to get WebSocket URL in community screen, retrying in 5s...", err);
          reconnectTimeout = setTimeout(connectWS, 5000);
        });
    }

    connectWS();

    return () => {
      isDisconnected = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socket) {
        try {
          socket.send(
            JSON.stringify({
              type: "leave",
              room: "community",
            })
          );
        } catch { }
        socket.close();
      }
    };
  }, [token, user?._id]);

  // UI States
  const [posts, setPosts] = useState<Post[]>([]);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  // isOwner is now tracked on each Post/Comment object from the API — no extra Set needed
  const [isPostsLoading, setIsPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const pageRef = useRef(1);
  const POSTS_PAGE_SIZE = 20;
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");

  // Modals Controller States
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [createPostVisible, setCreatePostVisible] = useState(false);
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const { hasAccess, refresh: refreshSubscriptionAccess } = useSubscriptionAccess();

  // Selected Context Holders
  const [activePost, setActivePost] = useState<Post | null>(null);
  const [isCommentsLoading, setIsCommentsLoading] = useState(false);
  const [newPostContent, setNewPostContent] = useState("");
  const [newPostCategory, setNewPostCategory] = useState<string | null>(null);
  const [newCommentContent, setNewCommentContent] = useState("");

  // Compose-modal poll state. `pollOptions === null` means "no poll attached";
  // toggling the poll button seeds two empty options (up to POLL_MAX_OPTIONS).
  const [pollOptions, setPollOptions] = useState<string[] | null>(null);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  // Tracks polls a vote is in-flight for, so options can't be double-tapped.
  const [votingPollIds, setVotingPollIds] = useState<Set<string>>(new Set());
  // Long post bodies render uncapped by default, pushing the rest of the
  // card (and feed) way down — cap them and let the reader expand in place.
  const [expandedPostIds, setExpandedPostIds] = useState<Set<string>>(new Set());
  const LONG_POST_CHAR_THRESHOLD = 240;
  const toggleExpandedPost = (postId: string) =>
    setExpandedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });

  // Compose-modal attachment picking state
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const audioRecorderState = useAudioRecorderState(audioRecorder);

  // Reply-composer attachment picking state (comments sheet footer)
  const [pendingReplyAttachment, setPendingReplyAttachment] = useState<PendingAttachment | null>(null);
  const [isPublishingComment, setIsPublishingComment] = useState(false);
  const replyAudioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const replyAudioRecorderState = useAudioRecorderState(replyAudioRecorder);

  const {
    reportPost,
    sharePost,
    earnTokens,
    savedPosts,
    reportedPosts,
    toggleSavedPost,
  } = useAppState();

  // Loads the first page, replacing the list. `silent` skips the full-screen
  // spinner (used by pull-to-refresh, which shows its own indicator).
  const loadPosts = useCallback(
    async (silent = false) => {
      if (!silent) setIsPostsLoading(true);
      setPostsError(null);
      pageRef.current = 1;

      try {
        const postsResponse = await communityApi.getPosts({
          limit: POSTS_PAGE_SIZE,
          page: 1,
          category: activeCategory ?? undefined,
          search: submittedSearch.trim() || undefined,
        });
        setPosts(postsResponse.posts.map(mapCommunityPost));
        setHasMorePosts(postsResponse.posts.length >= POSTS_PAGE_SIZE);
        setLikedPostIds(
          new Set(
            postsResponse.posts
              .filter((post) => post.likedByMe)
              .map((post) => post.id ?? post._id),
          ),
        );
      } catch {
        setPosts([]);
        setLikedPostIds(new Set());
        setHasMorePosts(false);
        setPostsError("Couldn't load anonymous posts.");
      } finally {
        setIsPostsLoading(false);
      }
    },
    [activeCategory, submittedSearch],
  );

  // Appends the next page for infinite scroll. Guards against overlapping loads
  // and de-dupes by id so a post can't appear twice across page boundaries.
  const loadMorePosts = useCallback(async () => {
    if (isLoadingMore || isPostsLoading || !hasMorePosts || postsError) return;
    setIsLoadingMore(true);
    const nextPage = pageRef.current + 1;
    try {
      const postsResponse = await communityApi.getPosts({
        limit: POSTS_PAGE_SIZE,
        page: nextPage,
        category: activeCategory ?? undefined,
        search: submittedSearch.trim() || undefined,
      });
      const mapped = postsResponse.posts.map(mapCommunityPost);
      pageRef.current = nextPage;
      setHasMorePosts(mapped.length >= POSTS_PAGE_SIZE);
      setPosts((current) => {
        const seen = new Set(current.map((p) => p.id));
        return [...current, ...mapped.filter((p) => !seen.has(p.id))];
      });
      setLikedPostIds((current) => {
        const next = new Set(current);
        postsResponse.posts
          .filter((post) => post.likedByMe)
          .forEach((post) => next.add(post.id ?? post._id));
        return next;
      });
    } catch {
      // Keep what we have; the user can pull to refresh or scroll to retry.
      setHasMorePosts(false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [activeCategory, submittedSearch, isLoadingMore, isPostsLoading, hasMorePosts, postsError]);

  const refreshPosts = useCallback(async () => {
    setIsRefreshing(true);
    await loadPosts(true);
    setIsRefreshing(false);
  }, [loadPosts]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Opens straight to the shared post when the app was launched via a
  // "community?postId=..." deep link (see shareCommunityPost below).
  useEffect(() => {
    if (!deepLinkedPostId) return;
    let isMounted = true;

    communityApi
      .getPostById(deepLinkedPostId)
      .then((post) => {
        if (isMounted) openCommentsSheet(mapCommunityPost(post));
      })
      .catch(() => {
        if (isMounted) alert("Couldn't open that post", "It may have been removed.");
      });

    return () => {
      isMounted = false;
    };
  }, [deepLinkedPostId]);

  // --- ACTIONS HANDLERS ---
  function openOptions(post: Post) {
    setActivePost(post);
    setOptionsVisible(true);
  }

  function closeOptions() {
    setOptionsVisible(false);
    setActivePost(null);
  }

  async function openCommentsSheet(post: Post) {
    setActivePost(post);
    setCommentsModalVisible(true);
    setUnreadCommentPostIds((prev) => {
      const next = new Set(prev);
      next.delete(post.id);
      return next;
    });
    // The feed no longer ships comment bodies (only the count), so fetch the
    // full post — with its comments — when the sheet opens. Skip the fetch if
    // this post already arrived with its comments loaded (e.g. via deep link).
    if (post.comments && post.comments.length > 0) return;
    setIsCommentsLoading(true);
    try {
      const full = await communityApi.getPostById(post.id);
      const mapped = mapCommunityPost(full);
      setActivePost((current) =>
        current && current.id === mapped.id
          ? { ...current, comments: mapped.comments, commentsCount: mapped.commentsCount }
          : current,
      );
    } catch {
      // Leave the sheet with no comments; the user can pull down / retry.
    } finally {
      setIsCommentsLoading(false);
    }
  }

  function closeCommentsSheet() {
    setCommentsModalVisible(false);
    setActivePost(null);
    setNewCommentContent("");
  }

  async function toggleLike(post: Post) {
    const isAlreadyLiked = likedPostIds.has(post.id);
    setLikedPostIds((current) => {
      const next = new Set(current);
      if (isAlreadyLiked) next.delete(post.id);
      else next.add(post.id);
      return next;
    });

    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? {
            ...item,
            likes: Math.max(0, item.likes + (isAlreadyLiked ? -1 : 1)),
          }
          : item,
      ),
    );
    if (!isAlreadyLiked) earnTokens(1);

    try {
      const result = await communityApi.toggleLike(post.id);
      setPosts((current) =>
        current.map((item) =>
          item.id === post.id ? { ...item, likes: result.likes } : item,
        ),
      );
      setLikedPostIds((current) => {
        const next = new Set(current);
        if (result.likedByMe) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
    } catch {
      // Optimistic local state is kept when the API is unavailable.
    }
  }

  async function pickAttachmentImage(setter: (attachment: PendingAttachment) => void) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showPermissionModal({
        title: "Photo access needed",
        message: "Allow photo library access to attach an image.",
        icon: "images-outline",
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setter({
      uri: asset.uri,
      type: "image",
      mimeType: asset.mimeType || "image/jpeg",
    });
  }

  async function pickAttachmentVideo(setter: (attachment: PendingAttachment) => void) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showPermissionModal({
        title: "Media access needed",
        message: "Allow media library access to attach a video.",
        icon: "videocam-outline",
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setter({
      uri: asset.uri,
      type: "video",
      mimeType: asset.mimeType || "video/mp4",
    });
  }

  async function toggleAttachmentRecording(
    recorder: ReturnType<typeof useAudioRecorder>,
    recorderState: ReturnType<typeof useAudioRecorderState>,
    setter: (attachment: PendingAttachment | null) => void,
  ) {
    if (recorderState.isRecording) {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) {
        setter({ uri, type: "audio", mimeType: "audio/m4a" });
      }
      return;
    }

    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      showPermissionModal({
        title: "Microphone access needed",
        message: "Enable microphone access in Settings to attach a voice note.",
        icon: "mic-outline",
      });
      return;
    }
    setter(null);
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  function resetComposeAttachment() {
    setPendingAttachment(null);
    if (audioRecorderState.isRecording) audioRecorder.stop();
  }

  const handlePickComposeImage = () => pickAttachmentImage(setPendingAttachment);
  const handlePickComposeVideo = () => pickAttachmentVideo(setPendingAttachment);
  const handleToggleComposeRecording = () =>
    toggleAttachmentRecording(audioRecorder, audioRecorderState, setPendingAttachment);

  function resetReplyAttachment() {
    setPendingReplyAttachment(null);
    if (replyAudioRecorderState.isRecording) replyAudioRecorder.stop();
  }

  const handlePickReplyImage = () => pickAttachmentImage(setPendingReplyAttachment);
  const handlePickReplyVideo = () => pickAttachmentVideo(setPendingReplyAttachment);
  const handleToggleReplyRecording = () =>
    toggleAttachmentRecording(replyAudioRecorder, replyAudioRecorderState, setPendingReplyAttachment);

  // Threads style real-time sub-array append mutation
  async function handlePublishPost() {
    if (!newPostContent.trim()) {
      alert(
        "Empty Post",
        "Please type something before sharing with the community.",
      );
      return;
    }
    if (isPublishing) return;

    // Validate the attached poll (if any) before uploading anything.
    let pollPayload: { allowMultiple: boolean; options: string[] } | undefined;
    if (pollOptions !== null) {
      const trimmed = pollOptions.map((option) => option.trim()).filter(Boolean);
      if (trimmed.length < POLL_MIN_OPTIONS) {
        alert("Add poll options", `A poll needs at least ${POLL_MIN_OPTIONS} filled options.`);
        return;
      }
      pollPayload = { allowMultiple: pollAllowMultiple, options: trimmed };
    }

    setIsPublishing(true);
    try {
      let attachments: CommunityAttachment[] | undefined;
      if (pendingAttachment) {
        const { url, key } = await uploadApi.uploadMedia(
          pendingAttachment.uri,
          "community",
          pendingAttachment.mimeType,
        );
        attachments = [{ url, key, type: pendingAttachment.type }];
      }

      const createdPost = await communityApi.createPost({
        content: newPostContent.trim(),
        isAnonymous: true,
        category: newPostCategory ?? undefined,
        attachments,
        poll: pollPayload,
      });

      setPosts((current) => [mapCommunityPost(createdPost), ...current]);
      setNewPostContent("");
      setNewPostCategory(null);
      setPollOptions(null);
      setPollAllowMultiple(false);
      resetComposeAttachment();
      setCreatePostVisible(false);
      earnTokens(5);
    } catch (error) {
      // The client-side hasAccess() check above is optimistic (cached), so
      // the server's own gate can still fire here if access lapsed since —
      // route that case to the paywall instead of a generic error.
      if (isFeatureLockedError(error)) {
        setCreatePostVisible(false);
        setPaywallVisible(true);
        return;
      }
      alert(
        "Couldn't publish post",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setIsPublishing(false);
    }
  }

  // --- Poll composer helpers ---
  const togglePollComposer = () =>
    setPollOptions((current) => (current === null ? ["", ""] : null));
  const updatePollOption = (index: number, value: string) =>
    setPollOptions((current) =>
      current ? current.map((option, i) => (i === index ? value : option)) : current,
    );
  const addPollOption = () =>
    setPollOptions((current) =>
      current && current.length < POLL_MAX_OPTIONS ? [...current, ""] : current,
    );
  const removePollOption = (index: number) =>
    setPollOptions((current) =>
      current && current.length > POLL_MIN_OPTIONS
        ? current.filter((_, i) => i !== index)
        : current,
    );

  // Cast a vote on a post's poll. Optimistically reflects the new counts +
  // myVote so the results bars render immediately, then reconciles with the
  // server response (source of truth for totals).
  async function handleVotePoll(post: Post, optionIds: string[]) {
    if (
      !canPost || // partner viewers are read-only here too, see PostPollView's readOnly
      !post.poll ||
      post.poll.myVote.length > 0 ||
      optionIds.length === 0 ||
      votingPollIds.has(post.id)
    )
      return;

    const applyPoll = (poll: CommunityPoll) =>
      setPosts((current) =>
        current.map((item) => (item.id === post.id ? { ...item, poll } : item)),
      );

    setVotingPollIds((current) => new Set(current).add(post.id));
    try {
      const { poll, tokensAwarded } = await communityApi.votePoll(post.id, optionIds);
      applyPoll(poll);
      if (tokensAwarded) earnTokens(tokensAwarded);
    } catch (error) {
      alert(
        "Couldn't record your vote",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setVotingPollIds((current) => {
        const next = new Set(current);
        next.delete(post.id);
        return next;
      });
    }
  }

  async function handlePublishComment() {
    if (!newCommentContent.trim() || !activePost || isPublishingComment) return;

    const postId = activePost.id;
    setIsPublishingComment(true);

    try {
      let attachments: CommunityAttachment[] | undefined;
      if (pendingReplyAttachment) {
        const { url, key } = await uploadApi.uploadMedia(
          pendingReplyAttachment.uri,
          "community",
          pendingReplyAttachment.mimeType,
        );
        attachments = [{ url, key, type: pendingReplyAttachment.type }];
      }

      const result = await communityApi.addComment(
        postId,
        newCommentContent.trim(),
        true,
        attachments,
      );
      const createdComment = result.comment;
      const syncedComment: Comment = {
        id: createdComment.id ?? createdComment._id ?? `c_${Date.now()}`,
        author: createdComment.isAnonymous
          ? "Anonymous member"
          : "Community member",
        avatar: "AU",
        content: createdComment.content,
        attachment: createdComment.attachments?.[0],
        time: formatRelativeTime(createdComment.createdAt),
        isOwner: true,
      };

      setPosts((current) =>
        current.map((item) =>
          item.id === postId
            ? {
              ...item,
              commentsCount: result.commentsCount,
              comments: [...item.comments, syncedComment],
            }
            : item,
        ),
      );
      setActivePost((prev) =>
        prev && prev.id === postId
          ? {
            ...prev,
            commentsCount: result.commentsCount,
            comments: [...prev.comments, syncedComment],
          }
          : prev
      );

      setNewCommentContent("");
      resetReplyAttachment();
      earnTokens(2);
    } catch (error) {
      alert(
        "Couldn't post reply",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setIsPublishingComment(false);
    }
  }

  async function shareCommunityPost(post: Post) {
    await sharePost(`${post.author}: ${post.content}`, `community?postId=${post.id}`);
    earnTokens(2);
  }

  async function saveActivePost() {
    if (!activePost) return;
    const wasSaved = savedPosts.has(activePost.id);
    toggleSavedPost(activePost.id);
    if (!wasSaved) earnTokens(3);
    try {
      const result = await communityApi.toggleSave(activePost.id);
      if (result.tokensAwarded) earnTokens(result.tokensAwarded);
    } catch {
      // Local saved state remains useful offline.
    }
    closeOptions();
  }

  async function reportActivePost() {
    if (!activePost) return;
    reportPost(activePost.id);
    try {
      await communityApi.report(activePost.id, "Reported from mobile app");
    } catch {
      // Local report flag remains visible offline.
    }
    closeOptions();
  }

  function handleDeletePost() {
    if (!activePost) return;
    const postId = activePost.id;
    closeOptions();
    alert(
      "Delete this post?",
      "This permanently removes the post from the community feed.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => confirmDeletePost(postId) },
      ],
    );
  }

  async function confirmDeletePost(postId: string) {
    setPosts((current) => current.filter((p) => p.id !== postId));
    try {
      await communityApi.deletePost(postId);
    } catch {
      alert("Error", "Could not delete post. Please try again.");
      loadPosts();
    }
  }

  async function handleDeleteComment(postId: string, commentId: string) {
    const performDelete = async () => {
      // Optimistic local removal from both posts list and activePost
      setPosts((current) =>
        current.map((p) =>
          p.id === postId
            ? {
              ...p,
              commentsCount: Math.max(0, p.commentsCount - 1),
              comments: p.comments.filter((c) => c.id !== commentId),
            }
            : p,
        ),
      );
      setActivePost((prev) =>
        prev && prev.id === postId
          ? {
            ...prev,
            commentsCount: Math.max(0, prev.commentsCount - 1),
            comments: prev.comments.filter((c) => c.id !== commentId),
          }
          : prev,
      );
      try {
        await communityApi.deleteComment(postId, commentId);
      } catch {
        alert("Error", "Could not delete comment. Please try again.");
        try {
          const postsResponse = await communityApi.getPosts({ limit: 20 });
          const mapped = postsResponse.posts.map(mapCommunityPost);
          setPosts(mapped);
          setActivePost((prev) =>
            prev ? mapped.find((p) => p.id === prev.id) ?? prev : prev,
          );
        } catch {
          // Best-effort resync; local state stays as-is until next reload.
        }
      }
    };

    alert(
      "Delete Comment",
      "Remove this comment permanently?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: performDelete,
        },
      ],
    );
  }

  // 16px gap between virtualized post cards.
  const PostSeparator = () => <View style={{ height: 16 }} />;

  // Full-width loading / error / empty state shown by the FlatList when there
  // are no post rows to render.
  const renderListEmpty = () => (
    <View className="mt-6">
      {/* Instagram-style: show post-shaped skeletons while the feed loads,
          instead of a spinner in an empty box. */}
      {isPostsLoading && <SkeletonPostList count={5} />}
      {!isPostsLoading && postsError && (
        <View
          className="rounded-2xl border p-6 items-center mx-6"
          style={{ backgroundColor: colors.surface, borderColor: colors.border }}
        >
          <Ionicons name="cloud-offline-outline" size={24} color={colors.primary} />
          <Text
            className="mt-4 text-sm font-extrabold text-center"
            style={{ color: colors.foreground, fontFamily: fonts.heading }}
          >
            Could not load posts
          </Text>
          <Text
            className="mt-1 text-xs text-center leading-4"
            style={{ color: colors.mutedText, fontFamily: fonts.body }}
          >
            Check your connection and try again.
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            className="mt-4 rounded-full px-4 py-2"
            onPress={() => loadPosts()}
            style={{ backgroundColor: colors.primary }}
          >
            <Text
              className="text-xs font-bold"
              style={{ color: colors.buttonText, fontFamily: fonts.body }}
            >
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {!isPostsLoading && !postsError && (
        <View
          className="rounded-2xl border p-6 items-center mx-6"
          style={{ backgroundColor: colors.surface, borderColor: colors.border }}
        >
          <View
            className="w-12 h-12 rounded-2xl items-center justify-center border"
            style={{ backgroundColor: colors.surfaceSoft, borderColor: colors.border }}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.primary} />
          </View>
          <Text
            className="mt-4 text-sm font-extrabold text-center"
            style={{ color: colors.foreground, fontFamily: fonts.heading }}
          >
            No anonymous posts yet
          </Text>
          <Text
            className="mt-1 text-xs text-center leading-4"
            style={{ color: colors.mutedText, fontFamily: fonts.body }}
          >
            Start the first thread when you are ready to share.
          </Text>
        </View>
      )}
    </View>
  );

  // One virtualized post card. Horizontal padding lives here (not on the list
  // container) so the header can keep its own layout; the first row also gets a
  // top gap below the header.
  const renderPost = ({ item: post, index }: { item: Post; index: number }) => {
    const isReported = reportedPosts.has(post.id);
    const isLiked = likedPostIds.has(post.id);
    const isSaved = savedPosts.has(post.id);

    return (
      <View style={{ paddingHorizontal: 24, paddingTop: index === 0 ? 24 : 0 }}>
        <View
          className="rounded-3xl border p-5 relative"
          style={{
            backgroundColor: colors.surface,
            borderColor: isReported ? colors.danger : colors.border,
            ...getShadow(colors, isDark),
          }}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <View
                className="w-10 h-10 rounded-full items-center justify-center border-2"
                style={{ backgroundColor: colors.primaryLight, borderColor: colors.background }}
              >
                <Text
                  className="text-sm font-bold"
                  style={{ color: colors.primary, fontFamily: fonts.body }}
                >
                  {post.avatar}
                </Text>
              </View>
              <View>
                <Text
                  className="text-[13px] font-bold"
                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                >
                  {post.author}
                </Text>
                <View className="flex-row items-center gap-1.5 mt-0.5">
                  <Text
                    className="text-[11px] font-semibold"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    {post.time}
                  </Text>
                  {post.category ? (
                    <View
                      className="rounded-full px-2 py-[1px]"
                      style={{ backgroundColor: colors.primaryLight }}
                    >
                      <Text
                        className="text-[9px] font-black uppercase tracking-wide"
                        style={{ color: colors.primary, fontFamily: fonts.body }}
                      >
                        {post.category}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => openOptions(post)}
              accessibilityRole="button"
              accessibilityLabel="Post options"
              className="p-2 -mr-2 rounded-full"
            >
              <Feather name="more-vertical" size={18} color={colors.mutedText} />
            </TouchableOpacity>
          </View>

          <Text
            className="mt-4 text-sm font-medium leading-5"
            style={{ color: colors.foreground, fontFamily: fonts.body }}
            numberOfLines={
              post.content.length > LONG_POST_CHAR_THRESHOLD && !expandedPostIds.has(post.id) ? 6 : undefined
            }
          >
            {post.content}
          </Text>
          {post.content.length > LONG_POST_CHAR_THRESHOLD && (
            <TouchableOpacity
              onPress={() => toggleExpandedPost(post.id)}
              activeOpacity={0.7}
              className="mt-1"
              accessibilityRole="button"
            >
              <Text className="text-xs font-bold" style={{ color: colors.primary, fontFamily: fonts.body }}>
                {expandedPostIds.has(post.id) ? "Show less" : "Read more"}
              </Text>
            </TouchableOpacity>
          )}

          {post.attachment && <PostAttachmentView attachment={post.attachment} />}

          {post.poll && (
            <PostPollView
              poll={post.poll}
              isVoting={votingPollIds.has(post.id)}
              onVote={(optionIds) => handleVotePoll(post, optionIds)}
              readOnly={!canPost}
            />
          )}

          {/* Action Bar - all icons left side together */}
          <View
            className="mt-5 pt-3 flex-row items-center"
            style={{ borderTopWidth: 1, borderTopColor: colors.border, gap: 10 }}
          >
            {/* Like */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={isLiked ? "Unlike post" : "Like post"}
              className="flex-row items-center gap-1.5 py-1.5 px-2.5 rounded-full"
              style={{ backgroundColor: isLiked ? colors.primaryLight : "transparent" }}
              onPress={() => toggleLike(post)}
            >
              <Ionicons
                name={isLiked ? "heart" : "heart-outline"}
                size={19}
                color={isLiked ? colors.primary : colors.mutedText}
              />
              <Text
                className="text-xs font-bold"
                style={{ color: isLiked ? colors.primary : colors.mutedText, fontFamily: fonts.mono }}
              >
                {post.likes}
              </Text>
            </TouchableOpacity>

            {/* Comment */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="View comments"
              className="flex-row items-center gap-1.5 py-1.5 px-2.5 rounded-full relative"
              onPress={() => openCommentsSheet(post)}
            >
              <View className="relative">
                <Ionicons name="chatbubble-outline" size={18} color={colors.mutedText} />
                {unreadCommentPostIds.has(post.id) && (
                  <View
                    style={{
                      position: "absolute",
                      top: -2,
                      right: -2,
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: colors.danger,
                    }}
                  />
                )}
              </View>
              <Text
                className="text-xs font-bold"
                style={{ color: colors.mutedText, fontFamily: fonts.mono }}
              >
                {post.commentsCount}
              </Text>
            </TouchableOpacity>

            {/* Share */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Share post"
              className="flex-row items-center gap-1.5 py-1.5 px-2.5 rounded-full"
              onPress={() => shareCommunityPost(post)}
            >
              <Ionicons name="arrow-redo-outline" size={18} color={colors.mutedText} />
            </TouchableOpacity>
          </View>

          {/* Meta badges overlay */}
          {(isSaved || isReported) && (
            <View className="mt-4 flex-row gap-1.5">
              {isSaved && (
                <View
                  className="flex-row items-center gap-1 rounded-full px-2.5 py-0.5"
                  style={{ backgroundColor: colors.primaryLight }}
                >
                  <Text
                    className="text-[10px] font-bold"
                    style={{ color: colors.primary, fontFamily: fonts.body }}
                  >
                    Saved
                  </Text>
                </View>
              )}
              {isReported && (
                <View
                  className="flex-row items-center gap-1 rounded-full px-2.5 py-0.5"
                  style={{ backgroundColor: colors.dangerLight }}
                >
                  <Text
                    className="text-[10px] font-bold"
                    style={{ color: colors.danger, fontFamily: fonts.body }}
                  >
                    Reported
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
      >
        <View className="flex-1 relative">
          <FlatList
            data={!isPostsLoading && !postsError ? posts : []}
            keyExtractor={(item) => item.id}
            renderItem={renderPost}
            ItemSeparatorComponent={PostSeparator}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1, backgroundColor: colors.background }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 140 }}
            onEndReached={loadMorePosts}
            onEndReachedThreshold={0.5}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={refreshPosts}
                tintColor={colors.primary}
              />
            }
            ListFooterComponent={
              isLoadingMore ? (
                <View className="py-6">
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : null
            }
            ListEmptyComponent={renderListEmpty()}
            ListHeaderComponent={
              <View>
            {/* Header */}
            <View className="px-6 pt-6 flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text
                  className="text-[22px] font-bold tracking-tight"
                  style={{ color: colors.foreground, fontFamily: fonts.heading }}
                >
                  Community
                </Text>
                <Text
                  className="text-xs font-semibold mt-1"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  Share experiences and ask questions anonymously, safely.
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={searchVisible ? "Close search" : "Search posts"}
                onPress={() => {
                  setSearchVisible((visible) => {
                    const next = !visible;
                    if (!next && (searchInput || submittedSearch)) {
                      setSearchInput("");
                      setSubmittedSearch("");
                    }
                    return next;
                  });
                }}
                className="w-9 h-9 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
              >
                <Ionicons
                  name={searchVisible ? "close" : "search"}
                  size={17}
                  color={colors.foreground}
                />
              </TouchableOpacity>
            </View>

            {searchVisible && (
              <View className="px-6 mt-4">
                <TextInput
                  autoFocus
                  placeholder="Search community posts..."
                  placeholderTextColor={colors.mutedText}
                  value={searchInput}
                  onChangeText={setSearchInput}
                  onSubmitEditing={() => setSubmittedSearch(searchInput)}
                  returnKeyType="search"
                  className="px-4 py-3 rounded-xl text-sm"
                  style={{
                    backgroundColor: colors.input,
                    color: colors.foreground,
                    fontFamily: fonts.body,
                  }}
                />
              </View>
            )}

            {/* CATEGORY FILTER CHIPS */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
              className="mt-4"
            >
              {["All", ...COMMUNITY_CATEGORIES].map((chip) => {
                const isActive =
                  chip === "All" ? activeCategory === null : activeCategory === chip;
                return (
                  <TouchableOpacity
                    key={chip}
                    activeOpacity={0.85}
                    onPress={() => setActiveCategory(chip === "All" ? null : chip)}
                    className="rounded-full px-4 py-2"
                    style={{
                      backgroundColor: isActive ? colors.primary : colors.surface,
                      borderWidth: isActive ? 0 : 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      className="text-xs font-bold"
                      style={{
                        color: isActive ? colors.buttonText : colors.foreground,
                        fontFamily: fonts.body,
                      }}
                    >
                      {chip}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
              </View>
            }
          />

          {/* FLOATING ACTION TRIGGER — new post (owners only, see canPost) */}
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
              className="absolute bottom-28 right-6 w-14 h-14 rounded-full items-center justify-center border"
              style={{
                backgroundColor: colors.primary,
                borderColor: colors.background,
                ...getShadow(colors, isDark),
              }}
            >
              <Ionicons name="add" size={26} color={colors.buttonText} />
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
          setCreatePostVisible(true);
        }}
      />

      {/* --- MODAL FEATURE 1: COMPOSE FRESH POST SHEET --- */}
      <Modal
        visible={createPostVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCreatePostVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View
            className="flex-1 px-6"
            style={{
              backgroundColor: colors.background,
              // Modal on Android ignores `presentationStyle="pageSheet"` and
              // always renders truly fullscreen under the status bar, so the
              // header row needs an explicit safe-area top inset here — the
              // outer screen's SafeAreaView doesn't wrap this Modal's content.
              paddingTop: Math.max(18, insets.top + 10),
              paddingBottom: Math.max(18, insets.bottom + 10),
            }}
          >
            <View className="flex-row justify-between items-center mb-6">
              <TouchableOpacity
                onPress={() => {
                  setCreatePostVisible(false);
                  resetComposeAttachment();
                  setNewPostCategory(null);
                  setPollOptions(null);
                  setPollAllowMultiple(false);
                }}
              >
                <Text
                  className="text-base font-semibold"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <Text
                className="text-[17px] font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                New Thread
              </Text>
              <TouchableOpacity
                onPress={handlePublishPost}
                disabled={isPublishing}
                className="px-4 py-1.5 rounded-full flex-row items-center gap-2"
                style={{ backgroundColor: colors.primary, opacity: isPublishing ? 0.7 : 1 }}
              >
                {isPublishing && <ActivityIndicator size="small" color={colors.buttonText} />}
                <Text
                  className="text-xs font-bold"
                  style={{ color: colors.buttonText, fontFamily: fonts.body }}
                >
                  {isPublishing ? "Posting..." : "Post"}
                </Text>
              </TouchableOpacity>
            </View>

            <View className="flex-row gap-4">
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.primaryLight }}
              >
                <Text className="text-lg">✨</Text>
              </View>
              <TextInput
                multiline
                autoFocus
                placeholder="What's on your mind? Share your cycle update anonymously..."
                placeholderTextColor={colors.mutedText}
                value={newPostContent}
                onChangeText={setNewPostContent}
                className="flex-1 text-base pt-1"
                style={{ color: colors.foreground, verticalAlign: "top", fontFamily: fonts.body }}
                textAlignVertical="top"
              />
            </View>

            <View className="mt-4 ml-14 flex-row flex-wrap gap-2">
              {COMMUNITY_CATEGORIES.map((category) => {
                const isActive = newPostCategory === category;
                return (
                  <TouchableOpacity
                    key={category}
                    activeOpacity={0.85}
                    onPress={() =>
                      setNewPostCategory((current) =>
                        current === category ? null : category,
                      )
                    }
                    className="rounded-full px-3 py-1.5"
                    style={{
                      backgroundColor: isActive ? colors.primary : colors.surfaceSoft,
                      borderWidth: isActive ? 0 : 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      className="text-[11px] font-bold"
                      style={{
                        color: isActive ? colors.buttonText : colors.mutedText,
                        fontFamily: fonts.body,
                      }}
                    >
                      {category}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {pendingAttachment && (
              <View
                className="mt-4 ml-14 flex-row items-center gap-3 rounded-2xl px-4 py-3"
                style={{ backgroundColor: colors.surfaceSoft }}
              >
                <Ionicons
                  name={
                    pendingAttachment.type === "image"
                      ? "image-outline"
                      : pendingAttachment.type === "video"
                        ? "videocam-outline"
                        : "mic-outline"
                  }
                  size={18}
                  color={colors.primary}
                />
                <Text
                  className="flex-1 text-xs font-bold"
                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                >
                  {pendingAttachment.type === "image"
                    ? "Photo attached"
                    : pendingAttachment.type === "video"
                      ? "Video attached"
                      : "Voice note attached"}
                </Text>
                <TouchableOpacity onPress={resetComposeAttachment}>
                  <Ionicons name="close-circle" size={18} color={colors.mutedText} />
                </TouchableOpacity>
              </View>
            )}

            {pollOptions !== null && (
              <View
                className="mt-4 ml-14 rounded-2xl border p-4"
                style={{ borderColor: colors.border, backgroundColor: colors.surfaceSoft }}
              >
                <View className="flex-row items-center justify-between mb-3">
                  <Text
                    className="text-[13px] font-bold"
                    style={{ color: colors.foreground, fontFamily: fonts.body }}
                  >
                    Poll
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setPollOptions(null);
                      setPollAllowMultiple(false);
                    }}
                    accessibilityLabel="Remove poll"
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.mutedText} />
                  </TouchableOpacity>
                </View>

                <View style={{ gap: 8 }}>
                  {pollOptions.map((option, index) => (
                    <View key={index} className="flex-row items-center gap-2">
                      <TextInput
                        placeholder={`Option ${index + 1}`}
                        placeholderTextColor={colors.mutedText}
                        value={option}
                        onChangeText={(text) => updatePollOption(index, text)}
                        className="flex-1 rounded-xl border px-3 py-2 text-sm"
                        style={{
                          color: colors.foreground,
                          borderColor: colors.border,
                          backgroundColor: colors.surface,
                          fontFamily: fonts.body,
                        }}
                      />
                      {pollOptions.length > POLL_MIN_OPTIONS && (
                        <TouchableOpacity
                          onPress={() => removePollOption(index)}
                          accessibilityLabel={`Remove option ${index + 1}`}
                        >
                          <Ionicons name="close-circle" size={20} color={colors.mutedText} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>

                {pollOptions.length < POLL_MAX_OPTIONS && (
                  <TouchableOpacity
                    onPress={addPollOption}
                    className="flex-row items-center gap-1.5 mt-3"
                  >
                    <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                    <Text
                      className="text-xs font-bold"
                      style={{ color: colors.primary, fontFamily: fonts.body }}
                    >
                      Add option
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => setPollAllowMultiple((current) => !current)}
                  className="flex-row items-center gap-2 mt-4 pt-3"
                  style={{ borderTopWidth: 1, borderTopColor: colors.border }}
                >
                  <Ionicons
                    name={pollAllowMultiple ? "checkbox" : "square-outline"}
                    size={18}
                    color={pollAllowMultiple ? colors.primary : colors.mutedText}
                  />
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: colors.foreground, fontFamily: fonts.body }}
                  >
                    Allow selecting multiple options
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View
              className="mt-4 ml-14 flex-row items-center gap-5 pt-3"
              style={{ borderTopWidth: 1, borderTopColor: colors.border }}
            >
              <TouchableOpacity onPress={handlePickComposeImage}>
                <Ionicons name="image-outline" size={22} color={colors.mutedText} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePickComposeVideo}>
                <Ionicons name="videocam-outline" size={22} color={colors.mutedText} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleToggleComposeRecording}>
                <Ionicons
                  name={audioRecorderState.isRecording ? "stop-circle" : "mic-outline"}
                  size={22}
                  color={audioRecorderState.isRecording ? colors.danger : colors.mutedText}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={togglePollComposer}>
                <Ionicons
                  name="stats-chart"
                  size={22}
                  color={pollOptions !== null ? colors.primary : colors.mutedText}
                />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- MODAL FEATURE 2: THREADS STYLE DETAIL SLIDING COMMENTS MODULE --- */}
      <Modal
        visible={commentsModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeCommentsSheet}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View className="flex-1" style={{ backgroundColor: colors.background }}>
            {/* Sheet Header navigation panel bar — Android Modal ignores
                presentationStyle="pageSheet" and renders fullscreen under the
                status bar, so this needs its own top inset. */}
            <View
              className="px-6 py-4 flex-row justify-between items-center"
              style={{ paddingTop: insets.top + 16, borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <TouchableOpacity onPress={closeCommentsSheet}>
                <Feather name="x" size={20} color={colors.foreground} />
              </TouchableOpacity>
              <Text
                className="text-[15px] font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                Thread Discussion
              </Text>
              <View className="w-5" />
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              className="flex-1 px-6 pt-4"
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
            >
              {/* Primary Render Target Focused Post Header Context info segment */}
              {activePost && (
                <View
                  className="pb-5"
                  style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  <View className="flex-row items-center gap-3">
                    <View
                      className="w-9 h-9 rounded-full items-center justify-center"
                      style={{ backgroundColor: colors.primaryLight }}
                    >
                      <Text
                        className="text-sm font-bold"
                        style={{ color: colors.primary, fontFamily: fonts.body }}
                      >
                        {activePost.avatar}
                      </Text>
                    </View>
                    <Text
                      className="text-[13px] font-bold"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                    >
                      {activePost.author}
                    </Text>
                  </View>
                  <Text
                    className="mt-3 text-sm leading-5"
                    style={{ color: colors.foreground, fontFamily: fonts.body }}
                  >
                    {activePost.content}
                  </Text>
                </View>
              )}

              {/* List Array Generation target segment for mapped Comments database blocks */}
              <View className="mt-5 gap-4 pb-20">
                <Text
                  className="text-xs font-bold tracking-widest uppercase mb-1"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  Responses
                </Text>
                {isCommentsLoading && activePost?.comments.length === 0 && (
                  <View className="gap-5 py-3">
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </View>
                )}
                {activePost?.comments.map((comment) => (
                  <View
                    key={comment.id}
                    className="flex-row gap-3.5 items-start p-1"
                  >
                    <View
                      className="w-9 h-9 rounded-full items-center justify-center"
                      style={{ backgroundColor: colors.primaryLight }}
                    >
                      <Text
                        className="text-sm font-bold"
                        style={{ color: colors.primary, fontFamily: fonts.body }}
                      >
                        {comment.avatar}
                      </Text>
                    </View>
                    <View
                      className="flex-1 p-3.5 rounded-2xl"
                      style={{
                        backgroundColor: colors.surfaceSoft,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <View className="flex-row justify-between items-center">
                        <Text
                          className="text-xs font-bold"
                          style={{ color: colors.foreground, fontFamily: fonts.body }}
                        >
                          {comment.author}
                        </Text>
                        <View className="flex-row items-center gap-2">
                          <Text
                            className="text-[10px] font-semibold"
                            style={{ color: colors.mutedText, fontFamily: fonts.body }}
                          >
                            {comment.time}
                          </Text>
                          {comment.isOwner && activePost && (
                            <TouchableOpacity
                              onPress={() =>
                                handleDeleteComment(activePost.id, comment.id)
                              }
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Feather
                                name="trash-2"
                                size={13}
                                color={colors.danger}
                              />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                      <Text
                        className="text-xs font-medium mt-1.5 leading-4"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        {comment.content}
                      </Text>
                      {comment.attachment && (
                        <PostAttachmentView attachment={comment.attachment} />
                      )}
                    </View>
                  </View>
                ))}
                {!isCommentsLoading && activePost?.comments.length === 0 && (
                  <Text
                    className="text-xs text-center italic my-6"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    Be the first one to leave a supportive reply!
                  </Text>
                )}
              </View>
            </ScrollView>

            {/* Persistent Absolute Standard Footer Input field layout for writing replies
                (owners only — partners get a read-only note instead, see canPost) */}
            {!canPost ? (
              <View
                className="px-4 py-3 flex-row items-center gap-2"
                style={{
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  backgroundColor: colors.surface,
                  paddingBottom: Math.max(12, insets.bottom + 8),
                }}
              >
                <Ionicons name="eye-outline" size={14} color={colors.mutedText} />
                <Text
                  className="text-xs font-semibold"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  Partners can view the community but can&apos;t post replies.
                </Text>
              </View>
            ) : (
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.border,
                backgroundColor: colors.surface,
                paddingBottom: Math.max(12, insets.bottom + 8),
              }}
            >
              {pendingReplyAttachment && (
                <View
                  className="mx-4 mt-3 flex-row items-center gap-3 rounded-2xl px-4 py-2.5"
                  style={{ backgroundColor: colors.surfaceSoft }}
                >
                  <Ionicons
                    name={
                      pendingReplyAttachment.type === "image"
                        ? "image-outline"
                        : pendingReplyAttachment.type === "video"
                          ? "videocam-outline"
                          : "mic-outline"
                    }
                    size={16}
                    color={colors.primary}
                  />
                  <Text
                    className="flex-1 text-xs font-bold"
                    style={{ color: colors.foreground, fontFamily: fonts.body }}
                  >
                    {pendingReplyAttachment.type === "image"
                      ? "Photo attached"
                      : pendingReplyAttachment.type === "video"
                        ? "Video attached"
                        : "Voice note attached"}
                  </Text>
                  <TouchableOpacity onPress={resetReplyAttachment}>
                    <Ionicons name="close-circle" size={16} color={colors.mutedText} />
                  </TouchableOpacity>
                </View>
              )}

              <View className="px-4 pt-3 flex-row items-center gap-2">
                <TouchableOpacity onPress={handlePickReplyImage}>
                  <Ionicons name="image-outline" size={20} color={colors.mutedText} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handlePickReplyVideo}>
                  <Ionicons name="videocam-outline" size={20} color={colors.mutedText} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleToggleReplyRecording}>
                  <Ionicons
                    name={replyAudioRecorderState.isRecording ? "stop-circle" : "mic-outline"}
                    size={20}
                    color={replyAudioRecorderState.isRecording ? colors.danger : colors.mutedText}
                  />
                </TouchableOpacity>
              </View>

              <View className="px-4 pt-2 pb-1 flex-row items-center gap-3">
                <TextInput
                  placeholder="Post your reply..."
                  placeholderTextColor={colors.mutedText}
                  value={newCommentContent}
                  onChangeText={setNewCommentContent}
                  className="flex-1 px-4 py-3 rounded-xl text-sm"
                  style={{
                    backgroundColor: colors.input,
                    color: colors.foreground,
                    fontFamily: fonts.body,
                  }}
                  onSubmitEditing={handlePublishComment}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  disabled={!newCommentContent.trim() || isPublishingComment}
                  onPress={handlePublishComment}
                  className="p-2.5 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: newCommentContent.trim()
                      ? colors.primary
                      : colors.border,
                    opacity: isPublishingComment ? 0.7 : 1,
                  }}
                >
                  {isPublishingComment ? (
                    <ActivityIndicator size="small" color={colors.buttonText} />
                  ) : (
                    <Feather
                      name="arrow-up"
                      size={16}
                      color={
                        newCommentContent.trim()
                          ? colors.buttonText
                          : colors.mutedText
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
            </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <OptionsModal
        visible={optionsVisible}
        onClose={closeOptions}
        onShare={async () => {
          if (activePost) await shareCommunityPost(activePost);
          closeOptions();
        }}
        onSave={saveActivePost}
        onReport={reportActivePost}
        onDelete={
          activePost?.isOwner
            ? handleDeletePost
            : undefined
        }
        isSaved={activePost ? savedPosts.has(activePost.id) : false}
        isReported={activePost ? reportedPosts.has(activePost.id) : false}
      />
    </>
  );
}
