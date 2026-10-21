import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, PanResponder, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { haptics } from "../../lib/haptics";
import { useContentWidth } from "../../lib/layout";
import { AppLockCover } from "../AppLockScreen";
import { Icon } from "../Icon";
import PressableFeedback from "../PressableFeedback";
import { useTheme } from "../theme";

/** How far a drag (or how fast a flick) sends the card away. */
const SWIPE_DISTANCE = 90;
const SWIPE_VELOCITY = 0.5;

export type DeckCard = { title: string; kicker?: string; body?: string };

/**
 * Full-screen couples card game: a stacked deck on a deep gradient. Swipe
 * the top card away (or tap Next) and the next one rises from the stack;
 * Back returns a card, Shuffle reorders. A progress bar shows how far in you
 * are. Each draw calls `onDraw` (the server counts plays) and ticks a haptic.
 * Under reduced motion cards swap without flying.
 */
export function CardDeckPlayer({
  visible,
  onClose,
  title,
  icon,
  gradient,
  cards,
  onDraw,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon: string;
  gradient: readonly [string, string, ...string[]];
  cards: DeckCard[];
  onDraw?: (index: number) => void;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const width = useContentWidth();
  const reduceMotion = useReducedMotion();

  // Play order: indexes into `cards`, reshuffled on demand.
  const [order, setOrder] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  // A fresh, in-order deck each time the game opens (or the deck size changes).
  useEffect(() => {
    if (visible) {
      setOrder(Array.from({ length: cards.length }, (_, i) => i));
      setPos(0);
    }
  }, [visible, cards.length]);

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const rise = useSharedValue(1);

  const count = order.length;
  const current = count ? cards[order[pos % count]] : undefined;
  const next = count > 1 ? cards[order[(pos + 1) % count]] : undefined;

  // Latest state and callbacks for the pan handlers, which are created once.
  const latest = useRef({ pos, count, order, onDraw, reduceMotion });
  latest.current = { pos, count, order, onDraw, reduceMotion };

  const settleTo = (nextPos: number) => {
    const { count: n, order: o, onDraw: draw, reduceMotion: still } = latest.current;
    if (!n) return;
    const p = ((nextPos % n) + n) % n;
    setPos(p);
    dragX.value = 0;
    dragY.value = 0;
    rise.value = 0;
    rise.value = still ? 1 : withSpring(1, { damping: 16, stiffness: 180 });
    haptics.tap();
    draw?.(o[p]);
  };

  // Fly the top card off to one side, then bring the next one up.
  const fling = (dir: 1 | -1) => {
    const { pos: p, reduceMotion: still } = latest.current;
    if (still) {
      settleTo(p + 1);
      return;
    }
    dragX.value = withTiming(dir * width * 1.3, { duration: 260, easing: Easing.in(Easing.quad) }, (done) => {
      if (done) runOnJS(settleTo)(p + 1);
    });
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_, g) => {
          dragX.value = g.dx;
          dragY.value = g.dy * 0.25;
        },
        onPanResponderRelease: (_, g) => {
          if (g.dx > SWIPE_DISTANCE || g.vx > SWIPE_VELOCITY) fling(1);
          else if (g.dx < -SWIPE_DISTANCE || g.vx < -SWIPE_VELOCITY) fling(-1);
          else {
            dragX.value = withSpring(0, { damping: 15, stiffness: 200 });
            dragY.value = withSpring(0, { damping: 15, stiffness: 200 });
          }
        },
      }),
    // Handlers read the latest state through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, reduceMotion],
  );

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value },
      { translateY: dragY.value + (1 - rise.value) * 18 },
      { rotate: `${dragX.value / 22}deg` },
      { scale: 0.94 + rise.value * 0.06 },
    ],
  }));
  // The card underneath grows towards the top spot as the top one leaves.
  const underStyle = useAnimatedStyle(() => {
    const t = Math.min(1, Math.abs(dragX.value) / (width * 0.6));
    return { transform: [{ translateY: 18 - t * 18 }, { scale: 0.94 + t * 0.06 }], opacity: 0.75 + t * 0.25 };
  });

  // The card fills the space the deck actually has (measured), keeping its
  // playing-card shape: never cut off on short phones, never huge on tablets.
  const [area, setArea] = useState({ width: 0, height: 0 });
  const RATIO = 0.72;
  const cardWidth = Math.max(
    220,
    Math.min(width - 48, 400, area.height ? (area.height - 36) * RATIO : Infinity),
  );
  const cardHeight = cardWidth / RATIO;
  // Short screens drop the hint line to give the card the room.
  const roomy = area.height === 0 || area.height > 440;
  const progress = count ? (pos + 1) / count : 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
          {/* Header: close, title, shuffle */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, gap: 12 }}>
            <RoundButton icon="close" label="Close game" onPress={onClose} />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ color: "#fff", fontSize: 17, fontWeight: "800", fontFamily: fonts.heading }}>
                {title}
              </Text>
              <Text maxFontSizeMultiplier={1.3} style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600", fontFamily: fonts.body, marginTop: 2 }}>
                {count ? `Card ${pos + 1} of ${count}` : " "}
              </Text>
            </View>
            <RoundButton
              icon="shuffle"
              label="Shuffle the deck"
              onPress={() => {
                const shuffled = cards.map((_, i) => i).sort(() => Math.random() - 0.5);
                setOrder(shuffled);
                latest.current.order = shuffled;
                settleTo(0);
              }}
            />
          </View>

          {/* Progress */}
          <View style={{ marginHorizontal: 24, marginTop: 16, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
            <View style={{ width: `${progress * 100}%`, height: 4, borderRadius: 2, backgroundColor: "#fff" }} />
          </View>

          {/* The deck */}
          <View
            onLayout={(e) => setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            {next ? (
              <Animated.View style={[styles.card, { width: cardWidth, height: cardHeight, backgroundColor: colors.surface }, underStyle]}>
                <CardFace card={next} icon={icon} tint={gradient[0]} size={cardWidth} dim />
              </Animated.View>
            ) : null}
            {current ? (
              <Animated.View
                {...pan.panHandlers}
                entering={FadeIn.duration(300)}
                accessible
                accessibilityLabel={[current.title, current.kicker, current.body].filter(Boolean).join(". ")}
                accessibilityHint="Swipe or tap Next for the next card"
                style={[styles.card, { width: cardWidth, height: cardHeight, backgroundColor: colors.surface }, topStyle]}
              >
                <CardFace card={current} icon={icon} tint={gradient[0]} size={cardWidth} />
              </Animated.View>
            ) : null}
          </View>

          {roomy ? (
            <Text maxFontSizeMultiplier={1.3} style={{ color: "rgba(255,255,255,0.8)", textAlign: "center", fontSize: 13, fontWeight: "600", fontFamily: fonts.body }}>
              Swipe the card for the next one
            </Text>
          ) : null}

          {/* Back / Next */}
          <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 24, paddingTop: 16, paddingBottom: insets.bottom + 20 }}>
            <PressableFeedback
              onPress={() => settleTo(pos - 1)}
              disabled={pos === 0}
              accessibilityRole="button"
              accessibilityLabel="Previous card"
              style={({ pressed }) => [styles.ghostButton, { opacity: pos === 0 ? 0.4 : pressed ? 0.7 : 1 }]}
            >
              <Icon set="ion" name="arrow-back" size={20} color="#fff" />
            </PressableFeedback>
            <PressableFeedback
              onPress={() => fling(1)}
              accessibilityRole="button"
              accessibilityLabel="Next card"
              style={({ pressed }) => [styles.nextButton, { opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={{ color: gradient[gradient.length - 1], fontSize: 16, fontWeight: "800", fontFamily: fonts.body }}>Next card</Text>
              <Icon set="ion" name="arrow-forward" size={18} color={gradient[gradient.length - 1]} />
            </PressableFeedback>
          </View>
        </SafeAreaView>
      </LinearGradient>
      {visible ? <AppLockCover /> : null}
    </Modal>
  );
}

/** One card's face; type scales with the card's width (`size`) so it reads well on any screen. */
function CardFace({ card, icon, tint, size, dim }: { card: DeckCard; icon: string; tint: string; size: number; dim?: boolean }) {
  const { colors, fonts } = useTheme();
  const scale = Math.min(1.15, Math.max(0.82, size / 330));
  const titleSize = Math.round((card.body ? 22 : 24) * scale);
  const pad = Math.round(24 * scale);
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: pad, paddingVertical: pad + 14, opacity: dim ? 0.6 : 1 }}>
      <View style={{ position: "absolute", top: 18, left: 20 }}>
        <Icon set="ion" name={icon as never} size={Math.round(22 * scale)} color={tint} />
      </View>
      <View style={{ position: "absolute", bottom: 18, right: 20, transform: [{ rotate: "180deg" }] }}>
        <Icon set="ion" name={icon as never} size={Math.round(22 * scale)} color={tint} />
      </View>
      {card.kicker ? (
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={1.2}
          style={{ color: tint, fontSize: Math.round(12.5 * scale), fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase", fontFamily: fonts.body, marginBottom: 10, textAlign: "center" }}
        >
          {card.kicker}
        </Text>
      ) : null}
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        numberOfLines={card.body ? 3 : 7}
        maxFontSizeMultiplier={1.2}
        style={{ color: colors.foreground, fontSize: titleSize, lineHeight: Math.round(titleSize * 1.3), fontWeight: "800", letterSpacing: -0.4, textAlign: "center", fontFamily: fonts.heading }}
      >
        {card.title}
      </Text>
      {card.body ? (
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          numberOfLines={7}
          maxFontSizeMultiplier={1.2}
          style={{ color: colors.mutedText, fontSize: Math.round(15 * scale), lineHeight: Math.round(22 * scale), textAlign: "center", fontFamily: fonts.body, marginTop: 14 }}
        >
          {card.body}
        </Text>
      ) : null}
    </View>
  );
}

function RoundButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.18)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.35)",
      })}
    >
      <Icon set="ion" name={icon as never} size={20} color="#fff" />
    </PressableFeedback>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    borderRadius: 28,
    borderCurve: "continuous",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  ghostButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  nextButton: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
});
