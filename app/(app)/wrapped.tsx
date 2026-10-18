import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { useTheme } from "../../components/theme";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { genzApi, type CycleWrapped } from "../../lib/api";
import { moodDisplay, prettifyTag, shareViewAsImage } from "../../lib/genz";

/**
 * Cycle Wrapped — a Spotify-Wrapped-style story of the user's month or year,
 * built from GET /api/genz/wrapped. Tap right/left to move between slides,
 * hold to pause; each slide auto-advances. The last slide is a share card
 * that goes out as a PNG (lib/genz.ts#shareViewAsImage).
 */

const SLIDE_MS = 5200;
const WHITE = "#FFFFFF";

type RangeKey = "this_month" | "last_month" | "year";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "year", label: "This year" },
];

function rangeArgs(key: RangeKey): ["month" | "year", string | undefined] {
  const now = new Date();
  if (key === "year") return ["year", String(now.getFullYear())];
  const d = key === "last_month" ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : now;
  return ["month", `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`];
}

type Slide = { key: string; gradient: [string, string, string]; render: () => React.ReactNode };

function Big({ children, size = 84 }: { children: React.ReactNode; size?: number }) {
  const { fonts } = useTheme();
  return (
    <Text style={{ color: WHITE, fontSize: size, lineHeight: size * 1.05, fontFamily: fonts.monoSemiBold, fontWeight: "700" }}>
      {children}
    </Text>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  const { fonts } = useTheme();
  return (
    <Text style={{ color: WHITE, opacity: 0.85, fontSize: 13, letterSpacing: 2, textTransform: "uppercase", fontFamily: fonts.heading, fontWeight: "800" }}>
      {children}
    </Text>
  );
}

function Headline({ children }: { children: React.ReactNode }) {
  const { fonts } = useTheme();
  return (
    <Text style={{ color: WHITE, fontSize: 30, lineHeight: 36, fontFamily: fonts.heading, fontWeight: "900", marginTop: 10 }}>
      {children}
    </Text>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  const { fonts } = useTheme();
  return (
    <Text style={{ color: WHITE, opacity: 0.9, fontSize: 16, lineHeight: 23, fontFamily: fonts.body, fontWeight: "600", marginTop: 14 }}>
      {children}
    </Text>
  );
}

function RankRow({ rank, emoji, label, count }: { rank: number; emoji: string; label: string; count: number }) {
  const { fonts } = useTheme();
  return (
    <View
      className="flex-row items-center rounded-2xl px-4 py-3.5 mt-3"
      style={{ backgroundColor: "rgba(255,255,255,0.16)" }}
    >
      <Text style={{ color: WHITE, width: 28, fontSize: 18, fontFamily: fonts.monoSemiBold }}>{rank}</Text>
      <Text style={{ fontSize: 24, marginRight: 12 }}>{emoji}</Text>
      <Text className="flex-1" style={{ color: WHITE, fontSize: 17, fontFamily: fonts.heading, fontWeight: "800" }}>
        {label}
      </Text>
      <Text style={{ color: WHITE, opacity: 0.85, fontSize: 14, fontFamily: fonts.mono }}>{count}×</Text>
    </View>
  );
}

function buildSlides(w: CycleWrapped): Slide[] {
  const slides: Slide[] = [
    {
      key: "intro",
      gradient: ["#FF5E8A", "#B24BF3", "#5B3CF5"],
      render: () => (
        <>
          <Text style={{ fontSize: 64 }}>🎁</Text>
          <Headline>{`Your ${w.label}\nWrapped`}</Headline>
          <Sub>Your cycle, but make it a story. Tap to see what your body has been up to.</Sub>
        </>
      ),
    },
    {
      key: "days",
      gradient: ["#00B4D8", "#3A86FF", "#7B2FF7"],
      render: () => (
        <>
          <Kicker>You showed up for yourself</Kicker>
          <Big>{w.daysLogged}</Big>
          <Headline>{w.daysLogged === 1 ? "day logged" : "days logged"}</Headline>
          <Sub>
            {w.consistency >= 80
              ? `That's ${w.consistency}% of the days. Consistency queen 👑`
              : w.consistency >= 40
                ? `${w.consistency}% of the days. Solid, bestie.`
                : `${w.consistency}% of the days. Every log counts, keep going 💪`}
          </Sub>
        </>
      ),
    },
  ];

  if (w.longestStreak >= 2) {
    slides.push({
      key: "streak",
      gradient: ["#FF9F1C", "#FF4D6D", "#C9184A"],
      render: () => (
        <>
          <Text style={{ fontSize: 64 }}>🔥</Text>
          <Big>{w.longestStreak}</Big>
          <Headline>day streak</Headline>
          <Sub>Your longest run of back-to-back logs. Built different.</Sub>
        </>
      ),
    });
  }

  if (w.topMoods.length) {
    const top = moodDisplay(w.topMoods[0].value);
    slides.push({
      key: "moods",
      gradient: ["#F72585", "#B5179E", "#7209B7"],
      render: () => (
        <>
          <Kicker>Your mood of the {w.period === "year" ? "year" : "month"}</Kicker>
          <Headline>{`${top.emoji} ${top.label}`}</Headline>
          {w.topMoods.map((m, i) => {
            const d = moodDisplay(m.value);
            return <RankRow key={m.value} rank={i + 1} emoji={d.emoji} label={d.label} count={m.count} />;
          })}
        </>
      ),
    });
  }

  if (w.topSymptoms.length) {
    slides.push({
      key: "symptoms",
      gradient: ["#2EC4B6", "#11998E", "#0B6E4F"],
      render: () => (
        <>
          <Kicker>{"Your body's top plot points"}</Kicker>
          <Headline>The symptoms that showed up most</Headline>
          {w.topSymptoms.map((s, i) => (
            <RankRow key={s.value} rank={i + 1} emoji={["🥇", "🥈", "🥉"][i] ?? "•"} label={prettifyTag(s.value)} count={s.count} />
          ))}
        </>
      ),
    });
  }

  if (w.periodsStarted || w.avgCycleLength) {
    slides.push({
      key: "cycle",
      gradient: ["#FF6B8B", "#E63973", "#9D174D"],
      render: () => (
        <>
          <Kicker>Cycle check</Kicker>
          {w.avgCycleLength ? (
            <>
              <Big>{Math.round(w.avgCycleLength)}</Big>
              <Headline>day average cycle</Headline>
            </>
          ) : (
            <Headline>{`${w.periodsStarted} period${w.periodsStarted === 1 ? "" : "s"} tracked`}</Headline>
          )}
          <Sub>
            {w.periodDays
              ? `${w.periodDays} period day${w.periodDays === 1 ? "" : "s"} logged. Heating pad MVP 🏆`
              : "Keep logging your flow to see your full pattern."}
          </Sub>
        </>
      ),
    });
  }

  if (w.avgSleepHours || w.avgWaterMl) {
    slides.push({
      key: "care",
      gradient: ["#4361EE", "#3A0CA3", "#240046"],
      render: () => (
        <>
          <Kicker>Self-care stats</Kicker>
          {w.avgSleepHours ? (
            <View className="mt-4">
              <Big size={64}>{`${w.avgSleepHours}h`}</Big>
              <Sub>{w.avgSleepHours >= 8 ? "average sleep. Sleeping beauty behaviour 😴" : "average sleep. Your bed misses you 🛏️"}</Sub>
            </View>
          ) : null}
          {w.avgWaterMl ? (
            <View className="mt-8">
              <Big size={64}>{`${(w.avgWaterMl / 1000).toFixed(1)}L`}</Big>
              <Sub>{w.avgWaterMl >= 2000 ? "water a day. Hydro homie 💧" : "water a day. Sip sip, bestie 💧"}</Sub>
            </View>
          ) : null}
        </>
      ),
    });
  }

  return slides;
}

/** The share card: also the last slide, captured to PNG as-is. */
function PersonaCard({ w }: { w: CycleWrapped }) {
  const { fonts } = useTheme();
  const stats = [
    { label: "Days logged", value: String(w.daysLogged) },
    { label: "Best streak", value: `${w.longestStreak}🔥` },
    w.avgCycleLength ? { label: "Avg cycle", value: `${Math.round(w.avgCycleLength)}d` } : null,
    w.topMoods[0] ? { label: "Top mood", value: moodDisplay(w.topMoods[0].value).emoji } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <LinearGradient
      colors={["#FF5E8A", "#B24BF3", "#3A0CA3"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 28, padding: 26 }}
    >
      <Kicker>{`${w.label} Wrapped`}</Kicker>
      <Text style={{ fontSize: 72, marginTop: 18 }}>{w.persona.emoji}</Text>
      <Text style={{ color: WHITE, opacity: 0.85, fontSize: 14, marginTop: 8, fontFamily: fonts.body, fontWeight: "700" }}>
        My cycle personality is
      </Text>
      <Text style={{ color: WHITE, fontSize: 32, lineHeight: 38, fontFamily: fonts.heading, fontWeight: "900", marginTop: 4 }}>
        {w.persona.title}
      </Text>
      <View className="flex-row flex-wrap mt-6" style={{ gap: 10 }}>
        {stats.map((s) => (
          <View key={s.label} className="rounded-2xl px-4 py-3" style={{ backgroundColor: "rgba(255,255,255,0.18)", minWidth: "46%", flexGrow: 1 }}>
            <Text style={{ color: WHITE, fontSize: 22, fontFamily: fonts.monoSemiBold }}>{s.value}</Text>
            <Text style={{ color: WHITE, opacity: 0.85, fontSize: 12, fontFamily: fonts.body, fontWeight: "700", marginTop: 2 }}>{s.label}</Text>
          </View>
        ))}
      </View>
      <Text style={{ color: WHITE, opacity: 0.75, fontSize: 12, marginTop: 22, fontFamily: fonts.heading, fontWeight: "800", letterSpacing: 1 }}>
        🌸 THE NURA · thenura.care
      </Text>
    </LinearGradient>
  );
}

function ProgressBars({ count, index, progress }: { count: number; index: number; progress: Animated.Value }) {
  return (
    <View className="flex-row px-4 pt-2" style={{ gap: 4 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} className="flex-1 overflow-hidden rounded-full" style={{ height: 3, backgroundColor: "rgba(255,255,255,0.3)" }}>
          <Animated.View
            style={{
              height: 3,
              backgroundColor: WHITE,
              width:
                i < index
                  ? "100%"
                  : i === index
                    ? progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] })
                    : "0%",
            }}
          />
        </View>
      ))}
    </View>
  );
}

