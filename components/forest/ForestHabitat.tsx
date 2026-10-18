import { LinearGradient } from "expo-linear-gradient";
import React, { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
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
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop, LinearGradient as SvgLinearGradient } from "react-native-svg";
import type { ForestVitality } from "../../lib/api";
import { LivingTree, TREE_ASPECT } from "./LivingTree";

/*
 * The Forest screen's living scene, composed back to front like a matte
 * painting, so it reads with real depth:
 *
 *   sky + horizon glow → sun/moon (follows the real clock) + rays → clouds →
 *   far mountains → distant treeline → haze → hill with the trees you've grown
 *   → meadow → your tree and its shadow → foreground grass → weather & effects
 *
 * - Light: the sun's position sets where shadows fall and how long they are
 *   (long at dawn/dusk, short at noon); the moon does the same, faintly.
 * - Depth: each layer sits at its own distance; dragging sideways moves near
 *   layers more than far ones (parallax), and far layers are paler and bluer.
 * - Wind: one gusting wind drives the tree and the grass together.
 * - Touch: tap your tree to rustle it; it sheds a few leaves.
 * - Mood: butterflies and birds when it's thriving, petals when in bloom,
 *   fireflies and the odd shooting star at night, overcast when wilting,
 *   dusty haze when dry.
 * - Watering (`waterKey`): a small rain cloud, rain, a wet patch, ripples
 *   and, by day, a rainbow. `celebrateKey` replays the stage-up glow.
 * Every loop stops when the device asks for reduced motion or while the
 * scene is off screen (`active`). Every part is memoized, so a growth tween
 * frame only redraws the tree; `lowDetail` thins the particles for low-end phones.
 */

export type DayPart = "dawn" | "day" | "dusk" | "night";

export function dayPartFor(date = new Date()): DayPart {
  const h = date.getHours();
  if (h >= 5 && h < 8) return "dawn";
  if (h >= 8 && h < 17) return "day";
  if (h >= 17 && h < 20) return "dusk";
  return "night";
}

type Palette = {
  sky: [string, string, string];
  glow: string;
  mountain: string;
  treeline: string;
  haze: string;
  far: string;
  near: string;
  ground: [string, string];
  grass: string;
  tint: string | null;
};

const SKY: Record<DayPart, Palette> = {
  dawn: {
    sky: ["#F4B49A", "#FBD8C3", "#CFE5F1"],
    glow: "#FFD3A6",
    mountain: "#B8B4CC",
    treeline: "#93AC98",
    haze: "#F8DCCB",
    far: "#A3C79B",
    near: "#86BC7C",
    ground: ["#7DBA6E", "#4F9651"],
    grass: "#3E7F41",
    tint: "rgba(255,170,120,0.07)",
  },
  day: {
    sky: ["#58B0E8", "#A4D7F3", "#E2F3FB"],
    glow: "#FFF7D9",
    mountain: "#A8C2D7",
    treeline: "#86B28D",
    haze: "#E2F2FA",
    far: "#9BCE92",
    near: "#7BBE70",
    ground: ["#74BA66", "#4A954D"],
    grass: "#3A7F3E",
    tint: null,
  },
  dusk: {
    sky: ["#D7745C", "#F1B38A", "#E5CDE1"],
    glow: "#FFB787",
    mountain: "#A690A6",
    treeline: "#7D9881",
    haze: "#EFC3AE",
    far: "#86AF7F",
    near: "#6CA164",
    ground: ["#62A05A", "#3F8245"],
    grass: "#346B37",
    tint: "rgba(233,120,90,0.08)",
  },
  night: {
    sky: ["#071330", "#162C55", "#2D4573"],
    glow: "#8FA3D9",
    mountain: "#22345A",
    treeline: "#1C3832",
    haze: "#2C4470",
    far: "#25453A",
    near: "#1F3C2D",
    ground: ["#234530", "#15311E"],
    grass: "#122B1B",
    tint: "rgba(10,20,50,0.28)",
  },
};

const HOUR_FOR_PART: Record<DayPart, number> = { dawn: 6.6, day: 12.5, dusk: 18.4, night: 22.5 };

/** Where the sun (or moon) is, from the hour: an arc across the sky. */
function lightFor(hour: number, width: number, height: number) {
  const night = hour >= 19.6 || hour < 5.4;
  const t = night ? (((hour - 19.6 + 24) % 24) / 9.8) : (hour - 5.4) / 14.2;
  const k = Math.min(1, Math.max(0, t));
  const altitude = Math.sin(Math.PI * k) * (night ? 0.85 : 1);
  return {
    night,
    x: width * (0.1 + 0.8 * k),
    y: height * (0.56 - 0.44 * altitude),
    altitude,
  };
}

/** Deterministic noise for scenery placement (same scene every render). */
function noise(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Loops stop when the device asks for reduced motion, and while the scene is
 * off screen (`active={false}`, e.g. another screen pushed over the Forest).
 */
const ActiveContext = createContext(true);
function useCalm() {
  const reduced = useReducedMotion();
  const active = useContext(ActiveContext);
  return reduced || !active;
}

function useLoop(duration: number, delay = 0, enabled = true) {
  const v = useSharedValue(0);
  useEffect(() => {
    if (!enabled) return;
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(v);
  }, [v, duration, delay, enabled]);
  return v;
}

/* --------------------------------- Depth ---------------------------------- */

/** Extra width each layer carries so a sideways drag never shows its edge. */
const PAD = 0.14;

/** One depth layer: moves with the drag in proportion to how near it is. */
function Layer({ cam, depth, width, children }: { cam: SharedValue<number>; depth: number; width: number; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: cam.value * depth * width * 0.07 }] }));
  return (
    <Animated.View pointerEvents="box-none" style={[{ position: "absolute", top: 0, bottom: 0, left: -width * PAD, width: width * (1 + 2 * PAD) }, style]}>
      {children}
    </Animated.View>
  );
}

/* ---------------------------------- Sky ----------------------------------- */

