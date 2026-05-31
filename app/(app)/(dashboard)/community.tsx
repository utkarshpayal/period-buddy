import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppState } from "../../../components/AppState";
import OptionsModal from "../../../components/OptionsModal";
import { useTheme } from "../../../components/theme";

// --- BACKEND API LAYER SCHEMAS & INTERFACES ---
interface Comment {
  id: string;
  author: string;
  avatar: string;
  content: string;
  time: string;
}

interface Post {
  id: string;
  author: string;
  avatar: string;
  content: string;
  likes: number;
  commentsCount: number;
  comments: Comment[]; // Dynamic sub-array matching active relational database payloads
  time: string;
}

interface Blog {
  id: string;
  title: string;
  subtitle: string;
  readTime: string;
  thumbnailUrl: string;
}

interface Reel {
  id: string;
  title: string;
  videoDuration: string;
  thumbnailUrl: string;
}

// --- INITIAL PAYLOAD RECORDS MATCHING LIVE ENDPOINTS ---
const initialPosts: Post[] = [
  {
    id: "1",
    author: "Sarah M.",
    avatar: "👧",
    content: "Just tracked my period consistently for 3 months! Amazing insights on my body 🎉",
    likes: 234,
    commentsCount: 2,
    time: "2h ago",
    comments: [
      { id: "c_1", author: "Jessica T.", avatar: "👩", content: "So proud of you! Consistency is key 💖", time: "1h ago" },
      { id: "c_2", author: "Lily R.", avatar: "👱‍♀️", content: "Can't wait to reach my 3-month mark too!", time: "45m ago" }
    ]
  },
  {
    id: "2",
    author: "Emma K.",
    avatar: "👩",
    content: "The habit building feature helped me stay consistent. Got 500 tokens this month!",
    likes: 156,
    commentsCount: 1,
    time: "4h ago",
    comments: [
      { id: "c_3", author: "Chloe B.", avatar: "👧", content: "Wow, 500 tokens is amazing! What are you spending them on?", time: "2h ago" }
    ]
  },
];

const blogsData: Blog[] = [
  {
    id: "b1",
    title: "Period Myths Debunked",
    subtitle: "Separating clinical science from traditional generation misconceptions.",
    readTime: "5 min read",
    thumbnailUrl: "https://images.unsplash.com/photo-1516627145497-ae6968895b74?q=80&w=600&auto=format&fit=crop",
  },
];

const reelsData: Reel[] = [
  {
    id: "r1",
    title: "Hormonal Health Tips",
    videoDuration: "3:45",
    thumbnailUrl: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=600&auto=format&fit=crop",
  },
];

