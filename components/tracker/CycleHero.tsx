import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { getCyclePhase } from "../../lib/cycle";
import { haptics } from "../../lib/haptics";
import { useTheme } from "../theme";
import { withAlpha } from "../ui-tokens";
import { CycleRing } from "./CycleRing";

type RingProps = React.ComponentProps<typeof CycleRing>;

const AnimatedPath = Animated.createAnimatedComponent(Path);

const RING = 196;
// Fits just inside the ring's track.
const BUBBLE = 150;
const STAGE = 284;
// How long the old values stay up while the wave fills, before the new ones land.
const SWAP_AFTER_MS = 460;
// Changes this close to the last pulse ride on it instead of starting another.
const MERGE_MS = 1500;
// Little air bubbles rising through the liquid: x across the bubble, size, loop length, start offset.
const FIZZ = [
  { x: 0.3, r: 3, ms: 4200, delay: 0 },
  { x: 0.62, r: 2, ms: 3600, delay: 900 },
  { x: 0.46, r: 4, ms: 5200, delay: 1800 },
  { x: 0.74, r: 2.5, ms: 4600, delay: 2600 },
  { x: 0.2, r: 2, ms: 3900, delay: 3300 },
];

/** Water line for the day: the bubble fills up as the cycle goes on, and is all but full when late. */
function levelFor(ring: RingProps) {
  if ((ring.daysLate ?? 0) > 0) return 0.84;
  return 0.2 + 0.6 * Math.min(1, ring.cycleDay / Math.max(1, ring.activeCycleLength));
}

/**
 * The tracker's top, Flo/Clue style and boxless: the cycle ring around a
 * glassy bubble of "liquid" in the phase colour whose level shows how far
 * through the cycle today is, with a sheen, depth shading, fizz rising
 * through it, and two faint rings breathing behind.
 *
 * Choreography: on first show the rings bloom in, the bubble springs up, the
 * liquid rises to today's level while the arc draws round to today. When
 * the ring's data or `pulseKey` changes (a log saved, settings changed) the
 * liquid surges to the brim, the values roll over at the peak, the ring
 * pops, a ripple rolls out and the liquid settles at its new level, blending
 * to the new phase colour. Pressing squeezes it; letting go sloshes it.
 * Under reduced motion everything stands still at its final state.
 */