const SunMoon = memo(function SunMoon({ night, x, y, sky }: { night: boolean; x: number; y: number; sky: string }) {
  const reduced = useCalm();
  const pulse = useLoop(3200, 0, !reduced);
  const glow = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.1 }], opacity: 0.5 + pulse.value * 0.2 }));
  const size = 120;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[StyleSheet.absoluteFill, glow]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={night ? "#F2EFE0" : "#FFF3C4"} stopOpacity={night ? 0.45 : 0.8} />
              <Stop offset="0.35" stopColor={night ? "#C9D3F2" : "#FFE08A"} stopOpacity={night ? 0.18 : 0.35} />
              <Stop offset="1" stopColor={night ? "#C9D3F2" : "#FFE08A"} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#halo)" />
        </Svg>
      </Animated.View>
      <Svg width={34} height={34}>
        <Defs>
          <RadialGradient id="disc" cx="40%" cy="38%" r="65%">
            <Stop offset="0" stopColor={night ? "#FBFAF2" : "#FFFBE6"} />
            <Stop offset="1" stopColor={night ? "#DCD8C6" : "#FFD25E"} />
          </RadialGradient>
        </Defs>
        <Circle cx={17} cy={17} r={15} fill="url(#disc)" />
        {night ? (
          <>
            {/* Craters, and a crescent shadow from the sky colour. */}
            <Circle cx={12} cy={13} r={2.6} fill="#CFCAB6" opacity={0.6} />
            <Circle cx={19} cy={21} r={1.8} fill="#CFCAB6" opacity={0.55} />
            <Circle cx={24} cy={12} r={9.5} fill={sky} opacity={0.82} />
          </>
        ) : null}
      </Svg>
    </View>
  );
});

/** Soft light shafts from a low or high sun, slowly turning. */
const SunRays = memo(function SunRays({ x, y, length, strength }: { x: number; y: number; length: number; strength: number }) {
  const reduced = useCalm();
  const turn = useLoop(11000, 0, !reduced);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${(turn.value - 0.5) * 10}deg` }] }));
  const rays = [200, 222, 246, 268, 292, 318, 340];
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: x - length, top: y - length, width: length * 2, height: length * 2 }, style]}>
      <Svg width={length * 2} height={length * 2}>
        <Defs>
          <RadialGradient id="ray" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.22 * strength} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {rays.map((deg, i) => {
          const a1 = ((deg - 3.5) * Math.PI) / 180;
          const a2 = ((deg + 3.5) * Math.PI) / 180;
          const r = length * (0.8 + noise(i) * 0.2);
          return (
            <Path
              key={deg}
              d={`M${length},${length} L${length + Math.cos(a1) * r},${length + Math.sin(a1) * r} L${length + Math.cos(a2) * r},${length + Math.sin(a2) * r} Z`}
              fill="url(#ray)"
            />
          );
        })}
      </Svg>
    </Animated.View>
  );
});

const Star = memo(function Star({ x, y, r, delay }: { x: number; y: number; r: number; delay: number }) {
  const reduced = useCalm();
  const t = useLoop(1800 + delay, delay, !reduced);
  const style = useAnimatedStyle(() => ({ opacity: 0.3 + t.value * 0.7 }));
  return <Animated.View pointerEvents="none" style={[{ position: "absolute", left: x, top: y, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: "#FFFFFF" }, style]} />;
});

/** Now and then a meteor streaks across the night sky. */
const ShootingStar = memo(function ShootingStar({ width, height }: { width: number; height: number }) {
  const reduced = useCalm();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withDelay(2500, withRepeat(withSequence(withTiming(1, { duration: 950, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 9000 }), withTiming(0, { duration: 0 })), -1));
    return () => cancelAnimation(t);
  }, [t, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value > 0 && t.value < 1 ? Math.sin(t.value * Math.PI) : 0,
    transform: [{ translateX: width * 0.15 + t.value * width * 0.45 }, { translateY: height * 0.06 + t.value * height * 0.16 }, { rotate: "20deg" }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, style]}>
      <LinearGradient colors={["rgba(255,255,255,0)", "#FFFFFF"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ width: 70, height: 2, borderRadius: 1 }} />
    </Animated.View>
  );
});

/** A volumetric cloud: lit from above, shaded underneath. */
const Cloud = memo(function Cloud({ top, width, scale, duration, offset, tone }: { top: number; width: number; scale: number; duration: number; offset: number; tone: "light" | "night" | "grey" }) {
  const reduced = useCalm();
  const x = useSharedValue(offset);
  useEffect(() => {
    if (reduced) return;
    x.value = withRepeat(
      withSequence(
        withTiming(1, { duration: duration * (1 - offset), easing: Easing.linear }),
        withTiming(0, { duration: 0 }),
        withTiming(offset, { duration: duration * offset, easing: Easing.linear }),
      ),
      -1,
    );
    return () => cancelAnimation(x);
  }, [x, duration, offset, reduced]);
  const w = 110 * scale;
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -w + x.value * (width + w) }] }));
  const top0 = tone === "grey" ? "#D9DEE3" : "#FFFFFF";
  const bottom0 = tone === "grey" ? "#A9B2BB" : tone === "night" ? "#7D8BA8" : "#D7E3EE";
  const gid = `cl${tone}${Math.round(scale * 10)}`;
  return (
    <Animated.View style={[{ position: "absolute", top, left: 0, opacity: tone === "night" ? 0.4 : 0.95 }, style]} pointerEvents="none">
      <Svg width={w} height={46 * scale} viewBox="0 0 110 46">
        <Defs>
          <SvgLinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top0} />
            <Stop offset="1" stopColor={bottom0} />
          </SvgLinearGradient>
        </Defs>
        <G fill={`url(#${gid})`}>
          <Ellipse cx={55} cy={33} rx={50} ry={11} />
          <Circle cx={34} cy={25} r={15} />
          <Circle cx={58} cy={19} r={19} />
          <Circle cx={80} cy={27} r={13} />
        </G>
        <Ellipse cx={52} cy={14} rx={12} ry={5} fill="#FFFFFF" opacity={tone === "grey" ? 0.25 : 0.55} />
      </Svg>
    </Animated.View>
  );
});

