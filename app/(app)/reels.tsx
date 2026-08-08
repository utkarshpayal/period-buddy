import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
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
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useAppState } from "../../components/AppState";
import { alert } from "../../lib/alert";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
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

// Shared reel chrome — the center play glyph (shown while paused) and the
// mute toggle — so a direct-MP4 reel and a YouTube reel feel identical to
// the user, regardless of where the video actually lives.
function ReelPlayerChrome({
  isMuted,
  isPlaying,
  onToggleMuted,
}: {
  isMuted: boolean;
  isPlaying: boolean;
  onToggleMuted: () => void;
}) {
  return (
    <>
      {!isPlaying && (
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
        >
          <View className="h-16 w-16 items-center justify-center rounded-full border border-white/50 bg-black/35">
            <Ionicons name="play" size={30} color="white" />
          </View>
        </View>
      )}

      <TouchableOpacity
        activeOpacity={0.78}
        onPress={(event) => {
          event.stopPropagation();
          onToggleMuted();
        }}
        className="absolute right-4 top-16 h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/35"
      >
        <Ionicons
          name={isMuted ? "volume-mute" : "volume-high"}
          size={16}
          color="white"
        />
      </TouchableOpacity>
    </>
  );
}

// Plays a direct MP4 source (e.g. your own S3/server upload) with real
// audio and tap-to-pause. Mounted only for the currently active reel, so it
// starts fresh (and stops) as the user scrolls — no cross-fade of two
// videos playing at once.
function DirectVideoPlayer({
  isMuted,
  onToggleMuted,
  uri,
}: {
  isMuted: boolean;
  onToggleMuted: () => void;
  uri: string;
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = isMuted;
    instance.play();
  });

  useEffect(() => {
    player.muted = isMuted;
  }, [player, isMuted]);

  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });

  return (
    <Pressable
      onPress={() => (isPlaying ? player.pause() : player.play())}
      style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
    >
      <VideoView
        player={player}
        style={{ height: "100%", width: "100%" }}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
      />

      <ReelPlayerChrome
        isMuted={isMuted}
        isPlaying={isPlaying}
        onToggleMuted={onToggleMuted}
      />
    </Pressable>
  );
}

declare global {
  interface Window {
    YT?: {
      Player: new (elementId: string, options: Record<string, unknown>) => YouTubeIframeApiPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YouTubeIframeApiPlayer = {
  destroy: () => void;
  mute: () => void;
  pauseVideo: () => void;
  playVideo: () => void;
  unMute: () => void;
};

let youtubeApiLoadPromise: Promise<void> | null = null;

// Loads the YouTube IFrame API script exactly once per web session and
// resolves once `window.YT.Player` is ready to use.
function loadYouTubeIframeApi(): Promise<void> {
  if (youtubeApiLoadPromise) return youtubeApiLoadPromise;

  youtubeApiLoadPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }

    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve();
    };

    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    }
  });

  return youtubeApiLoadPromise;
}

