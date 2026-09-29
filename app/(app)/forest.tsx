import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown, FadeOut, useReducedMotion } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
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
const SCENE_HEIGHT = 340;

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
  const chip = { backgroundColor: "rgba(255,255,255,0.88)" };

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
                />
                <View
                  pointerEvents="box-none"
                  style={{ position: "absolute", left: 14, right: 14, top: 14, flexDirection: "row", justifyContent: "space-between", gap: 8 }}
                >
                  <View style={[{ flexShrink: 1, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 }, chip]}>
                    <Text numberOfLines={1} style={{ color: "#1F3B24", fontSize: 15, fontWeight: "800", fontFamily: fonts.heading }}>
                      {growth ? STAGE_LABEL[growth.stage] : "Seed"}
                    </Text>
                    <Text numberOfLines={1} style={{ color: "#4B5E4E", fontSize: 12.5, fontWeight: "600", marginTop: 1, fontFamily: fonts.body }}>
                      {VITALITY_LINE[growth?.vitality ?? "new"]}
                    </Text>
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

            {/* Stage track: seed → bloom */}
            <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {STAGES.map((stage, i) => {
                  const index = growth?.stageIndex ?? 0;
                  const fill = i <= index ? 100 : i === index + 1 ? Math.round((growth?.stageProgress ?? 0) * 100) : 0;
                  return (
                    <React.Fragment key={stage}>
                      {i > 0 ? (
                        <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.border, overflow: "hidden" }}>
                          <View style={{ height: 3, width: `${fill}%`, backgroundColor: colors.success }} />
                        </View>
                      ) : null}
                      <View
                        style={{
                          width: i === index ? 14 : 10,
                          height: i === index ? 14 : 10,
                          borderRadius: 7,
                          backgroundColor: i <= index ? colors.success : colors.border,
                          borderWidth: i === index ? 3 : 0,
                          borderColor: colors.successLight,
                        }}
                      />
                    </React.Fragment>
                  );
                })}
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 8 }}>
                <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.foreground, fontSize: 14.5, fontWeight: "700", fontFamily: fonts.body }}>
                  {growth && growth.totalPoints > 0 ? `${toNext} more task${toNext === 1 ? "" : "s"} to ${nextLabel}` : "Every task you finish helps it grow"}
                </Text>
                <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }}>
                  {`Stage ${(growth?.stageIndex ?? 0) + 1}/${growth?.stageCount ?? 7}`}
                </Text>
              </View>
            </View>
          </View>

          {/* Today's care */}
          <SectionHeader title="Today's care" style={{ marginTop: 28 }} />
          <View style={{ borderRadius: 22, backgroundColor: colors.surface, overflow: "hidden", ...getShadow(colors, isDark) }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 10 }}>
              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" }}>
                <View style={{ height: 6, width: `${(doneToday / 3) * 100}%`, borderRadius: 3, backgroundColor: colors.success }} />
              </View>
              <Text style={{ color: colors.mutedText, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>{doneToday}/3 done</Text>
            </View>
            {TASKS.map((task, i) => {
              const done = taskDone(task.key);
              const isWater = task.key === "water";
              return (
                <View key={task.key}>
                  {i > 0 ? <View style={{ height: 1, marginLeft: 68, backgroundColor: colors.border }} /> : null}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    disabled={done || (isWater && watering) || !hasLoaded}
                    onPress={() => (isWater ? handleWater() : task.route ? router.push(task.route as never) : undefined)}
                    accessibilityRole="button"
                    accessibilityState={{ checked: done }}
                    accessibilityLabel={`${task.title}${done ? ", done" : ""}`}
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: done ? colors.successLight : colors.input,
                      }}
                    >
                      <Ionicons name={done ? "checkmark" : task.icon} size={19} color={done ? colors.success : colors.foreground} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: done ? colors.mutedText : colors.foreground, fontSize: 15, fontWeight: "700", fontFamily: fonts.body }}>
                        {task.title}
                      </Text>
                      <Text numberOfLines={1} style={{ color: done ? colors.success : colors.mutedText, fontSize: 13, marginTop: 2, fontFamily: fonts.body }}>
                        {done ? "Done · +1 growth" : task.hint}
                      </Text>
                    </View>
                    {done ? null : isWater ? (
                      <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.primary, opacity: watering ? 0.6 : 1 }}>
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
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 14, borderRadius: 22, backgroundColor: colors.surface }}>
                {growth.week.map((day) => {
                  const isToday = day.dateKey === growth.today.dateKey;
                  return (
                    <View key={day.dateKey} accessible accessibilityLabel={`${formatShortDate(`${day.dateKey}T12:00:00`)}: ${day.done} of 3 tasks`} style={{ alignItems: "center", gap: 7 }}>
                      <Text style={{ color: isToday ? colors.foreground : colors.mutedText, fontSize: 12.5, fontWeight: "700", fontFamily: fonts.body }}>
                        {WEEKDAY[new Date(`${day.dateKey}T12:00:00`).getDay()]}
                      </Text>
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: day.done ? colors.successLight : colors.input,
                          borderWidth: isToday ? 2 : 0,
                          borderColor: colors.success,
                        }}
                      >
                        <Ionicons
                          name={day.done ? "leaf" : "leaf-outline"}
                          size={15}
                          color={day.done ? colors.success : colors.mutedText}
                          style={{ opacity: day.done ? 0.45 + (day.done / 3) * 0.55 : 0.6 }}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* The forest you've grown */}
          <SectionHeader title="Your forest" barColor={colors.accent} style={{ marginTop: 28 }} />
          {grown.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {[...grown].reverse().map((tree) => (
                <View
                  key={tree.number}
                  style={{ width: "31%", flexGrow: 1, maxWidth: "32%", alignItems: "center", paddingTop: 8, paddingBottom: 12, borderRadius: 18, backgroundColor: colors.surface }}
                >
                  <LivingTree growth={1} seed={tree.number} size={78} lowDetail />
                  <Text style={{ color: colors.foreground, fontSize: 13.5, fontWeight: "700", marginTop: 2, fontFamily: fonts.body }}>Tree {tree.number}</Text>
                  <Text style={{ color: colors.mutedText, fontSize: 12.5, fontFamily: fonts.body }}>{formatShortDate(`${tree.grownOn}T12:00:00`)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ borderRadius: 22, backgroundColor: colors.surface }}>
              <EmptyState compact icon="tree-outline" title="No full-grown trees yet" message="Each grown tree is planted here." />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
