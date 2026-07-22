import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import { alert } from "../../lib/alert";
import { useTheme } from "../../components/theme";
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import { blogsApi, type Blog, type BlogCategory, type ContentFeedItem } from "../../lib/api";
import { shareWithAppLink } from "../../lib/share";

// --- BACKEND REST API PAYLOAD CONTRACTS ---
interface ContentItem {
  id: string;
  title: string;
  author: string;
  type: "blog" | "reel";
  time: string;
  imageUrl: string;
  verified: boolean;
  summary: string;
  slug?: string;
  category?: BlogCategory;
  tags?: string[];
  viewCount?: number;
  likeCount?: number;
}

const CATEGORY_LABELS: Record<BlogCategory, string> = {
  general: "General",
  health: "Health",
  lifestyle: "Lifestyle",
  beauty: "Beauty",
};

const CATEGORY_OPTIONS: { id: "all" | BlogCategory; label: string }[] = [
  { id: "all", label: "All Categories" },
  ...(Object.keys(CATEGORY_LABELS) as BlogCategory[]).map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
  })),
];

const fallbackContent: ContentItem[] = [
  {
    id: "c1",
    title: "Understanding Your Hormonal Cycle",
    author: "Dr. Sarah Chen (Endocrinologist)",
    type: "blog",
    time: "8 min read",
    imageUrl:
      "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=600&auto=format&fit=crop",
    verified: true,
    summary:
      "A practical guide to the common phases of a menstrual cycle, what can change in mood and energy, and how tracking helps you notice your own pattern.",
  },
  {
    id: "c2",
    title: "Yoga and Targeted Stretching for Cramps",
    author: "Coach Fernanda Fit",
    type: "reel",
    time: "10 min playback",
    imageUrl:
      "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=600&auto=format&fit=crop",
    verified: true,
    summary:
      "Gentle movements like child pose, cat-cow, and supported hip stretches may reduce tension and make cramps easier to manage.",
  },
  {
    id: "c3",
    title: "PCOS / PCOD: What You Need to Know Today",
    author: "Dr. Priya Sharma (OBGYN)",
    type: "blog",
    time: "12 min read",
    imageUrl:
      "https://images.unsplash.com/photo-1511556532299-8f662fc26c06?q=80&w=600&auto=format&fit=crop",
    verified: true,
    summary:
      "Learn the common signs of PCOS/PCOD, what to track, and when to bring symptoms to a clinician for a proper evaluation.",
  },
  {
    id: "c4",
    title: "Period Myths vs Clinical Facts",
    author: "Jessica Wellness Team",
    type: "reel",
    time: "5 min playback",
    imageUrl:
      "https://images.unsplash.com/photo-1516627145497-ae6968895b74?q=80&w=600&auto=format&fit=crop",
    verified: true,
    summary:
      "A simple myth-busting guide on swimming, movement, showers, hygiene, and what is actually safe during a period.",
  },
];

function mapFeedItem(item: ContentFeedItem): ContentItem {
  return {
    id: item.sourceId,
    title: item.title,
    author: item.author,
    type: item.type,
    time: item.time,
    imageUrl: item.imageUrl,
    verified: item.verified,
    summary: item.summary,
    slug: item.slug,
    category: item.category,
    tags: item.tags,
    viewCount: item.viewCount,
    likeCount: item.likeCount,
  };
}

