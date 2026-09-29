import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, Path, Stop, LinearGradient as SvgLinearGradient } from "react-native-svg";
import type { ForestVitality } from "../../lib/api";
import { LivingTree, TREE_ASPECT } from "./LivingTree";

// The Forest screen's living scene: sky by the real time of day, drifting
// clouds, the user's fully grown trees on the far hill, and their current
// tree swaying in the meadow. Ambient life follows the tree's health
// (butterflies when thriving, falling leaves when dry, fireflies at night).
// `waterKey` / `celebrateKey` replay the watering and stage-up effects.

export type DayPart = "dawn" | "day" | "dusk" | "night";

export function dayPartFor(date = new Date()): DayPart {
  const h = date.getHours();
  if (h >= 5 && h < 8) return "dawn";
  if (h >= 8 && h < 17) return "day";
  if (h >= 17 && h < 20) return "dusk";
  return "night";
}

const SKY: Record<DayPart, { sky: [string, string, string]; far: string; near: string; ground: [string, string]; tint: string | null }> = {
  dawn: { sky: ["#F9C9A8", "#FDE3CF", "#D3ECF7"], far: "#A9CFA0", near: "#86BD7C", ground: ["#79B86C", "#4F9651"], tint: "rgba(255,170,120,0.08)" },
  day: { sky: ["#72BFEB", "#AEDCF5", "#E3F4FC"], far: "#A4D39B", near: "#7DBE73", ground: ["#72B866", "#4B964E"], tint: null },
  dusk: { sky: ["#E98E6B", "#F5BE92", "#E9D4E6"], far: "#8DB585", near: "#6FA266", ground: ["#62A05A", "#3F8245"], tint: "rgba(233,120,90,0.1)" },
  night: { sky: ["#0A1733", "#1B335F", "#36507F"], far: "#2A4A3A", near: "#23402F", ground: ["#274A30", "#183421"], tint: "rgba(10,20,50,0.32)" },
};

function useLoop(duration: number, delay = 0, enabled = true) {
  const v = useSharedValue(0);
  useEffect(() => {
    if (!enabled) return;
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(v);
  }, [v, duration, delay, enabled]);
  return v;
}

function Cloud({ top, width, scale, duration, offset, dim }: { top: number; width: number; scale: number; duration: number; offset: number; dim: boolean }) {
  const reduced = useReducedMotion();
  const x = useSharedValue(offset);
  useEffect(() => {
    if (reduced) return;
    x.value = withRepeat(
      withSequence(withTiming(1, { duration: duration * (1 - offset), easing: Easing.linear }), withTiming(0, { duration: 0 }), withTiming(offset, { duration: duration * offset, easing: Easing.linear })),
      -1,
    );
    return () => cancelAnimation(x);
  }, [x, duration, offset, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -90 * scale + x.value * (width + 90 * scale) }] }));
  return (
    <Animated.View style={[{ position: "absolute", top, left: 0, opacity: dim ? 0.35 : 0.92 }, style]} pointerEvents="none">
      <Svg width={90 * scale} height={36 * scale} viewBox="0 0 90 36">
        <Ellipse cx={45} cy={24} rx={40} ry={11} fill="#FFFFFF" />
        <Circle cx={30} cy={18} r={13} fill="#FFFFFF" />
        <Circle cx={52} cy={14} r={15} fill="#FFFFFF" />
        <Ellipse cx={45} cy={30} rx={34} ry={5} fill="#E6EEF5" opacity={0.7} />
      </Svg>
    </Animated.View>
  );
}

