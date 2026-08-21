import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";
import type { CyclePhase } from "../lib/cycle";
import { FOREST_PHASE_COLORS } from "./ui-tokens";

// Ported 1:1 from the marketing website's forest simulator
// (Marketing website/src/pages/Home.jsx) so the app's Wellness Forest shares
// the same look — same trees, same phase-based sky/hill palette.

export type ForestPhase = CyclePhase;

const PHASE_SKY = FOREST_PHASE_COLORS.sky;
const PHASE_HILLS = FOREST_PHASE_COLORS.hills;
const PHASE_SUN = FOREST_PHASE_COLORS.sun;

export function OakSVG({
  color = "#2E8B7A",
  highlightColor = "#4DB6AC",
  size = 52,
}: {
  color?: string;
  highlightColor?: string;
  size?: number;
}) {
  return (
    <Svg viewBox="0 0 64 64" width={size} height={size}>
      <Path
        d="M32,58 L32,40 M32,46 L26,38 M32,43 L37,37"
        stroke="#5D4037"
        strokeWidth={4.5}
        strokeLinecap="round"
        fill="none"
      />
      <Ellipse cx={32} cy={58} rx={18} ry={4} fill="#795548" opacity={0.5} />
      <Circle cx={32} cy={26} r={16} fill={color} />
      <Circle cx={22} cy={32} r={12} fill={color} />
      <Circle cx={42} cy={32} r={12} fill={color} />
      <Circle cx={30} cy={22} r={12} fill={highlightColor} opacity={0.8} />
      <Circle cx={20} cy={30} r={9} fill={highlightColor} opacity={0.8} />
      <Circle cx={40} cy={28} r={9} fill={highlightColor} opacity={0.8} />
    </Svg>
  );
}

export function SproutSVG({ size = 48 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 64 64" width={size} height={size}>
      <Path
        d="M32,56 C32,56 22,46 22,34 C22,24 30,16 32,16 C34,16 42,24 42,34 C42,46 32,56 32,56 Z"
        fill="#2E8B7A"
        opacity={0.15}
      />
      <Path d="M32,58 L32,32" stroke="#8D6E63" strokeWidth={3} strokeLinecap="round" />
      <Path
        d="M32,42 C24,42 16,36 14,30 C12,24 18,20 24,24 C30,28 32,38 32,42 Z"
        fill="#4CAF50"
      />
      <Path
        d="M32,42 C26,40 20,34 18,28"
        stroke="#388E3C"
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M32,36 C40,36 48,30 50,24 C52,18 46,14 40,18 C34,22 32,32 32,36 Z"
        fill="#81C784"
      />
      <Path
        d="M32,36 C38,34 44,28 46,22"
        stroke="#4CAF50"
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
      />
      <Ellipse cx={32} cy={58} rx={14} ry={4} fill="#8D6E63" opacity={0.7} />
    </Svg>
  );
}

export function PalmSVG({ size = 48 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 64 64" width={size} height={size}>
      <Path
        d="M26,58 C28,44 32,32 40,24"
        stroke="#8D6E63"
        strokeWidth={4.5}
        strokeLinecap="round"
        fill="none"
      />
      <Ellipse cx={26} cy={58} rx={16} ry={4.5} fill="#795548" opacity={0.6} />
      <Path d="M40,24 C32,22 22,24 16,30" stroke="#2E8B7A" strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M40,24 C34,20 25,20 18,24" stroke="#4DB6AC" strokeWidth={2.5} strokeLinecap="round" fill="none" />
      <Path d="M40,24 C46,26 54,32 58,40" stroke="#2E8B7A" strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M40,24 C44,22 51,24 56,28" stroke="#4DB6AC" strokeWidth={2.5} strokeLinecap="round" fill="none" />
      <Path d="M40,24 C36,16 28,10 18,12" stroke="#2E8B7A" strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M40,24 C44,14 48,8 56,12" stroke="#009688" strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M40,24 C40,12 36,4 32,2" stroke="#80CBC4" strokeWidth={3} strokeLinecap="round" fill="none" />
      <Circle cx={37} cy={27} r={3.5} fill="#5D4037" />
      <Circle cx={43} cy={25} r={3} fill="#5D4037" />
    </Svg>
  );
}

