import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown, FadeOut, useReducedMotion } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { ForestHabitat } from "../../components/forest/ForestHabitat";
import { LivingTree } from "../../components/forest/LivingTree";
import { ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import { SkeletonBlock } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { useDataRefresh } from "../../hooks/useDataRefresh";
import { alert } from "../../lib/alert";
import {
  forestApi,
  type ForestGrowth,
  type ForestGrowthStage,
  type ForestStatus,
  type ForestTaskKey,
  type ForestVitality,
} from "../../lib/api";
import { formatShortDate, getDateKey } from "../../lib/format";
import { careHeadline, careStreak, STAGE_GROWTH, weekTotals } from "../../lib/forestView";
import Svg, { Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";

// Your Forest: one tree grows from a seed to full bloom as you do three
// small tasks a day (log your day, finish a habit, water the tree). Each
// fully grown tree joins the forest on the hill and a new seed is planted.
// Growth is computed server-side from real logs (backend utils/forestGrowth.js).

const STAGES: ForestGrowthStage[] = ["seed", "sprout", "seedling", "sapling", "young", "mature", "bloom"];

const STAGE_LABEL: Record<ForestGrowthStage, string> = {
  seed: "Seed",
  sprout: "Sprout",
  seedling: "Seedling",
  sapling: "Sapling",
  young: "Young tree",
  mature: "Mature tree",
  bloom: "In bloom",
};

const VITALITY_LINE: Record<ForestVitality, string> = {
  new: "Do a task below to plant it",
  thriving: "Thriving",
  thirsty: "Thirsty, do a task today",
  wilting: "Wilting, it misses you",
  dry: "Dry, a little care brings it back",
};

const TASKS: {
  key: ForestTaskKey;
  title: string;
  hint: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  route?: string;
}[] = [
  { key: "log", title: "Log your day", hint: "Flow, mood or symptoms", icon: "calendar-outline", route: "/(app)/tracker?log=today" },
  { key: "habit", title: "Finish a habit", hint: "Any habit counts", icon: "checkmark-done-outline", route: "/(app)/habits" },
  { key: "water", title: "Water your tree", hint: "Once a day", icon: "water-outline" },
];

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];
const SCENE_HEIGHT = 360;

/** For a backend without `growth`: a still-usable picture from the old fields. */
function legacyGrowth(status: ForestStatus, today: string): ForestGrowth {
  const growth = Math.min(1, Math.max(0, (status.currentHealth - 30) / 70));
  const stageIndex = Math.min(6, Math.floor(growth * 7));
  return {
    stage: STAGES[stageIndex],
    stageIndex,
    stageCount: 7,
    stageProgress: 0,
    nextStage: STAGES[stageIndex + 1] ?? null,
    pointsToNextStage: 1,
    points: 0,
    pointsPerTree: 60,
    growth,
    totalPoints: 0,
    treesGrown: 0,
    grownTrees: [],
    vitality: status.todayCareLogged ? "thriving" : "thirsty",
    vitalityLevel: status.currentHealth,
    daysSinceActive: status.todayCareLogged ? 0 : 1,
    today: {
      dateKey: today,
      tasks: TASKS.map((t) => ({ key: t.key, done: t.key === "water" && status.todayCareLogged })),
      done: status.todayCareLogged ? 1 : 0,
      total: 3,
    },
    week: [],
  };
}

/** Eases a number towards `target` on the JS thread (the tree is re-drawn per frame). */
function useTween(target: number, duration: number) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);
  const frame = useRef<number | null>(null);
  const run = useCallback(
    (from: number, to: number, ms: number) => {
      if (frame.current) cancelAnimationFrame(frame.current);
      if (reduced || ms <= 0 || Math.abs(to - from) < 0.002) {
        valueRef.current = to;
        setValue(to);
        return;
      }
      const start = Date.now();
      let lastPaint = 0;
      const step = () => {
        const t = Math.min(1, (Date.now() - start) / ms);
        const next = from + (to - from) * (1 - Math.pow(1 - t, 3));
        valueRef.current = next;
        // ~30 fps is plenty for growth and keeps the SVG work light.
        if (t === 1 || Date.now() - lastPaint > 32) {
          lastPaint = Date.now();
          setValue(next);
        }
        if (t < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    },
    [reduced],
  );
  useEffect(() => {
    run(valueRef.current, target, duration);
  }, [target, duration, run]);
  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );
  return { value, replay: (ms: number) => run(0, target, ms), jump: (v: number) => run(v, v, 0) };
}