function SunMoon({ part, x, y }: { part: DayPart; x: number; y: number }) {
  const reduced = useReducedMotion();
  const pulse = useLoop(2600, 0, !reduced);
  const glow = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.12 }], opacity: 0.35 + pulse.value * 0.2 }));
  const night = part === "night";
  const core = night ? "#F4F1E4" : part === "day" ? "#FFE58A" : "#FFC27A";
  return (
    <View style={{ position: "absolute", left: x - 34, top: y - 34, width: 68, height: 68, alignItems: "center", justifyContent: "center" }} pointerEvents="none">
      <Animated.View style={[{ position: "absolute", width: 68, height: 68, borderRadius: 34, backgroundColor: night ? "rgba(244,241,228,0.35)" : "rgba(255,221,120,0.55)" }, glow]} />
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: core }}>
        {night ? <View style={{ position: "absolute", left: 9, top: -3, width: 26, height: 26, borderRadius: 13, backgroundColor: SKY.night.sky[1] }} /> : null}
      </View>
    </View>
  );
}

function Star({ x, y, r, delay }: { x: number; y: number; r: number; delay: number }) {
  const reduced = useReducedMotion();
  const t = useLoop(1800 + delay, delay, !reduced);
  const style = useAnimatedStyle(() => ({ opacity: 0.35 + t.value * 0.65 }));
  return <Animated.View pointerEvents="none" style={[{ position: "absolute", left: x, top: y, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: "#FFFFFF" }, style]} />;
}

function Butterfly({ area, color, delay }: { area: { x: number; y: number; w: number; h: number }; color: string; delay: number }) {
  const reduced = useReducedMotion();
  const path = useLoop(5200 + delay, delay, !reduced);
  const bob = useLoop(1300, delay / 2, !reduced);
  const flap = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    flap.value = withRepeat(withSequence(withTiming(0.25, { duration: 140 }), withTiming(1, { duration: 140 })), -1);
    return () => cancelAnimation(flap);
  }, [flap, reduced]);
  const body = useAnimatedStyle(() => ({
    transform: [{ translateX: area.x + path.value * area.w }, { translateY: area.y + bob.value * area.h + Math.sin(path.value * Math.PI * 2) * 10 }],
  }));
  const wings = useAnimatedStyle(() => ({ transform: [{ scaleX: flap.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0 }, body]}>
      <Animated.View style={[{ flexDirection: "row" }, wings]}>
        <View style={{ width: 8, height: 10, borderTopLeftRadius: 8, borderBottomLeftRadius: 5, backgroundColor: color }} />
        <View style={{ width: 2, height: 10, backgroundColor: "#4A3728" }} />
        <View style={{ width: 8, height: 10, borderTopRightRadius: 8, borderBottomRightRadius: 5, backgroundColor: color }} />
      </Animated.View>
    </Animated.View>
  );
}

function Firefly({ x, y, delay }: { x: number; y: number; delay: number }) {
  const reduced = useReducedMotion();
  const t = useLoop(2200 + delay, delay, !reduced);
  const style = useAnimatedStyle(() => ({
    opacity: 0.2 + t.value * 0.8,
    transform: [{ translateX: x + Math.sin(t.value * Math.PI) * 14 }, { translateY: y - t.value * 18 }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, width: 5, height: 5, borderRadius: 3, backgroundColor: "#FFF59D", shadowColor: "#FFF59D", shadowOpacity: 1, shadowRadius: 5 }, style]} />
  );
}

function FallingLeaf({ x, top, fall, delay, color }: { x: number; top: number; fall: number; delay: number; color: string }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 4200, easing: Easing.in(Easing.quad) }), -1));
    return () => cancelAnimation(t);
  }, [t, delay, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.9 ? 1 : (1 - t.value) * 10,
    transform: [{ translateX: x + Math.sin(t.value * Math.PI * 3) * 12 }, { translateY: top + t.value * fall }, { rotate: `${t.value * 540}deg` }],
  }));
  return <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, width: 7, height: 5, borderTopLeftRadius: 6, borderBottomRightRadius: 6, backgroundColor: color }, style]} />;
}