export function MushroomSVG({ size = 48 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 64 64" width={size} height={size}>
      <Path
        d="M32,58 C32,58 26,52 26,42 C26,38 38,38 38,42 C38,52 32,58 32,58 Z"
        fill="#F5F5F5"
        stroke="#E0E0E0"
        strokeWidth={1.5}
      />
      <Path
        d="M14,38 C14,24 22,14 32,14 C42,14 50,24 50,38 C50,39 14,39 14,38 Z"
        fill="#E4694F"
      />
      <Circle cx={24} cy={22} r={3} fill="#FFFFFF" opacity={0.9} />
      <Circle cx={40} cy={24} r={3.5} fill="#FFFFFF" opacity={0.9} />
      <Circle cx={32} cy={30} r={2.5} fill="#FFFFFF" opacity={0.9} />
      <Circle cx={19} cy={32} r={2} fill="#FFFFFF" opacity={0.9} />
      <Circle cx={45} cy={33} r={2} fill="#FFFFFF" opacity={0.9} />
      <Ellipse cx={32} cy={58} rx={15} ry={4} fill="#81C784" />
      <Path
        d="M22,58 L20,53 L25,58 L28,51 L31,58 L36,52 L39,58"
        stroke="#4CAF50"
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

export function PineSVG({ size = 48 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 64 64" width={size} height={size}>
      <Rect x={30} y={48} width={4} height={10} rx={1} fill="#5D4037" />
      <Ellipse cx={32} cy={58} rx={14} ry={3.5} fill="#795548" opacity={0.5} />
      <Path d="M14,48 L50,48 L32,32 Z" fill="#1B5E20" />
      <Path d="M17,36 L47,36 L32,22 Z" fill="#2E7D32" />
      <Path d="M21,24 L43,24 L32,10 Z" fill="#4CAF50" />
      <Circle cx={32} cy={18} r={1.5} fill="#FFF" opacity={0.3} />
      <Circle cx={28} cy={30} r={1.5} fill="#FFF" opacity={0.3} />
      <Circle cx={36} cy={40} r={1.5} fill="#FFF" opacity={0.3} />
    </Svg>
  );
}

export function AutumnSVG({ size = 52 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 64 64" width={size} height={size}>
      <Path
        d="M32,58 L32,40 M32,46 L27,39 M32,44 L36,38"
        stroke="#5D4037"
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
      />
      <Ellipse cx={32} cy={58} rx={16} ry={4} fill="#795548" opacity={0.5} />
      <Circle cx={32} cy={26} r={15} fill="#E4694F" />
      <Circle cx={23} cy={31} r={11} fill="#D9B26B" />
      <Circle cx={41} cy={31} r={11} fill="#E28743" />
      <Circle cx={31} cy={21} r={10} fill="#FFC107" opacity={0.9} />
      <Circle cx={21} cy={28} r={8} fill="#F4511E" opacity={0.9} />
      <Path d="M22,57 C20,55 18,57 20,58 Z" fill="#D9B26B" />
      <Path d="M42,58 C44,56 46,58 43,59 Z" fill="#E4694F" />
    </Svg>
  );
}

function cycleTreeForPhase(phase: ForestPhase) {
  if (phase === "period") return <OakSVG color="#E4694F" highlightColor="#FFA796" />;
  if (phase === "follicular") return <SproutSVG />;
  if (phase === "ovulation") return <OakSVG color="#2E8B7A" highlightColor="#4DB6AC" />;
  return <AutumnSVG />;
}

// Per-phase motion + ambient particle character, so the scene feels alive in a
// way that matches the cycle phase: calm and rainy during the period, gently
// blooming in the follicular phase, bright and energetic at ovulation, and a
// warm falling-leaf drift in the luteal phase.
const PHASE_MOTION: Record<
  ForestPhase,
  { swayDeg: number; swayMs: number; particle: string; particleColors: string[] }
> = {
  period: { swayDeg: 2, swayMs: 2600, particle: "rain", particleColors: ["#9DB4C0", "#B8C6CF"] },
  follicular: { swayDeg: 3, swayMs: 1900, particle: "petal", particleColors: ["#F6C6D8", "#FADCE6", "#FBE3B3"] },
  ovulation: { swayDeg: 4.5, swayMs: 1300, particle: "sparkle", particleColors: ["#FFE082", "#FFF3C4", "#FFFFFF"] },
  luteal: { swayDeg: 3.5, swayMs: 2100, particle: "leaf", particleColors: ["#E4694F", "#E28743", "#D9B26B", "#FFC107"] },
};

function FloatingCloud({ top, left, delay, scale = 1 }: { top: number; left: number; delay: number; scale?: number }) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(drift, {
          duration: 6000,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          duration: 6000,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [delay, drift]);

  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 24] });

  return (
    <Animated.View
      style={{
        position: "absolute",
        top,
        left,
        transform: [{ translateX }, { scale }],
      }}
    >
      <View style={{ width: 60, height: 20, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.85)" }} />
      <View
        style={{
          position: "absolute",
          top: -15,
          left: 10,
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: "rgba(255,255,255,0.85)",
        }}
      />
      <View
        style={{
          position: "absolute",
          top: -10,
          right: 10,
          width: 25,
          height: 25,
          borderRadius: 12.5,
          backgroundColor: "rgba(255,255,255,0.85)",
        }}
      />
    </Animated.View>
  );
}