export function CycleHero({ pulseKey, children, ...ring }: RingProps & { pulseKey?: string | number; children?: React.ReactNode }) {
  const { colors, fonts, isDark } = useTheme();
  const reduceMotion = useReducedMotion();

  // The values on screen lag the props by SWAP_AFTER_MS during an update.
  const [shown, setShown] = useState(ring);
  const signature = JSON.stringify(ring);
  const level = useSharedValue(reduceMotion ? levelFor(ring) : 0);
  const slosh = useSharedValue(0);
  const ripple = useSharedValue(0);
  const pop = useSharedValue(1);
  const press = useSharedValue(1);
  const bloom = useSharedValue(reduceMotion ? 1 : 0);
  const firstRun = useRef(true);
  const lastPulse = useRef(0);
  const latest = useRef(ring);
  latest.current = ring;

  // Entrance.
  useEffect(() => {
    if (reduceMotion) return;
    bloom.value = withSpring(1, { damping: 16, stiffness: 120 });
    level.value = withDelay(200, withTiming(levelFor(latest.current), { duration: 1200, easing: Easing.out(Easing.cubic) }));
    slosh.value = withDelay(200, withSequence(withTiming(0.6, { duration: 500 }), withTiming(0, { duration: 1200 })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (reduceMotion) {
      setShown(latest.current);
      level.value = levelFor(latest.current);
      return;
    }
    // A save and the refreshed predictions it causes land moments apart:
    // one pulse covers both, the later values just swap in under it.
    const now = Date.now();
    if (now - lastPulse.current > MERGE_MS) {
      lastPulse.current = now;
      level.value = withSequence(
        withTiming(1.06, { duration: 440, easing: Easing.out(Easing.cubic) }),
        withDelay(160, withTiming(levelFor(latest.current), { duration: 1100, easing: Easing.inOut(Easing.cubic) })),
      );
      slosh.value = withSequence(withTiming(1, { duration: 320 }), withTiming(0, { duration: 1500 }));
      ripple.value = 0;
      ripple.value = withDelay(SWAP_AFTER_MS - 60, withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }));
      pop.value = withDelay(SWAP_AFTER_MS, withSequence(withTiming(1.045, { duration: 140 }), withSpring(1, { damping: 9, stiffness: 180 })));
    } else {
      // Riding an earlier pulse: just steer the settle to the newest level.
      level.value = withTiming(levelFor(latest.current), { duration: 900, easing: Easing.inOut(Easing.cubic) });
    }
    const timer = setTimeout(() => setShown(latest.current), SWAP_AFTER_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, pulseKey]);

  const phase = getCyclePhase(shown.cycleDay, shown.activePeriodLength, shown.activeCycleLength);
  // Same phase colours as the ring's arc.
  const tint = {
    period: colors.primary,
    follicular: colors.accentText,
    ovulation: colors.secondary,
    luteal: colors.warning,
  }[phase];

  const stageStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value * pop.value }] }));
  const bubbleIn = useAnimatedStyle(() => ({ opacity: Math.min(1, bloom.value * 1.4), transform: [{ scale: 0.7 + bloom.value * 0.3 }] }));

  return (
    <View style={{ alignItems: "center", paddingTop: 14 }}>
      <Animated.Text
        key={`${shown.cycleDay}/${shown.activeCycleLength}`}
        entering={FadeIn.duration(300)}
        style={{ color: colors.mutedText, fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 1.1, textTransform: "uppercase", fontFamily: fonts.body }}
      >
        {`Today · Cycle day ${shown.cycleDay} of ${shown.activeCycleLength}`}
      </Animated.Text>

      <Pressable
        onPressIn={() => {
          if (!reduceMotion) press.value = withSpring(0.96, { damping: 18, stiffness: 320 });
        }}
        onPressOut={() => {
          if (!reduceMotion) press.value = withSpring(1, { damping: 10, stiffness: 200 });
        }}
        onPress={() => {
          haptics.tap();
          if (reduceMotion) return;
          slosh.value = withSequence(withTiming(1, { duration: 200 }), withTiming(0, { duration: 1500 }));
          ripple.value = 0;
          ripple.value = withTiming(1, { duration: 1000, easing: Easing.out(Easing.quad) });
        }}
        accessibilityRole="button"
        accessibilityHint="Plays a short animation"
        style={{ width: STAGE, height: STAGE, alignItems: "center", justifyContent: "center" }}
      >
        <Breath size={STAGE - 4} color={tint} alpha={isDark ? 0.08 : 0.07} delay={0} bloom={bloom} still={reduceMotion} />
        <Breath size={RING + 44} color={tint} alpha={isDark ? 0.13 : 0.11} delay={900} bloom={bloom} still={reduceMotion} />
        <Ripple progress={ripple} color={tint} />
        <Animated.View style={[{ alignItems: "center", justifyContent: "center" }, stageStyle]}>
          <Animated.View style={[{ position: "absolute" }, bubbleIn]}>
            <Bubble tint={tint} isDark={isDark} surface={colors.surface} level={level} slosh={slosh} still={reduceMotion} />
          </Animated.View>
          <CycleRing {...shown} />
        </Animated.View>
      </Pressable>

      {children ? <View style={{ alignSelf: "stretch", marginHorizontal: 24 }}>{children}</View> : null}
    </View>
  );
}

/** A faint disc behind the ring that blooms in, then slowly swells and fades. */
function Breath({
  size,
  color,
  alpha,
  delay,
  bloom,
  still,
}: {
  size: number;
  color: string;
  alpha: number;
  delay: number;
  bloom: SharedValue<number>;
  still: boolean;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [still, delay, t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: (0.5 + bloom.value * 0.5) * (0.95 + t.value * 0.05) }],
    opacity: bloom.value * (0.7 + t.value * 0.3),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: withAlpha(color, alpha) }, style]}
    />
  );
}

/** One clean wave rolling out from the ring. */
function Ripple({ progress, color }: { progress: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.value === 0 || progress.value === 1 ? 0 : (1 - progress.value) * 0.5,
    transform: [{ scale: 1 + progress.value * 0.38 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2, borderColor: color }, style]}
    />
  );
}

/** A sine-wave liquid surface filled down to the bottom of the bubble. */
function wavePath(levelValue: number, phaseValue: number, amplitude: number, shift: number) {
  "worklet";
  const y0 = BUBBLE * (1 - levelValue);
  let d = `M 0 ${y0}`;
  for (let x = 0; x <= BUBBLE; x += 5) {
    const y = y0 + amplitude * Math.sin((x / BUBBLE) * Math.PI * 2 + phaseValue + shift);
    d += ` L ${x} ${y}`;
  }
  return `${d} L ${BUBBLE} ${BUBBLE} L 0 ${BUBBLE} Z`;
}