/** One water drop: falls onto the tree, then a ripple spreads on the ground. */
function Drop({ x, fromY, toY, delay, trigger }: { x: number; fromY: number; toY: number; delay: number; trigger: number }) {
  const t = useSharedValue(0);
  const ripple = useSharedValue(0);
  useEffect(() => {
    if (!trigger) return;
    t.value = 0;
    ripple.value = 0;
    t.value = withDelay(delay, withTiming(1, { duration: 650, easing: Easing.in(Easing.quad) }));
    ripple.value = withDelay(delay + 650, withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }));
  }, [trigger, delay, t, ripple]);
  const drop = useAnimatedStyle(() => ({
    opacity: t.value > 0 && t.value < 1 ? 1 : 0,
    transform: [{ translateX: x }, { translateY: fromY + t.value * (toY - fromY) }],
  }));
  const ring = useAnimatedStyle(() => ({
    opacity: ripple.value > 0 && ripple.value < 1 ? 1 - ripple.value : 0,
    transform: [{ translateX: x - 10 }, { translateY: toY - 3 }, { scaleX: 0.4 + ripple.value * 1.4 }, { scaleY: 0.4 + ripple.value * 0.6 }],
  }));
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.abs, { width: 6, height: 9, borderRadius: 3, borderTopLeftRadius: 1, borderTopRightRadius: 5, backgroundColor: "#6EC6FF" }, drop]} />
      <Animated.View pointerEvents="none" style={[styles.abs, { width: 20, height: 6, borderRadius: 10, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.85)" }, ring]} />
    </>
  );
}

function Sparkle({ cx, cy, angle, distance, delay, trigger, color }: { cx: number; cy: number; angle: number; distance: number; delay: number; trigger: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!trigger) return;
    t.value = 0;
    t.value = withDelay(delay, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [trigger, delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value > 0 && t.value < 1 ? 1 - t.value * t.value : 0,
    transform: [
      { translateX: cx + Math.cos(angle) * distance * t.value },
      { translateY: cy + Math.sin(angle) * distance * t.value - t.value * 12 },
      { scale: 0.4 + Math.sin(t.value * Math.PI) * 0.9 },
      { rotate: `${t.value * 180}deg` },
    ],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, style]}>
      <View style={{ width: 10, height: 10, alignItems: "center", justifyContent: "center" }}>
        <View style={{ position: "absolute", width: 10, height: 2.4, borderRadius: 2, backgroundColor: color }} />
        <View style={{ position: "absolute", width: 2.4, height: 10, borderRadius: 2, backgroundColor: color }} />
      </View>
    </Animated.View>
  );
}

function GlowBurst({ cx, cy, size, trigger }: { cx: number; cy: number; size: number; trigger: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!trigger) return;
    t.value = 0;
    t.value = withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) });
  }, [trigger, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value > 0 && t.value < 1 ? (1 - t.value) * 0.7 : 0,
    transform: [{ translateX: cx - size / 2 }, { translateY: cy - size / 2 }, { scale: 0.3 + t.value * 1.2 }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.abs, { width: size, height: size, borderRadius: size / 2, backgroundColor: "rgba(255,244,190,0.9)" }, style]} />;
}

/** The current tree, swaying from its base like a real one in a breeze. */
function SwayingTree({ growth, vitality, seed, size, left, bottom, calm }: { growth: number; vitality: ForestVitality; seed: number; size: number; left: number; bottom: number; calm: boolean }) {
  const reduced = useReducedMotion();
  const sway = useLoop(3400, 0, !reduced && !calm);
  const amp = 0.6 + 1.4 * Math.min(1, growth * 1.6); // bigger crowns catch more wind
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${(sway.value - 0.5) * amp}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left, bottom, width: size, height: size * TREE_ASPECT, transformOrigin: "50% 91%" }, style]}>
      <LivingTree growth={growth} vitality={vitality} seed={seed} size={size} />
    </Animated.View>
  );
}