function SwayingTree({
  children,
  delay = 0,
  swayDeg = 3,
  swayMs = 1800,
}: {
  children: React.ReactNode;
  delay?: number;
  swayDeg?: number;
  swayMs?: number;
}) {
  const sway = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(sway, {
          duration: swayMs,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(sway, {
          duration: swayMs,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [delay, sway, swayMs]);

  const rotate = sway.interpolate({
    inputRange: [0, 1],
    outputRange: [`-${swayDeg}deg`, `${swayDeg}deg`],
  });

  return <Animated.View style={{ transform: [{ rotate }] }}>{children}</Animated.View>;
}

// A softly breathing sun/moon: the glow radius and scale pulse gently. At
// ovulation the glow is strongest, giving the scene its "bright day" feel.
function PulsingSun({ color, glow, top }: { color: string; glow: string | null; top: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { duration: 2200, easing: Easing.inOut(Easing.sin), toValue: 1, useNativeDriver: true }),
        Animated.timing(pulse, { duration: 2200, easing: Easing.inOut(Easing.sin), toValue: 0, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, glow ? 1.08 : 1.02] });

  return (
    <Animated.View
      style={{
        position: "absolute",
        top,
        right: 28,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: color,
        transform: [{ scale }],
        ...(glow
          ? { shadowColor: glow, shadowOpacity: 0.9, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } }
          : null),
      }}
    />
  );
}

// One drifting ambient particle (rain streak / petal / sparkle / leaf) that
// falls from above the scene to below it, swaying sideways on the way down and
// then looping. Shape and motion are chosen per phase.
function Particle({
  kind,
  color,
  startLeft,
  delay,
  height,
  swayX,
}: {
  kind: string;
  color: string;
  startLeft: number;
  delay: number;
  height: number;
  swayX: number;
}) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const duration = kind === "rain" ? 1400 : kind === "sparkle" ? 2600 : 3400;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { duration, easing: Easing.linear, toValue: 1, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [t, delay, kind]);

  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-12, height + 12] });
  const translateX = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, swayX, 0] });
  const opacity = t.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] });
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "220deg"] });

  const base = {
    position: "absolute" as const,
    top: 0,
    left: startLeft,
    transform: [{ translateX }, { translateY }, ...(kind === "rain" ? [] : [{ rotate }])],
    opacity,
  };

  if (kind === "rain") {
    return <Animated.View style={[base, { width: 2, height: 10, borderRadius: 1, backgroundColor: color }]} />;
  }
  if (kind === "sparkle") {
    return <Animated.View style={[base, { width: 5, height: 5, borderRadius: 2.5, backgroundColor: color }]} />;
  }
  // petal / leaf — a small rounded blob, leaves slightly larger
  const s = kind === "leaf" ? 9 : 7;
  return (
    <Animated.View
      style={[base, { width: s, height: s * 0.7, borderTopLeftRadius: s, borderBottomRightRadius: s, backgroundColor: color }]}
    />
  );
}