function formatCount(count?: number): string {
  if (!count) return "0";
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export default function Blogs() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const { earnTokens } = useAppState();

  // Functional Interface States
  const [selectedType, setSelectedType] = useState<"all" | "blog" | "reel">(
    "all",
  );
  const [selectedCategory, setSelectedCategory] = useState<
    "all" | BlogCategory
  >("all");
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [content, setContent] = useState<ContentItem[]>(fallbackContent);
  const [usingFallback, setUsingFallback] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Immersive Preview Modal Layer States
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [fullBlog, setFullBlog] = useState<Blog | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);

  const softTints = getSoftTints(colors);

  const PAGE_SIZE = 10;

  useEffect(() => {
    let isMounted = true;

    async function loadFeed() {
      try {
        const response = await blogsApi.getFeed({
          limit: PAGE_SIZE,
          page: 1,
          type: selectedType,
          category:
            selectedCategory === "all" ? undefined : selectedCategory,
        });
        if (!isMounted) return;
        if (response.items.length > 0) {
          setContent(response.items.map(mapFeedItem));
          setUsingFallback(false);
          setPage(1);
          setHasMore(response.pagination.page < response.pagination.pages);
        } else {
          setContent([]);
          setUsingFallback(false);
          setHasMore(false);
        }
      } catch {
        if (!isMounted) return;
        setContent(fallbackContent);
        setUsingFallback(true);
        setHasMore(false);
      }
    }

    loadFeed();

    return () => {
      isMounted = false;
    };
  }, [selectedType, selectedCategory]);

  async function handleLoadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const response = await blogsApi.getFeed({
        limit: PAGE_SIZE,
        page: nextPage,
        type: selectedType,
        category: selectedCategory === "all" ? undefined : selectedCategory,
      });
      setContent((prev) => [...prev, ...response.items.map(mapFeedItem)]);
      setPage(nextPage);
      setHasMore(response.pagination.page < response.pagination.pages);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  const filteredContent =
    selectedType === "all"
      ? content
      : content.filter((c) => c.type === selectedType);

  // --- ACTIONS CONTROLLERS INTERACTIVITY LAYER ---
  function handleToggleBookmark(id: string) {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        earnTokens(2);
      }
      return next;
    });
  }

  async function handleTriggerPreview(item: ContentItem) {
    setSelectedItem(item);
    setPreviewVisible(true);
    setFullBlog(null);
    earnTokens(1);

    if (item.type !== "blog" || !item.slug) return;

    setArticleLoading(true);
    try {
      const blog = await blogsApi.getBlogBySlug(item.slug);
      setFullBlog(blog);
    } catch {
      setFullBlog(null);
    } finally {
      setArticleLoading(false);
    }
  }

  async function handleShareContent(item: ContentItem) {
    try {
      await shareWithAppLink(
        `Check out this verified health resource on Nura: "${item.title}" by ${item.author}.`,
      );
      earnTokens(3);
    } catch {
      alert(
        "Error",
        "Unable to open the share sheet right now.",
      );
    }
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
        {/* Navigation Action Bar */}
        <View className="flex-row items-center gap-2 px-6 pt-6">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="p-2.5 -ml-2 rounded-full border"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <Text
            className="flex-1 text-2xl font-black tracking-tight ml-2"
            style={{ color: colors.foreground, fontFamily: fonts.heading }}
          >
            Insights Feed
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
        >
          {/* Segmented Controller Chips Selection */}
          <View className="mt-5 flex-row gap-2 px-6">
            {[
              { id: "all", label: "All Insights" },
              { id: "blog", label: "Journals & Blogs" },
              { id: "reel", label: "Video Insights" },
            ].map((tab) => {
              const isSelected = selectedType === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setSelectedType(tab.id as any)}
                  activeOpacity={0.8}
                  className="rounded-full px-5 py-2.5 border shadow-3xs"
                  style={{
                    backgroundColor: isSelected
                      ? colors.primary
                      : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    className="text-xs font-bold tracking-wide"
                    style={{
                      color: isSelected ? colors.buttonText : colors.foreground,
                      fontFamily: fonts.body,
                    }}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Category Filter Dropdown Selection */}
          {selectedType !== "reel" && (
            <View className="mt-3 px-6">
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setCategoryPickerVisible(true)}
                className="self-start flex-row items-center gap-1.5 px-4 py-2 rounded-full border"
                style={{
                  backgroundColor:
                    selectedCategory === "all" ? colors.surface : softTints.pink,
                  borderColor:
                    selectedCategory === "all" ? colors.border : colors.primary,
                }}
              >
                <Text
                  className="text-xs font-bold"
                  style={{
                    color:
                      selectedCategory === "all"
                        ? colors.foreground
                        : colors.primary,
                    fontFamily: fonts.body,
                  }}
                >
                  {
                    CATEGORY_OPTIONS.find((c) => c.id === selectedCategory)
                      ?.label
                  }
                </Text>
                <Feather
                  name="chevron-down"
                  size={13}
                  color={selectedCategory === "all" ? colors.mutedText : colors.primary}
                />
              </TouchableOpacity>
            </View>
          )}

          {/* DYNAMIC MEDIA CONTENT TIMELINE CARDS WRAPPER */}
          <View className="mt-6 gap-4 px-6">
            {filteredContent.map((item) => {
              const isBookmarked = bookmarkedIds.has(item.id);
              const isVideo = item.type === "reel";

              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.9}
                  onPress={() => handleTriggerPreview(item)} // FIXED: Ab pure card container touch par hi modal sheet slide up ho jayegi
                  className="overflow-hidden rounded-3xl border shadow-2xl"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <View className="flex-row h-36">
                    {/* ASYMMETRIC IMAGE PANEL WITH NATIVE MEDIA HOOK OVERLAYS */}
                    <View className="w-36 h-full relative bg-neutral-100 dark:bg-neutral-800">
                      <Image
                        source={{ uri: item.imageUrl }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />

                      {isVideo && (
                        /* Centered overlay blur layout for video identifier markers */
                        <View className="absolute inset-0 items-center justify-center bg-black/10">
                          <View className="w-8 h-8 rounded-full bg-white/30 items-center justify-center border border-white/40 shadow-sm">
                            <Ionicons
                              name="play"
                              size={14}
                              color="white"
                              className="ml-0.5"
                            />
                          </View>
                        </View>
                      )}
                    </View>

                    {/* CONTEXT DATA DETAIL COLUMN */}
                    <View className="flex-1 p-4 justify-between">
                      <View>
                        <View className="flex-row items-start justify-between gap-1.5">
                          <Text
                            className="flex-1 text-sm font-black tracking-tight leading-4.5"
                            numberOfLines={2}
                            style={{ color: colors.foreground, fontFamily: fonts.heading }}
                          >
                            {item.title}
                          </Text>

                          {/* Bookmark Save Interaction Floating Anchor */}
                          <TouchableOpacity
                            onPress={() => handleToggleBookmark(item.id)}
                            className="-mt-1 -mr-1 p-1"
                            hitSlop={{
                              top: 10,
                              bottom: 10,
                              left: 10,
                              right: 10,
                            }} // Prevents accidental full card clicks when targeting bookmark icon
                          >
                            <Ionicons
                              name={
                                isBookmarked ? "bookmark" : "bookmark-outline"
                              }
                              size={16}
                              color={
                                isBookmarked ? colors.primary : colors.mutedText
                              }
                            />
                          </TouchableOpacity>
                        </View>

                        {/* Author Credentials and Professional Check Tag Badge */}
                        <View className="flex-row items-center gap-1.5 mt-1.5 flex-wrap">
                          <Text
                            className="text-[11px] font-semibold"
                            style={{ color: colors.mutedText, fontFamily: fonts.body }}
                            numberOfLines={1}
                          >
                            {item.author}
                          </Text>
                          {item.verified && (
                            <MaterialCommunityIcons
                              name="shield-check"
                              size={12}
                              color={colors.success}
                            />
                          )}
                        </View>

                        {/* Category + Tags Segregation Row */}
                        {(item.category || (item.tags && item.tags.length > 0)) && (
                          <View className="flex-row items-center gap-1 mt-1 flex-wrap">
                            {item.category && (
                              <View
                                className="px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: softTints.pink }}
                              >
                                <Text
                                  className="text-[9px] font-bold uppercase"
                                  style={{ color: colors.primary, fontFamily: fonts.body }}
                                >
                                  {CATEGORY_LABELS[item.category]}
                                </Text>
                              </View>
                            )}
                            {item.tags?.slice(0, 2).map((tag) => (
                              <Text
                                key={tag}
                                className="text-[9px] font-semibold"
                                style={{ color: colors.mutedText, fontFamily: fonts.body }}
                                numberOfLines={1}
                              >
                                #{tag}
                              </Text>
                            ))}
                          </View>
                        )}
                      </View>

                      {/* Card Lower Parameters Bar Action Section */}
                      <View className="flex-row items-center justify-between pt-2 border-t border-neutral-50 dark:border-neutral-900/60">
                        <View className="flex-row items-center gap-2.5">
                          <View className="flex-row items-center gap-1">
                            <Feather
                              name="clock"
                              size={11}
                              color={colors.mutedText}
                            />
                            <Text
                              className="text-[10px] font-bold tracking-wide"
                              style={{ color: colors.mutedText, fontFamily: fonts.body }}
                            >
                              {item.time}
                            </Text>
                          </View>
                          {item.type === "blog" && (
                            <View className="flex-row items-center gap-1">
                              <Feather
                                name="eye"
                                size={11}
                                color={colors.mutedText}
                              />
                              <Text
                                className="text-[10px] font-bold tracking-wide"
                                style={{ color: colors.mutedText, fontFamily: fonts.body }}
                              >
                                {formatCount(item.viewCount)}
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Immersive Sheet Reader Trigger CTA Button */}
                        <View
                          className="px-4 py-1.5 rounded-xl shadow-3xs"
                          style={{
                            backgroundColor: isVideo
                              ? softTints.purple
                              : softTints.pink,
                          }}
                        >
                          <Text
                            className="text-[11px] font-black"
                            style={{
                              color: isVideo ? colors.accent : colors.primary,
                              fontFamily: fonts.body,
                            }}
                          >
                            {isVideo ? "Watch" : "Read"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            {filteredContent.length === 0 && (
              <View className="items-center py-10">
                <Text
                  className="text-sm font-medium"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  No insights found for this filter yet.
                </Text>
              </View>
            )}

            {!usingFallback && hasMore && filteredContent.length > 0 && (
              <TouchableOpacity
                onPress={handleLoadMore}
                disabled={loadingMore}
                activeOpacity={0.8}
                className="items-center justify-center py-3 rounded-2xl border mt-1"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
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
            )}
          </View>
        </ScrollView>

        {/* --- CATEGORY FILTER DROPDOWN SELECT MODAL --- */}
        <Modal
          visible={categoryPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCategoryPickerVisible(false)}
        >
          <Pressable
            className="flex-1 justify-center items-center px-8"
            style={{ backgroundColor: colors.overlay }}
            onPress={() => setCategoryPickerVisible(false)}
          >
            <View
              className="w-full max-w-[280px] p-4 rounded-3xl border"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                ...getShadow(colors, isDark),
              }}
            >
              <Text
                className="text-center font-extrabold mb-3 text-base"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                Filter by Category
              </Text>
              {CATEGORY_OPTIONS.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => {
                      setSelectedCategory(cat.id);
                      setCategoryPickerVisible(false);
                    }}
                    className="py-3 px-4 rounded-xl flex-row items-center justify-between"
                    style={{
                      backgroundColor: isSelected ? softTints.pink : "transparent",
                    }}
                  >
                    <Text
                      className="font-bold text-sm"
                      style={{
                        color: isSelected ? colors.primary : colors.foreground,
                        fontFamily: fonts.body,
                      }}
                    >
                      {cat.label}
                    </Text>
                    {isSelected && (
                      <Feather name="check" size={16} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Modal>

        {/* --- DYNAMIC THREADS-STYLE INTERNAL DOCUMENT PREVIEW OVERLAY SHEET MODAL --- */}
        <Modal
          visible={previewVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setPreviewVisible(false)}
        >
          {selectedItem && (
            <View
              className="flex-1"
              style={{ backgroundColor: colors.background }}
            >
              {/* Overlay Navigation Sticky Upper Bar segment */}
              <View
                className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-900/60 flex-row justify-between items-center"
                style={{ backgroundColor: colors.surface }}
              >
                <View className="flex-row items-center gap-2">
                  <View className="px-2.5 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800">
                    <Text
                      className="text-[9px] font-black uppercase tracking-wider"
                      style={{ color: !isDark ? "white" : "black", fontFamily: fonts.body }}
                    >
                      {selectedItem.type === "blog" ? "Journal" : "Video"}
                    </Text>
                  </View>
                  {selectedItem.verified && (
                    <MaterialCommunityIcons
                      name="shield-check"
                      size={14}
                      color={colors.success}
                    />
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => setPreviewVisible(false)}
                  className="p-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full"
                >
                  <Feather name="x" size={16} color={!isDark ? "white" : "black"} />
                </TouchableOpacity>
              </View>

              {/* Scrollable Clinical Document Framework Canvas section */}
              <ScrollView showsVerticalScrollIndicator={false}>
                <View className="w-full h-56 bg-neutral-100 dark:bg-neutral-900 relative">
                  <Image
                    source={{ uri: selectedItem.imageUrl }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                  <View className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

                  {/* Title text overlay embedded on asset hero container templates */}
                  <View className="absolute bottom-5 left-6 right-6">
                    <Text className="text-xl font-black text-white tracking-tight leading-6 shadow-sm" style={{ fontFamily: fonts.heading }}>
                      {selectedItem.title}
                    </Text>
                    <Text className="text-xs text-white/90 font-medium mt-1" style={{ fontFamily: fonts.body }}>
                      By {selectedItem.author}
                    </Text>
                  </View>
                </View>

                {/* Main Core Typography reading content area wrapper segments */}
                <View className="p-6">
                  {/* Category, tags and engagement stats segregation row */}
                  {(fullBlog || selectedItem.category || selectedItem.tags) && (
                    <View className="flex-row items-center flex-wrap gap-1.5 mb-3">
                      {(fullBlog?.category ?? selectedItem.category) && (
                        <View
                          className="px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: softTints.pink }}
                        >
                          <Text
                            className="text-[10px] font-bold uppercase"
                            style={{ color: colors.primary, fontFamily: fonts.body }}
                          >
                            {
                              CATEGORY_LABELS[
                                (fullBlog?.category ?? selectedItem.category)!
                              ]
                            }
                          </Text>
                        </View>
                      )}
                      {(fullBlog?.tags ?? selectedItem.tags ?? []).map((tag) => (
                        <Text
                          key={tag}
                          className="text-[10px] font-semibold"
                          style={{ color: colors.mutedText, fontFamily: fonts.body }}
                        >
                          #{tag}
                        </Text>
                      ))}
                    </View>
                  )}

                  {selectedItem.type === "blog" && (
                    <View className="flex-row items-center gap-4 mb-4 pb-4 border-b border-neutral-100 dark:border-neutral-900">
                      <View className="flex-row items-center gap-1">
                        <Feather name="eye" size={12} color={colors.mutedText} />
                        <Text
                          className="text-[11px] font-bold"
                          style={{ color: colors.mutedText, fontFamily: fonts.body }}
                        >
                          {formatCount(fullBlog?.viewCount ?? selectedItem.viewCount)} views
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Ionicons name="heart" size={12} color={colors.mutedText} />
                        <Text
                          className="text-[11px] font-bold"
                          style={{ color: colors.mutedText, fontFamily: fonts.body }}
                        >
                          {formatCount(fullBlog?.likeCount ?? selectedItem.likeCount)} likes
                        </Text>
                      </View>
                    </View>
                  )}

                  <Text
                    className="text-xs font-bold tracking-widest uppercase mb-3"
                    style={{ color: colors.primary, fontFamily: fonts.heading }}
                  >
                    {fullBlog?.content ? "Full Article" : "Verified Health Summary"}
                  </Text>

                  {articleLoading ? (
                    <View className="items-center py-8">
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  ) : fullBlog?.content ? (
                    <View className="mb-8">
                      <Markdown
                        style={{
                          body: {
                            color: colors.foreground,
                            fontFamily: fonts.body,
                            fontSize: 14,
                            lineHeight: 22,
                          },
                          heading1: {
                            color: colors.foreground,
                            fontFamily: fonts.heading,
                            fontSize: 20,
                            marginTop: 4,
                            marginBottom: 8,
                          },
                          heading2: {
                            color: colors.foreground,
                            fontFamily: fonts.heading,
                            fontSize: 16,
                            marginTop: 16,
                            marginBottom: 6,
                          },
                          heading3: {
                            color: colors.foreground,
                            fontFamily: fonts.heading,
                            fontSize: 14,
                            marginTop: 12,
                            marginBottom: 6,
                          },
                          strong: { fontFamily: fonts.heading },
                          bullet_list: { marginBottom: 8 },
                          ordered_list: { marginBottom: 8 },
                          list_item: { marginBottom: 4 },
                          paragraph: { marginTop: 0, marginBottom: 10 },
                        }}
                      >
                        {fullBlog.content}
                      </Markdown>
                    </View>
                  ) : (
                    <Text
                      className="text-sm font-medium leading-6 mb-8"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                    >
                      {selectedItem.summary}
                    </Text>
                  )}

                  {/* Actions utility taskbars footer system inside document sheet overlay */}
                  <View className="flex-row gap-3 border-t border-neutral-100 dark:border-neutral-900 pt-5">
                    <TouchableOpacity
                      onPress={() => handleToggleBookmark(selectedItem.id)}
                      activeOpacity={0.7}
                      className="flex-1 flex-row gap-2 items-center justify-center border py-3 rounded-xl shadow-3xs"
                      style={{
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      }}
                    >
                      <Ionicons
                        name={
                          bookmarkedIds.has(selectedItem.id)
                            ? "bookmark"
                            : "bookmark-outline"
                        }
                        size={15}
                        color={
                          bookmarkedIds.has(selectedItem.id)
                            ? colors.primary
                            : colors.foreground
                        }
                      />
                      <Text
                        className="text-xs font-bold"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        {bookmarkedIds.has(selectedItem.id)
                          ? "Saved to Care"
                          : "Save Article"}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleShareContent(selectedItem)}
                      activeOpacity={0.7}
                      className="px-5 items-center justify-center border py-3 rounded-xl shadow-3xs"
                      style={{
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      }}
                    >
                      <Ionicons
                        name="share-social-outline"
                        size={16}
                        color={colors.foreground}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </View>
          )}
        </Modal>
      </SafeAreaView>
    </>
  );
}