/**
 * The glass bubble inside the ring: two drifting waves of liquid (colour
 * blends when the phase changes), fizz rising through it, shading towards
 * the bottom and a sheen on the top left.
 */
function Bubble({
  tint,
  isDark,
  surface,
  level,
  slosh,
  still,
}: {
  tint: string;
  isDark: boolean;
  surface: string;
  level: SharedValue<number>;
  slosh: SharedValue<number>;
  still: boolean;
}) {
  const phase = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    phase.value = withRepeat(withTiming(Math.PI * 2, { duration: 4200, easing: Easing.linear }), -1, false);
  }, [still, phase]);

  // Blend from the old phase colour to the new one instead of jumping.
  const [blend, setBlend] = useState({ from: tint, to: tint });
  const mix = useSharedValue(1);
  useEffect(() => {
    if (tint === blend.to) return;
    setBlend({ from: blend.to, to: tint });
    mix.value = 0;
    mix.value = withTiming(1, { duration: still ? 0 : 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tint]);
  const backFrom = withAlpha(blend.from, isDark ? 0.24 : 0.2);
  const backTo = withAlpha(blend.to, isDark ? 0.24 : 0.2);
  const frontFrom = withAlpha(blend.from, isDark ? 0.42 : 0.34);
  const frontTo = withAlpha(blend.to, isDark ? 0.42 : 0.34);

  const backProps = useAnimatedProps(() => ({
    d: wavePath(level.value + 0.025, -phase.value * 0.8, 5 + slosh.value * 8, 1.7),
    fill: interpolateColor(mix.value, [0, 1], [backFrom, backTo]),
  }));
  const frontProps = useAnimatedProps(() => ({
    d: wavePath(level.value, phase.value, 4 + slosh.value * 10, 0),
    fill: interpolateColor(mix.value, [0, 1], [frontFrom, frontTo]),
  }));
  const wash = withAlpha(tint, isDark ? 0.12 : 0.08);

  return (
    <View
      pointerEvents="none"
      style={{ width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2, overflow: "hidden", backgroundColor: surface }}
    >
      <View style={{ position: "absolute", inset: 0, backgroundColor: wash }} />
      <Svg width={BUBBLE} height={BUBBLE} style={{ position: "absolute" }}>
        <AnimatedPath animatedProps={backProps} />
        <AnimatedPath animatedProps={frontProps} />
      </Svg>
      {still ? null : FIZZ.map((f, i) => <Fizz key={i} {...f} level={level} color={isDark ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.85)"} />)}
      {/* Depth: a little darker towards the bottom. */}
      <LinearGradient
        colors={["rgba(0,0,0,0)", isDark ? "rgba(0,0,0,0.18)" : "rgba(80,20,50,0.06)"]}
        start={{ x: 0.5, y: 0.45 }}
        end={{ x: 0.5, y: 1 }}
        style={{ position: "absolute", inset: 0 }}
      />
      {/* Sheen, top left, and a hairline rim: reads as glass. */}
      <View
        style={{
          position: "absolute",
          top: 14,
          left: 22,
          width: 46,
          height: 20,
          borderRadius: 12,
          backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.7)",
          transform: [{ rotate: "-32deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: BUBBLE / 2,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.9)",
        }}
      />
    </View>
  );
}

/** One air bubble: rises from the bottom to just under the surface, wobbling, fading out at the top. */
function Fizz({ x, r, ms, delay, level, color }: { x: number; r: number; ms: number; delay: number; level: SharedValue<number>; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: ms, easing: Easing.in(Easing.quad) }), -1, false));
  }, [t, ms, delay]);
  const style = useAnimatedStyle(() => {
    const surface = BUBBLE * (1 - Math.min(level.value, 1)) + 8;
    const bottom = BUBBLE - 6;
    const y = bottom - (bottom - surface) * t.value;
    return {
      opacity: surface >= bottom - 4 ? 0 : Math.sin(t.value * Math.PI),
      transform: [{ translateX: x * BUBBLE + Math.sin(t.value * Math.PI * 4) * 3 - r }, { translateY: y - r }],
    };
  });
  return <Animated.View style={[{ position: "absolute", width: r * 2, height: r * 2, borderRadius: r, backgroundColor: color }, style]} />;
}