function FallingParticles({ phase, height, width = 320 }: { phase: ForestPhase; height: number; width?: number }) {
  const motion = PHASE_MOTION[phase];
  const count = motion.particle === "rain" ? 14 : motion.particle === "sparkle" ? 10 : 9;
  // Deterministic spread (no Math.random — keeps SSR/reanimated-safe & stable).
  const particles = Array.from({ length: count }, (_, i) => ({
    key: i,
    color: motion.particleColors[i % motion.particleColors.length],
    startLeft: 12 + ((i * 53) % (width - 24)),
    delay: (i * 260) % 2400,
    swayX: motion.particle === "rain" ? 4 : (i % 2 === 0 ? 16 : -16),
  }));

  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      {particles.map((p) => (
        <Particle
          key={p.key}
          kind={motion.particle}
          color={p.color}
          startLeft={p.startLeft}
          delay={p.delay}
          height={height}
          swayX={p.swayX}
        />
      ))}
    </View>
  );
}

export type ForestSceneProps = {
  height?: number;
  phase: ForestPhase;
  /** When provided, this replaces the generic 4-species decorative row with
   * a single centerpiece (the user's own GrowthTree) so the scene reads as
   * "your tree in your forest" rather than stock scenery. The centerpiece is
   * expected to manage its own sway/scale animation, so it isn't wrapped in
   * SwayingTree here (that would compound two independent rotations). */
  centerpiece?: React.ReactNode;
};

export function ForestScene({ height = 236, phase, centerpiece }: ForestSceneProps) {
  const sky = PHASE_SKY[phase];
  const hills = PHASE_HILLS[phase];
  const sun = PHASE_SUN[phase];
  const motion = PHASE_MOTION[phase];

  return (
    <View style={{ height, width: "100%", overflow: "hidden", position: "relative" }}>
      {/* Sky */}
      <LinearGradient
        colors={sky}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: "60%" }}
      />

      {/* Sun / moon — softly breathing, glow varies by phase */}
      <PulsingSun color={sun.color} glow={sun.glow} top={phase === "period" ? 18 : 14} />

      <FloatingCloud top={20} left={20} delay={0} />
      <FloatingCloud top={46} left={160} delay={2000} scale={0.8} />

      {/* Phase-specific ambient particles (rain / petals / sparkles / leaves) */}
      <FallingParticles phase={phase} height={height} />

      {/* Hills */}
      <LinearGradient
        colors={hills}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "50%",
          borderTopLeftRadius: 999,
          borderTopRightRadius: 999,
        }}
      />

      {/* Trees */}
      <View
        style={{
          position: "absolute",
          bottom: 18,
          left: 0,
          right: 0,
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "flex-end",
          gap: 10,
        }}
      >
        {centerpiece ?? (
          <>
            <SwayingTree delay={0} swayDeg={motion.swayDeg} swayMs={motion.swayMs}>
              <PalmSVG size={44} />
            </SwayingTree>
            <SwayingTree delay={300} swayDeg={motion.swayDeg} swayMs={motion.swayMs}>
              <MushroomSVG size={44} />
            </SwayingTree>
            <SwayingTree delay={150} swayDeg={motion.swayDeg + 1} swayMs={motion.swayMs}>
              {cycleTreeForPhase(phase)}
            </SwayingTree>
            <SwayingTree delay={450} swayDeg={motion.swayDeg} swayMs={motion.swayMs}>
              <PineSVG size={44} />
            </SwayingTree>
          </>
        )}
      </View>
    </View>
  );
}
