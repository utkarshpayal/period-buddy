import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppState } from "../../../components/AppState";
import OptionsModal from "../../../components/OptionsModal";
import { useTheme } from "../../../components/theme";

interface Post {
  id: string;
  author: string;
  avatar: string;
  content: string;
  likes: number;
  comments: number;
  time: string;
}

const initialPosts: Post[] = [
  {
    id: "1",
    author: "Sarah M.",
    avatar: "👧",
    content:
      "Just tracked my period consistently for 3 months! Amazing insights on my body 🎉",
    likes: 234,
    comments: 45,
    time: "2h ago",
  },
  {
    id: "2",
    author: "Emma K.",
    avatar: "👩",
    content:
      "The habit building feature helped me stay consistent. Got 500 tokens this month!",
    likes: 156,
    comments: 32,
    time: "4h ago",
  },
];

export default function Community() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"posts" | "buddy" | "blogs">(
    "posts",
  );
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [activePost, setActivePost] = useState<Post | null>(null);
  const {
    reportPost,
    sharePost,
    earnTokens,
    savedPosts,
    reportedPosts,
    toggleSavedPost,
  } = useAppState();

  function openOptions(post: Post) {
    setActivePost(post);
    setOptionsVisible(true);
  }

  function closeOptions() {
    setOptionsVisible(false);
    setActivePost(null);
  }

  function toggleLike(post: Post) {
    const isAlreadyLiked = likedPostIds.has(post.id);

    setLikedPostIds((current) => {
      const next = new Set(current);

      if (isAlreadyLiked) {
        next.delete(post.id);
      } else {
        next.add(post.id);
      }

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
  }

  function addComment(post: Post) {
    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? {
              ...item,
              comments: item.comments + 1,
            }
          : item,
      ),
    );
    earnTokens(1);
    Alert.alert("Comment added", "A supportive quick comment was added.");
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

      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
      >
        <ScrollView contentContainerClassName="pb-20">
          <View className="px-6 pt-6">
            <Text
              className="text-3xl font-bold"
              style={{ color: colors.foreground }}
            >
              Community
            </Text>
          </View>

          {/* Tabs */}
          <View className="mt-6 flex-row gap-2 px-6">
            {["posts", "buddy", "blogs"].map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab as any)}
                className="rounded-full px-6 py-2"
                style={{
                  backgroundColor:
                    activeTab === tab ? colors.primary : colors.surface,
                  borderWidth: activeTab === tab ? 0 : 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  className="text-sm font-semibold capitalize"
                  style={{
                    color:
                      activeTab === tab ? colors.buttonText : colors.foreground,
                  }}
                >
                  {tab === "buddy"
                    ? "Period Buddy"
                    : tab === "blogs"
                      ? "Blogs & Reels"
                      : "Posts"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Posts */}
          {activeTab === "posts" && (
            <View className="mt-6">
              {posts.map((post) => (
                <View
                  key={post.id}
                  className="mx-6 mb-4 rounded-2xl border-2 p-4"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: reportedPosts.has(post.id)
                      ? "#ef4444"
                      : colors.border,
                  }}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-3">
                      <Text className="text-3xl">{post.avatar}</Text>
                      <View>
                        <Text
                          className="font-semibold"
                          style={{ color: colors.foreground }}
                        >
                          {post.author}
                        </Text>
                        <Text
                          className="text-xs"
                          style={{ color: colors.mutedText }}
                        >
                          {post.time}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => openOptions(post)}
                      accessibilityLabel="Open post options"
                      style={{ padding: 8, margin: -8 }}
                    >
                      <Ionicons
                        name="ellipsis-vertical"
                        size={20}
                        color={colors.mutedText}
                      />
                    </TouchableOpacity>
                  </View>

                  <Text className="mt-4" style={{ color: colors.foreground }}>
                    {post.content}
                  </Text>

                  <View className="mt-4 flex-row justify-between">
                    <TouchableOpacity
                      className="flex-row items-center gap-2"
                      onPress={() => toggleLike(post)}
                    >
                      <Ionicons
                        name={
                          likedPostIds.has(post.id) ? "heart" : "heart-outline"
                        }
                        size={20}
                        color={colors.primary}
                      />
                      <Text
                        className="text-sm"
                        style={{ color: colors.mutedText }}
                      >
                        {post.likes}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="flex-row items-center gap-2"
                      onPress={() => addComment(post)}
                    >
                      <Ionicons
                        name="chatbubble-outline"
                        size={20}
                        color={colors.secondary}
                      />
                      <Text
                        className="text-sm"
                        style={{ color: colors.mutedText }}
                      >
                        {post.comments}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="flex-row items-center gap-2"
                      onPress={() => shareCommunityPost(post)}
                    >
                      <Ionicons
                        name="share-social-outline"
                        size={20}
                        color={colors.accent}
                      />
                    </TouchableOpacity>
                  </View>

                  {(savedPosts.has(post.id) || reportedPosts.has(post.id)) && (
                    <View className="mt-4 flex-row gap-2">
                      {savedPosts.has(post.id) && (
                        <View
                          className="flex-row items-center gap-1 rounded-full px-3 py-1"
                          style={{ backgroundColor: colors.primaryLight }}
                        >
                          <Ionicons
                            name="bookmark"
                            size={12}
                            color={colors.primary}
                          />
                          <Text
                            className="text-xs font-semibold"
                            style={{ color: colors.primary }}
                          >
                            Saved
                          </Text>
                        </View>
                      )}

                      {reportedPosts.has(post.id) && (
                        <View
                          className="flex-row items-center gap-1 rounded-full px-3 py-1"
                          style={{ backgroundColor: "#fee2e2" }}
                        >
                          <Ionicons name="flag" size={12} color="#ef4444" />
                          <Text
                            className="text-xs font-semibold"
                            style={{ color: "#ef4444" }}
                          >
                            Reported
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Period Buddy Nomination */}
          {activeTab === "buddy" && (
            <View className="mt-6 px-6">
              <View
                className="rounded-2xl border-2 p-6"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.primary,
                }}
              >
                <Ionicons
                  name="star"
                  size={40}
                  color={colors.primary}
                  style={{ alignSelf: "center", marginBottom: 12 }}
                />
                <Text
                  className="text-center text-lg font-bold"
                  style={{ color: colors.foreground }}
                >
                  Nominate Your Period Buddy
                </Text>
                <Text
                  className="mt-3 text-center text-sm"
                  style={{ color: colors.mutedText }}
                >
                  This month, nominate a girl with a matching cycle phase! 🌙
                </Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  className="mt-6 rounded-lg py-3"
                  onPress={() => router.push("/(app)/buddy-nomination" as any)}
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text
                    className="text-center font-semibold"
                    style={{ color: colors.buttonText }}
                  >
                    Nominate Now →
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Blogs & Reels */}
          {activeTab === "blogs" && (
            <View className="mt-6 px-6">
              {[1, 2, 3].map((i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() =>
                    router.push(i % 2 === 0 ? "/(app)/blogs" : "/(app)/reels")
                  }
                  className="mb-4 overflow-hidden rounded-2xl border-2"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <View className="h-40 bg-gradient-to-b from-pink-400 to-purple-500" />
                  <View className="p-4">
                    <Text
                      className="font-bold"
                      style={{ color: colors.foreground }}
                    >
                      {i === 1
                        ? "Period Myths Debunked"
                        : i === 2
                          ? "PCOS Management Guide"
                          : "Hormonal Health Tips"}
                    </Text>
                    <Text
                      className="mt-2 text-sm"
                      style={{ color: colors.mutedText }}
                    >
                      {i % 2 === 0 ? "Blog • 5 min read" : "Video • 8 min"}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
      <OptionsModal
        visible={optionsVisible}
        onClose={closeOptions}
        onShare={async () => {
          if (activePost) {
            await shareCommunityPost(activePost);
          }
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
