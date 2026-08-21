import React, { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path } from "react-native-svg";

// The Forest screen's signature visual: one personal tree whose size and
// vitality are driven entirely by the user's real care data (ForestStatus.
// currentHealth + todayCareLogged) — not by decoration. Water it (log care)
// and it visibly grows a stage with a satisfied "pop"; skip a day and it
// visibly droops and dulls, same growth axis run in reverse, the way a real
// plant would.

export type GrowthStage = "seed" | "sprout" | "sapling" | "tree" | "bloom";

export function getGrowthStage(health: number): GrowthStage {
  if (health < 15) return "seed";
  if (health < 35) return "sprout";
  if (health < 60) return "sapling";
  if (health < 85) return "tree";
  return "bloom";
}

const STAGE_ORDER: GrowthStage[] = ["seed", "sprout", "sapling", "tree", "bloom"];

export const GROWTH_STAGE_LABEL: Record<GrowthStage, string> = {
  bloom: "Full Bloom",
  sapling: "Growing Sapling",
  seed: "Resting Seed",
  sprout: "New Sprout",
  tree: "Flourishing Tree",
};

export const GROWTH_STAGE_MOTIVATION: Record<GrowthStage, string> = {
  bloom: "Thriving — your care is really showing.",
  sapling: "Taking root. A few more waterings and it'll fill out.",
  seed: "Still resting beneath the soil — give it some water to begin.",
  sprout: "Just broke the surface. Keep the care coming.",
  tree: "Growing strong. Not far from full bloom now.",
};

const VITAL = {
  bloom: "#F7A8C4",
  bloomCenter: "#FFE082",
  leaf: "#4CAF50",
  leafDark: "#1E7A5C",
  leafLight: "#81C784",
  soil: "#8D6E63",
  trunk: "#6D4C41",
};

const THIRSTY = {
  bloom: "#C9A6A0",
  bloomCenter: "#D8C48A",
  leaf: "#9E9868",
  leafDark: "#726E49",
  leafLight: "#BEB98D",
  soil: "#A79C8D",
  trunk: "#8D7B6B",
};

function SoilBase({ color }: { color: string }) {
  return <Ellipse cx={32} cy={57} rx={19} ry={4.5} fill={color} opacity={0.5} />;
}

function SeedArt({ palette, droop }: { palette: typeof VITAL; droop: number }) {
  return (
    <>
      <SoilBase color={palette.soil} />
      <Ellipse cx={32} cy={53} rx={16} ry={3} fill={palette.soil} opacity={0.35} />
      <G transform={`translate(0 ${droop * 0.6})`}>
        <Ellipse cx={32} cy={49.5} rx={6.5} ry={8} fill={palette.trunk} />
        <Ellipse cx={29.5} cy={46.5} rx={2} ry={2.8} fill="rgba(255,255,255,0.28)" />
      </G>
    </>
  );
}

function SproutArt({ palette, droop }: { palette: typeof VITAL; droop: number }) {
  return (
    <>
      <SoilBase color={palette.soil} />
      <Ellipse cx={32} cy={54} rx={13} ry={2.6} fill={palette.soil} opacity={0.35} />
      <Path d="M32,55 L32,42" stroke={palette.trunk} strokeWidth={2.5} strokeLinecap="round" />
      <G transform={`rotate(${droop} 32 42)`}>
        <Path
          d="M32,44 C25,44 20,39 19,34 C24,32 31,35 32,44 Z"
          fill={palette.leaf}
        />
        <Path
          d="M32,44 C39,44 44,39 45,34 C40,32 33,35 32,44 Z"
          fill={palette.leafLight}
        />
      </G>
    </>
  );
}

