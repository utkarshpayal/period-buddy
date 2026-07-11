import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useAppState } from "../../components/AppState";
import { useTheme } from "../../components/theme";
import { reelsApi, type Reel as ApiReel } from "../../lib/api";

// --- STRUCTURAL CLINICAL ENDPOINT CONTRACTS ---
interface HealthReel {
  id: string;
  title: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  duration: string;
  views: number;
  category: string;
  verified: boolean;
  thumbnailUrl: string;
  directMp4Url: string; // Fixed: Raw MP4 Stream parameters
  pollQuestion: string;
  pollOptions: { id: string; topic: string; votes: number }[];
  votedOptionId: string | null;
}

const fallbackReels: HealthReel[] = [
  {
    id: "r_1",
    title: "A Simple Overview of Hormonal Cycle Phases",
    creatorId: "doc_sarah",
    creatorName: "Dr. Sarah Chen (OBGYN & Cycle Expert)",
    creatorAvatar:
      "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?q=80&w=150&auto=format&fit=crop",
    duration: "0:15",
    views: 3420,
    category: "Wellness",
    verified: true,
    thumbnailUrl:
      "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=600&auto=format&fit=crop",
    directMp4Url:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    pollQuestion: "Vote for the next video topic:",
    votedOptionId: null,
    pollOptions: [
      {
        id: "o1",
        topic: "Stress, cortisol, and cycle changes",
        votes: 142,
      },
      {
        id: "o2",
        topic: "Menstrual cup cleaning and storage",
        votes: 98,
      },
    ],
  },
  {
    id: "r_2",
    title: "Gentle Yoga Movements for Period Pain Relief",
    creatorId: "doc_thara",
    creatorName: "Dr. Thara (Clinical Physiologist)",
    creatorAvatar:
      "https://images.unsplash.com/photo-1594824813573-246434e33963?q=80&w=150&auto=format&fit=crop",
    duration: "0:12",
    views: 2890,
    category: "Self-Care",
    verified: true,
    thumbnailUrl:
      "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=600&auto=format&fit=crop",
    directMp4Url:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    pollQuestion: "What should the next quick video cover?",
    votedOptionId: null,
    pollOptions: [
      {
        id: "o3",
        topic: "Understanding Period Poops & Bowel Triggers",
        votes: 215,
      },
      { id: "o4", topic: "PCOS-friendly food and routine basics", votes: 310 },
    ],
  },
];

function mapApiReel(reel: ApiReel): HealthReel {
  return {
    id: reel.id ?? reel._id ?? reel.creatorId,
    title: reel.title,
    creatorId: reel.creatorId,
    creatorName: reel.creatorName,
    creatorAvatar:
      reel.creatorAvatar ||
      "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?q=80&w=150&auto=format&fit=crop",
    duration: reel.duration,
    views: reel.views,
    category: reel.category,
    verified: reel.verified,
    thumbnailUrl: reel.thumbnailUrl,
    directMp4Url: reel.directMp4Url,
    pollQuestion: reel.pollQuestion || "Vote for the next topic:",
    votedOptionId: reel.votedOptionId ?? null,
    pollOptions: reel.pollOptions.map((option) => ({
      id: option.optionId,
      topic: option.topic,
      votes: option.votes,
    })),
  };
}

