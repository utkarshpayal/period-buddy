import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  Share,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import { useTheme } from "../../components/theme";
import { getSoftTints } from "../../components/ui-tokens";
import { blogsApi, type ContentFeedItem } from "../../lib/api";

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
}

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
  };
}

export default function Blogs() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const { earnTokens } = useAppState();

  // Functional Interface States
  const [selectedType, setSelectedType] = useState<"all" | "blog" | "reel">(
    "all",
  );
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [content, setContent] = useState<ContentItem[]>(fallbackContent);

  // Immersive Preview Modal Layer States
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  const softTints = getSoftTints(colors);

  useEffect(() => {
    let isMounted = true;

    async function loadFeed() {
      try {
        const response = await blogsApi.getFeed({
          limit: 20,
          type: selectedType,
        });
        if (isMounted && response.items.length > 0) {
          setContent(response.items.map(mapFeedItem));
        }
      } catch {
        if (isMounted) setContent(fallbackContent);
      }
    }

    loadFeed();

    return () => {
      isMounted = false;
    };
  }, [selectedType]);

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

  function handleTriggerPreview(item: ContentItem) {
    setSelectedItem(item);
    setPreviewVisible(true);
    earnTokens(1);
  }

  async function handleShareContent(item: ContentItem) {
    try {
      await Share.share({
        message: `Check out this verified health resource on Nura: "${item.title}" by ${item.author}.`,
      });
      earnTokens(3);
    } catch {
      Alert.alert(
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
                      </View>

                      {/* Card Lower Parameters Bar Action Section */}
                      <View className="flex-row items-center justify-between pt-2 border-t border-neutral-50 dark:border-neutral-900/60">
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
          </View>
        </ScrollView>

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
                  <Text
                    className="text-xs font-bold tracking-widest uppercase mb-3"
                    style={{ color: colors.primary, fontFamily: fonts.heading }}
                  >
                    Verified Health Summary
                  </Text>
                  <Text
                    className="text-sm font-medium leading-6 mb-8"
                    style={{ color: colors.foreground, fontFamily: fonts.body }}
                  >
                    {selectedItem.summary}
                  </Text>

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