/** Today's 3 tasks as a ring of three segments, with "2/3" in the middle. */
function CareRing({ done, size, color, track, textColor, font }: { done: number; size: number; color: string; track: string; textColor: string; font: string }) {
  const r = size / 2 - 5;
  const c = size / 2;
  const arc = (i: number) => {
    // 120° per task, with a small gap between segments.
    const a1 = ((-90 + i * 120 + 6) * Math.PI) / 180;
    const a2 = ((-90 + (i + 1) * 120 - 6) * Math.PI) / 180;
    return `M${c + r * Math.cos(a1)},${c + r * Math.sin(a1)} A${r},${r} 0 0 1 ${c + r * Math.cos(a2)},${c + r * Math.sin(a2)}`;
  };
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        {[0, 1, 2].map((i) => (
          <Path key={i} d={arc(i)} stroke={i < done ? color : track} strokeWidth={6} strokeLinecap="round" fill="none" />
        ))}
      </Svg>
      <Text style={{ color: textColor, fontSize: 15, fontWeight: "800", fontFamily: font }}>{`${done}/3`}</Text>
    </View>
  );
}

export default function Forest() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const [status, setStatus] = useState<ForestStatus | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [watering, setWatering] = useState(false);
  const [waterKey, setWaterKey] = useState(0);
  const [celebrateKey, setCelebrateKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  // "Drag to look around · tap your tree": until the first drag/tap, or a few seconds.
  const [showHint, setShowHint] = useState(true);
  useEffect(() => {
    if (!hasLoaded) return;
    const t = setTimeout(() => setShowHint(false), 6500);
    return () => clearTimeout(t);
  }, [hasLoaded]);
  const [target, setTarget] = useState(0);
  const [tweenMs, setTweenMs] = useState(2200);
  const last = useRef<{ stageIndex: number; treesGrown: number } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const tween = useTween(target, tweenMs);
  const tweenRef = useRef(tween);
  tweenRef.current = tween;

  const growth = status ? (status.growth ?? legacyGrowth(status, getDateKey(new Date()))) : null;

  const applyStatus = useCallback((next: ForestStatus) => {
    const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
    const celebrate = (message: string) => {
      setCelebrateKey((k) => k + 1);
      setToast(message);
      later(() => setToast(null), 3200);
    };
    const g = next.growth ?? legacyGrowth(next, getDateKey(new Date()));
    const prev = last.current;
    last.current = { stageIndex: g.stageIndex, treesGrown: g.treesGrown };
    setStatus(next);

    if (prev && g.treesGrown > prev.treesGrown) {
      // Finish the old tree on screen, celebrate, then plant the new seed.
      setTweenMs(1200);
      setTarget(1);
      later(() => celebrate("Fully grown! It joined your forest"), 1200);
      later(() => {
        tweenRef.current.jump(0);
        setTweenMs(1600);
        setTarget(g.growth);
      }, 3600);
      return;
    }
    // First open grows the tree in from the seed; later updates ease over.
    setTweenMs(prev ? 1400 : 2200);
    setTarget(g.growth);
    if (prev && g.stageIndex > prev.stageIndex) {
      later(() => celebrate(`Your tree is now a ${STAGE_LABEL[g.stage].toLowerCase()}`), 1000);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      applyStatus(await forestApi.getStatus(getDateKey(new Date())));
    } catch {
      // Keep whatever is on screen.
    } finally {
      setHasLoaded(true);
    }
  }, [applyStatus]);

  useEffect(() => {
    load();
  }, [load]);

  // Logging your day or ticking a habit elsewhere grows the tree when you come back.
  useDataRefresh(["forest", "cycle", "habits"], async () => {
    try {
      applyStatus(await forestApi.getStatus(getDateKey(new Date())));
    } catch {
      // Quiet refresh.
    }
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  async function handleWater() {
    if (watering) return;
    setWatering(true);
    setWaterKey((k) => k + 1);
    try {
      const today = getDateKey(new Date());
      const [result] = await Promise.all([
        forestApi.logCare({ careType: "water", dateKey: today, today, note: "Watered from the app" }),
        new Promise((resolve) => setTimeout(resolve, 900)), // let the drops land first
      ]);
      applyStatus(result.status);
    } catch (error) {
      alert("Couldn't water your tree", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setWatering(false);
    }
  }

  const doneToday = growth?.today.done ?? 0;
  const taskDone = (key: ForestTaskKey) => growth?.today.tasks.find((t) => t.key === key)?.done ?? false;
  const toNext = growth ? (growth.nextStage ? growth.pointsToNextStage : growth.pointsPerTree - growth.points) : 0;
  const nextLabel = growth?.nextStage ? STAGE_LABEL[growth.nextStage].toLowerCase() : "your forest";
  const grown = growth?.grownTrees ?? [];
  const chip = { backgroundColor: "rgba(255,255,255,0.9)" };
  const vitality = growth?.vitality ?? "new";
  const vitalityColor =
    vitality === "thriving" ? colors.success : vitality === "new" ? colors.primary : vitality === "dry" ? colors.danger : colors.warning;
  const todayKey = growth?.today.dateKey ?? getDateKey(new Date());
  const streak = growth ? careStreak(growth.week, todayKey) : 0;
  const totals = growth ? weekTotals(growth.week) : { done: 0, possible: 0 };
  const stageIndex = growth?.stageIndex ?? 0;
  const stageCount = growth?.stageCount ?? 7;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Your Forest" />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 6, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* The living scene */}
          <View style={{ borderRadius: 28, overflow: "hidden", backgroundColor: colors.surface, ...getShadow(colors, isDark) }}>
            {!hasLoaded ? (
              <SkeletonBlock width="100%" height={SCENE_HEIGHT} radius={0} />
            ) : (
              <View>
                <ForestHabitat
                  height={SCENE_HEIGHT}
                  growth={tween.value}
                  vitality={growth?.vitality ?? "new"}
                  treeSeed={(growth?.treesGrown ?? 0) + 1}
                  grownSeeds={grown.map((t) => t.number)}
                  waterKey={waterKey}
                  celebrateKey={celebrateKey}
                  onInteract={() => setShowHint(false)}
                />
                <View
                  pointerEvents="box-none"
                  style={{ position: "absolute", left: 14, right: 14, top: 14, flexDirection: "row", justifyContent: "space-between", gap: 8 }}
                >
                  <View style={[{ flexShrink: 1, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 }, chip]}>
                    <Text numberOfLines={1} style={{ color: "#1F3B24", fontSize: 15, fontWeight: "800", fontFamily: fonts.heading }}>
                      {growth ? STAGE_LABEL[growth.stage] : "Seed"}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: vitalityColor }} />
                      <Text numberOfLines={1} style={{ flexShrink: 1, color: "#4B5E4E", fontSize: 12.5, fontWeight: "600", fontFamily: fonts.body }}>
                        {VITALITY_LINE[growth?.vitality ?? "new"]}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                    <TouchableOpacity
                      onPress={() => tween.replay(4200)}
                      accessibilityRole="button"
                      accessibilityLabel="Watch your tree grow"
                      activeOpacity={0.8}
                      style={[{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }, chip]}
                    >
                      <Ionicons name="play" size={15} color="#1F3B24" />
                    </TouchableOpacity>
                    <View
                      accessible
                      accessibilityLabel={`${growth?.treesGrown ?? 0} trees grown`}
                      style={[{ flexDirection: "row", alignItems: "center", gap: 5, height: 36, paddingHorizontal: 12, borderRadius: 18 }, chip]}
                    >
                      <Ionicons name="leaf" size={14} color="#2E7D32" />
                      <Text style={{ color: "#1F3B24", fontSize: 14, fontWeight: "800", fontFamily: fonts.body }}>{growth?.treesGrown ?? 0}</Text>
                    </View>
                  </View>
                </View>
                {showHint && !toast ? (
                  <Animated.View
                    entering={FadeInDown.delay(900).duration(400)}
                    exiting={FadeOut.duration(300)}
                    pointerEvents="none"
                    style={{ position: "absolute", left: 0, right: 0, bottom: 16, alignItems: "center" }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: "rgba(20,32,24,0.62)" }}>
                      <Ionicons name="hand-left-outline" size={14} color="#FFFFFF" />
                      <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>Drag to look around · tap your tree</Text>
                    </View>
                  </Animated.View>
                ) : null}
                {toast ? (
                  <Animated.View
                    entering={FadeInDown.springify().damping(14)}
                    exiting={FadeOut}
                    pointerEvents="none"
                    style={{ position: "absolute", left: 16, right: 16, bottom: 16, alignItems: "center" }}
                  >
                    <View
                      accessibilityLiveRegion="polite"
                      style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: "rgba(31,59,36,0.92)" }}
                    >
                      <Ionicons name="sparkles" size={15} color="#FFE082" />
                      <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700", fontFamily: fonts.body }}>{toast}</Text>
                    </View>
                  </Animated.View>
                ) : null}
              </View>
            )}

            {/* Stage: where the tree is, how far to the next, and the whole journey */}
            <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ color: colors.mutedText, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, fontFamily: fonts.body }}>
                    {`STAGE ${stageIndex + 1} OF ${stageCount}`}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 19, fontWeight: "800", marginTop: 2, fontFamily: fonts.heading }}>
                    {growth ? STAGE_LABEL[growth.stage] : "Seed"}
                  </Text>
                </View>
                <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.mutedText, fontSize: 13, fontWeight: "600", textAlign: "right", fontFamily: fonts.body }}>
                  {growth && growth.totalPoints > 0 ? `${toNext} task${toNext === 1 ? "" : "s"} to ${nextLabel}` : "Every task helps it grow"}
                </Text>
              </View>
              <View style={{ height: 8, borderRadius: 4, marginTop: 12, backgroundColor: colors.surfaceSoft, overflow: "hidden" }}>
                <LinearGradient
                  colors={[colors.success, colors.secondary]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={{ height: 8, borderRadius: 4, width: `${Math.max(4, Math.round((growth?.stageProgress ?? 0) * 100))}%` }}
                />
              </View>

              {/* Growth journey: the actual tree at every stage. */}
              <View
                accessible
                accessibilityLabel={`Growth journey: stage ${stageIndex + 1} of ${stageCount}`}
                style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16 }}
              >
                {STAGES.map((stage, i) => {
                  const reached = i <= stageIndex;
                  const current = i === stageIndex;
                  return (
                    <View key={stage} style={{ alignItems: "center", flex: 1 }}>
                      <View style={{ opacity: reached ? 1 : 0.28 }}>
                        <LivingTree growth={STAGE_GROWTH[i]} seed={(growth?.treesGrown ?? 0) + 1} size={current ? 38 : 30} lowDetail vitality="thriving" />
                      </View>
                      <View
                        style={{
                          width: current ? 18 : 6,
                          height: 6,
                          borderRadius: 3,
                          marginTop: 4,
                          backgroundColor: reached ? colors.success : colors.border,
                        }}
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Today's care */}
          <SectionHeader title="Today's care" style={{ marginTop: 28 }} />
          <View style={{ borderRadius: 24, backgroundColor: colors.surface, overflow: "hidden", ...getShadow(colors, isDark) }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
              <CareRing done={doneToday} size={58} color={colors.success} track={colors.surfaceSoft} textColor={colors.foreground} font={fonts.mono} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "800", fontFamily: fonts.heading }}>
                  {doneToday >= 3 ? "Done for today" : `${doneToday} of 3 done`}
                </Text>
                <Text style={{ color: colors.mutedText, fontSize: 13, marginTop: 2, fontFamily: fonts.body }}>{careHeadline(doneToday)}</Text>
              </View>
            </View>
            {TASKS.map((task) => {
              const done = taskDone(task.key);
              const isWater = task.key === "water";
              return (
                <View key={task.key}>
                  <View style={{ height: 1, marginLeft: 70, backgroundColor: colors.border }} />
                  <TouchableOpacity
                    activeOpacity={0.7}
                    disabled={done || (isWater && watering) || !hasLoaded}
                    onPress={() => (isWater ? handleWater() : task.route ? router.push(task.route as never) : undefined)}
                    accessibilityRole="button"
                    accessibilityState={{ checked: done }}
                    accessibilityLabel={`${task.title}${done ? ", done" : ""}`}
                    style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: done ? colors.success : isWater ? colors.skyLight : colors.input,
                      }}
                    >
                      <Ionicons name={done ? "checkmark" : task.icon} size={19} color={done ? "#FFFFFF" : isWater ? colors.sky : colors.foreground} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: done ? colors.mutedText : colors.foreground,
                          fontSize: 15,
                          fontWeight: "700",
                          fontFamily: fonts.body,
                          textDecorationLine: done ? "line-through" : "none",
                        }}
                      >
                        {task.title}
                      </Text>
                      <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 13, marginTop: 2, fontFamily: fonts.body }}>
                        {task.hint}
                      </Text>
                    </View>
                    {done ? (
                      <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: colors.successLight }}>
                        <Text style={{ color: colors.success, fontSize: 12.5, fontWeight: "800", fontFamily: fonts.body }}>+1 growth</Text>
                      </View>
                    ) : isWater ? (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          paddingHorizontal: 14,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: colors.primary,
                          opacity: watering ? 0.6 : 1,
                        }}
                      >
                        <Ionicons name="water" size={14} color={colors.buttonText} />
                        <Text style={{ color: colors.buttonText, fontSize: 13.5, fontWeight: "800", fontFamily: fonts.body }}>
                          {watering ? "Watering" : "Water"}
                        </Text>
                      </View>
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={colors.mutedText} />
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {/* This week */}
          {growth?.week.length ? (
            <>
              <SectionHeader title="This week" barColor={colors.secondary} style={{ marginTop: 28 }} />
              <View style={{ borderRadius: 24, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 16, ...getShadow(colors, isDark) }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: streak ? colors.warningLight : colors.surfaceSoft }}>
                      <Ionicons name="flame" size={17} color={streak ? colors.warning : colors.mutedText} />
                    </View>
                    <View>
                      <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "800", fontFamily: fonts.heading }}>
                        {streak ? `${streak}-day streak` : "Start a streak"}
                      </Text>
                      <Text style={{ color: colors.mutedText, fontSize: 12.5, fontFamily: fonts.body }}>
                        {streak ? "Keep it going today" : "Do one task a day"}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: colors.mutedText, fontSize: 13, fontWeight: "700", fontFamily: fonts.mono }}>{`${totals.done}/${totals.possible}`}</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  {growth.week.map((day) => {
                    const isToday = day.dateKey === growth.today.dateKey;
                    const fill = Math.min(3, day.done) / 3;
                    return (
                      <View
                        key={day.dateKey}
                        accessible
                        accessibilityLabel={`${formatShortDate(`${day.dateKey}T12:00:00`)}: ${day.done} of 3 tasks`}
                        style={{ alignItems: "center", gap: 7, flex: 1 }}
                      >
                        <View style={{ width: 22, height: 52, borderRadius: 11, justifyContent: "flex-end", overflow: "hidden", backgroundColor: colors.surfaceSoft, borderWidth: isToday ? 2 : 0, borderColor: colors.success }}>
                          {fill > 0 ? <View style={{ height: `${fill * 100}%`, borderRadius: 9, backgroundColor: fill === 1 ? colors.success : colors.secondary }} /> : null}
                        </View>
                        <Text style={{ color: isToday ? colors.foreground : colors.mutedText, fontSize: 12.5, fontWeight: isToday ? "800" : "600", fontFamily: fonts.body }}>
                          {WEEKDAY[new Date(`${day.dateKey}T12:00:00`).getDay()]}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </>
          ) : null}

          {/* The forest you've grown */}
          <SectionHeader title="Your forest" barColor={colors.accentText} style={{ marginTop: 28 }} />
          {grown.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {[...grown].reverse().map((tree) => (
                <View
                  key={tree.number}
                  accessible
                  accessibilityLabel={`Tree ${tree.number}, grown ${formatShortDate(`${tree.grownOn}T12:00:00`)}`}
                  style={{ width: "31%", flexGrow: 1, maxWidth: "32%", borderRadius: 20, overflow: "hidden", backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
                >
                  <LinearGradient colors={isDark ? ["#1E3345", "#2A4A3A"] : ["#DDF0FA", "#E9F6E4"]} style={{ alignItems: "center", paddingTop: 10 }}>
                    <LivingTree growth={1} seed={tree.number} size={76} lowDetail showSoil={false} />
                    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 10, backgroundColor: isDark ? "#2C5236" : "#8CC57F" }} />
                  </LinearGradient>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 10, alignItems: "center" }}>
                    <Text style={{ color: colors.foreground, fontSize: 13.5, fontWeight: "800", fontFamily: fonts.body }}>{`Tree ${tree.number}`}</Text>
                    <Text style={{ color: colors.mutedText, fontSize: 12.5, marginTop: 1, fontFamily: fonts.body }}>{formatShortDate(`${tree.grownOn}T12:00:00`)}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 24, padding: 16, backgroundColor: colors.surface, ...getShadow(colors, isDark) }}>
              <View style={{ width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "flex-end", overflow: "hidden", backgroundColor: colors.successLight }}>
                <LivingTree growth={0.16} seed={1} size={58} lowDetail />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "800", fontFamily: fonts.heading }}>Your first tree is on its way</Text>
                <Text style={{ color: colors.mutedText, fontSize: 13, lineHeight: 19, marginTop: 2, fontFamily: fonts.body }}>
                  {"When it's fully grown, it's planted here and on the hill."}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