// HTML for the native (WebView) YouTube player. Uses the real IFrame Player
// API — not a static `?mute=1` src — so play/pause and mute/unmute are
// instant `postMessage`-free JS calls instead of reloading the embed.
function generateYouTubePlayerHTML(videoId: string, initialMuted: boolean) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          body, html { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #000000; overflow: hidden; }
          #player { width: 100%; height: 100%; }
          iframe { width: 100% !important; height: 100% !important; }
        </style>
      </head>
      <body>
        <div id="player"></div>
        <script src="https://www.youtube.com/iframe_api"></script>
        <script>
          var player;
          function onYouTubeIframeAPIReady() {
            player = new YT.Player('player', {
              videoId: '${videoId}',
              playerVars: {
                autoplay: 1,
                controls: 0,
                loop: 1,
                playlist: '${videoId}',
                playsinline: 1,
                modestbranding: 1,
                rel: 0,
                mute: ${initialMuted ? 1 : 0}
              },
              events: {
                onReady: function (event) { event.target.playVideo(); },
                onStateChange: function (event) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'stateChange', state: event.data }));
                }
              }
            });
            window.__ytPlayer = player;
          }
        </script>
      </body>
    </html>
  `;
}

// Plays a YouTube-hosted reel (a creator can paste a YouTube link into the
// same field used for direct uploads) with the same tap-to-pause and real
// mute control as DirectVideoPlayer, via the official IFrame Player API —
// on native through a WebView + postMessage bridge, on web by attaching
// YT.Player straight to a DOM node.
function YouTubePlayer({
  isMuted,
  onToggleMuted,
  videoId,
}: {
  isMuted: boolean;
  onToggleMuted: () => void;
  videoId: string;
}) {
  const [isPlaying, setIsPlaying] = useState(true);
  const webViewRef = useRef<WebView>(null);
  const webPlayerRef = useRef<YouTubeIframeApiPlayer | null>(null);
  const elementId = useMemo(
    () => `yt-reel-${videoId}-${Math.random().toString(36).slice(2)}`,
    [videoId],
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let cancelled = false;

    loadYouTubeIframeApi().then(() => {
      if (cancelled || !window.YT) return;
      webPlayerRef.current = new window.YT.Player(elementId, {
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          loop: 1,
          playlist: videoId,
          playsinline: 1,
          modestbranding: 1,
          rel: 0,
          mute: isMuted ? 1 : 0,
        },
        events: {
          onReady: (event: { target: YouTubeIframeApiPlayer }) => event.target.playVideo(),
          onStateChange: (event: { data: number }) => setIsPlaying(event.data === 1),
        },
      });
    });

    return () => {
      cancelled = true;
      webPlayerRef.current?.destroy?.();
      webPlayerRef.current = null;
    };
    // Only (re)create the player when the video itself changes — mute is
    // handled by the effect below so toggling it doesn't restart playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementId, videoId]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (isMuted) webPlayerRef.current?.mute();
    else webPlayerRef.current?.unMute();
  }, [isMuted]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const script = isMuted
      ? "window.__ytPlayer && window.__ytPlayer.mute(); true;"
      : "window.__ytPlayer && window.__ytPlayer.unMute(); true;";
    webViewRef.current?.injectJavaScript(script);
  }, [isMuted]);

  function togglePlay() {
    if (Platform.OS === "web") {
      const player = webPlayerRef.current;
      if (!player) return;
      if (isPlaying) player.pauseVideo();
      else player.playVideo();
      setIsPlaying((current) => !current);
      return;
    }

    const script = isPlaying
      ? "window.__ytPlayer && window.__ytPlayer.pauseVideo(); true;"
      : "window.__ytPlayer && window.__ytPlayer.playVideo(); true;";
    webViewRef.current?.injectJavaScript(script);
    setIsPlaying((current) => !current);
  }

  function handleWebViewMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "stateChange") setIsPlaying(data.state === 1);
    } catch {
      // Ignore malformed bridge messages.
    }
  }

  return (
    <Pressable
      onPress={togglePlay}
      style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
    >
      {Platform.OS === "web" ? (
        <div id={elementId} style={{ width: "100%", height: "100%", pointerEvents: "none" }} />
      ) : (
        <WebView
          ref={webViewRef}
          allowsInlineMediaPlayback
          domStorageEnabled
          javaScriptEnabled
          mediaPlaybackRequiresUserAction={false}
          originWhitelist={["*"]}
          allowsFullscreenVideo
          androidLayerType="hardware"
          onMessage={handleWebViewMessage}
          source={{ html: generateYouTubePlayerHTML(videoId, isMuted) }}
          style={{
            backgroundColor: "black",
            bottom: 0,
            left: 0,
            position: "absolute",
            right: 0,
            top: 0,
          }}
          pointerEvents="none"
        />
      )}

      <ReelPlayerChrome
        isMuted={isMuted}
        isPlaying={isPlaying}
        onToggleMuted={onToggleMuted}
      />
    </Pressable>
  );
}

export default function Reels() {
  const { colors, fonts, isDark } = useTheme();
  const router = useRouter();
  const { earnTokens } = useAppState();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reelHeight = useMemo(
    () => Math.max(560, height - insets.top - insets.bottom),
    [height, insets.bottom, insets.top],
  );

  const [activePlayId, setActivePlayId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [followingCreatorIds, setFollowingCreatorIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedCreator, setSelectedCreator] = useState<HealthReel | null>(
    null,
  );
  const [pollReelId, setPollReelId] = useState<string | null>(null);

  const [reels, setReels] = useState<HealthReel[]>([]);
  const [loadingReels, setLoadingReels] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const REELS_PAGE_SIZE = 10;

  useEffect(() => {
    let isMounted = true;

    async function loadReels() {
      setLoadingReels(true);
      try {
        const response = await reelsApi.getReels({
          limit: REELS_PAGE_SIZE,
          page: 1,
          category: selectedCategory === "all" ? undefined : selectedCategory,
        });
        if (!isMounted) return;

        if (response.reels.length > 0) {
          const mappedReels = response.reels.map(mapApiReel);
          setReels(mappedReels);
          setUsingFallback(false);
          setPage(1);
          setHasMore(response.pagination.page < response.pagination.pages);
          // Goes through handlePlay (not a plain setActivePlayId) so the
          // very first reel's view actually gets recorded, same as every
          // reel reached by scrolling.
          if (mappedReels[0]) void handlePlay(mappedReels[0].id);
          setFollowingCreatorIds(
            new Set(
              response.reels
                .filter((reel) => reel.followedByMe)
                .map((reel) => reel.creatorId),
            ),
          );
          if (selectedCategory === "all") {
            setAvailableCategories(
              Array.from(new Set(response.reels.map((reel) => reel.category))),
            );
          }
        } else {
          setReels([]);
          setUsingFallback(false);
          setHasMore(false);
        }
      } catch {
        if (isMounted) {
          setReels(fallbackReels);
          setUsingFallback(true);
          setHasMore(false);
          setActivePlayId((current) => current ?? fallbackReels[0]?.id ?? null);
        }
      } finally {
        if (isMounted) setLoadingReels(false);
      }
    }

    loadReels();

    return () => {
      isMounted = false;
    };
    // handlePlay isn't memoized; including it would rerun this load effect
    // on every render instead of only when selectedCategory changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  async function handleLoadMoreReels() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const response = await reelsApi.getReels({
        limit: REELS_PAGE_SIZE,
        page: nextPage,
        category: selectedCategory === "all" ? undefined : selectedCategory,
      });
      setReels((prev) => [...prev, ...response.reels.map(mapApiReel)]);
      setPage(nextPage);
      setHasMore(response.pagination.page < response.pagination.pages);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

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
    // Already the active reel — skip, so a drag-then-momentum scroll (which
    // can fire both onScrollEndDrag and onMomentumScrollEnd for the same
    // settle) doesn't record the view twice or restart the video.
    if (reelId === activePlayId) return;

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

  // Fires on both onScrollEndDrag and onMomentumScrollEnd — a short/slow
  // flick on a pagingEnabled ScrollView can settle on the next page without
  // ever producing momentum, in which case onMomentumScrollEnd never fires
  // and the previous reel would otherwise keep playing (with audio) behind
  // the new one.
  function handleReelScrollSettle(
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) {
    const nextIndex = Math.round(
      event.nativeEvent.contentOffset.y / reelHeight,
    );
    const nextReel = reels[nextIndex];

    if (nextReel) {
      void handlePlay(nextReel.id);
    }

    if (!usingFallback && hasMore && nextIndex >= reels.length - 2) {
      void handleLoadMoreReels();
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

  const pollReel = reels.find((reel) => reel.id === pollReelId) ?? null;
  const pollTotalVotes = pollReel
    ? pollReel.pollOptions.reduce((sum, option) => sum + option.votes, 0)
    : 0;

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
        {loadingReels && reels.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="white" size="large" />
          </View>
        ) : (
        <ScrollView
          decelerationRate="fast"
          disableIntervalMomentum
          onMomentumScrollEnd={handleReelScrollSettle}
          onScrollEndDrag={handleReelScrollSettle}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToAlignment="start"
          snapToInterval={reelHeight}
        >
          {reels.map((item, index) => {
            const isPlaying = activePlayId === item.id;
            const isFollowing = followingCreatorIds.has(item.creatorId);

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
                  (() => {
                    const ytId = getYouTubeId(item.directMp4Url);
                    return ytId ? (
                      <YouTubePlayer
                        videoId={ytId}
                        isMuted={isMuted}
                        onToggleMuted={() => setIsMuted((current) => !current)}
                      />
                    ) : (
                      <DirectVideoPlayer
                        uri={item.directMp4Url}
                        isMuted={isMuted}
                        onToggleMuted={() => setIsMuted((current) => !current)}
                      />
                    );
                  })()
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
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
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
                  <TouchableOpacity
                    activeOpacity={0.78}
                    accessibilityRole="button"
                    accessibilityLabel="Filter by category"
                    onPress={() => setCategoryPickerVisible(true)}
                    className="flex-row items-center gap-1 rounded-full bg-white/15 px-3 py-1.5"
                  >
                    <Text className="text-[10px] font-black uppercase text-white" style={{ fontFamily: fonts.body }}>
                      {selectedCategory === "all" ? "For You" : selectedCategory}
                    </Text>
                    <Feather name="chevron-down" size={11} color="white" />
                  </TouchableOpacity>
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
                    accessibilityRole="button"
                    accessibilityLabel={isFollowing ? "Unfollow creator" : "Follow creator"}
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

                  <TouchableOpacity
                    activeOpacity={0.82}
                    accessibilityRole="button"
                    accessibilityLabel="View poll"
                    className="items-center"
                    onPress={() => setPollReelId(item.id)}
                  >
                    <View className="h-11 w-11 items-center justify-center rounded-full bg-white/18">
                      <MaterialCommunityIcons
                        name="vote-outline"
                        size={20}
                        color="white"
                      />
                      {item.votedOptionId ? (
                        <View
                          className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 items-center justify-center rounded-full"
                          style={{ backgroundColor: colors.success }}
                        >
                          <MaterialCommunityIcons name="check" size={9} color="white" />
                        </View>
                      ) : null}
                    </View>
                    <Text className="mt-1 text-[10px] font-black text-white" style={{ fontFamily: fonts.body }}>
                      Poll
                    </Text>
                  </TouchableOpacity>
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
                </View>
              </View>
            );
          })}
        </ScrollView>
        )}

        {loadingMore && (
          <View className="absolute bottom-6 self-center rounded-full bg-black/50 px-4 py-2">
            <ActivityIndicator color="white" />
          </View>
        )}
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

      {/* --- CATEGORY FILTER DROPDOWN SELECT MODAL --- */}
      <Modal
        visible={categoryPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryPickerVisible(false)}
      >
        <Pressable
          className="flex-1 justify-center items-center px-8"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
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
            {["all", ...availableCategories].map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => {
                    setSelectedCategory(cat);
                    setCategoryPickerVisible(false);
                  }}
                  className="py-3 px-4 rounded-xl flex-row items-center justify-between"
                  style={{
                    backgroundColor: isSelected ? colors.primaryLight : "transparent",
                  }}
                >
                  <Text
                    className="font-bold text-sm"
                    style={{
                      color: isSelected ? colors.primary : colors.foreground,
                      fontFamily: fonts.body,
                    }}
                  >
                    {cat === "all" ? "For You (All Categories)" : cat}
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

      {/* --- POLL MODAL - kept off the video by default so the reel stays the focus --- */}
      <Modal
        visible={!!pollReel}
        transparent
        animationType="slide"
        onRequestClose={() => setPollReelId(null)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onPress={() => setPollReelId(null)}
        >
          <Pressable
            className="rounded-t-3xl border-t p-5"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: insets.bottom + 20,
            }}
            onPress={(event) => event.stopPropagation()}
          >
            <View className="mb-4 flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <MaterialCommunityIcons
                  name="vote-outline"
                  size={16}
                  color={colors.primary}
                />
                <Text
                  className="text-[10px] font-black uppercase tracking-widest"
                  style={{ color: colors.primary, fontFamily: fonts.body }}
                >
                  Next topic poll
                </Text>
              </View>
              <TouchableOpacity
                accessibilityLabel="Close poll"
                className="h-7 w-7 items-center justify-center rounded-full"
                onPress={() => setPollReelId(null)}
                style={{ backgroundColor: colors.surfaceSoft }}
              >
                <Feather name="x" size={16} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {pollReel ? (
              <>
                <Text
                  className="mb-4 text-base font-black"
                  style={{ color: colors.foreground, fontFamily: fonts.heading }}
                >
                  {pollReel.pollQuestion}
                </Text>

                <View style={{ gap: 8 }}>
                  {pollReel.pollOptions.map((option) => {
                    const percentValue =
                      pollTotalVotes > 0
                        ? Math.round((option.votes / pollTotalVotes) * 100)
                        : 0;
                    const isThisChoiceVoted = pollReel.votedOptionId === option.id;

                    return (
                      <TouchableOpacity
                        activeOpacity={0.82}
                        className="overflow-hidden rounded-2xl border px-4 py-3"
                        disabled={!!pollReel.votedOptionId}
                        key={option.id}
                        onPress={() => handleTriggerVote(pollReel.id, option.id)}
                        style={{ borderColor: colors.border, backgroundColor: colors.input }}
                      >
                        {!!pollReel.votedOptionId ? (
                          <View
                            className="absolute bottom-0 left-0 top-0"
                            style={{ width: `${percentValue}%`, backgroundColor: colors.primaryLight }}
                          />
                        ) : null}
                        <View className="flex-row items-center justify-between gap-3">
                          <Text
                            className="flex-1 text-xs font-bold"
                            numberOfLines={2}
                            style={{ color: colors.foreground, fontFamily: fonts.body }}
                          >
                            {option.topic}
                          </Text>
                          {!!pollReel.votedOptionId ? (
                            <Text
                              className="text-xs font-black"
                              style={{
                                color: isThisChoiceVoted ? colors.primary : colors.mutedText,
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

                {pollReel.votedOptionId ? (
                  <Text
                    className="mt-3 text-center text-[10px] font-bold"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    Thanks for voting — {pollTotalVotes.toLocaleString()} total votes
                  </Text>
                ) : null}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
