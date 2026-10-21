import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import { Modal, PanResponder, Pressable, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import type { CommunityAttachment } from "../../lib/api";
import { useTheme } from "../theme";
import { Icon } from "../Icon";
import { motion } from "../motion";

export function PostAttachmentView({ attachment }: { attachment: CommunityAttachment }) {
  const { colors } = useTheme();
  const [fullscreenVisible, setFullscreenVisible] = useState(false);

  if (attachment.type === "image") {
    return (
      <>
        <Pressable
          onPress={() => setFullscreenVisible(true)}
          accessibilityRole="imagebutton"
          accessibilityLabel="Photo"
          accessibilityHint="Opens it full screen"
        >
          <Image
            transition={motion.duration.base}
            source={{ uri: attachment.url }}
            className="mt-4 w-full rounded-2xl"
            style={{ aspectRatio: 4 / 3, backgroundColor: colors.surfaceSoft }}
            contentFit="cover"
          />
        </Pressable>
        {/* Mounted only while open: it holds a video player, which every
            image row would otherwise create for nothing. */}
        {fullscreenVisible ? (
          <FullscreenMediaModal onClose={() => setFullscreenVisible(false)} attachment={attachment} />
        ) : null}
      </>
    );
  }

  if (attachment.type === "video") {
    return <PostVideoAttachment url={attachment.url} attachment={attachment} />;
  }

  return <PostAudioAttachment url={attachment.url} />;
}

function PostVideoAttachment({
  url,
  attachment,
}: {
  url: string;
  attachment: CommunityAttachment;
}) {
  const { colors } = useTheme();
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = false;
  });

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Open full screen" onPress={() => setFullscreenVisible(true)}>
        <View
          className="mt-4 w-full rounded-2xl overflow-hidden"
          style={{ aspectRatio: 16 / 9, backgroundColor: colors.surfaceSoft }}
        >
          <VideoView
            player={player}
            style={{ height: "100%", width: "100%" }}
            contentFit="cover"
            nativeControls={false}
            pointerEvents="none"
          />
          <View
            pointerEvents="none"
            className="absolute inset-0 items-center justify-center"
          >
            <View className="h-12 w-12 items-center justify-center rounded-full border border-white/50 bg-black/35">
              <Icon set="ion" name="play" size={22} color="white" />
            </View>
          </View>
        </View>
      </Pressable>
      {/* Only while open, so a feed of videos holds one decoder per post, not two. */}
      {fullscreenVisible ? (
        <FullscreenMediaModal onClose={() => setFullscreenVisible(false)} attachment={attachment} />
      ) : null}
    </>
  );
}

function FullscreenMediaModal({
  attachment,
  onClose,
}: {
  attachment: CommunityAttachment;
  onClose: () => void;
}) {
  const player = useVideoPlayer(attachment.type === "video" ? attachment.url : null, (instance) => {
    instance.loop = false;
    if (attachment.type === "video") instance.play();
  });

  return (
    <Modal
      visible
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "black" }}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close"
          onPress={onClose}
          className="absolute right-5 top-14 z-10 h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon set="ion" name="close" size={22} color="white" />
        </TouchableOpacity>

        {attachment.type === "image" ? (
          <Image
            transition={motion.duration.base}
            source={{ uri: attachment.url }}
            style={{ width: "100%", height: "80%" }}
            contentFit="contain"
          />
        ) : (
          <VideoView
            player={player}
            style={{ width: "100%", height: "60%" }}
            contentFit="contain"
            nativeControls
          />
        )}
      </View>
    </Modal>
  );
}

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function PostAudioAttachment({ url }: { url: string }) {
  const { colors, fonts } = useTheme();
  // No source until the first Play: a feed of voice notes shouldn't download
  // and decode every one of them on mount.
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const loadedRef = useRef(false);
  // The pan responder is created once, so it reads these through refs (as
  // plain closures they'd stay at their first-render values, width 0).
  const trackWidthRef = useRef(0);
  const durationRef = useRef(0);
  durationRef.current = status.duration;

  useEffect(() => {
    loadedRef.current = false;
  }, [url]);

  const progress = status.duration > 0 ? status.currentTime / status.duration : 0;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => seekToX(event.nativeEvent.locationX),
      onPanResponderMove: (event) => seekToX(event.nativeEvent.locationX),
    }),
  ).current;

  function seekToX(x: number) {
    const width = trackWidthRef.current;
    const duration = durationRef.current;
    if (width <= 0 || duration <= 0) return;
    const ratio = Math.min(1, Math.max(0, x / width));
    player.seekTo(ratio * duration);
  }

  function togglePlayback() {
    if (!loadedRef.current) {
      loadedRef.current = true;
      player.replace({ uri: url });
      player.play();
      return;
    }
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish || status.currentTime >= status.duration) player.seekTo(0);
      player.play();
    }
  }

  return (
    <View
      className="mt-4 flex-row items-center gap-3 rounded-2xl px-4 py-3"
      style={{ backgroundColor: colors.surfaceSoft }}
    >
      <TouchableOpacity hitSlop={6} accessibilityRole="button" accessibilityLabel={status.playing ? "Pause" : "Play"}
        activeOpacity={0.85}
        onPress={togglePlayback}
        className="w-9 h-9 rounded-full items-center justify-center"
        style={{ backgroundColor: colors.primary }}
      >
        <Icon set="ion"
          name={status.playing ? "pause" : "play"}
          size={16}
          color={colors.buttonText}
        />
      </TouchableOpacity>

      <View className="flex-1">
        <View
          onLayout={(event) => {
            trackWidthRef.current = event.nativeEvent.layout.width;
          }}
          {...panResponder.panHandlers}
          className="h-4 justify-center"
        >
          <View
            className="h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: colors.border }}
          >
            <View
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, Math.max(0, progress * 100))}%`,
                backgroundColor: colors.primary,
              }}
            />
          </View>
          <View
            pointerEvents="none"
            className="absolute h-3 w-3 rounded-full"
            style={{
              left: `${Math.min(100, Math.max(0, progress * 100))}%`,
              marginLeft: -6,
              backgroundColor: colors.primary,
            }}
          />
        </View>
        <View className="flex-row justify-between mt-1">
          <Text
            className="text-xs font-bold"
            style={{ color: colors.mutedText, fontFamily: fonts.mono }}
          >
            {formatAudioTime(status.currentTime)}
          </Text>
          <Text
            className="text-xs font-bold"
            style={{ color: colors.mutedText, fontFamily: fonts.mono }}
          >
            {formatAudioTime(status.duration)}
          </Text>
        </View>
      </View>
    </View>
  );
}
