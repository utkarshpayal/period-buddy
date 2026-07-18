import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useAppState } from "../../components/AppState";
import { alert } from "../../lib/alert";
import { useTheme } from "../../components/theme";
import { reelsApi, type Reel as ApiReel } from "../../lib/api";
import { LinearGradient } from "expo-linear-gradient";

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
    title: reel.title ?? "Untitled Reel",
    creatorId: reel.creatorId,
    creatorName: reel.creatorName ?? "Anonymous Creator",
    creatorAvatar:
      reel.creatorAvatar ||
      "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?q=80&w=150&auto=format&fit=crop",
    duration: reel.duration || "0:30",
    views: reel.viewCount ?? reel.views ?? 0,
    category: reel.category ?? "Wellness",
    verified: reel.verified ?? false,
    thumbnailUrl: reel.thumbnailUrl || "https://placehold.co/640x360?text=Period+Buddy",
    directMp4Url: reel.directMp4Url,
    pollQuestion: reel.pollQuestion || "Vote for the next topic:",
    votedOptionId: reel.votedOptionId ?? null,
    pollOptions: (reel.pollOptions || []).map((option) => ({
      id: option.optionId,
      topic: option.topic,
      votes: option.votes ?? 0,
    })),
  };
}

export default function Reels() {
  const { colors, fonts } = useTheme();
  const router = useRouter();
  const { earnTokens } = useAppState();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reelHeight = useMemo(
    () => Math.max(560, height - insets.top - insets.bottom),
    [height, insets.bottom, insets.top],
  );

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
          const mappedReels = response.reels.map(mapApiReel);
          setReels(mappedReels);
          setActivePlayId((current) => current ?? mappedReels[0]?.id ?? null);
          setFollowingCreatorIds(
            new Set(
              response.reels
                .filter((reel) => reel.followedByMe)
                .map((reel) => reel.creatorId),
            ),
          );
        }
      } catch {
        if (isMounted) {
          setReels(fallbackReels);
          setActivePlayId((current) => current ?? fallbackReels[0]?.id ?? null);
        }
      }
    }

    loadReels();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activePlayId && reels[0]) {
      setActivePlayId(reels[0].id);
    }
  }, [activePlayId, reels]);

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
        alert(
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

  function handleReelMomentumEnd(
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) {
    const nextIndex = Math.round(
      event.nativeEvent.contentOffset.y / reelHeight,
    );
    const nextReel = reels[nextIndex];

    if (nextReel) {
      void handlePlay(nextReel.id);
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

  // Extract YouTube ID if present
  function getYouTubeId(url: string): string | null {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  // Generates appropriate HTML based on video type
  function generateVideoPlayerHTML(videoUrl: string) {
    const ytId = getYouTubeId(videoUrl);
    if (ytId) {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>
              body, html { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #000000; overflow: hidden; }
              iframe { width: 100%; height: 100%; border: 0; }
            </style>
          </head>
          <body>
            <iframe 
              src="https://www.youtube.com/embed/${ytId}?autoplay=1&loop=1&playlist=${ytId}&mute=1&playsinline=1&controls=0&modestbranding=1&rel=0" 
              frameborder="0" 
              allow="autoplay; encrypted-media; picture-in-picture" 
              allowfullscreen>
            </iframe>
          </body>
        </html>
      `;
    }

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
          <video src="${videoUrl}" autoplay loop muted playsinline></video>
        </body>
      </html>
    `;
  }

  return (
    <>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#050505"
      />

      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: "#050505" }}
      >
        <ScrollView
          decelerationRate="fast"
          disableIntervalMomentum
          onMomentumScrollEnd={handleReelMomentumEnd}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToAlignment="start"
          snapToInterval={reelHeight}
        >
          {reels.map((item, index) => {
            const isPlaying = activePlayId === item.id;
            const isFollowing = followingCreatorIds.has(item.creatorId);
            const totalVotes = item.pollOptions.reduce(
              (acc, curr) => acc + curr.votes,
              0,
            );

            return (
              <View
                key={item.id}
                style={{
                  backgroundColor: "#050505",
                  height: reelHeight,
                  overflow: "hidden",
                  width,
                }}
              >
                {isPlaying ? (
                  Platform.OS === "web" ? (
                    (() => {
                      const ytId = getYouTubeId(item.directMp4Url);
                      if (ytId) {
                        return (
                          <iframe
                            src={`https://www.youtube.com/embed/${ytId}?autoplay=1&loop=1&playlist=${ytId}&mute=1&playsinline=1&controls=0&modestbranding=1&rel=0`}
                            style={{
                              border: 0,
                              width: "100%",
                              height: "100%",
                              position: "absolute",
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              backgroundColor: "black",
                            }}
                            allow="autoplay; encrypted-media; picture-in-picture"
                            allowFullScreen
                          />
                        );
                      }
                      return (
                        <video
                          src={item.directMp4Url}
                          autoPlay
                          loop
                          muted
                          playsInline
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: "black",
                          }}
                        />
                      );
                    })()
                  ) : (
                    <WebView
                      allowsInlineMediaPlayback
                      domStorageEnabled
                      javaScriptEnabled
                      mediaPlaybackRequiresUserAction={false}
                      originWhitelist={["*"]}
                      allowsFullscreenVideo
                      androidLayerType="hardware"
                      source={{
                        html: generateVideoPlayerHTML(item.directMp4Url),
                      }}
                      style={{
                        backgroundColor: "black",
                        bottom: 0,
                        left: 0,
                        position: "absolute",
                        right: 0,
                        top: 0,
                      }}
                    />
                  )
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.92}
                    onPress={() => handlePlay(item.id)}
                    style={{
                      bottom: 0,
                      left: 0,
                      position: "absolute",
                      right: 0,
                      top: 0,
                    }}
                  >
                    <Image
                      source={{ uri: item.thumbnailUrl }}
                      resizeMode="cover"
                      style={{ height: "100%", width: "100%" }}
                    />
                    <View className="absolute inset-0 items-center justify-center">
                      <View className="h-16 w-16 items-center justify-center rounded-full border border-white/50 bg-black/35">
                        <Ionicons name="play" size={30} color="white" />
                      </View>
                    </View>
                  </TouchableOpacity>
                )}

                <LinearGradient
                  colors={[
                    "rgba(0,0,0,0.58)",
                    "rgba(0,0,0,0.08)",
                    "rgba(0,0,0,0.9)",
                  ]}
                  locations={[0, 0.42, 1]}
                  pointerEvents="none"
                  style={{
                    bottom: 0,
                    left: 0,
                    position: "absolute",
                    right: 0,
                    top: 0,
                  }}
                />

                <View className="absolute left-5 right-5 top-4 flex-row items-center gap-3">
                  <TouchableOpacity
                    activeOpacity={0.78}
                    className="h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/35"
                    onPress={() => router.back()}
                  >
                    <Feather name="arrow-left" size={18} color="white" />
                  </TouchableOpacity>
                  <View className="flex-1">
                    <Text className="text-lg font-black text-white" style={{ fontFamily: fonts.heading }}>
                      Reels
                    </Text>
                    <Text className="text-[10px] font-bold uppercase text-white/65" style={{ fontFamily: fonts.body }}>
                      {index + 1} of {reels.length}
                    </Text>
                  </View>
                  <View className="rounded-full bg-white/15 px-3 py-1.5">
                    <Text className="text-[10px] font-black uppercase text-white" style={{ fontFamily: fonts.body }}>
                      For You
                    </Text>
                  </View>
                </View>

                <View className="absolute bottom-28 right-4 items-center gap-4">
                  <TouchableOpacity
                    activeOpacity={0.85}
                    className="items-center"
                    onPress={() => setSelectedCreator(item)}
                  >
                    <Image
                      source={{ uri: item.creatorAvatar }}
                      className="h-12 w-12 rounded-full border-2 border-white bg-neutral-200"
                    />
                    {item.verified ? (
                      <View
                        className="-mt-3 rounded-full p-0.5"
                        style={{ backgroundColor: colors.success }}
                      >
                        <MaterialCommunityIcons
                          name="check"
                          size={12}
                          color="white"
                        />
                      </View>
                    ) : null}
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.82}
                    className="items-center"
                    onPress={() => handleToggleFollow(item.id, item.creatorId)}
                  >
                    <View className="h-11 w-11 items-center justify-center rounded-full bg-white/18">
                      <Ionicons
                        name={isFollowing ? "checkmark" : "add"}
                        size={24}
                        color="white"
                      />
                    </View>
                    <Text className="mt-1 text-[10px] font-black text-white" style={{ fontFamily: fonts.body }}>
                      {isFollowing ? "Following" : "Follow"}
                    </Text>
                  </TouchableOpacity>

                  <View className="items-center">
                    <View className="h-11 w-11 items-center justify-center rounded-full bg-white/18">
                      <Feather name="eye" size={20} color="white" />
                    </View>
                    <Text className="mt-1 text-[10px] font-black text-white" style={{ fontFamily: fonts.mono }}>
                      {item.views.toLocaleString()}
                    </Text>
                  </View>
                </View>

                <View className="absolute bottom-5 left-5 right-24">
                  <TouchableOpacity
                    activeOpacity={0.8}
                    className="mb-3 flex-row items-center gap-2"
                    onPress={() => setSelectedCreator(item)}
                  >
                    <Text
                      className="flex-1 text-sm font-black text-white"
                      numberOfLines={1}
                      style={{ fontFamily: fonts.heading }}
                    >
                      {item.creatorName}
                    </Text>
                    <View className="rounded-full bg-white/18 px-2 py-0.5">
                      <Text className="text-[9px] font-black uppercase text-white" style={{ fontFamily: fonts.body }}>
                        {item.category}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <Text
                    className="text-base font-black leading-5 text-white"
                    numberOfLines={3}
                    style={{ fontFamily: fonts.heading }}
                  >
                    {item.title}
                  </Text>

                  <View className="mt-3 flex-row items-center gap-3">
                    <View className="flex-row items-center gap-1 rounded-full bg-black/30 px-2.5 py-1">
                      <Ionicons
                        name="time-outline"
                        size={12}
                        color="rgba(255,255,255,0.82)"
                      />
                      <Text className="text-[10px] font-bold text-white/85" style={{ fontFamily: fonts.mono }}>
                        {item.duration}
                      </Text>
                    </View>
                    <Text className="text-[10px] font-bold text-white/70" style={{ fontFamily: fonts.body }}>
                      Board-certified cycle education
                    </Text>
                  </View>

                  <View className="mt-4 rounded-2xl border border-white/15 bg-black/42 p-3">
                    <View className="mb-2 flex-row items-center gap-1.5">
                      <MaterialCommunityIcons
                        name="vote-outline"
                        size={14}
                        color="white"
                      />
                      <Text className="text-[10px] font-black uppercase text-white/75" style={{ fontFamily: fonts.body }}>
                        Next topic poll
                      </Text>
                    </View>
                    <Text
                      className="mb-2 text-xs font-bold text-white"
                      numberOfLines={2}
                      style={{ fontFamily: fonts.heading }}
                    >
                      {item.pollQuestion}
                    </Text>
                    <View className="gap-2">
                      {item.pollOptions.map((option) => {
                        const percentValue =
                          totalVotes > 0
                            ? Math.round((option.votes / totalVotes) * 100)
                            : 0;
                        const isThisChoiceVoted =
                          item.votedOptionId === option.id;

                        return (
                          <TouchableOpacity
                            activeOpacity={0.82}
                            className="overflow-hidden rounded-xl border border-white/15 bg-white/10 px-3 py-2"
                            disabled={!!item.votedOptionId}
                            key={option.id}
                            onPress={() =>
                              handleTriggerVote(item.id, option.id)
                            }
                          >
                            {!!item.votedOptionId ? (
                              <View
                                className="absolute bottom-0 left-0 top-0 bg-white/18"
                                style={{ width: `${percentValue}%` }}
                              />
                            ) : null}
                            <View className="flex-row items-center justify-between gap-3">
                              <Text
                                className="flex-1 text-[11px] font-bold text-white"
                                numberOfLines={2}
                                style={{ fontFamily: fonts.body }}
                              >
                                {option.topic}
                              </Text>
                              {!!item.votedOptionId ? (
                                <Text
                                  className="text-[11px] font-black"
                                  style={{
                                    color: isThisChoiceVoted
                                      ? colors.rose
                                      : "rgba(255,255,255,0.7)",
                                    fontFamily: fonts.mono,
                                  }}
                                >
                                  {percentValue}%
                                </Text>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
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
                  style={{ color: colors.foreground, fontFamily: fonts.heading }}
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
                    style={{ color: colors.foreground, fontFamily: fonts.heading }}
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
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
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
                      style={{ color: colors.foreground, fontFamily: fonts.mono }}
                    >
                      {metric.value}
                    </Text>
                    <Text
                      className="text-[10px] font-bold"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
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
                  style={{ color: colors.foreground, fontFamily: fonts.heading }}
                >
                  About this creator
                </Text>
                <Text
                  className="mt-2 text-xs font-semibold leading-5"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
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
                      fontFamily: fonts.body,
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
                  style={{ color: colors.primary, fontFamily: fonts.heading }}
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
                            style={{ color: colors.foreground, fontFamily: fonts.heading }}
                          >
                            {reel.title}
                          </Text>
                          <Text
                            className="mt-1 text-[10px] font-bold"
                            style={{ color: colors.mutedText, fontFamily: fonts.body }}
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
