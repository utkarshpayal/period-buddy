import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, View, type GestureResponderEvent } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { DOUBLE_TAP_MS, hasPoll, REEL_POLL_AFTER_MS, REEL_POLL_RESULTS_MS, REEL_VIEW_AFTER_MS, type ReelItem } from "../../lib/reels";
import { ReelActionRail } from "./ReelActionRail";
import { HeartBurst, MuteFlash, type Burst } from "./ReelFeedback";
import { ReelOverlay } from "./ReelOverlay";
import { PollPanel } from "./ReelSheets";
import { ReelVideo } from "./ReelVideo";
import { YouTubeReel } from "./YouTubeReel";

const FILL = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;

/** Everything the pager hands each page. Callbacks are stable (the screen keeps them in refs). */
export type ReelPageActions = {
  onToggleMute: () => void;
  /** Sets the like (double tap only ever likes). */
  onSetLike: (id: string, liked: boolean) => void;
  onSetSaved: (id: string, saved: boolean) => void;
  onShare: (reel: ReelItem) => void;
  onOpenComments: (id: string) => void;
  onFollow: (id: string, creatorId: string) => void;
  onOpenCreator: (reel: ReelItem) => void;
  onOpenPoll: (id: string) => void;
  /** Votes from the poll panel on the video. */
  onVote: (id: string, optionId: string) => void;
  /** Fired once per activation, after REEL_VIEW_AFTER_MS of real playback. */
  onViewed: (id: string) => void;
  /** The active MP4 reel played to the end without looping. */
  onEnded: (id: string) => void;
};

/**
 * Calls `onFire` once `running` has been true for `ms` in total (pauses
 * don't reset it). `reset` going true starts over (the reel was swiped away).
 */
function usePlayTimeTrigger(running: boolean, reset: boolean, ms: number, onFire: () => void) {
  const elapsed = useRef(0);
  const fired = useRef(false);
  const onFireRef = useRef(onFire);
  onFireRef.current = onFire;

  useEffect(() => {
    if (!reset) return;
    elapsed.current = 0;
    fired.current = false;
  }, [reset]);

  useEffect(() => {
    if (!running || fired.current) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      fired.current = true;
      onFireRef.current();
    }, Math.max(0, ms - elapsed.current));
    return () => {
      clearTimeout(timer);
      if (!fired.current) elapsed.current += Date.now() - startedAt;
    };
  }, [running, ms]);
}