const Backdrop = memo(function Backdrop({ width, height, part, grownSeeds }: { width: number; height: number; part: DayPart; grownSeeds: number[] }) {
  const pal = SKY[part];
  const farY = height * 0.62;
  const nearY = height * 0.72;
  // The forest you've grown stands on the far hill, back to front.
  const slots = useMemo(() => {
    const n = Math.min(grownSeeds.length, 9);
    return grownSeeds.slice(-n).map((seed, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const rank = Math.floor(i / 2);
      const x = width / 2 + side * (width * 0.2 + rank * width * 0.075) + ((seed * 37) % 11) - 5;
      const s = 44 - rank * 3 + ((seed * 13) % 7);
      return { seed, x, size: s, y: farY + 6 + (rank % 2) * 5 };
    });
  }, [grownSeeds, width, farY]);
  return (
    <>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={pal.ground[0]} />
            <Stop offset="1" stopColor={pal.ground[1]} />
          </SvgLinearGradient>
        </Defs>
        <Path d={`M0,${farY} C${width * 0.2},${farY - 26} ${width * 0.42},${farY - 8} ${width * 0.6},${farY - 20} S${width * 0.9},${farY - 30} ${width},${farY - 12} L${width},${height} L0,${height} Z`} fill={pal.far} />
      </Svg>
      {slots.map((t) => (
        <View key={t.seed} pointerEvents="none" style={{ position: "absolute", left: t.x - t.size / 2, top: t.y - t.size * TREE_ASPECT * 0.92, opacity: 0.92 }}>
          <LivingTree growth={1} seed={t.seed} size={t.size} lowDetail showSoil={false} vitality="thriving" />
        </View>
      ))}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path d={`M0,${nearY} C${width * 0.25},${nearY - 14} ${width * 0.55},${nearY + 4} ${width * 0.75},${nearY - 8} S${width},${nearY - 2} ${width},${nearY - 4} L${width},${height} L0,${height} Z`} fill={pal.near} />
        <Path d={`M0,${height * 0.8} C${width * 0.3},${height * 0.76} ${width * 0.7},${height * 0.77} ${width},${height * 0.8} L${width},${height} L0,${height} Z`} fill="url(#ground)" />
        {/* Grass tufts and a few wildflowers in the meadow. */}
        {Array.from({ length: 14 }, (_, i) => {
          const x = ((i * 53) % 97) / 97 * width;
          const y = height * (0.84 + ((i * 29) % 13) / 100);
          return <Path key={`g${i}`} d={`M${x},${y} q-2,-7 -4,-9 M${x},${y} q0,-8 1,-11 M${x},${y} q2,-6 5,-8`} stroke={pal.ground[1]} strokeWidth={1.4} fill="none" strokeLinecap="round" />;
        })}
        {part !== "night"
          ? Array.from({ length: 7 }, (_, i) => {
              const x = ((i * 71 + 13) % 89) / 89 * width;
              if (Math.abs(x - width / 2) < width * 0.14) return null;
              const y = height * (0.86 + ((i * 17) % 9) / 100);
              return <Circle key={`f${i}`} cx={x} cy={y} r={2.2} fill={["#FFFFFF", "#FFD54F", "#F8BBD0"][i % 3]} />;
            })
          : null}
      </Svg>
    </>
  );
});

export type ForestHabitatProps = {
  height: number;
  growth: number;
  vitality: ForestVitality;
  treeSeed: number;
  grownSeeds: number[];
  waterKey: number;
  celebrateKey: number;
  /** Fixed time of day instead of the clock (previews). */
  dayPart?: DayPart;
};

