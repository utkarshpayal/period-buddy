import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Image,
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

// --- STRUCTURAL CLINICAL ENDPOINT CONTRACTS ---
interface GynacReel {
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

export default function Reels() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { earnTokens } = useAppState();

  const [activePlayId, setActivePlayId] = useState<string | null>(null);
  const [followingCreatorIds, setFollowingCreatorIds] = useState<Set<string>>(
    new Set(),
  );

  // Fixed Data collections using raw direct MP4 streaming containers
  const [reels, setReels] = useState<GynacReel[]>([
    {
      id: "r_1",
      title: "Complete Medical Overview of Hormonal Cycle Milestones",
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
      // Verified direct static MP4 sample source link
      directMp4Url:
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      pollQuestion:
        "Vote for my next video topic, sister! Drop your preference:",
      votedOptionId: null,
      pollOptions: [
        {
          id: "o1",
          topic: "Reversing Cortisol Stress Spikes Naturally",
          votes: 142,
        },
        {
          id: "o2",
          topic: "Menstrual Cups: Complete Medical Sanitization Guide",
          votes: 98,
        },
      ],
    },
    {
      id: "r_2",
      title: "Yoga & Pelvic Floor Decompression Movements for Pain Relief",
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
      pollQuestion: "What should I decode in next week's quick-clip feed?",
      votedOptionId: null,
      pollOptions: [
        {
          id: "o3",
          topic: "Understanding Period Poops & Bowel Triggers",
          votes: 215,
        },
        { id: "o4", topic: "PCOS Nutritional Matrix Layouts", votes: 310 },
      ],
    },
  ]);

  const softTints = {
    pink: isDark ? "#3b1a2d" : "#fff0f6",
  };

  // --- INTERACTION CONTROLLER DRIVERS ---
  function handleToggleFollow(creatorId: string) {
    setFollowingCreatorIds((prev) => {
      const next = new Set(prev);
      if (next.has(creatorId)) next.delete(creatorId);
      else {
        next.add(creatorId);
        earnTokens(2);
      }
      return next;
    });
  }

  function handleTriggerVote(reelId: string, optionId: string) {
    setReels((currentList) =>
      currentList.map((reel) => {
        if (reel.id !== reelId || reel.votedOptionId) return reel;

        const updatedOptions = reel.pollOptions.map((opt) =>
          opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt,
        );

        earnTokens(5);
        Alert.alert(
          "Vote Counted! 🎉",
          "Your video topic priority reference has been attached.",
        );

        return {
          ...reel,
          votedOptionId: optionId,
          pollOptions: updatedOptions,
        };
      }),
    );
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
                    <View className="flex-row items-center gap-3 flex-1">
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
                              color="#10b981"
                            />
                          )}
                        </View>
                        <Text className="text-[10px] font-bold tracking-wide uppercase text-neutral-400">
                          Board Certified Gynac
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => handleToggleFollow(item.creatorId)}
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
                        onPress={() => setActivePlayId(item.id)}
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
                        Creator's Next Topic Poll
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
    </>
  );
}
