import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { requireOptionalNativeModule } from "expo";
import { useRouter } from "expo-router";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AppState, InteractionManager, Platform, RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, useReducedMotion } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { ForestHabitat } from "../../components/forest/ForestHabitat";
import { LivingTree } from "../../components/forest/LivingTree";
import { ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import { SkeletonBlock } from "../../components/Skeleton";
import { Loader } from "../../components/Loader";
import { useAuth } from "../../components/auth-context";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { useDataRefresh } from "../../hooks/useDataRefresh";
import { alert } from "../../lib/alert";
import {
  forestApi,
  getFriendlyErrorMessage,
  isNetworkError,
  type ForestGrowth,
  type ForestGrowthStage,
  type ForestStatus,
  type ForestTaskKey,
  type ForestVitality,
} from "../../lib/api";
import { formatShortDate, getDateKey } from "../../lib/format";
import {
  flushWaterings,
  patchForestMemory,
  queuedWaterings,
  queueWatering,
  readForestCache,
  writeForestCache,
} from "../../lib/forestCache";
import {
  careHeadline,
  careStreak,
  lastSyncedLabel,
  rollCachedDay,
  shouldUseLowDetail,
  STAGE_GROWTH,
  weekTotals,
  withOfflineWater,
} from "../../lib/forestView";
import Svg, { Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Button";

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
  const targetRef = useRef(target);
  targetRef.current = target;
  const replay = useCallback((ms: number) => run(0, targetRef.current, ms), [run]);
  const jump = useCallback((v: number) => run(v, v, 0), [run]);
  return { value, replay, jump };
}

/** The status request gives up after this; the screen's own watchdog a little later. */
const STATUS_TIMEOUT_MS = 12000;
const WATCHDOG_MS = STATUS_TIMEOUT_MS + 3000;
/** The scene mounts after the opening animation, or after this at the latest. */
const SCENE_FALLBACK_MS = 700;
/** While offline, try again this often (only while the screen is in front). */
const OFFLINE_RETRY_MS = 30000;
/** A foreground refresh happens when the copy on screen is older than this. */
const STALE_MS = 2 * 60 * 1000;

class ForestTimeout extends Error {
  constructor() {
    super("Your forest is taking too long to load.");
    this.name = "ForestTimeout";
  }
}

/** Rejects if `promise` hasn't settled in `ms`, so a stuck request can't keep the skeleton up forever. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ForestTimeout()), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

let lowDetailDevice: boolean | undefined;
/** Low-end phone (little memory or an old model): draw the lighter scene. */
function isLowDetailDevice(): boolean {
  if (lowDetailDevice !== undefined) return lowDetailDevice;
  lowDetailDevice = false;
  if (Platform.OS === "web") return lowDetailDevice;
  try {
    if (requireOptionalNativeModule("ExpoDevice")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Device = require("expo-device") as typeof import("expo-device");
      lowDetailDevice = shouldUseLowDetail({ memoryBytes: Device.totalMemory, yearClass: Device.deviceYearClass });
    }
  } catch {
    lowDetailDevice = false;
  }
  return lowDetailDevice;
}

type HabitatHandle = { replay: (ms: number) => void; jump: (v: number) => void };

/**
 * The scene with its growth tween. The tween's per-frame state lives here, so
 * only the scene redraws while the tree grows, not the whole page.
 */
const TweenedHabitat = forwardRef<
  HabitatHandle,
  Omit<React.ComponentProps<typeof ForestHabitat>, "growth"> & { target: number; tweenMs: number }
>(function TweenedHabitat({ target, tweenMs, ...props }, ref) {
  const tween = useTween(target, tweenMs);
  useImperativeHandle(ref, () => ({ replay: tween.replay, jump: tween.jump }), [tween.replay, tween.jump]);
  return <ForestHabitat {...props} growth={tween.value} />;
});

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

/** Grown trees drawn at first; each is a full SVG tree, so a big forest opens on "Show all". */
const GROWN_PREVIEW = 9;

/**
 * The page's shape while the forest loads: a soft sky-and-meadow scene with
 * the loader in it, then placeholders for the stage, today's care and the
 * forest. Nothing shows made-up numbers ("Seed", "0 of 3") before real data.
 */
function ForestSkeleton() {
  const { colors, isDark } = useTheme();
  const card = { borderRadius: 24, backgroundColor: colors.surface, ...getShadow(colors, isDark) };
  return (
    <View accessibilityLabel="Loading your forest" accessible>
      <View style={{ ...card, borderRadius: 28, borderCurve: "continuous", overflow: "hidden" }}>
        <LinearGradient
          colors={isDark ? ["#1E3345", "#22382E", "#2C5236"] : ["#DDF0FA", "#EAF6F0", "#CFE9C4"]}
          style={{ height: SCENE_HEIGHT, alignItems: "center", justifyContent: "center" }}
        >
          <Loader label="Growing your forest…" />
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 56, backgroundColor: isDark ? "#2C5236" : "#A8D79A", opacity: 0.6 }} />
        </LinearGradient>
        <View style={{ padding: 18, gap: 10 }}>
          <SkeletonBlock width={90} height={11} />
          <SkeletonBlock width={140} height={20} />
          <SkeletonBlock height={8} radius={4} style={{ marginTop: 4 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
            {STAGES.map((s) => (
              <SkeletonBlock key={s} width={26} height={30} radius={13} />
            ))}
          </View>
        </View>
      </View>
      <SkeletonBlock width={130} height={16} style={{ marginTop: 30, marginBottom: 12 }} />
      <View style={[card, { padding: 16, gap: 16 }]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <SkeletonBlock width={i === 0 ? 58 : 40} height={i === 0 ? 58 : 40} radius={29} />
            <View style={{ flex: 1, gap: 7 }}>
              <SkeletonBlock width="55%" height={14} />
              <SkeletonBlock width="80%" height={11} />
            </View>
          </View>
        ))}
      </View>
      <SkeletonBlock width={110} height={16} style={{ marginTop: 30, marginBottom: 12 }} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <SkeletonBlock key={i} width="31%" height={130} radius={20} style={{ flexGrow: 1 }} />
        ))}
      </View>
    </View>
  );
}