export default function Reels() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { earnTokens } = useAppState();

  const [activePlayId, setActivePlayId] = useState<string | null>(null);
  const [followingCreatorIds, setFollowingCreatorIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedCreator, setSelectedCreator] = useState<HealthReel | null>(
    null,
  );

  const [reels, setReels] = useState<HealthReel[]>(fallbackReels);

  useEffect(() => {
    let isMounted = true;

    async function loadReels() {
      try {
        const response = await reelsApi.getReels({ limit: 20 });
        if (isMounted && response.reels.length > 0) {
          setReels(response.reels.map(mapApiReel));
          setFollowingCreatorIds(
            new Set(
              response.reels
                .filter((reel) => reel.followedByMe)
                .map((reel) => reel.creatorId),
            ),
          );
        }
      } catch {
        if (isMounted) setReels(fallbackReels);
      }
    }

    loadReels();

    return () => {
      isMounted = false;
    };
  }, []);

  // --- INTERACTION CONTROLLER DRIVERS ---
  async function handleToggleFollow(reelId: string, creatorId: string) {
    setFollowingCreatorIds((prev) => {
      const next = new Set(prev);
      if (next.has(creatorId)) next.delete(creatorId);
      else {
        next.add(creatorId);
        earnTokens(2);
      }
      return next;
    });

    try {
      const result = await reelsApi.toggleFollowCreator(reelId);
      if (result.tokensAwarded) earnTokens(result.tokensAwarded);
      setFollowingCreatorIds((prev) => {
        const next = new Set(prev);
        if (result.followedByMe) next.add(creatorId);
        else next.delete(creatorId);
        return next;
      });
    } catch {
      // Optimistic follow state remains local while offline.
    }
  }

  async function handleTriggerVote(reelId: string, optionId: string) {
    setReels((currentList) =>
      currentList.map((reel) => {
        if (reel.id !== reelId || reel.votedOptionId) return reel;

        const updatedOptions = reel.pollOptions.map((opt) =>
          opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt,
        );

        earnTokens(5);
        Alert.alert(
          "Vote counted",
          "Your topic preference has been saved.",
        );

        return {
          ...reel,
          votedOptionId: optionId,
          pollOptions: updatedOptions,
        };
      }),
    );

    try {
      const result = await reelsApi.votePoll(reelId, optionId);
      earnTokens(result.tokensAwarded);
      setReels((currentList) =>
        currentList.map((reel) =>
          reel.id === reelId
            ? {
                ...reel,
                votedOptionId: optionId,
                pollOptions: result.pollOptions.map((option) => ({
                  id: option.optionId,
                  topic: option.topic,
                  votes: option.votes,
                })),
              }
            : reel,
        ),
      );
    } catch {
      // Optimistic vote remains visible while offline.
    }
  }

  async function handlePlay(reelId: string) {
    setActivePlayId(reelId);
    try {
      const result = await reelsApi.recordView(reelId);
      setReels((currentList) =>
        currentList.map((reel) =>
          reel.id === reelId ? { ...reel, views: result.views } : reel,
        ),
      );
    } catch {
      // Video can still play when view tracking is unavailable.
    }
  }

  function getCreatorStats(creatorId: string) {
    const creatorReels = reels.filter((reel) => reel.creatorId === creatorId);
    return {
      reelsCount: creatorReels.length,
      totalViews: creatorReels.reduce((sum, reel) => sum + reel.views, 0),
      categories: Array.from(new Set(creatorReels.map((reel) => reel.category))),
    };
  }

  // Pure HTML5 Video Engine — Bypasses all YouTube iframe blocks natively
  function generateHTML5VideoPlayer(mp4Url: string) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <style>
            body, html { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #000000; overflow: hidden; }
            video { width: 100%; height: 100%; object-fit: cover; }
          </style>
        </head>
        <body>
          <video src="${mp4Url}" autoplay loop controls playsinline></video>
        </body>
      </html>
    `;
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
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          {/* Header */}
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
              style={{ color: colors.foreground }}
            >
              Video Feed
            </Text>
          </View>

          {/* TIMELINE TIMELINE STACK FEED */}
          <View className="mt-6 px-6 gap-6">
            {reels.map((item) => {
              const isPlaying = activePlayId === item.id;
              const isFollowing = followingCreatorIds.has(item.creatorId);

              return (
                <View
                  key={item.id}
                  className="rounded-3xl border overflow-hidden shadow-2xl"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  {/* MEDICAL CREATOR HEADER */}
                  <View className="p-4 flex-row items-center justify-between border-b border-neutral-100 dark:border-neutral-900/60">
                    <TouchableOpacity
                      activeOpacity={0.75}
                      className="flex-row items-center gap-3 flex-1"
                      onPress={() => setSelectedCreator(item)}
                    >
                      <Image
                        source={{ uri: item.creatorAvatar }}
                        className="w-10 h-10 rounded-full bg-neutral-200"
                      />
                      <View className="flex-1">
                        <View className="flex-row items-center gap-1">
                          <Text
                            className="text-xs font-black tracking-tight"
                            style={{ color: colors.foreground }}
                            numberOfLines={1}
                          >
                            {item.creatorName}
                          </Text>
                          {item.verified && (
                            <MaterialCommunityIcons
                              name="shield-check"
                              size={13}
                            color={colors.success}
                            />
                          )}
                        </View>
                        <Text className="text-[10px] font-bold tracking-wide uppercase text-neutral-400">
                          Board-certified specialist
                        </Text>
                        <Text
                          className="mt-1 text-[10px] font-black uppercase tracking-wider"
                          style={{ color: colors.primary }}
                        >
                          View Profile
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => handleToggleFollow(item.id, item.creatorId)}
                      className="px-3.5 py-1.5 rounded-full border"
                      style={{
                        backgroundColor: isFollowing
                          ? "transparent"
                          : colors.primary,
                        borderColor: isFollowing
                          ? colors.border
                          : colors.primary,
                      }}
                    >
                      <Text
                        className="text-[10px] font-black"
                        style={{
                          color: isFollowing
                            ? colors.foreground
                            : colors.buttonText,
                        }}
                      >
                        {isFollowing ? "Following" : "Follow"}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* HTML5 EMBEDDED MP4 STREAM CONTAINER */}
                  <View className="w-full h-56 bg-black relative">
                    {isPlaying ? (
                      <WebView
                        originWhitelist={["*"]}
                        source={{
                          html: generateHTML5VideoPlayer(item.directMp4Url),
                        }}
                        javaScriptEnabled={true}
                        domStorageEnabled={true}
                        allowsInlineMediaPlayback={true}
                        mediaPlaybackRequiresUserAction={false}
                        className="w-full h-full"
                        style={{ backgroundColor: "black" }}
                      />
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => handlePlay(item.id)}
                        className="w-full h-full relative"
                      >
                        <Image
                          source={{ uri: item.thumbnailUrl }}
                          className="w-full h-full"
                          resizeMode="cover"
                        />
                        <View className="absolute inset-0 bg-black/25" />

                        <View className="absolute inset-0 items-center justify-center">
                          <View className="w-14 h-14 rounded-full bg-white/20 items-center justify-center border border-white/40 shadow-sm">
                            <Ionicons
                              name="play-circle"
                              size={32}
                              color="white"
                              className="ml-0.5"
                            />
                          </View>
                        </View>

                        <View className="absolute bottom-3 right-3 bg-black/60 px-2 py-0.5 rounded-md">
                          <Text className="text-[10px] font-bold text-white">
                            {item.duration}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* TITLE DESCRIPTION BLOCK */}
                  <View className="p-5 border-b border-neutral-100 dark:border-neutral-900/60">
                    <Text
                      className="text-sm font-black tracking-tight leading-5"
                      style={{ color: colors.foreground }}
                    >
                      {item.title}
                    </Text>
                    <View className="flex-row items-center gap-4 mt-3">
                      <View className="flex-row items-center gap-1">
                        <Feather
                          name="eye"
                          size={12}
                          color={colors.mutedText}
                        />
                        <Text
                          className="text-[10px] font-extrabold tracking-wide"
                          style={{ color: colors.mutedText }}
                        >
                          {item.views.toLocaleString()} views
                        </Text>
                      </View>
                      <View className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded-md">
                        <Text className="text-[9px] font-black uppercase text-neutral-400">
                          {item.category}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* INTEGRATED POLL COMPONENT */}
                  <View className="p-5 bg-neutral-50 dark:bg-neutral-900/30">
                    <View className="flex-row items-center gap-1.5 mb-3">
                      <MaterialCommunityIcons
                        name="vote-outline"
                        size={14}
                        color={colors.primary}
                      />
                      <Text className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                        {"Creator's Next Topic Poll"}
                      </Text>
                    </View>

                    <Text
                      className="text-xs font-bold mb-3"
                      style={{ color: colors.foreground }}
                    >
                      {item.pollQuestion}
                    </Text>

                    <View className="gap-2">
                      {item.pollOptions.map((option) => {
                        const totalVotes = item.pollOptions.reduce(
                          (acc, curr) => acc + curr.votes,
                          0,
                        );
                        const percentValue =
                          totalVotes > 0
                            ? Math.round((option.votes / totalVotes) * 100)
                            : 0;
                        const isThisChoiceVoted =
                          item.votedOptionId === option.id;

                        return (
                          <TouchableOpacity
                            key={option.id}
                            disabled={!!item.votedOptionId}
                            onPress={() =>
                              handleTriggerVote(item.id, option.id)
                            }
                            activeOpacity={0.8}
                            className="rounded-xl border p-3 relative overflow-hidden flex-row justify-between items-center"
                            style={{
                              backgroundColor: colors.surface,
                              borderColor: isThisChoiceVoted
                                ? colors.primary
                                : colors.border,
                            }}
                          >
                            {!!item.votedOptionId && (
                              <View
                                className="absolute left-0 top-0 bottom-0 opacity-10"
                                style={{
                                  width: `${percentValue}%`,
                                  backgroundColor: colors.primary,
                                }}
                              />
                            )}
                            <Text
                              className="text-xs font-semibold flex-1 pr-4"
                              style={{ color: colors.foreground }}
                            >
                              {option.topic}
                            </Text>
                            {!!item.votedOptionId && (
                              <Text
                                className="text-xs font-black"
                                style={{
                                  color: isThisChoiceVoted
                                    ? colors.primary
                                    : colors.mutedText,
                                }}
                              >
                                {percentValue}%
                              </Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={!!selectedCreator}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedCreator(null)}
      >
        {selectedCreator ? (
          <SafeAreaView
            className="flex-1"
            style={{ backgroundColor: colors.background }}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              <View className="flex-row items-center justify-between px-6 pt-6">
                <Text
                  className="text-xl font-black tracking-tight"
                  style={{ color: colors.foreground }}
                >
                  Creator Profile
                </Text>
                <TouchableOpacity
                  accessibilityLabel="Close creator profile"
                  className="rounded-full border p-2"
                  onPress={() => setSelectedCreator(null)}
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <Feather name="x" size={18} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              <View className="items-center px-6 pt-8">
                <Image
                  source={{ uri: selectedCreator.creatorAvatar }}
                  className="h-28 w-28 rounded-full bg-neutral-200"
                />
                <View className="mt-4 flex-row items-center gap-1.5">
                  <Text
                    className="text-2xl font-black tracking-tight text-center"
                    style={{ color: colors.foreground }}
                  >
                    {selectedCreator.creatorName}
                  </Text>
                  {selectedCreator.verified ? (
                    <MaterialCommunityIcons
                      name="shield-check"
                      size={18}
                      color={colors.success}
                    />
                  ) : null}
                </View>
                <Text
                  className="mt-1 text-xs font-bold uppercase tracking-wider"
                  style={{ color: colors.mutedText }}
                >
                  {selectedCreator.category} creator
                </Text>
              </View>

              <View className="mx-6 mt-8 flex-row gap-3">
                {[
                  {
                    label: "Videos",
                    value: getCreatorStats(selectedCreator.creatorId).reelsCount,
                    icon: "play-circle-outline",
                  },
                  {
                    label: "Views",
                    value: getCreatorStats(
                      selectedCreator.creatorId,
                    ).totalViews.toLocaleString(),
                    icon: "eye-outline",
                  },
                  {
                    label: "Topics",
                    value: getCreatorStats(
                      selectedCreator.creatorId,
                    ).categories.length,
                    icon: "albums-outline",
                  },
                ].map((metric) => (
                  <View
                    key={metric.label}
                    className="flex-1 items-center rounded-2xl border p-4"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    }}
                  >
                    <Ionicons
                      name={metric.icon as any}
                      size={18}
                      color={colors.primary}
                    />
                    <Text
                      className="mt-2 text-base font-black"
                      style={{ color: colors.foreground }}
                    >
                      {metric.value}
                    </Text>
                    <Text
                      className="text-[10px] font-bold"
                      style={{ color: colors.mutedText }}
                    >
                      {metric.label}
                    </Text>
                  </View>
                ))}
              </View>

              <View
                className="mx-6 mt-6 rounded-3xl border p-5"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Text
                  className="text-sm font-black"
                  style={{ color: colors.foreground }}
                >
                  About this creator
                </Text>
                <Text
                  className="mt-2 text-xs font-semibold leading-5"
                  style={{ color: colors.mutedText }}
                >
                  Follow this specialist to keep their cycle education videos,
                  polls, and comfort-first health guidance close in your feed.
                </Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  className="mt-5 rounded-full py-3.5 items-center justify-center"
                  onPress={() =>
                    handleToggleFollow(
                      selectedCreator.id,
                      selectedCreator.creatorId,
                    )
                  }
                  style={{
                    backgroundColor: followingCreatorIds.has(
                      selectedCreator.creatorId,
                    )
                      ? colors.input
                      : colors.primary,
                    borderColor: colors.border,
                    borderWidth: followingCreatorIds.has(
                      selectedCreator.creatorId,
                    )
                      ? 1
                      : 0,
                  }}
                >
                  <Text
                    className="text-sm font-black"
                    style={{
                      color: followingCreatorIds.has(selectedCreator.creatorId)
                        ? colors.foreground
                        : colors.buttonText,
                    }}
                  >
                    {followingCreatorIds.has(selectedCreator.creatorId)
                      ? "Following"
                      : "Follow Creator"}
                  </Text>
                </TouchableOpacity>
              </View>

              <View className="mx-6 mt-6">
                <Text
                  className="mb-3 text-xs font-black uppercase tracking-widest"
                  style={{ color: colors.primary }}
                >
                  Videos by this creator
                </Text>
                <View className="gap-3">
                  {reels
                    .filter(
                      (reel) =>
                        reel.creatorId === selectedCreator.creatorId,
                    )
                    .map((reel) => (
                      <TouchableOpacity
                        key={reel.id}
                        activeOpacity={0.8}
                        className="flex-row overflow-hidden rounded-2xl border"
                        onPress={() => {
                          setSelectedCreator(null);
                          handlePlay(reel.id);
                        }}
                        style={{
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        }}
                      >
                        <Image
                          source={{ uri: reel.thumbnailUrl }}
                          className="h-20 w-24 bg-neutral-200"
                        />
                        <View className="flex-1 justify-center p-3">
                          <Text
                            className="text-xs font-black"
                            numberOfLines={2}
                            style={{ color: colors.foreground }}
                          >
                            {reel.title}
                          </Text>
                          <Text
                            className="mt-1 text-[10px] font-bold"
                            style={{ color: colors.mutedText }}
                          >
                            {reel.duration} • {reel.views.toLocaleString()} views
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        ) : null}
      </Modal>
    </>
  );
}