function SaplingArt({ palette, droop }: { palette: typeof VITAL; droop: number }) {
  return (
    <>
      <SoilBase color={palette.soil} />
      <Path d="M32,57 L32,36" stroke={palette.trunk} strokeWidth={3} strokeLinecap="round" />
      <Path d="M32,44 L27,39" stroke={palette.trunk} strokeWidth={2} strokeLinecap="round" />
      <Path d="M32,41 L37,37" stroke={palette.trunk} strokeWidth={2} strokeLinecap="round" />
      <G transform={`rotate(${droop} 32 30)`}>
        <Circle cx={32} cy={28} r={11} fill={palette.leaf} />
        <Circle cx={28} cy={24} r={7} fill={palette.leafLight} opacity={0.85} />
      </G>
    </>
  );
}

function TreeArt({ palette, droop }: { palette: typeof VITAL; droop: number }) {
  return (
    <>
      <SoilBase color={palette.soil} />
      <Path d="M32,58 L32,38" stroke={palette.trunk} strokeWidth={4} strokeLinecap="round" />
      <Path d="M32,46 L25,39" stroke={palette.trunk} strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M32,42 L39,37" stroke={palette.trunk} strokeWidth={2.5} strokeLinecap="round" />
      <G transform={`rotate(${droop} 32 26)`}>
        <Circle cx={32} cy={26} r={15} fill={palette.leaf} />
        <Circle cx={22} cy={31} r={10.5} fill={palette.leaf} />
        <Circle cx={42} cy={31} r={10.5} fill={palette.leaf} />
        <Circle cx={30} cy={21} r={9.5} fill={palette.leafLight} opacity={0.85} />
        <Circle cx={20} cy={29} r={7} fill={palette.leafLight} opacity={0.8} />
        <Circle cx={40} cy={27} r={7} fill={palette.leafLight} opacity={0.8} />
      </G>
    </>
  );
}

function BloomArt({ palette, droop }: { palette: typeof VITAL; droop: number }) {
  return (
    <>
      <SoilBase color={palette.soil} />
      <Path d="M32,58 L32,38" stroke={palette.trunk} strokeWidth={4.5} strokeLinecap="round" />
      <Path d="M32,46 L24,38" stroke={palette.trunk} strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M32,42 L40,36" stroke={palette.trunk} strokeWidth={2.5} strokeLinecap="round" />
      <G transform={`rotate(${droop} 32 24)`}>
        <Circle cx={32} cy={24} r={16} fill={palette.leaf} />
        <Circle cx={20} cy={30} r={11.5} fill={palette.leaf} />
        <Circle cx={44} cy={30} r={11.5} fill={palette.leaf} />
        <Circle cx={30} cy={18} r={10} fill={palette.leafLight} opacity={0.85} />
        <Circle cx={18} cy={27} r={7.5} fill={palette.leafLight} opacity={0.8} />
        <Circle cx={42} cy={26} r={7.5} fill={palette.leafLight} opacity={0.8} />
        {/* Blossoms — the one detail exclusive to full bloom */}
        {[
          { cx: 22, cy: 20, r: 3 },
          { cx: 41, cy: 18, r: 2.6 },
          { cx: 32, cy: 10, r: 2.8 },
          { cx: 16, cy: 32, r: 2.4 },
          { cx: 47, cy: 33, r: 2.4 },
        ].map((b, i) => (
          <Circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill={palette.bloom} />
        ))}
        <Circle cx={32} cy={10} r={1.1} fill={palette.bloomCenter} />
      </G>
    </>
  );
}

const STAGE_ART: Record<
  GrowthStage,
  (props: { palette: typeof VITAL; droop: number }) => React.ReactElement
> = {
  bloom: BloomArt,
  sapling: SaplingArt,
  seed: SeedArt,
  sprout: SproutArt,
  tree: TreeArt,
};