export default function Community() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  
  // UI States
  const [activeTab, setActiveTab] = useState<"posts" | "buddy" | "blogs">("posts");
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  
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
  }

  function closeCommentsSheet() {
    setCommentsModalVisible(false);
    setActivePost(null);
    setNewCommentContent("");
  }

  function toggleLike(post: Post) {
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
          ? { ...item, likes: Math.max(0, item.likes + (isAlreadyLiked ? -1 : 1)) }
          : item
      )
    );
    if (!isAlreadyLiked) earnTokens(1);
  }

  // Threads style real-time sub-array append mutation
  function handlePublishPost() {
    if (!newPostContent.trim()) {
      Alert.alert("Empty Post", "Please type something before sharing with the community.");
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
      comments: []
    };

    setPosts([payload, ...posts]);
    setNewPostContent("");
    setCreatePostVisible(false);
    earnTokens(5); // Higher incentive tier for content curation
    Alert.alert("Success 🎉", "Your post has been live streamed to the community feed.");
  }

  function handlePublishComment() {
    if (!newCommentContent.trim() || !activePost) return;

    const freshComment: Comment = {
      id: `c_local_${Date.now()}`,
      author: "You",
      avatar: "✨",
      content: newCommentContent.trim(),
      time: "Just now"
    };

    // Immutably patching structural nested relational values
    const updatedPosts = posts.map((item) => {
      if (item.id === activePost.id) {
        const structuralComments = [...item.comments, freshComment];
        const patchedObject = {
          ...item,
          commentsCount: item.commentsCount + 1,
          comments: structuralComments
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
  }

  async function shareCommunityPost(post: Post) {
    await sharePost(`${post.author}: ${post.content}`);
    earnTokens(2);
  }

  function saveActivePost() {
    if (!activePost) return;
    const wasSaved = savedPosts.has(activePost.id);
    toggleSavedPost(activePost.id);
    if (!wasSaved) earnTokens(3);
    closeOptions();
  }

  function reportActivePost() {
    if (!activePost) return;
    reportPost(activePost.id);
    closeOptions();
  }

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-1 relative">
          
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
            {/* Header */}
            <View className="px-6 pt-6">
              <Text className="text-3xl font-extrabold tracking-tight" style={{ color: colors.foreground }}>
                Community
              </Text>
              <Text className="text-xs font-semibold mt-1" style={{ color: colors.mutedText }}>
                Safe private hub for shared experiences & clinical logs
              </Text>
            </View>

            {/* Segmented Controls Tabs */}
            <View className="mt-5 flex-row gap-2 px-6">
              {[
                { id: "posts", label: "Posts" },
                { id: "buddy", label: "Period Buddy" },
                { id: "blogs", label: "Blogs & Reels" },
              ].map((tab) => {
                const isSelected = activeTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    onPress={() => setActiveTab(tab.id as any)}
                    activeOpacity={0.8}
                    className="rounded-full px-5 py-2 border shadow-2xs"
                    style={{
                      backgroundColor: isSelected ? colors.primary : colors.surface,
                      borderColor: isSelected ? colors.primary : colors.border,
                    }}
                  >
                    <Text className="text-xs font-bold tracking-wide" style={{ color: isSelected ? colors.buttonText : colors.foreground }}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* FEED CONTAINER */}
            {activeTab === "posts" && (
              <View className="mt-6 gap-4 px-6">
                {posts.map((post) => {
                  const isReported = reportedPosts.has(post.id);
                  const isLiked = likedPostIds.has(post.id);
                  const isSaved = savedPosts.has(post.id);

                  return (
                    <View
                      key={post.id}
                      className="rounded-3xl border p-5 shadow-2xs relative"
                      style={{
                        backgroundColor: colors.surface,
                        borderColor: isReported ? "#ef4444" : colors.border,
                      }}
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-3">
                          <View className="w-11 h-11 bg-neutral-100 dark:bg-neutral-800 rounded-full items-center justify-center border border-neutral-200/40">
                            <Text className="text-xl">{post.avatar}</Text>
                          </View>
                          <View>
                            <Text className="text-sm font-bold" style={{ color: colors.foreground }}>{post.author}</Text>
                            <Text className="text-[11px] font-semibold mt-0.5" style={{ color: colors.mutedText }}>{post.time}</Text>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => openOptions(post)} className="p-2 -mr-2">
                          <Feather name="more-vertical" size={18} color={colors.mutedText} />
                        </TouchableOpacity>
                      </View>

                      <Text className="mt-4 text-sm font-medium leading-5" style={{ color: colors.foreground }}>
                        {post.content}
                      </Text>

                      {/* Action Bar */}
                      <View className="mt-5 pt-3 border-t border-neutral-100 dark:border-neutral-800/60 flex-row justify-between items-center px-1">
                        <TouchableOpacity className="flex-row items-center gap-2 py-1" onPress={() => toggleLike(post)}>
                          <Ionicons name={isLiked ? "heart" : "heart-outline"} size={20} color={isLiked ? "#e11d48" : colors.mutedText} />
                          <Text className="text-xs font-bold" style={{ color: colors.mutedText }}>{post.likes}</Text>
                        </TouchableOpacity>

                        {/* Open Threads-Style sliding comments sub-module */}
                        <TouchableOpacity className="flex-row items-center gap-2 py-1" onPress={() => openCommentsSheet(post)}>
                          <Ionicons name="chatbubble-outline" size={18} color={colors.mutedText} />
                          <Text className="text-xs font-bold" style={{ color: colors.mutedText }}>{post.commentsCount}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity className="py-1" onPress={() => shareCommunityPost(post)}>
                          <Ionicons name="share-social-outline" size={19} color={colors.mutedText} />
                        </TouchableOpacity>
                      </View>

                      {/* Meta badges overlay */}
                      {(isSaved || isReported) && (
                        <View className="mt-4 flex-row gap-1.5">
                          {isSaved && (
                            <View className="flex-row items-center gap-1 rounded-full px-2.5 py-0.5 bg-pink-50 dark:bg-pink-950/40">
                              <Text className="text-[10px] font-bold" style={{ color: colors.primary }}>Saved</Text>
                            </View>
                          )}
                          {isReported && (
                            <View className="flex-row items-center gap-1 rounded-full px-2.5 py-0.5 bg-red-50 dark:bg-red-950/40">
                              <Text className="text-[10px] font-bold" style={{ color: "#ef4444" }}>Reported</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* BUDDY MATCHING SYSTEM */}
            {activeTab === "buddy" && (
              <View className="mt-6 px-6">
                <View className="rounded-3xl border p-6 items-center shadow-xs" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
                  <View className="p-4 rounded-2xl bg-pink-50 dark:bg-pink-950/30 mb-4">
                    <MaterialCommunityIcons name="star-face" size={36} color={colors.primary} />
                  </View>
                  <Text className="text-lg font-extrabold" style={{ color: colors.foreground }}>Nominate Period Buddy</Text>
                  <Text className="mt-2 text-xs text-center px-4 leading-4" style={{ color: colors.mutedText }}>Match instantly with a sister sharing your specific cycle phases.</Text>
                  <TouchableOpacity activeOpacity={0.85} className="mt-6 w-full rounded-xl py-3.5 items-center justify-center" onPress={() => router.push("/(app)/buddy-nomination" as any)} style={{ backgroundColor: colors.primary }}>
                    <Text className="text-sm font-bold" style={{ color: colors.buttonText }}>Nominate Now</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* EDUCATION MODULE (BLOGS) */}
            {activeTab === "blogs" && (
              <View className="mt-6 px-6 gap-5">
                {blogsData.map((blog) => (
                  <TouchableOpacity key={blog.id} className="overflow-hidden rounded-3xl border flex-row h-28" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
                    <Image source={{ uri: blog.thumbnailUrl }} className="w-28 h-full bg-neutral-200" />
                    <View className="flex-1 p-3 justify-center">
                      <Text className="font-extrabold text-sm" style={{ color: colors.foreground }}>{blog.title}</Text>
                      <Text className="text-[11px] mt-1" style={{ color: colors.mutedText }} numberOfLines={2}>{blog.subtitle}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>

          {/* FLOATING ACTION TRIGGER BAR (THREADS-STYLE FLOAT FAB) */}
          {activeTab === "posts" && (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setCreatePostVisible(true)}
              className="absolute bottom-28 right-6 w-14 h-14 rounded-full items-center justify-center shadow-lg border"
              style={{ backgroundColor: colors.primary, borderColor: colors.background }}
            >
              <Feather name="edit-3" size={22} color={colors.buttonText} />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      {/* --- MODAL FEATURE 1: COMPOSE FRESH POST SHEET --- */}
      <Modal visible={createPostVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCreatePostVisible(false)}>
        <View className="flex-1 px-6 pt-6" style={{ backgroundColor: colors.background }}>
          <View className="flex-row justify-between items-center mb-6">
            <TouchableOpacity onPress={() => setCreatePostVisible(false)}>
              <Text className="text-base font-semibold" style={{ color: colors.mutedText }}>Cancel</Text>
            </TouchableOpacity>
            <Text className="text-lg font-black" style={{ color: colors.foreground }}>New Thread</Text>
            <TouchableOpacity onPress={handlePublishPost} className="px-4 py-1.5 rounded-full" style={{ backgroundColor: colors.primary }}>
              <Text className="text-xs font-bold" style={{ color: colors.buttonText }}>Post</Text>
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
              style={{ color: colors.foreground, verticalAlign: "top" }}
            />
          </View>
        </View>
      </Modal>

      {/* --- MODAL FEATURE 2: THREADS STYLE DETAIL SLIDING COMMENTS MODULE --- */}
      <Modal visible={commentsModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeCommentsSheet}>
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
          {/* Sheet Header navigation panel bar */}
          <View className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-900 flex-row justify-between items-center">
            <TouchableOpacity onPress={closeCommentsSheet}>
              <Feather name="x" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text className="text-base font-black" style={{ color: colors.foreground }}>Thread Discussion</Text>
            <View className="w-5" />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} className="flex-1 px-6 pt-4">
            {/* Primary Render Target Focused Post Header Context info segment */}
            {activePost && (
              <View className="pb-5 border-b border-neutral-100 dark:border-neutral-900">
                <g className="flex-row items-center gap-3">
                  <Text className="text-2xl">{activePost.avatar}</Text>
                  <Text className="text-sm font-bold" style={{ color: colors.foreground }}>{activePost.author}</Text>
                </g>
                <Text className="mt-3 text-sm leading-5" style={{ color: colors.foreground }}>{activePost.content}</Text>
              </View>
            )}

            {/* List Array Generation target segment for mapped Comments database blocks */}
            <View className="mt-5 gap-4 pb-20">
              <Text className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: colors.mutedText }}>Responses</Text>
              {activePost?.comments.map((comment) => (
                <View key={comment.id} className="flex-row gap-3.5 items-start p-1">
                  <View className="w-9 h-9 bg-neutral-100 dark:bg-neutral-800 rounded-full items-center justify-center">
                    <Text className="text-base">{comment.avatar}</Text>
                  </View>
                  <View className="flex-1 bg-neutral-50 dark:bg-neutral-900/60 p-3.5 rounded-2xl border border-neutral-100/50 dark:border-neutral-800/40">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-xs font-bold" style={{ color: colors.foreground }}>{comment.author}</Text>
                      <Text className="text-[10px] font-semibold" style={{ color: colors.mutedText }}>{comment.time}</Text>
                    </View>
                    <Text className="text-xs font-medium mt-1.5 leading-4" style={{ color: colors.foreground }}>{comment.content}</Text>
                  </View>
                </View>
              ))}
              {activePost?.comments.length === 0 && (
                <Text className="text-xs text-center italic my-6" style={{ color: colors.mutedText }}>Be the first one to leave a supportive reply!</Text>
              )}
            </View>
          </ScrollView>

          {/* Persistent Absolute Standard Footer Input field layout for writing replies */}
          <View className="px-4 py-3 border-t border-neutral-100 dark:border-neutral-900 flex-row items-center gap-3" style={{ backgroundColor: colors.surface }}>
            <TextInput
              placeholder="Post your reply..."
              placeholderTextColor={colors.mutedText}
              value={newCommentContent}
              onChangeText={setNewCommentContent}
              className="flex-1 bg-neutral-100 dark:bg-neutral-800 px-4 py-3 rounded-xl text-sm"
              style={{ color: colors.foreground }}
            />
            <TouchableOpacity 
              disabled={!newCommentContent.trim()} 
              onPress={handlePublishComment} 
              className="p-2.5 rounded-full items-center justify-center"
              style={{ backgroundColor: newCommentContent.trim() ? colors.primary : colors.border }}
            >
              <Feather name="arrow-up" size={16} color={newCommentContent.trim() ? colors.buttonText : colors.mutedText} />
            </TouchableOpacity>
          </View>
        </View>
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
        isSaved={activePost ? savedPosts.has(activePost.id) : false}
        isReported={activePost ? reportedPosts.has(activePost.id) : false}
      />
    </>
  );
}