function Story({ wrapped, range, onRange }: { wrapped: CycleWrapped; range: RangeKey; onRange: (r: RangeKey) => void }) {
  const router = useRouter();
  const { fonts } = useTheme();
  const shareRef = useRef<View>(null);
  const slides = useMemo(() => buildSlides(wrapped), [wrapped]);
  const total = slides.length + 1; // + the share card
  const [index, setIndex] = useState(0);
  const [sharing, setSharing] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const isLast = index === total - 1;

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(total - 1, next));
      fade.setValue(0.25);
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      setIndex(clamped);
    },
    [fade, total],
  );

  // Restart on a new range.
  useEffect(() => setIndex(0), [wrapped]);

  const run = useCallback(
    (from = 0) => {
      progress.setValue(from);
      Animated.timing(progress, {
        toValue: 1,
        duration: SLIDE_MS * (1 - from),
        easing: Easing.linear,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) setIndex((i) => (i < total - 1 ? i + 1 : i));
      });
    },
    [progress, total],
  );

  useEffect(() => {
    if (isLast) {
      progress.setValue(1);
      return;
    }
    run(0);
    return () => progress.stopAnimation();
  }, [index, isLast, progress, run]);

  const pause = () => progress.stopAnimation();
  const resume = () => {
    if (isLast) return;
    progress.stopAnimation((v) => run(v));
  };

  const share = async () => {
    setSharing(true);
    try {
      await shareViewAsImage(
        shareRef,
        `My ${wrapped.label} Cycle Wrapped: ${wrapped.persona.emoji} ${wrapped.persona.title}. Get yours on The Nura`,
        "wrapped",
      );
    } finally {
      setSharing(false);
    }
  };

  const slide = slides[index];
  const gradient: [string, string, string] = slide?.gradient ?? ["#1B0B3A", "#2D0F5C", "#120727"];

  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ProgressBars count={total} index={index} progress={progress} />
        <View className="flex-row items-center justify-between px-4 pt-3">
          <View className="flex-row" style={{ gap: 6 }}>
            {RANGES.map((r) => {
              const active = r.key === range;
              return (
                <TouchableOpacity
                  key={r.key}
                  onPress={() => onRange(r.key)}
                  activeOpacity={0.8}
                  className="rounded-full px-3 py-1.5"
                  style={{ backgroundColor: active ? WHITE : "rgba(255,255,255,0.18)" }}
                >
                  <Text style={{ color: active ? "#3A0CA3" : WHITE, fontSize: 12, fontFamily: fonts.body, fontWeight: "800" }}>{r.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Close" hitSlop={12}>
            <Feather name="x" size={24} color={WHITE} />
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1 }}>
          <Animated.View style={{ flex: 1, opacity: fade, justifyContent: "center", paddingHorizontal: 28 }}>
            {slide ? (
              slide.render()
            ) : (
              <>
                <View ref={shareRef} collapsable={false}>
                  <PersonaCard w={wrapped} />
                </View>
              </>
            )}
          </Animated.View>

          {/* Tap zones sit over the slide; the share card needs its buttons, so they stop above them. */}
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: isLast ? 120 : 0, flexDirection: "row" }}>
            <Pressable style={{ flex: 1 }} onPress={() => go(index - 1)} onPressIn={pause} onPressOut={resume} accessibilityLabel="Previous" />
            <Pressable style={{ flex: 2 }} onPress={() => go(index + 1)} onPressIn={pause} onPressOut={resume} accessibilityLabel="Next" />
          </View>
        </View>

        {isLast ? (
          <View className="px-6 pb-6" style={{ gap: 10 }}>
            <TouchableOpacity
              onPress={share}
              disabled={sharing}
              activeOpacity={0.85}
              className="flex-row items-center justify-center rounded-2xl py-4"
              style={{ backgroundColor: WHITE, gap: 8, opacity: sharing ? 0.7 : 1 }}
            >
              <Feather name="share" size={18} color="#3A0CA3" />
              <Text style={{ color: "#3A0CA3", fontSize: 16, fontFamily: fonts.heading, fontWeight: "900" }}>
                {sharing ? "Getting it ready…" : "Share to your story"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => go(0)} activeOpacity={0.8} className="items-center py-2">
              <Text style={{ color: WHITE, fontSize: 14, fontFamily: fonts.body, fontWeight: "700" }}>Watch again</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </SafeAreaView>
    </LinearGradient>
  );
}

export default function WrappedScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [range, setRange] = useState<RangeKey>(() => (new Date().getDate() <= 5 ? "last_month" : "this_month"));
  const [period, value] = rangeArgs(range);

  const { data, loading, error, offline, reload } = useAsyncLoad(
    () => genzApi.getWrapped(period, value),
    [period, value],
    { refreshOn: ["cycle"], cacheKey: `genz:wrapped:${period}:${value}`, staleMs: 5 * 60_000 },
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#1B0B3A" }}>
      <StatusBar barStyle="light-content" backgroundColor="#1B0B3A" />
      <LoadingErrorState
        loading={loading && !data}
        error={error}
        offline={offline}
        onRetry={() => reload()}
        loadingLabel="Wrapping your cycle…"
        errorTitle="Couldn't load your Wrapped"
      >
        {data ? (
          data.isEmpty ? (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
              <EmptyState
                icon="gift-outline"
                title={`Nothing to wrap for ${data.label} yet`}
                message="Log a few days (flow, mood, symptoms) and your Wrapped builds itself."
                actionLabel="Log today"
                onAction={() => router.replace("/(app)/(dashboard)/tracker")}
              />
              <View className="flex-row justify-center pb-8" style={{ gap: 8 }}>
                {RANGES.filter((r) => r.key !== range).map((r) => (
                  <TouchableOpacity key={r.key} onPress={() => setRange(r.key)} className="rounded-full px-4 py-2" style={{ backgroundColor: colors.surface }}>
                    <Text style={{ color: colors.foreground, fontWeight: "700" }}>{`Try ${r.label.toLowerCase()}`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </SafeAreaView>
          ) : (
            <Story wrapped={data} range={range} onRange={setRange} />
          )
        ) : null}
      </LoadingErrorState>
    </View>
  );
}