// A few droplets that rise and fade above the tree right when care is
// logged — the immediate "that worked" feedback, separate from the slower
// stage-growth pop.
function WaterBurst({ active }: { active: boolean }) {
  const drops = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!active) return;
    const anims = drops.map((v, i) =>
      Animated.sequence([
        Animated.delay(i * 90),
        Animated.timing(v, { duration: 700, easing: Easing.out(Easing.quad), toValue: 1, useNativeDriver: true }),
      ]),
    );
    drops.forEach((v) => v.setValue(0));
    Animated.parallel(anims).start();
  }, [active, drops]);

  const offsets = [-22, -8, 8, 22];

  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      {drops.map((v, i) => {
        const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -30] });
        const opacity = v.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              top: "38%",
              left: `${50 + offsets[i] / 2}%`,
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: "#5AC8FA",
              opacity,
              transform: [{ translateY }],
            }}
          />
        );
      })}
    </View>
  );
}

export function GrowthTree({
  health,
  isThirsty = false,
  isWatering = false,
  size = 120,
}: {
  /** 0–100 care-driven health score — the single source of truth for both
   * growth stage and vitality tint. */
  health: number;
  /** No care logged yet today — dulls the tree and droops it slightly as an
   * immediate "it's thirsty right now" cue, independent of the longer-arc
   * stage the health score has already earned. */
  isThirsty?: boolean;
  /** Pulse true briefly right after logCare succeeds to play the water-burst
   * + growth-pop reward animation. */
  isWatering?: boolean;
  size?: number;
}) {
  const stage = getGrowthStage(health);
  const palette = isThirsty ? THIRSTY : VITAL;
  const Art = STAGE_ART[stage];

  const scale = useRef(new Animated.Value(1)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const prevStageIndex = useRef(STAGE_ORDER.indexOf(stage));

  // Gentle idle sway — always running, same character as ForestScene's
  // ambient trees so the hero tree still feels alive when nothing else is
  // happening.
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { duration: 2400, easing: Easing.inOut(Easing.sin), toValue: 1, useNativeDriver: true }),
        Animated.timing(sway, { duration: 2400, easing: Easing.inOut(Easing.sin), toValue: 0, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [sway]);

  // Stage-change reaction: a bouncy pop when it grows, a softer dip when it
  // regresses — so growing and drying read as opposite emotional beats, not
  // the same animation in both directions.
  useEffect(() => {
    const index = STAGE_ORDER.indexOf(stage);
    const prev = prevStageIndex.current;
    prevStageIndex.current = index;
    if (index === prev) return;
    const grew = index > prev;
    scale.setValue(grew ? 0.85 : 1);
    Animated.sequence([
      Animated.timing(scale, {
        duration: grew ? 260 : 220,
        easing: grew ? Easing.out(Easing.back(1.6)) : Easing.out(Easing.quad),
        toValue: grew ? 1.1 : 0.92,
        useNativeDriver: true,
      }),
      Animated.spring(scale, { friction: 5, toValue: 1, useNativeDriver: true }),
    ]).start();
  }, [stage, scale]);

  // One-shot celebratory bounce whenever care is freshly logged, on top of
  // whatever the stage transition is already doing.
  useEffect(() => {
    if (!isWatering) return;
    Animated.sequence([
      Animated.timing(scale, { duration: 160, easing: Easing.out(Easing.quad), toValue: 1.08, useNativeDriver: true }),
      Animated.spring(scale, { friction: 4, toValue: 1, useNativeDriver: true }),
    ]).start();
  }, [isWatering, scale]);

  const rotate = sway.interpolate({ inputRange: [0, 1], outputRange: ["-2deg", "2deg"] });
  // Droop is applied to the canopy/seed group in raw SVG rotation degrees —
  // small and only when thirsty, so it reads as "a little tired" not broken.
  const droop = isThirsty ? 5 : 0;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ transform: [{ rotate }, { scale }] }}>
        <Svg viewBox="0 0 64 64" width={size} height={size}>
          <Art palette={palette} droop={droop} />
        </Svg>
      </Animated.View>
      <WaterBurst active={isWatering} />
    </View>
  );
}
