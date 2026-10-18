import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { memo, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, Text, TouchableOpacity, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";

const FILL = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;

function logFirstFrame(uri: string, ms: number, preloaded: boolean) {
  if (!__DEV__) return;
  console.info(`[reels] first frame ${ms}ms${preloaded ? " (preloaded)" : ""} ${uri}`);
}

/**
 * A direct MP4 reel. Mounted for the active reel and its neighbours (so a
 * swipe either way starts from a buffered first frame); every other reel
 * shows only its thumbnail, and unmounting releases the native player.
 *
 * When `loop` is false the reel plays once and calls `onEnded` (the screen
 * moves on to the next one); when true it loops natively.
 *
 * Progress lives in a Reanimated shared value updated from the player's
 * `timeUpdate` event, so the bar moves without re-rendering anything.
 */
export const ReelVideo = memo(function ReelVideo({
  uri,
  thumbnailUrl,
  active,
  shouldPlay,
  muted,
  loop,
  bottomInset,
  onPlayingChange,
  onEnded,
}: {
  uri: string;
  thumbnailUrl: string;
  /** The reel on screen (shows the progress bar and loading state). */
  active: boolean;
  shouldPlay: boolean;
  muted: boolean;
  /** Loop instead of ending (last reel, or a sheet or poll is open). */
  loop: boolean;
  bottomInset: number;
  onPlayingChange: (playing: boolean) => void;
  onEnded: () => void;
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = loop;
    instance.muted = muted;
    instance.timeUpdateEventInterval = 0.25;
  });
  const [firstFrame, setFirstFrame] = useState(false);
  const progress = useSharedValue(0);

  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const { status } = useEvent(player, "statusChange", { status: player.status });

  useEffect(() => {
    if (shouldPlay) player.play();
    else player.pause();
  }, [player, shouldPlay]);

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    player.loop = loop;
  }, [player, loop]);

  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    const subscription = player.addListener("playToEnd", () => {
      if (!player.loop && activeRef.current) onEndedRef.current();
    });
    return () => subscription.remove();
  }, [player]);

  // Time to first frame, measured from when the reel became the active one
  // (0 when the preloaded frame was already there). Dev builds only for now.
  const activatedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!active) {
      activatedAt.current = null;
      return;
    }
    activatedAt.current = Date.now();
    if (firstFrame) logFirstFrame(uri, 0, true);
    // Only on activation; `firstFrame` turning true is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, uri]);

  // Swiping away and back starts the reel from the top, like Instagram.
  useEffect(() => {
    if (active) return;
    try {
      player.currentTime = 0;
    } catch {
      // The player may already be released while unmounting.
    }
    progress.value = 0;
  }, [active, player, progress]);

  useEffect(() => {
    const subscription = player.addListener("timeUpdate", ({ currentTime }) => {
      const duration = player.duration;
      progress.value = duration > 0 ? Math.min(1, currentTime / duration) : 0;
    });
    return () => subscription.remove();
  }, [player, progress]);

  useEffect(() => {
    onPlayingChange(isPlaying);
  }, [isPlaying, onPlayingChange]);

  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const failed = status === "error";
  const loading = active && shouldPlay && !failed && (!firstFrame || status === "loading");

  return (
    <View style={FILL} pointerEvents="box-none">
      <VideoView
        player={player}
        style={FILL}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
        // A TextureView composes correctly inside a scrolling pager.
        surfaceType={Platform.OS === "android" ? "textureView" : undefined}
        useExoShutter={false}
        onFirstFrameRender={() => {
          setFirstFrame(true);
          if (activatedAt.current !== null) logFirstFrame(uri, Date.now() - activatedAt.current, false);
        }}
      />

      {!firstFrame && thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} resizeMode="cover" style={FILL} />
      ) : null}

      {loading ? (
        <View style={FILL} pointerEvents="none" className="items-center justify-center">
          <ActivityIndicator color="white" />
        </View>
      ) : null}

      {failed && active ? (
        <View style={FILL} className="items-center justify-center bg-black/50" pointerEvents="box-none">
          <Ionicons name="alert-circle-outline" size={32} color="white" />
          <Text className="mt-2 text-sm font-bold text-white">This video couldn&apos;t play</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Try playing the video again"
            className="mt-3 rounded-full bg-white/20 px-4 py-2"
            onPress={() => {
              setFirstFrame(false);
              void player.replaceAsync(uri).then(() => {
                if (shouldPlay) player.play();
              });
            }}
          >
            <Text className="text-sm font-bold text-white">Try again</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {active ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", left: 0, right: 0, bottom: bottomInset, height: 2, backgroundColor: "rgba(255,255,255,0.22)" }}
        >
          <Animated.View style={[{ height: 2, backgroundColor: "white" }, barStyle]} />
        </View>
      ) : null}
    </View>
  );
});
