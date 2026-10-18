import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Polyline, Stop } from "react-native-svg";
import { useTheme } from "../../components/theme";
import { ColumnLabel } from "../../components/ColumnLabel";
import { SkeletonCard } from "../../components/Skeleton";
import {
  getHeroGradient,
  getSoftTints,
  getSurfaceGradient,
  getShadow,
} from "../../components/ui-tokens";
import { cycleApi, type Predictions as CyclePredictions } from "../../lib/api";
import { useDataRefresh } from "../../hooks/useDataRefresh";
import { ScreenHeader } from "../../components/ScreenHeader";


type AnalyticsBar = {
  daysLogged?: number;
  isPlaceholder: boolean;
  length: number;
  month: string;
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function parseMonthIndex(month: string) {
  const normalized = month.slice(0, 3).toLowerCase();
  return MONTH_LABELS.findIndex(
    (label) => label.toLowerCase() === normalized,
  );
}

function buildFiveMonthAnalytics(
  entries: CyclePredictions["analyticsData"] = [],
): AnalyticsBar[] {
  const cleanEntries = entries
    .filter((entry) => entry.month)
    .slice(-5)
    .map((entry) => {
      const monthIndex = parseMonthIndex(entry.month);

      return {
        ...entry,
        month:
          monthIndex >= 0
            ? MONTH_LABELS[monthIndex]
            : entry.month.slice(0, 3) || "Now",
      };
    });

  const latestMonth = cleanEntries[cleanEntries.length - 1]?.month;
  const latestIndex =
    latestMonth && parseMonthIndex(latestMonth) >= 0
      ? parseMonthIndex(latestMonth)
      : new Date().getMonth();
  const byMonth = new Map(cleanEntries.map((entry) => [entry.month, entry]));

  return Array.from({ length: 5 }, (_, index) => {
    const monthIndex = (latestIndex - 4 + index + 12) % 12;
    const month = MONTH_LABELS[monthIndex];
    const entry = byMonth.get(month);

    return {
      daysLogged: entry?.daysLogged,
      isPlaceholder: !entry,
      length: entry?.length ?? 0,
      month,
    };
  });
}

const TREND_CHART_WIDTH = 100;
const TREND_CHART_HEIGHT = 40;

function CycleTrendLine({ bars }: { bars: AnalyticsBar[] }) {
  const { colors, isDark, fonts } = useTheme();
  const heroGradient = getHeroGradient(colors, isDark);
  const loggedValues = bars.map((b) => b.length).filter((v) => v > 0);

  if (loggedValues.length < 2) {
    return (
      <Text
        className="text-xs font-semibold text-center py-6"
        style={{ color: colors.mutedText, fontFamily: fonts.body }}
      >
        Log at least two cycles to see your trend line.
      </Text>
    );
  }

  const max = Math.max(...loggedValues);
  const min = Math.min(...loggedValues);
  const range = Math.max(max - min, 1);
  const stepX = TREND_CHART_WIDTH / (bars.length - 1);

  const points = bars.map((bar, index) => {
    const x = index * stepX;
    const y =
      bar.length > 0
        ? TREND_CHART_HEIGHT - 4 - ((bar.length - min) / range) * (TREND_CHART_HEIGHT - 8)
        : null;
    return { x, y, length: bar.length };
  });

  const loggedPoints = points.filter((p) => p.y !== null) as { x: number; y: number; length: number }[];
  const polylinePoints = loggedPoints.map((p) => `${p.x},${p.y}`).join(" ");

  const firstLogged = loggedPoints[0].length;
  const lastLogged = loggedPoints[loggedPoints.length - 1].length;
  const delta = lastLogged - firstLogged;
  const trendColor = delta > 0 ? colors.danger : delta < 0 ? colors.success : colors.mutedText;
  const trendIcon = delta > 0 ? "trending-up" : delta < 0 ? "trending-down" : "trending-neutral";
  const trendLabel =
    delta === 0
      ? "Steady cycle length"
      : `${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} day${Math.abs(delta) === 1 ? "" : "s"} vs 5 months ago`;

  return (
    <View>
      <View className="flex-row items-center gap-1.5 mb-2">
        <MaterialCommunityIcons name={trendIcon} size={14} color={trendColor} />
        <Text className="text-xs font-bold" style={{ color: trendColor, fontFamily: fonts.body }}>
          {trendLabel}
        </Text>
      </View>
      <Svg width="100%" height={64} viewBox={`0 0 ${TREND_CHART_WIDTH} ${TREND_CHART_HEIGHT}`}>
        <Defs>
          <SvgGradient id="trendLineGradient" x1="0" y1="0" x2="1" y2="0">
            {heroGradient.map((stop, index) => (
              <Stop
                key={stop}
                offset={index / (heroGradient.length - 1)}
                stopColor={stop}
              />
            ))}
          </SvgGradient>
        </Defs>
        <Polyline
          points={polylinePoints}
          fill="none"
          stroke="url(#trendLineGradient)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {loggedPoints.map((p, index) => (
          <Circle key={index} cx={p.x} cy={p.y} r={2.4} fill={colors.primaryDark} />
        ))}
      </Svg>
      <View className="flex-row justify-between mt-1">
        {bars.map((bar, index) => (
          <Text
            key={`${bar.month}-${index}`}
            className="text-xs font-bold flex-1 text-center"
            style={{ color: colors.mutedText, fontFamily: fonts.body }}
          >
            {bar.month}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function Predictions() {
  const { colors, isDark, fonts } = useTheme();

  const PHASE_META: Record<string, { label: string; color: string; description: string }> = {
    period: { label: "Period", color: colors.rose, description: "Rest, hydrate, and notice what your body needs." },
    follicular: { label: "Follicular", color: colors.warning, description: "Energy often starts to rise after bleeding slows." },
    ovulation: { label: "Ovulation", color: colors.primary, description: "A common peak-fertility window for many cycles." },
    luteal: { label: "Luteal", color: colors.secondary, description: "Mood, cravings, and sleep can shift before your period." },
  };

  const [data, setData] = useState<CyclePredictions | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const softTints = getSoftTints(colors);
  const surfaceGradient = getSurfaceGradient(colors, isDark) as [string, string];
  const heroGradient = getHeroGradient(colors, isDark) as [string, string, string];

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const predictions = await cycleApi.getPredictions({ force: isRefresh });
      setData(predictions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load predictions");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useDataRefresh(["cycle"], () =>
    cycleApi.getPredictions().then((predictions) => {
      setData(predictions);
      setError(null);
    }),
  );

  const phaseMeta = data ? PHASE_META[data.currentPhase] ?? PHASE_META.follicular : null;
  const analyticsBars = useMemo(
    () => buildFiveMonthAnalytics(data?.analyticsData),
    [data?.analyticsData],
  );
  const hasAnalyticsHistory = analyticsBars.some((bar) => bar.length > 0);

  const maxBarLength = Math.max(
    ...analyticsBars.map((d) => d.length),
    data?.cycleLength ?? 1,
    1,
  );

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Smart Predictions" />

        {loading ? (
          <View className="px-6 mt-6 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : error ? (
          <View className="flex-1 items-center justify-center px-8">
            <MaterialCommunityIcons name="calendar-alert" size={48} color={colors.primary} />
            <Text className="mt-4 text-base font-bold text-center" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
              {error.includes("setup") ? "No cycle data yet" : "Couldn't load predictions"}
            </Text>
            <Text className="mt-2 text-xs text-center leading-5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              {error.includes("setup")
                ? "Set up your cycle settings in the tracker to unlock predictions."
                : error}
            </Text>
            <TouchableOpacity
              onPress={() => load()}
              className="mt-6 px-6 py-3 rounded-2xl"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-sm font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                {error.includes("setup") ? "Go to Tracker" : "Retry"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : data ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 60 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor={colors.primary}
              />
            }
          >
            <View className="mx-6 mt-8">
              {/* Current Phase Badge */}
              {phaseMeta && (
                <View
                  className="flex-row items-center gap-3 p-4 rounded-2xl border mb-5"
                  style={{ backgroundColor: `${phaseMeta.color}0D`, borderColor: `${phaseMeta.color}40`, borderRadius: 28 }}
                >
                  <View className="w-3 h-3 rounded-full" style={{ backgroundColor: phaseMeta.color }} />
                  <View className="flex-1">
                    <Text className="text-xs font-black uppercase tracking-widest" style={{ color: phaseMeta.color, fontFamily: fonts.heading }}>
                      {phaseMeta.label} Phase — Day {data.currentCycleDay}
                    </Text>
                    <Text className="text-xs mt-0.5 font-medium" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                      {phaseMeta.description}
                    </Text>
                  </View>
                </View>
              )}

              {/* Stale-data warning — the user stopped logging, so the
                  projection has drifted far from a real anchor. */}
              {data.isStale && (
                <View
                  className="flex-row items-start gap-3 p-4 border mb-5"
                  style={{ backgroundColor: `${colors.warning}12`, borderColor: `${colors.warning}40`, borderRadius: 28 }}
                >
                  <Feather name="alert-triangle" size={18} color={colors.warning} />
                  <View className="flex-1">
                    <Text className="text-xs font-black" style={{ color: colors.warning, fontFamily: fonts.heading }}>
                      Predictions may be off
                    </Text>
                    <Text className="text-xs mt-0.5 font-medium leading-4" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                      It&apos;s been a while since your last logged period{typeof data.daysSinceLastActualPeriod === "number" ? ` (${data.daysSinceLastActualPeriod} days)` : ""}. Log your current period to re-anchor these dates.
                    </Text>
                  </View>
                </View>
              )}

              {/* Hero: Next Period — circular countdown ring */}
              <View
                className="border overflow-hidden mb-5 items-center py-6"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: 28,
                  ...getShadow(colors, isDark),
                }}
              >
                {(() => {
                  const size = 150;
                  const strokeWidth = 10;
                  const radius = (size - strokeWidth) / 2;
                  const circumference = 2 * Math.PI * radius;
                  const cycleLen = Math.max(data.cycleLength || 28, 1);
                  const progress = Math.min(
                    Math.max((cycleLen - data.nextPeriodDaysAway) / cycleLen, 0),
                    1,
                  );
                  const dashOffset = circumference * (1 - progress);
                  return (
                    <View style={{ width: size, height: size }}>
                      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                        <Defs>
                          <SvgGradient id="countdownRingGradient" x1="0" y1="0" x2="1" y2="1">
                            {heroGradient.map((stop, index) => (
                              <Stop
                                key={stop}
                                offset={index / (heroGradient.length - 1)}
                                stopColor={stop}
                              />
                            ))}
                          </SvgGradient>
                        </Defs>
                        <Circle
                          cx={size / 2}
                          cy={size / 2}
                          r={radius}
                          stroke={colors.border}
                          strokeWidth={strokeWidth}
                          fill="none"
                        />
                        <Circle
                          cx={size / 2}
                          cy={size / 2}
                          r={radius}
                          stroke="url(#countdownRingGradient)"
                          strokeWidth={strokeWidth}
                          fill="none"
                          strokeDasharray={`${circumference} ${circumference}`}
                          strokeDashoffset={dashOffset}
                          strokeLinecap="round"
                          rotation={-90}
                          originX={size / 2}
                          originY={size / 2}
                        />
                      </Svg>
                      {/* Absolutely centered over the ring via inset:0 + flex
                          centering, instead of a hand-tuned `top` offset that
                          drifted out of the circle's actual center. */}
                      <View
                        style={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          left: 0,
                          right: 0,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text className="text-3xl font-black" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                          {data.nextPeriodDaysAway}
                        </Text>
                        <Text className="text-xs font-bold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                          days left
                        </Text>
                      </View>
                    </View>
                  );
                })()}
                <Text className="mt-2.5 text-base font-black tracking-tight" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                  {data.isEstimate ? "Estimated next period" : "Next period"} · {data.nextPeriodDate}
                </Text>
                {data.isEstimate && data.predictedWindowRange ? (
                  <Text
                    className="mt-1 text-xs font-semibold text-center px-6"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    Your cycles vary — it may arrive anytime {data.predictedWindowRange}.
                  </Text>
                ) : null}
                {data.confidence ? (
                  <View
                    className="mt-2 rounded-full px-3 py-1"
                    style={{ backgroundColor: `${colors.primary}14` }}
                  >
                    <Text
                      className="text-[11.5px] font-black uppercase tracking-wider"
                      style={{ color: colors.primary, fontFamily: fonts.body }}
                    >
                      {data.confidence} confidence
                      {data.cyclesAnalyzed ? ` · ${data.cyclesAnalyzed} cycles` : ""}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Fertile Window + Ovulation */}
              <View className="flex-row gap-4 mb-5">
                <View
                  className="flex-1 border p-5 justify-between min-h-[140px]"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderRadius: 28,
                    ...getShadow(colors, isDark),
                  }}
                >
                  <View className="self-start p-2.5 rounded-xl" style={{ backgroundColor: softTints.purple }}>
                    <Ionicons name="heart-outline" size={18} color={colors.accent} />
                  </View>
                  <View className="mt-4">
                    <Text className="text-xs font-bold tracking-wide" style={{ color: colors.mutedText, fontFamily: fonts.heading }}>
                      Fertile Window
                    </Text>
                    <Text className="text-lg font-black tracking-tight mt-0.5" style={{ color: colors.foreground, fontFamily: fonts.mono }}>
                      {data.fertileWindowRange}
                    </Text>
                    <Text className="text-xs font-semibold mt-0.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                      {data.fertileWindowDuration}
                    </Text>
                  </View>
                </View>

                <View
                  className="flex-1 border p-5 justify-between min-h-[140px]"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderRadius: 28,
                    ...getShadow(colors, isDark),
                  }}
                >
                  <View className="self-start p-2.5 rounded-xl" style={{ backgroundColor: softTints.pink }}>
                    <Feather name="zap" size={16} color={colors.primary} />
                  </View>
                  <View className="mt-4">
                    <Text className="text-xs font-bold tracking-wide" style={{ color: colors.mutedText, fontFamily: fonts.heading }}>
                      Ovulation Day
                    </Text>
                    <Text className="text-lg font-black tracking-tight mt-0.5" style={{ color: colors.foreground, fontFamily: fonts.mono }}>
                      {data.ovulationReliable === false ? "—" : data.ovulationDate}
                    </Text>
                    <Text className="text-xs font-semibold mt-0.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                      {data.ovulationReliable === false
                        ? "Less reliable for irregular cycles"
                        : data.ovulationDaysAway === 0
                          ? "Today!"
                          : `In ${data.ovulationDaysAway} days`}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Analytics graph */}
              <View
                className="border overflow-hidden mb-5"
                style={{
                  borderColor: colors.border,
                  borderRadius: 28,
                  ...getShadow(colors, isDark),
                }}
              >
                <LinearGradient
                  colors={surfaceGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  className="p-5"
                >
                  <Text className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: colors.secondary, fontFamily: fonts.heading }}>
                    Analytics
                  </Text>
                  <View className="mb-5 flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-base font-extrabold tracking-tight" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                        Last 5 Cycle Entries
                      </Text>
                      <Text className="mt-1 text-xs font-semibold leading-4" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                        {hasAnalyticsHistory
                           ? "Missing months stay visible as 0 so trends are easy to read."
                           : "Log your first cycle month to start building this trend."}
                      </Text>
                    </View>
                    <View
                      className="rounded-full px-3 py-1"
                      style={{ backgroundColor: softTints.emerald }}
                    >
                      <Text className="text-[11.5px] font-black uppercase" style={{ color: colors.success, fontFamily: fonts.body }}>
                        5 months
                      </Text>
                    </View>
                  </View>
                  <View className="h-36 flex-row justify-between items-end px-1">
                    {analyticsBars.map((d, i) => {
                      const heightPct =
                        d.length > 0 ? Math.max(0.15, d.length / maxBarLength) : 0;
                      const isLatest = i === analyticsBars.length - 1;
                      return (
                        <View key={`${d.month}-${i}`} className="items-center flex-1 gap-1.5">
                          <Text className="text-xs font-bold" style={{ color: d.length ? colors.foreground : colors.mutedText, fontFamily: fonts.mono }}>
                            {d.length}d
                          </Text>
                          <View
                            className="w-5 rounded-full overflow-hidden justify-end"
                            style={{
                              backgroundColor: colors.surfaceSoft,
                              borderColor: colors.border,
                              borderWidth: 1,
                              height: 108,
                            }}
                          >
                            {d.length > 0 ? (
                              <LinearGradient
                                colors={isLatest ? heroGradient : [colors.accent, colors.mintLight]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={{
                                  borderRadius: 999,
                                  height: 108 * heightPct,
                                  opacity: isLatest ? 1 : 0.62,
                                  width: "100%",
                                }}
                              />
                            ) : (
                              <View
                                style={{
                                  backgroundColor: colors.border,
                                  borderRadius: 999,
                                  height: 4,
                                  margin: 4,
                                }}
                              />
                            )}
                          </View>
                          <Text className="text-xs font-bold mt-0.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                            {d.month}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </LinearGradient>
              </View>

              {/* Cycle length trend line */}
              <View
                className="border p-5 mb-5"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: 28,
                  ...getShadow(colors, isDark),
                }}
              >
                <Text
                  className="text-xs font-bold tracking-widest uppercase mb-3"
                  style={{ color: colors.secondary, fontFamily: fonts.heading }}
                >
                  Cycle Length Trend
                </Text>
                <CycleTrendLine bars={analyticsBars} />
              </View>

              {/* Cycle stats */}
              <View className="flex-row gap-3 mb-5">
                {[
                  { label: "Cycle Length", value: `${data.cycleLength}d`, icon: "repeat", color: colors.accent },
                  { label: "Period Length", value: `${data.periodLength}d`, icon: "droplet", color: colors.primary },
                ].map((s) => (
                  <View
                    key={s.label}
                    className="flex-1 border p-4 items-center"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderRadius: 20,
                      ...getShadow(colors, isDark),
                    }}
                  >
                    <Feather name={s.icon as any} size={18} color={s.color} />
                    <Text className="mt-2 text-lg font-black" style={{ color: colors.foreground, fontFamily: fonts.mono }}>
                      {s.value}
                    </Text>
                    <ColumnLabel style={{ fontSize: 13, fontWeight: "600", marginTop: 2, color: colors.mutedText, fontFamily: fonts.body }}>{s.label}</ColumnLabel>
                  </View>
                ))}
              </View>

              {/* AI notice */}
              <View
                className="p-5 border flex-row items-start gap-4"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: 28,
                  ...getShadow(colors, isDark),
                }}
              >
                <View className="p-2 rounded-xl" style={{ backgroundColor: softTints.emerald }}>
                  <MaterialCommunityIcons name="shield-check-outline" size={18} color={colors.success} />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                    {data.isDataHighlyAccurate ? "✓ High accuracy" : "Improving accuracy"}
                  </Text>
                  <Text className="mt-1 text-xs leading-4 font-medium" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                    Built from your logged cycle history. Keep logging regularly
                    to make predictions more personal and useful.
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </>
  );
}
