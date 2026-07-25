import { Feather, Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "../../../components/AppState";
import { useAuth } from "../../../components/auth-context";
import OptionsModal from "../../../components/OptionsModal";
import { alert } from "../../../lib/alert";
import { useTheme } from "../../../components/theme";
import {
  communityApi,
  getWebSocketUrl,
  type CommunityPost,
} from "../../../lib/api";

// --- BACKEND API LAYER SCHEMAS & INTERFACES ---
interface Comment {
  id: string;
  author: string;
  avatar: string;
  content: string;
  time: string;
  isOwner: boolean; // true when this comment belongs to the logged-in user
}

interface Post {
  id: string;
  author: string;
  avatar: string;
  content: string;
  likes: number;
  commentsCount: number;
  comments: Comment[];
  time: string;
  isOwner: boolean; // true when this post belongs to the logged-in user
}

function mapCommunityPost(post: CommunityPost): Post {
  // Backend resolveAuthor sets isOwn:true on userId when requester is the author
  const isOwner = typeof post.userId === "object" && post.userId?.isOwn === true;

  return {
    id: post.id ?? post._id,
    author: isOwner ? "You" : post.isAnonymous ? "Anonymous member" : "Community member",
    avatar: isOwner ? "✨" : "NU",
    content: post.content,
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

export default function Community() {
  const { colors, isDark, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
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

  // Modals Controller States
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [createPostVisible, setCreatePostVisible] = useState(false);
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);

  // Selected Context Holders
  const [activePost, setActivePost] = useState<Post | null>(null);
  const [newPostContent, setNewPostContent] = useState("");
  const [newCommentContent, setNewCommentContent] = useState("");

  const {
    reportPost,
    sharePost,
    earnTokens,
    savedPosts,
    reportedPosts,
    toggleSavedPost,
  } = useAppState();

  const loadPosts = useCallback(async () => {
    setIsPostsLoading(true);
    setPostsError(null);

    try {
      const postsResponse = await communityApi.getPosts({ limit: 20 });
      setPosts(postsResponse.posts.map(mapCommunityPost));
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
      setPostsError("Couldn't load anonymous posts.");
    } finally {
      setIsPostsLoading(false);
    }
  }, []);

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

  function openCommentsSheet(post: Post) {
    setActivePost(post);
    setCommentsModalVisible(true);
    setUnreadCommentPostIds((prev) => {
      const next = new Set(prev);
      next.delete(post.id);
      return next;
    });
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

  // Threads style real-time sub-array append mutation
  async function handlePublishPost() {
    if (!newPostContent.trim()) {
      alert(
        "Empty Post",
        "Please type something before sharing with the community.",
      );
      return;
    }

    const payload: Post = {
      id: `p_local_${Date.now()}`,
      author: "You",
      avatar: "✨",
      content: newPostContent.trim(),
      likes: 0,
      commentsCount: 0,
      time: "Just now",
      comments: [],
      isOwner: true,
    };

    const localId = payload.id;
    setPosts([payload, ...posts]);
    setNewPostContent("");
    setCreatePostVisible(false);
    earnTokens(5);

    try {
      const createdPost = await communityApi.createPost({
        content: payload.content,
        isAnonymous: true,
      });
      // mapCommunityPost reads isOwn from the serialized backend response
      setPosts((current) => [
        mapCommunityPost(createdPost),
        ...current.filter((post) => post.id !== localId),
      ]);
    } catch {
      alert(
        "Saved locally",
        "Your post is visible here. It will need the backend online to sync.",
      );
      return;
    }

    alert("Shared", "Your post is now visible in the community feed.");
  }

  async function handlePublishComment() {
    if (!newCommentContent.trim() || !activePost) return;

    const freshComment: Comment = {
      id: `c_local_${Date.now()}`,
      author: "You",
      avatar: "✨",
      content: newCommentContent.trim(),
      time: "Just now",
      isOwner: true,
    };

    // Immutably patching structural nested relational values
    const updatedPosts = posts.map((item) => {
      if (item.id === activePost.id) {
        const structuralComments = [...item.comments, freshComment];
        const patchedObject = {
          ...item,
          commentsCount: item.commentsCount + 1,
          comments: structuralComments,
        };
        // Update active context tree simultaneously to maintain reactive rendering
        setActivePost(patchedObject);
        return patchedObject;
      }
      return item;
    });

    setPosts(updatedPosts);
    setNewCommentContent("");
    earnTokens(2);

    try {
      const result = await communityApi.addComment(
        activePost.id,
        freshComment.content,
        true,
      );
      const createdComment = result.comment;
      const syncedComment: Comment = {
        id: createdComment.id ?? createdComment._id ?? freshComment.id,
        author: createdComment.isAnonymous
          ? "Anonymous member"
          : "Community member",
        avatar: "AU",
        content: createdComment.content,
        time: formatRelativeTime(createdComment.createdAt),
        isOwner: true,
      };
      setPosts((current) =>
        current.map((item) =>
          item.id === activePost.id
            ? {
              ...item,
              commentsCount: result.commentsCount,
              comments: [...item.comments.slice(0, -1), syncedComment],
            }
            : item,
        ),
      );
      setActivePost((prev) =>
        prev && prev.id === activePost.id
          ? {
            ...prev,
            commentsCount: result.commentsCount,
            comments: [...prev.comments.slice(0, -1), syncedComment],
          }
          : prev
      );
    } catch {
      // Keep local comment as an offline draft.
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
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 140 }}
          >
            {/* Header */}
            <View className="px-6 pt-6">
              <Text
                className="text-3xl font-extrabold tracking-tight"
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

            {/* FEED CONTAINER */}
            <View className="mt-6 gap-4 px-6">
                {isPostsLoading && (
                  <View
                    className="rounded-3xl border p-6 items-center"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    }}
                  >
                    <ActivityIndicator color={colors.primary} />
                    <Text
                      className="mt-3 text-xs font-bold"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      Loading anonymous posts...
                    </Text>
                  </View>
                )}
                {!isPostsLoading && postsError && (
                  <View
                    className="rounded-3xl border p-6 items-center"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    }}
                  >
                    <Ionicons
                      name="cloud-offline-outline"
                      size={24}
                      color={colors.primary}
                    />
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
                      onPress={loadPosts}
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
                {!isPostsLoading &&
                  !postsError &&
                  posts.map((post) => {
                    const isReported = reportedPosts.has(post.id);
                    const isLiked = likedPostIds.has(post.id);
                    const isSaved = savedPosts.has(post.id);

                    return (
                      <View
                        key={post.id}
                        className="rounded-3xl border p-5 shadow-2xs relative"
                        style={{
                          backgroundColor: colors.surface,
                          borderColor: isReported ? colors.danger : colors.border,
                        }}
                      >
                        <View className="flex-row items-center justify-between">
                          <View className="flex-row items-center gap-3">
                            <View
                              className="w-9 h-9 rounded-full items-center justify-center"
                              style={{
                                backgroundColor: colors.surfaceSoft,
                              }}
                            >
                              <Text className="text-base">{post.avatar}</Text>
                            </View>
                            <View>
                              <Text
                                className="text-sm font-bold"
                                style={{ color: colors.foreground, fontFamily: fonts.body }}
                              >
                                {post.author}
                              </Text>
                              <Text
                                className="text-[11px] font-semibold mt-0.5"
                                style={{ color: colors.mutedText, fontFamily: fonts.body }}
                              >
                                {post.time}
                              </Text>
                            </View>
                          </View>
                          <TouchableOpacity
                            onPress={() => openOptions(post)}
                            className="p-2 -mr-2"
                          >
                            <Feather
                              name="more-vertical"
                              size={18}
                              color={colors.mutedText}
                            />
                          </TouchableOpacity>
                        </View>

                        <Text
                          className="mt-4 text-sm font-medium leading-5"
                          style={{ color: colors.foreground, fontFamily: fonts.body }}
                        >
                          {post.content}
                        </Text>

                        {/* Action Bar - all icons left side together */}
                        <View
                          className="mt-5 pt-3 flex-row items-center"
                          style={{ borderTopWidth: 1, borderTopColor: colors.border, gap: 20 }}
                        >
                          {/* Like */}
                          <TouchableOpacity
                            className="flex-row items-center gap-1.5 py-1"
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
                            className="flex-row items-center gap-1.5 py-1 relative"
                            onPress={() => openCommentsSheet(post)}
                          >
                            <View className="relative">
                              <Ionicons
                                name="chatbubble-outline"
                                size={18}
                                color={colors.mutedText}
                              />
                              {unreadCommentPostIds.has(post.id) && (
                                <View
                                  style={{
                                    position: "absolute", top: -2, right: -2,
                                    width: 6, height: 6, borderRadius: 3,
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
                            className="flex-row items-center gap-1.5 py-1"
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
                    );
                  })}
                {!isPostsLoading && !postsError && posts.length === 0 && (
                  <View
                    className="rounded-3xl border p-6 items-center"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    }}
                  >
                    <View
                      className="w-12 h-12 rounded-2xl items-center justify-center border"
                      style={{
                        backgroundColor: colors.surfaceSoft,
                        borderColor: colors.border,
                      }}
                    >
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={22}
                        color={colors.primary}
                      />
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
          </ScrollView>

          {/* FLOATING ACTION TRIGGER BAR (THREADS-STYLE FLOAT FAB) */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setCreatePostVisible(true)}
            className="absolute bottom-28 right-6 w-14 h-14 rounded-full items-center justify-center shadow-lg border"
            style={{
              backgroundColor: colors.primary,
              borderColor: colors.background,
            }}
          >
            <Feather name="edit-3" size={22} color={colors.buttonText} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

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
            className="flex-1 px-6 pt-6"
            style={{
              backgroundColor: colors.background,
              paddingBottom: Math.max(18, insets.bottom + 10),
            }}
          >
            <View className="flex-row justify-between items-center mb-6">
              <TouchableOpacity onPress={() => setCreatePostVisible(false)}>
                <Text
                  className="text-base font-semibold"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <Text
                className="text-lg font-black"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                New Thread
              </Text>
              <TouchableOpacity
                onPress={handlePublishPost}
                className="px-4 py-1.5 rounded-full"
                style={{ backgroundColor: colors.primary }}
              >
                <Text
                  className="text-xs font-bold"
                  style={{ color: colors.buttonText, fontFamily: fonts.body }}
                >
                  Post
                </Text>
              </TouchableOpacity>
            </View>

            <View className="flex-row gap-4 flex-1">
              <View className="w-10 h-10 bg-pink-100 rounded-full items-center justify-center">
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
            {/* Sheet Header navigation panel bar */}
            <View
              className="px-6 py-4 flex-row justify-between items-center"
              style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <TouchableOpacity onPress={closeCommentsSheet}>
                <Feather name="x" size={20} color={colors.foreground} />
              </TouchableOpacity>
              <Text
                className="text-base font-black"
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
                      style={{ backgroundColor: colors.surfaceSoft }}
                    >
                      <Text className="text-base">{activePost.avatar}</Text>
                    </View>
                    <Text
                      className="text-sm font-bold"
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
                {activePost?.comments.map((comment) => (
                  <View
                    key={comment.id}
                    className="flex-row gap-3.5 items-start p-1"
                  >
                    <View
                      className="w-9 h-9 rounded-full items-center justify-center"
                      style={{ backgroundColor: colors.surfaceSoft }}
                    >
                      <Text className="text-base">{comment.avatar}</Text>
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
                              onPress={() => {
                                console.log(activePost.id, comment.id)
                                handleDeleteComment(activePost.id, comment.id)
                              }
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
                    </View>
                  </View>
                ))}
                {activePost?.comments.length === 0 && (
                  <Text
                    className="text-xs text-center italic my-6"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    Be the first one to leave a supportive reply!
                  </Text>
                )}
              </View>
            </ScrollView>

            {/* Persistent Absolute Standard Footer Input field layout for writing replies */}
            <View
              className="px-4 py-3 flex-row items-center gap-3"
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.border,
                backgroundColor: colors.surface,
                paddingBottom: Math.max(12, insets.bottom + 8),
              }}
            >
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
                disabled={!newCommentContent.trim()}
                onPress={handlePublishComment}
                className="p-2.5 rounded-full items-center justify-center"
                style={{
                  backgroundColor: newCommentContent.trim()
                    ? colors.primary
                    : colors.border,
                }}
              >
                <Feather
                  name="arrow-up"
                  size={16}
                  color={
                    newCommentContent.trim()
                      ? colors.buttonText
                      : colors.mutedText
                  }
                />
              </TouchableOpacity>
            </View>
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