/** A small bird crossing the sky, wings flapping. */
const Bird = memo(function Bird({ width, y, delay, duration, scale }: { width: number; y: number; delay: number; duration: number; scale: number }) {
  const reduced = useCalm();
  const t = useSharedValue(0);
  const flap = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    t.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration, easing: Easing.linear }), withTiming(1, { duration: 7000 }), withTiming(0, { duration: 0 })), -1));
    flap.value = withRepeat(withSequence(withTiming(-1, { duration: 180 }), withTiming(1, { duration: 180 })), -1);
    return () => {
      cancelAnimation(t);
      cancelAnimation(flap);
    };
  }, [t, flap, delay, duration, reduced]);
  const body = useAnimatedStyle(() => ({
    opacity: t.value > 0 && t.value < 1 ? 1 : 0,
    transform: [{ translateX: -20 + t.value * (width + 40) }, { translateY: y + Math.sin(t.value * Math.PI * 4) * 6 }, { scale }],
  }));
  const wings = useAnimatedStyle(() => ({ transform: [{ scaleY: flap.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, body]}>
      <Animated.View style={wings}>
        <Svg width={16} height={8} viewBox="0 0 16 8">
          <Path d="M0,5 Q4,0 8,5 Q12,0 16,5" stroke="#3C3A44" strokeWidth={1.6} fill="none" strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
});

/* ------------------------------- Landscape -------------------------------- */

/** Mountains, treeline and haze: the far distance (static, memoized). */
const Distance = memo(function Distance({ width, height, pal }: { width: number; height: number; pal: Palette }) {
  const W = width * (1 + 2 * PAD);
  const base = height * 0.6;
  const mountains = useMemo(() => {
    let d = `M0,${base}`;
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * W;
      const peak = base - height * (0.1 + noise(i + 3) * 0.13);
      const valley = base - height * (0.04 + noise(i + 40) * 0.05);
      d += ` L${x - W / steps / 2},${valley} L${x},${peak}`;
    }
    return `${d} L${W},${base} L${W},${height} L0,${height} Z`;
  }, [W, base, height]);
  const ridges = useMemo(() => {
    // Snow/light catching the left face of each peak.
    const steps = 9;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const x = (i / steps) * W;
      const peak = base - height * (0.1 + noise(i + 3) * 0.13);
      return `M${x},${peak} L${x - 7},${peak + 9} L${x - 2},${peak + 7} Z`;
    }).join(" ");
  }, [W, base, height]);
  const treeline = useMemo(() => {
    const y0 = height * 0.615;
    let d = `M0,${y0}`;
    let x = 0;
    let i = 0;
    while (x < W) {
      const w = 9 + noise(i) * 12;
      const h = 6 + noise(i + 99) * 12;
      // Alternate rounded crowns and pointed conifers.
      d += noise(i + 7) > 0.45 ? ` q${w / 2},${-h * 1.4} ${w},0` : ` l${w / 2},${-h * 1.7} l${w / 2},${h * 1.7}`;
      x += w;
      i += 1;
    }
    return `${d} L${W},${height} L0,${height} Z`;
  }, [W, height]);
  return (
    <Svg width={W} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={pal.haze} stopOpacity={0} />
          <Stop offset="1" stopColor={pal.haze} stopOpacity={0.75} />
        </SvgLinearGradient>
      </Defs>
      <Path d={mountains} fill={pal.mountain} />
      <Path d={ridges} fill="#FFFFFF" opacity={0.28} />
      <Rect x={0} y={base - height * 0.25} width={W} height={height * 0.25} fill="url(#haze)" />
      <Path d={treeline} fill={pal.treeline} />
      <Rect x={0} y={height * 0.52} width={W} height={height * 0.1} fill="url(#haze)" opacity={0.6} />
    </Svg>
  );
});

/** The hill where every tree you've grown now stands, with soft shadows. */
const FarHill = memo(function FarHill({ width, height, pal, grownSeeds, shadowDir, shadowLen, maxTrees }: { width: number; height: number; pal: Palette; grownSeeds: number[]; shadowDir: number; shadowLen: number; maxTrees: number }) {
  const W = width * (1 + 2 * PAD);
  const off = width * PAD;
  const farY = height * 0.64;
  const slots = useMemo(() => {
    const n = Math.min(grownSeeds.length, maxTrees);
    return grownSeeds.slice(-n).map((seed, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const rank = Math.floor(i / 2);
      const x = width / 2 + side * (width * 0.22 + rank * width * 0.08) + ((seed * 37) % 11) - 5;
      const s = 46 - rank * 3 + ((seed * 13) % 7);
      return { seed, x: x + off, size: s, y: farY + 4 + (rank % 2) * 5 };
    });
  }, [grownSeeds, width, farY, off, maxTrees]);
  return (
    <>
      <Svg width={W} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path
          d={`M0,${farY} C${W * 0.2},${farY - 24} ${W * 0.42},${farY - 6} ${W * 0.6},${farY - 18} S${W * 0.9},${farY - 28} ${W},${farY - 10} L${W},${height} L0,${height} Z`}
          fill={pal.far}
        />
        {slots.map((t) => (
          <Ellipse key={`s${t.seed}`} cx={t.x + shadowDir * t.size * 0.18 * shadowLen} cy={t.y} rx={t.size * (0.22 + 0.12 * shadowLen)} ry={2.4} fill="#0E2414" opacity={0.18} />
        ))}
      </Svg>
      {slots.map((t) => (
        <View key={t.seed} pointerEvents="none" style={{ position: "absolute", left: t.x - t.size / 2, top: t.y - t.size * TREE_ASPECT * 0.92, opacity: 0.95 }}>
          <LivingTree growth={1} seed={t.seed} size={t.size} lowDetail showSoil={false} vitality="thriving" />
        </View>
      ))}
    </>
  );
});