export function ForestHabitat({ height, growth, vitality, treeSeed, grownSeeds, waterKey, celebrateKey, dayPart }: ForestHabitatProps) {
  const [width, setWidth] = useState(0);
  const [clockPart, setPart] = useState<DayPart>(() => dayPartFor());
  const part = dayPart ?? clockPart;
  useEffect(() => {
    if (dayPart) return;
    const id = setInterval(() => setPart(dayPartFor()), 60_000);
    return () => clearInterval(id);
  }, [dayPart]);
  const pal = SKY[part];
  const night = part === "night";
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const groundY = height * 0.86;
  // Leave the top of the scene for the stage chips.
  // The camera starts close on the seed and pulls back as the tree grows, so a
  // sprout isn't lost in an empty meadow.
  const early = Math.min(1, Math.max(0, growth / 0.45));
  const zoom = 1 + 1.3 * (1 - early * early * (3 - 2 * early));
  const treeSize = Math.min(width * 0.7, (height * 0.66) / TREE_ASPECT) * zoom;
  const treeLeft = (width - treeSize) / 2;
  // LivingTree's ground line sits at 200/220 of its height.
  const treeBottom = height - groundY - treeSize * TREE_ASPECT * (20 / 220);
  const crownY = groundY - treeSize * TREE_ASPECT * (0.12 + 0.5 * growth);
  const lively = vitality === "thriving" || vitality === "new" || vitality === "thirsty";

  const stars = useMemo(
    () => Array.from({ length: 16 }, (_, i) => ({ x: ((i * 67) % 100) / 100, y: ((i * 31) % 45) / 100, r: i % 4 === 0 ? 1.4 : 0.9, delay: (i * 230) % 1700 })),
    [],
  );
  const drops = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ dx: ((i * 37) % 100) / 100 - 0.5, delay: (i * 97) % 700 })), []);
  const sparkles = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ angle: (i / 14) * Math.PI * 2, distance: 50 + ((i * 23) % 30), delay: (i * 40) % 200 })), []);

  return (
    <View onLayout={onLayout} style={{ height, overflow: "hidden" }}>
      <LinearGradient colors={pal.sky} style={StyleSheet.absoluteFill} />
      {width > 0 ? (
        <>
          {night ? stars.map((s, i) => <Star key={i} x={s.x * width} y={s.y * height} r={s.r} delay={s.delay} />) : null}
          <SunMoon part={part} x={width * 0.82} y={height * (part === "day" ? 0.16 : 0.3)} />
          <Cloud top={height * 0.1} width={width} scale={0.9} duration={46000} offset={0.15} dim={night} />
          <Cloud top={height * 0.26} width={width} scale={0.6} duration={62000} offset={0.6} dim={night} />
          <Backdrop width={width} height={height} part={part} grownSeeds={grownSeeds} />

          <SwayingTree growth={growth} vitality={vitality} seed={treeSeed} size={treeSize} left={treeLeft} bottom={treeBottom} calm={growth < 0.04} />

          {lively && !night && growth > 0.2 ? (
            <>
              <Butterfly area={{ x: width * 0.12, y: height * 0.38, w: width * 0.3, h: 26 }} color="#F48FB1" delay={0} />
              {growth > 0.6 ? <Butterfly area={{ x: width * 0.55, y: height * 0.48, w: width * 0.3, h: 20 }} color="#FFD54F" delay={900} /> : null}
            </>
          ) : null}
          {night && lively
            ? [0.18, 0.3, 0.7, 0.82, 0.62].map((fx, i) => <Firefly key={i} x={width * fx} y={height * (0.62 + (i % 3) * 0.07)} delay={i * 420} />)
            : null}
          {(vitality === "wilting" || vitality === "dry") && growth > 0.3
            ? [0, 1, 2].map((i) => (
                <FallingLeaf key={i} x={width / 2 + (i - 1) * treeSize * 0.22} top={crownY} fall={groundY - crownY} delay={i * 1400} color={vitality === "dry" ? "#B98552" : "#B7B24A"} />
              ))
            : null}

          {pal.tint ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: pal.tint }]} /> : null}

          {drops.map((d, i) => (
            <Drop key={i} x={width / 2 + d.dx * width * 0.5} fromY={-12} toY={groundY - 2 - Math.abs(d.dx) * 6} delay={d.delay} trigger={waterKey} />
          ))}
          <GlowBurst cx={width / 2} cy={crownY} size={treeSize * 0.9} trigger={celebrateKey} />
          {sparkles.map((s, i) => (
            <Sparkle key={i} cx={width / 2 - 5} cy={crownY - 5} angle={s.angle} distance={s.distance} delay={s.delay} trigger={celebrateKey} color={i % 2 ? "#FFE082" : "#FFFFFF"} />
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ abs: { position: "absolute", left: 0, top: 0 } });

