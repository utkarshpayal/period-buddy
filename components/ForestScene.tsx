import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";

// Ported 1:1 from the marketing website's forest simulator
// (Marketing website/src/pages/Home.jsx) so the app's Wellness Forest shares
// the same look — same trees, same phase-based sky/hill palette.

export type ForestPhase = "period" | "follicular" | "ovulation" | "luteal";

const PHASE_SKY: Record<ForestPhase, [string, string]> = {
  period: ["#e2e8f0", "#cbd5e1"],
  follicular: ["#e0f2fe", "#bae6fd"],
  ovulation: ["#ffedd5", "#fed7aa"],
  luteal: ["#fef3c7", "#fde68a"],
};

const PHASE_HILLS: Record<ForestPhase, [string, string]> = {
  period: ["#cbd5e1", "#94a3b8"],
  follicular: ["#95d5b2", "#74c69d"],
  ovulation: ["#74c69d", "#52b788"],
  luteal: ["#d97706", "#b45309"],
};

const PHASE_SUN: Record<ForestPhase, { color: string; glow: string | null }> = {
  period: { color: "#cbd5e1", glow: null },
  follicular: { color: "#fbbf24", glow: "#f59e0b" },
  ovulation: { color: "#fbbf24", glow: "#f59e0b" },
  luteal: { color: "#f97316", glow: "#ea580c" },
};

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

function SwayingTree({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const sway = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(sway, {
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(sway, {
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [delay, sway]);

  const rotate = sway.interpolate({ inputRange: [0, 1], outputRange: ["-3deg", "3deg"] });

  return <Animated.View style={{ transform: [{ rotate }] }}>{children}</Animated.View>;
}

export type ForestSceneProps = {
  height?: number;
  phase: ForestPhase;
};

export function ForestScene({ height = 236, phase }: ForestSceneProps) {
  const sky = PHASE_SKY[phase];
  const hills = PHASE_HILLS[phase];
  const sun = PHASE_SUN[phase];

  return (
    <View style={{ height, width: "100%", overflow: "hidden", position: "relative" }}>
      {/* Sky */}
      <LinearGradient
        colors={sky}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: "60%" }}
      />

      {/* Sun / moon */}
      <View
        style={{
          position: "absolute",
          top: phase === "period" ? 18 : 14,
          right: 28,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: sun.color,
          ...(sun.glow
            ? {
                shadowColor: sun.glow,
                shadowOpacity: 0.9,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 0 },
              }
            : null),
        }}
      />

      <FloatingCloud top={20} left={20} delay={0} />
      <FloatingCloud top={46} left={160} delay={2000} scale={0.8} />

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
        <SwayingTree delay={0}>
          <PalmSVG size={44} />
        </SwayingTree>
        <SwayingTree delay={300}>
          <MushroomSVG size={44} />
        </SwayingTree>
        <SwayingTree delay={150}>{cycleTreeForPhase(phase)}</SwayingTree>
        <SwayingTree delay={450}>
          <PineSVG size={44} />
        </SwayingTree>
      </View>
    </View>
  );
}