const NearHill = memo(function NearHill({ width, height, pal }: { width: number; height: number; pal: Palette }) {
  const W = width * (1 + 2 * PAD);
  const nearY = height * 0.73;
  return (
    <Svg width={W} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path d={`M0,${nearY} C${W * 0.25},${nearY - 14} ${W * 0.55},${nearY + 4} ${W * 0.75},${nearY - 8} S${W},${nearY - 2} ${W},${nearY - 4} L${W},${height} L0,${height} Z`} fill={pal.near} />
    </Svg>
  );
});

/** The meadow your tree grows in: texture, pebbles, mushrooms, wildflowers. */
const Meadow = memo(function Meadow({ width, height, pal, night }: { width: number; height: number; pal: Palette; night: boolean }) {
  const W = width * (1 + 2 * PAD);
  const off = width * PAD;
  const top = height * 0.8;
  const cx = off + width / 2;
  return (
    <Svg width={W} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={pal.ground[0]} />
          <Stop offset="1" stopColor={pal.ground[1]} />
        </SvgLinearGradient>
      </Defs>
      <Path d={`M0,${top} C${W * 0.3},${top - 4} ${W * 0.7},${top - 3} ${W},${top} L${W},${height} L0,${height} Z`} fill="url(#ground)" />
      {/* Mown-grass texture. */}
      {Array.from({ length: 22 }, (_, i) => {
        const x = noise(i + 5) * W;
        const y = top + 6 + noise(i + 60) * (height - top - 8);
        return <Path key={`t${i}`} d={`M${x},${y} q6,-1.5 12,0`} stroke={pal.ground[1]} strokeWidth={1} opacity={0.35} fill="none" />;
      })}
      {/* Grass tufts. */}
      {Array.from({ length: 16 }, (_, i) => {
        const x = noise(i + 11) * W;
        if (Math.abs(x - cx) < width * 0.08) return null;
        const y = top + 8 + noise(i + 70) * (height - top - 12);
        return <Path key={`g${i}`} d={`M${x},${y} q-2,-7 -4,-9 M${x},${y} q0,-8 1,-11 M${x},${y} q2,-6 5,-8`} stroke={pal.grass} strokeWidth={1.3} fill="none" strokeLinecap="round" />;
      })}
      {/* Pebbles near the tree. */}
      {[[-46, 10, 4.2], [-38, 13, 2.6], [42, 12, 3.4], [52, 9, 2.2]].map(([dx, dy, r], i) => (
        <G key={`p${i}`}>
          <Ellipse cx={cx + dx} cy={top + dy} rx={r} ry={r * 0.62} fill={night ? "#59606A" : "#9AA3A8"} />
          <Ellipse cx={cx + dx - r * 0.3} cy={top + dy - r * 0.25} rx={r * 0.45} ry={r * 0.22} fill="#FFFFFF" opacity={0.35} />
        </G>
      ))}
      {/* Two little mushrooms. */}
      {[[-62, 6, 1], [66, 15, 0.8]].map(([dx, dy, s], i) => {
        const x = cx + dx;
        const y = top + dy;
        return (
          <G key={`m${i}`} transform={`translate(${x} ${y}) scale(${s})`}>
            <Path d="M-1.4,0 L-1.1,-5 L1.1,-5 L1.4,0 Z" fill="#F3E9DC" />
            <Path d="M-5,-4.6 Q0,-11 5,-4.6 Z" fill={night ? "#8E3B3B" : "#D9534F"} />
            <Circle cx={-2} cy={-6.6} r={0.8} fill="#FFFFFF" />
            <Circle cx={1.6} cy={-7.4} r={0.7} fill="#FFFFFF" />
          </G>
        );
      })}
      {/* Wildflowers. */}
      {!night
        ? Array.from({ length: 9 }, (_, i) => {
            const x = noise(i + 23) * W;
            if (Math.abs(x - cx) < width * 0.14) return null;
            const y = top + 10 + noise(i + 91) * (height - top - 16);
            const color = ["#FFFFFF", "#FFD54F", "#F8BBD0", "#CE93D8"][i % 4];
            return (
              <G key={`f${i}`}>
                <Path d={`M${x},${y} l0,6`} stroke={pal.grass} strokeWidth={1} />
                {[0, 72, 144, 216, 288].map((deg) => (
                  <Circle key={deg} cx={x + Math.cos((deg * Math.PI) / 180) * 2} cy={y + Math.sin((deg * Math.PI) / 180) * 2} r={1.5} fill={color} />
                ))}
                <Circle cx={x} cy={y} r={1.1} fill="#F9A825" />
              </G>
            );
          })
        : null}
    </Svg>
  );
});