export default function Forest() {
  useSecureScreen("forest");
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?._id ?? null;
  const focused = useIsFocused();
  const lowDetail = useMemo(isLowDetailDevice, []);
  const [status, setStatus] = useState<ForestStatus | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  // First load failed with nothing on screen: show an error with Retry
  // instead of an empty seed that looks like a brand-new forest.
  const [loadError, setLoadError] = useState<{ message: string; offline: boolean } | null>(null);
  // Where what's on screen came from: `live` = this visit's server answer;
  // otherwise the offline copy saved at `savedAt`. `pending` = waterings
  // made offline, not yet sent.
  const [sync, setSync] = useState({ live: false, offline: false, savedAt: 0, pending: 0 });
  const syncRef = useRef(sync);
  syncRef.current = sync;
  const [syncing, setSyncing] = useState(false);
  // The scene is heavy to draw; mount it after the screen's opening animation.
  // runAfterInteractions can wait forever behind a stuck interaction handle
  // (a looping animation elsewhere), so a timer mounts it regardless.
  const [sceneReady, setSceneReady] = useState(false);
  useEffect(() => {
    let done = false;
    const ready = () => {
      if (done) return;
      done = true;
      setSceneReady(true);
    };
    const task = InteractionManager.runAfterInteractions(ready);
    const fallback = setTimeout(ready, SCENE_FALLBACK_MS);
    return () => {
      done = true;
      task.cancel();
      clearTimeout(fallback);
    };
  }, []);
  const [showAllTrees, setShowAllTrees] = useState(false);
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
  // Growth-animation steps, replaced by the next status; the toast's own timer
  // is separate so a new status never leaves a toast stuck on screen.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  // Load, background refresh and watering can overlap: each takes a number
  // when it starts and an answer older than the one on screen is dropped,
  // so the water tick doesn't vanish and the tree doesn't shrink back.
  const statusSeq = useRef(0);
  const appliedSeq = useRef(0);

  const habitatRef = useRef<HabitatHandle>(null);
  const statusRef = useRef<ForestStatus | null>(null);
  // A write from this screen (watering) refreshes it already; skip the echo refetch.
  const ownWriteAt = useRef(0);

  const growth = status ? (status.growth ?? legacyGrowth(status, getDateKey(new Date()))) : null;

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  /** `seq` from statusSeq when the request started; a stale answer is ignored. */
  const applyStatus = useCallback((next: ForestStatus, seq: number) => {
    if (seq < appliedSeq.current) return;
    appliedSeq.current = seq;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
    const celebrate = (message: string) => {
      setCelebrateKey((k) => k + 1);
      showToast(message);
    };
    const g = next.growth ?? legacyGrowth(next, getDateKey(new Date()));
    const prev = last.current;
    last.current = { stageIndex: g.stageIndex, treesGrown: g.treesGrown };
    statusRef.current = next;
    setStatus(next);

    if (prev && g.treesGrown > prev.treesGrown) {
      // Finish the old tree on screen, celebrate, then plant the new seed.
      setTweenMs(1200);
      setTarget(1);
      later(() => celebrate("Fully grown! It joined your forest"), 1200);
      later(() => {
        habitatRef.current?.jump(0);
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
  }, [showToast]);

  // A watering made offline that hasn't synced yet stays ticked on screen.
  const withQueued = useCallback((next: ForestStatus, queued: string[]) => {
    const today = getDateKey(new Date());
    return queued.includes(today) ? withOfflineWater(next, today) : next;
  }, []);

  // Stale-while-revalidate: the saved copy (if any) draws at once, the server's
  // answer replaces it. Queued waterings go out first, so the answer counts them.
  const liveRef = useRef(false);
  const loadingRef = useRef(false);
  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setSyncing(true);
    const seq = ++statusSeq.current;
    const today = getDateKey(new Date());
    try {
      // Throws when offline, so an offline open doesn't wait for a second timeout.
      const flushed = userId ? await withTimeout(flushWaterings(userId, today), WATCHDOG_MS) : null;
      if (flushed) ownWriteAt.current = Date.now();
      const fresh = flushed ?? (await withTimeout(forestApi.getStatus(today, { timeoutMs: STATUS_TIMEOUT_MS }), WATCHDOG_MS));
      const queued = userId ? await queuedWaterings(userId) : [];
      liveRef.current = true;
      applyStatus(withQueued(fresh, queued), seq);
      if (userId) writeForestCache(userId, fresh);
      setSync({ live: true, offline: false, savedAt: Date.now(), pending: queued.length });
      setLoadError(null);
      setHasLoaded(true);
    } catch (err) {
      const offline = isNetworkError(err) || err instanceof ForestTimeout;
      // Keep what's on screen; only an empty screen needs the error state.
      if (!last.current) {
        setLoadError({ message: err instanceof ForestTimeout ? err.message : getFriendlyErrorMessage(err), offline });
      }
      setSync((s) => ({ ...s, live: false, offline }));
    } finally {
      loadingRef.current = false;
      setSyncing(false);
    }
  }, [applyStatus, userId, withQueued]);

  const retry = useCallback(() => {
    setLoadError(null);
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    if (userId) {
      // Numbered before load() below, so the server's answer always wins.
      const seq = ++statusSeq.current;
      Promise.all([readForestCache(userId), queuedWaterings(userId)])
        .then(([cached, queued]) => {
          // The server already answered, or nothing saved: nothing to show early.
          if (cancelled || !cached || liveRef.current) return;
          applyStatus(withQueued(rollCachedDay(cached.status, getDateKey(new Date())), queued), seq);
          setSync((s) => ({ ...s, live: false, savedAt: cached.savedAt, pending: queued.length }));
          setLoadError(null);
          setHasLoaded(true);
        })
        .catch(() => {});
    }
    load();
    return () => {
      cancelled = true;
    };
    // Once per visit; later refreshes come from focus, foreground and pull-to-refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back in the app: send queued waterings and refresh an offline or old copy.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const s = syncRef.current;
      if (s.offline || s.pending > 0 || !s.live || Date.now() - s.savedAt > STALE_MS) load();
    });
    return () => sub.remove();
  }, [load]);

  // Offline and looking at the forest: try again now and then.
  useEffect(() => {
    if (!focused || (!sync.offline && sync.pending === 0)) return;
    const id = setInterval(() => load(), OFFLINE_RETRY_MS);
    return () => clearInterval(id);
  }, [focused, sync.offline, sync.pending, load]);

  // Logging your day or ticking a habit elsewhere grows the tree when you come back.
  // Goes through load() so queued offline waterings are sent first and stay
  // ticked; load() keeps what's on screen if it fails.
  useDataRefresh(["forest", "cycle", "habits"], async ({ whileFocused }) => {
    if (whileFocused && Date.now() - ownWriteAt.current < 5000) return;
    await load();
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
    const seq = ++statusSeq.current;
    const today = getDateKey(new Date());
    ownWriteAt.current = Date.now();
    try {
      const [result] = await Promise.all([
        forestApi.logCare({ careType: "water", dateKey: today, today, note: "Watered from the app" }, { timeoutMs: STATUS_TIMEOUT_MS }),
        new Promise((resolve) => setTimeout(resolve, 900)), // let the drops land first
      ]);
      liveRef.current = true;
      applyStatus(result.status, seq);
      if (userId) writeForestCache(userId, result.status);
      setSync((s) => ({ ...s, live: true, offline: false, savedAt: Date.now() }));
    } catch (error) {
      const current = statusRef.current;
      if (isNetworkError(error) && userId && current) {
        // Offline: keep it on the phone and send it once we're back online.
        try {
          await queueWatering(userId, today);
        } catch {
          alert("Couldn't water your tree", "You're offline and it couldn't be saved on this phone. Please try again.");
          return;
        }
        const next = withOfflineWater(current, today);
        applyStatus(next, ++statusSeq.current);
        patchForestMemory(userId, next);
        const queued = await queuedWaterings(userId).catch(() => [today]);
        setSync((s) => ({ ...s, live: false, offline: true, pending: queued.length }));
        showToast("Watered. It'll sync when you're back online");
      } else {
        alert("Couldn't water your tree", getFriendlyErrorMessage(error));
      }
    } finally {
      setWatering(false);
    }
  }

  const hideHint = useCallback(() => setShowHint(false), []);
  const doneToday = growth?.today.done ?? 0;
  const taskDone = (key: ForestTaskKey) => growth?.today.tasks.find((t) => t.key === key)?.done ?? false;
  const toNext = growth ? (growth.nextStage ? growth.pointsToNextStage : growth.pointsPerTree - growth.points) : 0;
  const nextLabel = growth?.nextStage ? STAGE_LABEL[growth.nextStage].toLowerCase() : "your forest";
  const grownTrees = growth?.grownTrees;
  const grown = useMemo(() => grownTrees ?? [], [grownTrees]);
  const grownSeeds = useMemo(() => grown.map((t) => t.number), [grown]);
  const syncLine = sync.live
    ? null
    : sync.pending > 0 && sync.offline
      ? "Offline · your watering will sync when you're back online"
      : sync.offline
        ? `Offline · ${sync.savedAt ? lastSyncedLabel(sync.savedAt, Date.now()) : "showing your saved forest"}`
        : syncing && sync.savedAt
          ? `Syncing… · ${lastSyncedLabel(sync.savedAt, Date.now())}`
          : null;
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
          {loadError ? (
            <View style={{ alignItems: "center", paddingVertical: 56, paddingHorizontal: 12 }}>
              <View style={{ width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "flex-end", overflow: "hidden", backgroundColor: colors.successLight }}>
                <LivingTree growth={0.3} seed={1} size={100} lowDetail vitality="wilting" />
              </View>
              <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "800", marginTop: 18, fontFamily: fonts.heading, textAlign: "center" }}>
                {loadError.offline ? "You're offline" : "Couldn't load your forest"}
              </Text>
              <Text style={{ color: colors.mutedText, fontSize: 13.5, marginTop: 6, fontFamily: fonts.body, textAlign: "center" }}>
                {loadError.offline ? "Your trees are safe. Connect to the internet and try again." : loadError.message}
              </Text>
              <Button label="Try again" icon="refresh" size="md" onPress={retry} style={{ marginTop: 20 }} />
            </View>
          ) : !hasLoaded || !sceneReady ? (
            <ForestSkeleton />
          ) : (
          <Animated.View entering={FadeIn.duration(350)}>
          {syncLine ? (
            <View
              accessible
              accessibilityLiveRegion="polite"
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 10 }}
            >
              <Icon set="ion" name={sync.offline ? "cloud-offline-outline" : "sync-outline"} size={13} color={colors.mutedText} />
              <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.mutedText, fontSize: 13, fontWeight: "600", fontFamily: fonts.body }}>
                {syncLine}
              </Text>
            </View>
          ) : null}
          {/* The living scene */}
          <View style={{ borderRadius: 28, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.surface, ...getShadow(colors, isDark) }}>
            {(
              <View>
                <TweenedHabitat
                  ref={habitatRef}
                  height={SCENE_HEIGHT}
                  target={target}
                  tweenMs={tweenMs}
                  vitality={growth?.vitality ?? "new"}
                  treeSeed={(growth?.treesGrown ?? 0) + 1}
                  grownSeeds={grownSeeds}
                  waterKey={waterKey}
                  celebrateKey={celebrateKey}
                  onInteract={hideHint}
                  lowDetail={lowDetail}
                  active={focused}
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
                      hitSlop={6}
                      onPress={() => habitatRef.current?.replay(4200)}
                      accessibilityRole="button"
                      accessibilityLabel="Watch your tree grow"
                      activeOpacity={0.8}
                      style={[{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }, chip]}
                    >
                      <Icon set="ion" name="play" size={15} color="#1F3B24" />
                    </TouchableOpacity>
                    <View
                      accessible
                      accessibilityLabel={`${growth?.treesGrown ?? 0} trees grown`}
                      style={[{ flexDirection: "row", alignItems: "center", gap: 5, height: 36, paddingHorizontal: 12, borderRadius: 18 }, chip]}
                    >
                      <Icon set="ion" name="leaf" size={14} color="#2E7D32" />
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
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderCurve: "continuous", backgroundColor: "rgba(20,32,24,0.62)" }}>
                      <Icon set="ion" name="hand-left-outline" size={14} color="#FFFFFF" />
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
                      style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderCurve: "continuous", backgroundColor: "rgba(31,59,36,0.92)" }}
                    >
                      <Icon set="ion" name="leaf" size={15} color="#A5D6A7" />
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
          <View style={{ borderRadius: 24, borderCurve: "continuous", backgroundColor: colors.surface, overflow: "hidden", ...getShadow(colors, isDark) }}>
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
                      <Icon set="ion" name={done ? "checkmark" : task.icon} size={19} color={done ? "#FFFFFF" : isWater ? colors.sky : colors.foreground} />
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
                        <Icon set="ion" name="water" size={14} color={colors.buttonText} />
                        <Text style={{ color: colors.buttonText, fontSize: 13.5, fontWeight: "800", fontFamily: fonts.body }}>
                          {watering ? "Watering" : "Water"}
                        </Text>
                      </View>
                    ) : (
                      <Icon set="ion" name="chevron-forward" size={18} color={colors.mutedText} />
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {/* This week */}
          {growth?.week.length ? (
            <>
              <SectionHeader title="This week" style={{ marginTop: 28 }} />
              <View style={{ borderRadius: 24, borderCurve: "continuous", backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 16, ...getShadow(colors, isDark) }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: streak ? colors.warningLight : colors.surfaceSoft }}>
                      <Icon set="ion" name="flame" size={17} color={streak ? colors.warning : colors.mutedText} />
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
          <SectionHeader title="Your forest" style={{ marginTop: 28 }} />
          {grown.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {[...grown].reverse().slice(0, showAllTrees ? undefined : GROWN_PREVIEW).map((tree) => (
                <View
                  key={tree.number}
                  accessible
                  accessibilityLabel={`Tree ${tree.number}, grown ${formatShortDate(`${tree.grownOn}T12:00:00`)}`}
                  style={{ width: "31%", flexGrow: 1, maxWidth: "32%", borderRadius: 20, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
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
          ) : null}
          {grown.length > GROWN_PREVIEW ? (
            <TouchableOpacity
              onPress={() => setShowAllTrees((v) => !v)}
              accessibilityRole="button"
              style={{ alignSelf: "center", paddingVertical: 12, paddingHorizontal: 12, marginTop: 4 }}
            >
              <Text style={{ color: colors.primaryDark, fontSize: 14, fontWeight: "600", textDecorationLine: "underline", fontFamily: fonts.body }}>
                {showAllTrees ? "Show less" : `Show all ${grown.length} trees`}
              </Text>
            </TouchableOpacity>
          ) : null}
          {grown.length ? null : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 24, borderCurve: "continuous", padding: 16, backgroundColor: colors.surface, ...getShadow(colors, isDark) }}>
              <View style={{ width: 64, height: 64, borderRadius: 18, borderCurve: "continuous", alignItems: "center", justifyContent: "flex-end", overflow: "hidden", backgroundColor: colors.successLight }}>
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
          </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