export const ReelPage = memo(function ReelPage({
  reel,
  width,
  height,
  isActive,
  isPreload,
  playbackAllowed,
  autoAdvance,
  muted,
  following,
  topInset,
  bottomInset,
  actions,
}: {
  reel: ReelItem;
  width: number;
  height: number;
  isActive: boolean;
  /** A neighbour of the active reel: its MP4 player is created paused so the swipe starts instantly. */
  isPreload: boolean;
  /** Screen focused, app in the foreground, nothing covering it. */
  playbackAllowed: boolean;
  /** Move on to the next reel when this one ends (false: loop). */
  autoAdvance: boolean;
  muted: boolean;
  following: boolean;
  topInset: number;
  bottomInset: number;
  actions: ReelPageActions;
}) {
  const [held, setHeld] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [burst, setBurst] = useState<Burst | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const lastTapRef = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shouldPlay = isActive && playbackAllowed && !held;

  useEffect(() => {
    if (!isActive) setHeld(false);
  }, [isActive]);

  useEffect(
    () => () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    },
    [],
  );

  usePlayTimeTrigger(isActive && playing, !isActive, REEL_VIEW_AFTER_MS, () => actions.onViewed(reel.id));

  // Poll: a bottom panel (same look as the poll sheet) slides up once the reel
  // has played a while, and slides away a moment after a vote (or when
  // closed). The video keeps playing above it. Already answered: never pops.
  const pollable = hasPoll(reel);
  const [pollShown, setPollShown] = useState(false);
  const [pollDone, setPollDone] = useState(false);
  // Counted from time on screen (not reported playback): browsers can block
  // autoplay, and the poll should still appear.
  usePlayTimeTrigger(shouldPlay && pollable && !reel.votedOptionId, !isActive, REEL_POLL_AFTER_MS, () =>
    setPollShown(true),
  );
  useEffect(() => {
    if (!isActive) {
      setPollShown(false);
      setPollDone(false);
    }
  }, [isActive]);
  // Starts fully below the bottom edge and drops back there when it goes.
  const pollOffscreen = height;
  const pollY = useSharedValue(pollOffscreen);
  const [pollMounted, setPollMounted] = useState(false);
  useEffect(() => {
    if (pollShown) {
      setPollMounted(true);
      pollY.value = pollOffscreen;
      pollY.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
      return;
    }
    pollY.value = withTiming(pollOffscreen, { duration: 420, easing: Easing.in(Easing.cubic) });
    const timer = setTimeout(() => setPollMounted(false), 440);
    return () => clearTimeout(timer);
  }, [pollShown, pollOffscreen, pollY]);
  const pollStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pollY.value }] }));

  useEffect(() => {
    if (!pollShown || !reel.votedOptionId) return;
    const timer = setTimeout(() => {
      setPollShown(false);
      setPollDone(true);
    }, REEL_POLL_RESULTS_MS);
    return () => clearTimeout(timer);
  }, [pollShown, reel.votedOptionId]);

  const handlePlayingChange = useCallback((value: boolean) => setPlaying(value), []);
  const handleEnded = useCallback(() => actions.onEnded(reel.id), [actions, reel.id]);

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      const now = Date.now();
      const { locationX, locationY } = event.nativeEvent;
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        // Double tap: like (never unlike) with a heart where the finger was.
        lastTapRef.current = 0;
        if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
        setBurst({ key: now, x: locationX, y: locationY });
        if (!reel.isLiked) actions.onSetLike(reel.id, true);
        return;
      }
      lastTapRef.current = now;
      singleTapTimer.current = setTimeout(() => {
        singleTapTimer.current = null;
        actions.onToggleMute();
        setFlashKey((key) => key + 1);
      }, DOUBLE_TAP_MS);
    },
    [actions, reel.id, reel.isLiked],
  );

  const mountPlayer = isActive || isPreload;

  return (
    <View style={{ width, height, backgroundColor: "#050505", overflow: "hidden" }}>
      {reel.youtubeId ? (
        isActive ? (
          <YouTubeReel videoId={reel.youtubeId} shouldPlay={shouldPlay} muted={muted} onPlayingChange={handlePlayingChange} />
        ) : reel.thumbnailUrl ? (
          <Image source={{ uri: reel.thumbnailUrl }} resizeMode="cover" style={FILL} />
        ) : null
      ) : mountPlayer && reel.videoUrl ? (
        <ReelVideo
          uri={reel.videoUrl}
          thumbnailUrl={reel.thumbnailUrl}
          active={isActive}
          shouldPlay={shouldPlay}
          muted={muted}
          // Keep looping while the poll panel waits for a vote.
          loop={!autoAdvance || (pollShown && !reel.votedOptionId)}
          bottomInset={bottomInset}
          onPlayingChange={handlePlayingChange}
          onEnded={handleEnded}
        />
      ) : reel.thumbnailUrl ? (
        <Image source={{ uri: reel.thumbnailUrl }} resizeMode="cover" style={FILL} />
      ) : null}

      {/* Gesture layer: tap = mute, double tap = like, hold = pause. */}
      <Pressable
        style={FILL}
        accessibilityRole="button"
        accessibilityLabel={`${reel.title}. Video`}
        accessibilityHint="Tap to mute or unmute, double tap to like, press and hold to pause"
        onPress={handlePress}
        onLongPress={() => setHeld(true)}
        onPressOut={() => setHeld(false)}
        delayLongPress={220}
      />

      {/* Scrims for legibility (top bar and bottom text). */}
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: topInset + 90 }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.78)"]}
        locations={[0, 0.45, 1]}
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: Math.min(height * 0.55, 420) }}
      />

      <HeartBurst burst={burst} />
      <MuteFlash flashKey={flashKey} muted={muted} />

      {/* Holding to pause hides the chrome, like Instagram. */}
      <View pointerEvents={held ? "none" : "box-none"} style={[FILL, { opacity: held ? 0 : 1 }]}>
        <View pointerEvents="box-none" style={{ position: "absolute", right: 10, bottom: bottomInset + 22 }}>
          <ReelActionRail
            reel={reel}
            following={following}
            onOpenCreator={() => actions.onOpenCreator(reel)}
            onFollow={() => actions.onFollow(reel.id, reel.creatorId)}
            onLike={() => actions.onSetLike(reel.id, !reel.isLiked)}
            onComments={() => actions.onOpenComments(reel.id)}
            onShare={() => actions.onShare(reel)}
            onSave={() => actions.onSetSaved(reel.id, !reel.isSaved)}
          />
        </View>
        <View
          pointerEvents={pollShown ? "none" : "box-none"}
          // The caption steps aside while the poll panel is up, so they never overlap.
          style={{ position: "absolute", left: 16, right: 76, bottom: bottomInset + 18, opacity: pollShown ? 0 : 1 }}
        >
          <ReelOverlay
            reel={reel}
            following={following}
            onOpenCreator={() => actions.onOpenCreator(reel)}
            onFollow={() => actions.onFollow(reel.id, reel.creatorId)}
            onOpenPoll={() => actions.onOpenPoll(reel.id)}
            onShowPoll={() => setPollShown(true)}
            showPollChip={pollable && !pollShown && (pollDone || Boolean(reel.votedOptionId))}
          />
        </View>

        {pollMounted ? (
          <Animated.View
            pointerEvents={pollShown ? "box-none" : "none"}
            style={[{ position: "absolute", left: 0, right: 0, bottom: 0 }, pollStyle]}
          >
            <PollPanel
              reel={reel}
              bottomInset={bottomInset}
              onVote={actions.onVote}
              onClose={() => {
                setPollShown(false);
                setPollDone(true);
              }}
            />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
});