/** Grass blades in the very front, swaying with the wind (the nearest depth). */
const ForegroundGrass = memo(function ForegroundGrass({ x, height, color, wind, delay, flip }: { x: number; height: number; color: string; wind: SharedValue<number>; delay: number; flip: boolean }) {
  const reduced = useCalm();
  const sway = useLoop(2200 + delay, delay, !reduced);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${(sway.value - 0.5) * (5 + wind.value * 9) + wind.value * 4}deg` }] }));
  const w = height * 0.8;
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: x - w / 2, bottom: -3, width: w, height, transformOrigin: "50% 100%" }, style]}>
      <Svg width={w} height={height} viewBox="0 0 40 50" style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
        <Path d="M20,50 Q14,26 6,6 Q16,26 23,50 Z" fill={color} />
        <Path d="M22,50 Q24,22 30,2 Q27,24 26,50 Z" fill={color} opacity={0.9} />
        <Path d="M18,50 Q8,34 0,24 Q11,34 21,50 Z" fill={color} opacity={0.85} />
        <Path d="M25,50 Q33,34 40,28 Q32,36 28,50 Z" fill={color} opacity={0.8} />
      </Svg>
    </Animated.View>
  );
});

/* ---------------------------------- Life ---------------------------------- */

const Butterfly = memo(function Butterfly({ ax, ay, aw, ah, color, delay }: { ax: number; ay: number; aw: number; ah: number; color: string; delay: number }) {
  const reduced = useCalm();
  const path = useLoop(5200 + delay, delay, !reduced);
  const bob = useLoop(1300, delay / 2, !reduced);
  const flap = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    flap.value = withRepeat(withSequence(withTiming(0.2, { duration: 130 }), withTiming(1, { duration: 130 })), -1);
    return () => cancelAnimation(flap);
  }, [flap, reduced]);
  const body = useAnimatedStyle(() => ({
    transform: [{ translateX: ax + path.value * aw }, { translateY: ay + bob.value * ah + Math.sin(path.value * Math.PI * 2) * 10 }],
  }));
  const wings = useAnimatedStyle(() => ({ transform: [{ scaleX: flap.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, body]}>
      <Animated.View style={wings}>
        <Svg width={18} height={13} viewBox="0 0 18 13">
          <Path d="M9,6 C6,0 0,0 1,5 C2,8 6,8 9,6 Z" fill={color} />
          <Path d="M9,6 C12,0 18,0 17,5 C16,8 12,8 9,6 Z" fill={color} />
          <Path d="M9,7 C7,9 4,12 3,10 C3,8 6,7 9,7 Z" fill={color} opacity={0.8} />
          <Path d="M9,7 C11,9 14,12 15,10 C15,8 12,7 9,7 Z" fill={color} opacity={0.8} />
          <Path d="M9,3 L9,10" stroke="#3E2C21" strokeWidth={1.2} strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
});

const Firefly = memo(function Firefly({ x, y, delay }: { x: number; y: number; delay: number }) {
  const reduced = useCalm();
  const t = useLoop(2400 + delay, delay, !reduced);
  const style = useAnimatedStyle(() => ({
    opacity: 0.15 + t.value * 0.85,
    transform: [{ translateX: x + Math.sin(t.value * Math.PI) * 16 }, { translateY: y - t.value * 20 }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { width: 14, height: 14, alignItems: "center", justifyContent: "center" }, style]}>
      <View style={{ position: "absolute", width: 14, height: 14, borderRadius: 7, backgroundColor: "rgba(255,245,157,0.25)" }} />
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#FFF59D" }} />
    </Animated.View>
  );
});

/** A leaf or petal drifting down; `once` plays it a single time per `trigger`. */
const Drifter = memo(function Drifter({ x, top, fall, delay, color, drift, petal, trigger, once }: { x: number; top: number; fall: number; delay: number; color: string; drift: number; petal?: boolean; trigger?: number; once?: boolean }) {
  const reduced = useCalm();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    if (once) {
      if (!trigger) return;
      t.value = 0;
      t.value = withDelay(delay, withTiming(1, { duration: 2400, easing: Easing.in(Easing.quad) }));
      return;
    }
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 5200, easing: Easing.in(Easing.quad) }), -1));
    return () => cancelAnimation(t);
  }, [t, delay, reduced, once, trigger]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value <= 0 || t.value >= 1 ? 0 : t.value < 0.85 ? 1 : (1 - t.value) * 6.6,
    transform: [
      { translateX: x + Math.sin(t.value * Math.PI * 3) * 12 + drift * t.value },
      { translateY: top + t.value * fall },
      { rotate: `${t.value * 520}deg` },
      { scaleX: 0.5 + Math.abs(Math.cos(t.value * Math.PI * 4)) * 0.5 },
    ],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.abs, { width: petal ? 6 : 8, height: petal ? 5 : 5, borderTopLeftRadius: 6, borderBottomRightRadius: 6, borderTopRightRadius: petal ? 6 : 1, backgroundColor: color }, style]}
    />
  );
});

/* -------------------------------- Weather --------------------------------- */

/** Watering: a small cloud gathers over the tree, rains, and drifts away. */
const RainCloud = memo(function RainCloud({ x, y, width, trigger }: { x: number; y: number; width: number; trigger: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!trigger) return;
    t.value = 0;
    t.value = withSequence(withTiming(1, { duration: 380 }), withTiming(1, { duration: 1900 }), withTiming(0, { duration: 700 }));
  }, [trigger, t]);
  const style = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ translateX: x - width / 2 }, { translateY: y - 10 + t.value * 10 }, { scale: 0.85 + t.value * 0.15 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, style]}>
      <Svg width={width} height={width * 0.42} viewBox="0 0 110 46">
        <Defs>
          <SvgLinearGradient id="rain" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#F2F5F8" />
            <Stop offset="1" stopColor="#8E9BA8" />
          </SvgLinearGradient>
        </Defs>
        <G fill="url(#rain)">
          <Ellipse cx={55} cy={33} rx={50} ry={11} />
          <Circle cx={34} cy={25} r={15} />
          <Circle cx={58} cy={19} r={19} />
          <Circle cx={80} cy={27} r={13} />
        </G>
      </Svg>
    </Animated.View>
  );
});

/** One raindrop streak, falling a few times with the wind's slant. */
const RainStreak = memo(function RainStreak({ x, fromY, toY, delay, trigger }: { x: number; fromY: number; toY: number; delay: number; trigger: number }) {
  const t = useSharedValue(0);
  const ripple = useSharedValue(0);
  useEffect(() => {
    if (!trigger) return;
    t.value = 0;
    ripple.value = 0;
    t.value = withDelay(350 + delay, withRepeat(withTiming(1, { duration: 520, easing: Easing.in(Easing.quad) }), 3));
    ripple.value = withDelay(350 + delay + 520, withRepeat(withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }), 3));
  }, [trigger, delay, t, ripple]);
  const drop = useAnimatedStyle(() => ({
    opacity: t.value > 0 && t.value < 1 ? 0.85 : 0,
    transform: [{ translateX: x + t.value * 6 }, { translateY: fromY + t.value * (toY - fromY) }, { rotate: "12deg" }],
  }));
  const ring = useAnimatedStyle(() => ({
    opacity: ripple.value > 0 && ripple.value < 1 ? (1 - ripple.value) * 0.9 : 0,
    transform: [{ translateX: x - 4 }, { translateY: toY - 3 }, { scaleX: 0.3 + ripple.value * 1.4 }, { scaleY: 0.3 + ripple.value * 0.6 }],
  }));
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.abs, { width: 1.6, height: 11, borderRadius: 1, backgroundColor: "#BFE3FF" }, drop]} />
      <Animated.View pointerEvents="none" style={[styles.abs, { width: 16, height: 5, borderRadius: 8, borderWidth: 1.2, borderColor: "rgba(255,255,255,0.85)" }, ring]} />
    </>
  );
});

/** The soil darkens where it rained, then dries. */
const WetPatch = memo(function WetPatch({ cx, cy, rx, trigger }: { cx: number; cy: number; rx: number; trigger: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!trigger) return;
    t.value = withSequence(withDelay(700, withTiming(1, { duration: 900 })), withDelay(2600, withTiming(0, { duration: 3500 })));
  }, [trigger, t]);
  const style = useAnimatedStyle(() => ({ opacity: t.value * 0.32 }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: cx - rx, top: cy - rx * 0.12, width: rx * 2, height: rx * 0.24, borderRadius: rx, backgroundColor: "#173C1B" }, style]} />
  );
});

/** After rain in daylight: a short-lived rainbow behind the tree. */
const Rainbow = memo(function Rainbow({ cx, baseY, radius, trigger }: { cx: number; baseY: number; radius: number; trigger: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!trigger) return;
    t.value = 0;
    t.value = withSequence(withDelay(1700, withTiming(1, { duration: 900 })), withDelay(2200, withTiming(0, { duration: 1100 })));
  }, [trigger, t]);
  const style = useAnimatedStyle(() => ({ opacity: t.value * 0.55 }));
  const bands = ["#FF6F61", "#FFB74D", "#FFF176", "#81C784", "#64B5F6", "#9575CD"];
  const size = radius * 2 + 20;
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: cx - size / 2, top: baseY - radius - 10, width: size, height: radius + 10 }, style]}>
      <Svg width={size} height={radius + 10}>
        {bands.map((c, i) => {
          const r = radius - i * 4.2;
          return <Path key={c} d={`M${size / 2 - r},${radius + 10} A${r},${r} 0 0 1 ${size / 2 + r},${radius + 10}`} stroke={c} strokeWidth={4.4} fill="none" />;
        })}
      </Svg>
    </Animated.View>
  );
});

const Sparkle = memo(function Sparkle({ cx, cy, angle, distance, delay, trigger, color }: { cx: number; cy: number; angle: number; distance: number; delay: number; trigger: number; color: string }) {
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
});

const GlowBurst = memo(function GlowBurst({ cx, cy, size, trigger }: { cx: number; cy: number; size: number; trigger: number }) {
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
});

/* ---------------------------------- Tree ---------------------------------- */

/** Your tree, swaying from its base in the gusting wind; a tap makes it rustle. */
const SwayingTree = memo(function SwayingTree({
  growth,
  vitality,
  seed,
  size,
  left,
  bottom,
  calm,
  wind,
  rustle,
  lowDetail,
}: {
  growth: number;
  vitality: ForestVitality;
  seed: number;
  size: number;
  left: number;
  bottom: number;
  calm: boolean;
  wind: SharedValue<number>;
  rustle: SharedValue<number>;
  lowDetail: boolean;
}) {
  const reduced = useCalm();
  const sway = useLoop(3400, 0, !reduced && !calm);
  const amp = 0.5 + 1.3 * Math.min(1, growth * 1.6); // bigger crowns catch more wind
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(sway.value - 0.5) * amp * (0.6 + wind.value * 1.1) + wind.value * amp * 0.5 + rustle.value * 3.2}deg` }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left, bottom, width: size, height: size * TREE_ASPECT, transformOrigin: "50% 91%" }, style]}>
      <LivingTree growth={growth} vitality={vitality} seed={seed} size={size} groundShadow={false} lowDetail={lowDetail} />
    </Animated.View>
  );
});

/* --------------------------------- Scene ---------------------------------- */

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
  /** The person dragged the scene or tapped the tree (e.g. to hide a hint). */
  onInteract?: () => void;
  /** Low-end phones: fewer particles, fewer trees on the hill, the simpler tree. */
  lowDetail?: boolean;
  /** False while the scene is off screen: every loop stops until it's back. */
  active?: boolean;
};

/** Particle counts, lighter on low-end phones. */
const DETAIL = {
  full: { stars: 16, rain: 12, sparkles: 10, grass: 9, fireflies: 6, hillTrees: 9 },
  low: { stars: 8, rain: 7, sparkles: 6, grass: 5, fireflies: 3, hillTrees: 5 },
};

export const ForestHabitat = memo(function ForestHabitat({ active = true, ...props }: ForestHabitatProps) {
  return (
    <ActiveContext.Provider value={active}>
      <Scene {...props} />
    </ActiveContext.Provider>
  );
});

function Scene({ height, growth, vitality, treeSeed, grownSeeds, waterKey, celebrateKey, dayPart, onInteract, lowDetail = false }: Omit<ForestHabitatProps, "active">) {
  const reduced = useCalm();
  const detail = lowDetail ? DETAIL.low : DETAIL.full;
  const [width, setWidth] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (dayPart) return;
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [dayPart]);
  const part = dayPart ?? dayPartFor(now);
  const hour = dayPart ? HOUR_FOR_PART[dayPart] : now.getHours() + now.getMinutes() / 60;
  const pal = SKY[part];
  const light = lightFor(hour, width, height);
  const night = light.night;
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  // Shadows fall away from the light, longer when it's low.
  const shadowDir = light.x < width / 2 ? 1 : -1;
  const shadowLen = 0.35 + (1 - light.altitude) * 1.6;
  const overcast = vitality === "wilting";
  const dusty = vitality === "dry";
  const lively = vitality === "thriving" || vitality === "new" || vitality === "thirsty";
  const bloom = growth > 0.88 && (vitality === "thriving" || vitality === "new");

  /* Camera: drag sideways to look around; springs back on release. */
  const cam = useSharedValue(0);
  const interacted = useRef(false);
  const noteInteraction = () => {
    if (interacted.current) return;
    interacted.current = true;
    onInteract?.();
  };
  const widthRef = useRef(width);
  widthRef.current = width;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
        onPanResponderGrant: () => noteInteraction(),
        onPanResponderMove: (_, g) => {
          cam.value = Math.max(-1, Math.min(1, g.dx / Math.max(1, widthRef.current * 0.45)));
        },
        onPanResponderRelease: () => {
          cam.value = withSpring(0, { damping: 13, stiffness: 90 });
        },
        onPanResponderTerminate: () => {
          cam.value = withSpring(0, { damping: 13, stiffness: 90 });
        },
        onPanResponderTerminationRequest: () => false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cam],
  );

  /* Wind: gusts that build and die down, shared by the tree and the grass. */
  const wind = useSharedValue(0.3);
  useEffect(() => {
    if (reduced) return;
    const ease = Easing.inOut(Easing.sin);
    wind.value = withRepeat(
      withSequence(
        withTiming(0.15, { duration: 2600, easing: ease }),
        withTiming(0.95, { duration: 1700, easing: ease }),
        withTiming(0.4, { duration: 2300, easing: ease }),
        withTiming(0.75, { duration: 1500, easing: ease }),
        withTiming(0.2, { duration: 3200, easing: ease }),
      ),
      -1,
      true,
    );
    return () => cancelAnimation(wind);
  }, [wind, reduced]);

  /* Tap the tree: it rustles and sheds a few leaves. */
  const rustle = useSharedValue(0);
  const [rustleKey, setRustleKey] = useState(0);
  const onTreePress = () => {
    noteInteraction();
    if (!reduced) {
      rustle.value = withSequence(
        withTiming(1, { duration: 90 }),
        withTiming(-0.8, { duration: 140 }),
        withTiming(0.5, { duration: 160 }),
        withTiming(-0.25, { duration: 180 }),
        withTiming(0, { duration: 220 }),
      );
    }
    setRustleKey((k) => k + 1);
  };

  const groundY = height * 0.86;
  // The camera starts close on the seed and pulls back as the tree grows, so a
  // sprout isn't lost in an empty meadow.
  const early = Math.min(1, Math.max(0, growth / 0.45));
  const zoom = 1 + 1.3 * (1 - early * early * (3 - 2 * early));
  const treeSize = Math.min(width * 0.7, (height * 0.66) / TREE_ASPECT) * zoom;
  const off = width * PAD; // scene x → layer x inside padded layers
  const treeLeft = off + (width - treeSize) / 2;
  // LivingTree's ground line sits at 200/220 of its height.
  const treeBottom = height - groundY - treeSize * TREE_ASPECT * (20 / 220);
  const crownY = groundY - treeSize * TREE_ASPECT * (0.12 + 0.5 * growth);
  const crownW = treeSize * (0.15 + 0.55 * Math.min(1, growth * 1.4));

  const stars = useMemo(
    () => Array.from({ length: detail.stars }, (_, i) => ({ x: noise(i + 300), y: noise(i + 400) * 0.48, r: i % 5 === 0 ? 1.4 : 0.85, delay: (i * 230) % 1700 })),
    [detail.stars],
  );
  const rain = useMemo(() => Array.from({ length: detail.rain }, (_, i) => ({ dx: noise(i + 500) - 0.5, delay: Math.round(noise(i + 600) * 520) })), [detail.rain]);
  const sparkles = useMemo(
    () => Array.from({ length: detail.sparkles }, (_, i) => ({ angle: (i / detail.sparkles) * Math.PI * 2, distance: 50 + ((i * 23) % 30), delay: (i * 40) % 200 })),
    [detail.sparkles],
  );
  const grassTufts = useMemo(
    () => Array.from({ length: detail.grass }, (_, i) => ({ x: noise(i + 700), h: 30 + noise(i + 800) * 22, delay: Math.round(noise(i + 900) * 900) })),
    [detail.grass],
  );
  const fireflies = [0.16, 0.3, 0.68, 0.84, 0.58, 0.42].slice(0, detail.fireflies);
  const leafColor = vitality === "dry" ? "#B98552" : vitality === "wilting" ? "#B7B24A" : "#5E9E45";

  return (
    <View onLayout={onLayout} style={{ height, overflow: "hidden" }} {...pan.panHandlers}>
      {/* Sky */}
      <LinearGradient colors={overcast ? ["#9AA7B2", "#C3CCD3", "#DFE4E8"] : pal.sky} style={StyleSheet.absoluteFill} />
      {width > 0 ? (
        <>
          {/* Warm glow on the horizon under the sun/moon. */}
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <RadialGradient id="horizon" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={pal.glow} stopOpacity={overcast ? 0.15 : 0.55} />
                <Stop offset="1" stopColor={pal.glow} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={light.x} cy={height * 0.6} rx={width * 0.7} ry={height * 0.34} fill="url(#horizon)" />
          </Svg>

          {night ? stars.map((s, i) => <Star key={i} x={s.x * width} y={s.y * height} r={s.r} delay={s.delay} />) : null}
          {night && !lowDetail ? <ShootingStar width={width} height={height} /> : null}
          {!overcast ? <SunMoon night={night} x={light.x} y={light.y} sky={pal.sky[1]} /> : null}
          {!night && !overcast && !lowDetail ? <SunRays x={light.x} y={light.y} length={width * 0.75} strength={part === "day" ? 0.7 : 1} /> : null}

          <Cloud top={height * 0.08} width={width} scale={0.9} duration={52000} offset={0.15} tone={overcast ? "grey" : night ? "night" : "light"} />
          <Cloud top={height * 0.24} width={width} scale={0.55} duration={70000} offset={0.62} tone={overcast ? "grey" : night ? "night" : "light"} />
          {overcast ? <Cloud top={height * 0.15} width={width} scale={1.2} duration={60000} offset={0.4} tone="grey" /> : null}

          {lively && !night && !overcast && !lowDetail ? (
            <>
              <Bird width={width} y={height * 0.2} delay={1200} duration={13000} scale={1} />
              <Bird width={width} y={height * 0.24} delay={1700} duration={13600} scale={0.75} />
            </>
          ) : null}

          {/* Landscape, far to near. Drag moves near layers more than far ones. */}
          <Layer cam={cam} depth={0.15} width={width}>
            <Distance width={width} height={height} pal={pal} />
          </Layer>
          <Layer cam={cam} depth={0.4} width={width}>
            <FarHill width={width} height={height} pal={pal} grownSeeds={grownSeeds} shadowDir={shadowDir} shadowLen={shadowLen} maxTrees={detail.hillTrees} />
          </Layer>
          <Layer cam={cam} depth={0.6} width={width}>
            <NearHill width={width} height={height} pal={pal} />
          </Layer>
          {!overcast && !night && growth > 0.5 ? (
            <Rainbow cx={width / 2} baseY={groundY - 10} radius={Math.min(width * 0.42, height * 0.55)} trigger={waterKey} />
          ) : null}
          <Layer cam={cam} depth={0.8} width={width}>
            <Meadow width={width} height={height} pal={pal} night={night} />
            <WetPatch cx={off + width / 2} cy={groundY + 2} rx={Math.max(36, crownW * 0.9)} trigger={waterKey} />

            {/* Contact shadow, then the cast shadow away from the light. */}
            {growth > 0.05 ? (
              <Svg width={width * (1 + 2 * PAD)} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Defs>
                  <RadialGradient id="cast" cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor="#0B2410" stopOpacity={night ? 0.16 : 0.3} />
                    <Stop offset="1" stopColor="#0B2410" stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Ellipse
                  cx={off + width / 2 + shadowDir * crownW * 0.32 * shadowLen}
                  cy={groundY + 1}
                  rx={crownW * (0.55 + 0.3 * shadowLen)}
                  ry={Math.max(4, crownW * 0.09)}
                  fill="url(#cast)"
                />
                <Ellipse cx={off + width / 2} cy={groundY + 1} rx={Math.max(10, crownW * 0.22)} ry={3} fill="#0B2410" opacity={0.22} />
              </Svg>
            ) : null}

            <SwayingTree
              growth={growth}
              vitality={vitality}
              seed={treeSeed}
              size={treeSize}
              left={treeLeft}
              bottom={treeBottom}
              calm={growth < 0.04}
              wind={wind}
              rustle={rustle}
              lowDetail={lowDetail}
            />
            {/* Tap target over the tree. */}
            <Pressable
              onPress={onTreePress}
              accessibilityRole="button"
              accessibilityLabel="Your tree. Tap to rustle its leaves"
              style={{ position: "absolute", left: off + width / 2 - Math.max(40, crownW * 0.6), top: crownY - crownW * 0.55, width: Math.max(80, crownW * 1.2), height: Math.max(60, groundY - crownY + crownW * 0.55) }}
            />
          </Layer>

          {/* Life */}
          {lively && !night && growth > 0.2 ? (
            <>
              <Butterfly ax={width * 0.1} ay={height * 0.42} aw={width * 0.3} ah={24} color="#F48FB1" delay={0} />
              {growth > 0.6 && !lowDetail ? <Butterfly ax={width * 0.56} ay={height * 0.5} aw={width * 0.3} ah={18} color="#FFCA28" delay={900} /> : null}
            </>
          ) : null}
          {night && lively ? fireflies.map((fx, i) => <Firefly key={i} x={width * fx} y={height * (0.62 + (i % 3) * 0.07)} delay={i * 380} />) : null}
          {(vitality === "wilting" || vitality === "dry") && growth > 0.3
            ? [0, 1, 2].map((i) => (
                <Drifter key={`w${i}`} x={width / 2 + (i - 1) * crownW * 0.4} top={crownY} fall={groundY - crownY} delay={i * 1500} color={leafColor} drift={18} />
              ))
            : null}
          {bloom
            ? [0, 1, 2, 3].map((i) => (
                <Drifter key={`p${i}`} x={width / 2 + (i - 1.5) * crownW * 0.3} top={crownY - 6} fall={groundY - crownY + 6} delay={i * 1300 + 400} color={i % 2 ? "#F8BBD0" : "#FCE4EC"} drift={26} petal />
              ))
            : null}
          {/* Leaves shaken loose by a tap. */}
          {growth > 0.3
            ? [0, 1, 2, 3].map((i) => (
                <Drifter key={`r${i}`} once trigger={rustleKey} x={width / 2 + (noise(i + 50) - 0.5) * crownW} top={crownY + (noise(i + 80) - 0.5) * crownW * 0.4} fall={groundY - crownY} delay={i * 90} color={leafColor} drift={(noise(i + 20) - 0.5) * 40} />
              ))
            : null}

          {/* Foreground grass: the nearest layer, partly in front of everything. */}
          <Layer cam={cam} depth={1.2} width={width}>
            {grassTufts.map((g, i) => {
              const x = off + g.x * width;
              if (Math.abs(x - off - width / 2) < width * 0.12) return null;
              return <ForegroundGrass key={i} x={x} height={g.h} color={pal.grass} wind={wind} delay={g.delay} flip={i % 2 === 0} />;
            })}
          </Layer>

          {/* Atmosphere for the time of day and the tree's mood. */}
          {pal.tint ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: pal.tint }]} /> : null}
          {overcast ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(110,120,130,0.12)" }]} /> : null}
          {dusty ? (
            <LinearGradient pointerEvents="none" colors={["rgba(222,184,128,0.05)", "rgba(214,168,110,0.22)"]} style={StyleSheet.absoluteFill} />
          ) : null}

          {/* Watering */}
          <RainCloud x={width / 2} y={Math.max(8, crownY - crownW * 0.6 - 40)} width={Math.max(110, crownW * 1.5)} trigger={waterKey} />
          {rain.map((d, i) => (
            <RainStreak key={i} x={width / 2 + d.dx * Math.max(90, crownW * 1.3)} fromY={Math.max(30, crownY - crownW * 0.6 - 4)} toY={groundY - 1 - Math.abs(d.dx) * 6} delay={d.delay} trigger={waterKey} />
          ))}

          {/* Stage-up celebration */}
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
