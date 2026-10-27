import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BarSeries, type Bar } from "../../components/charts/BarSeries";
import { ChartCard } from "../../components/charts/ChartCard";
import { chartColor } from "../../components/charts/chartColors";
import { TrendLine } from "../../components/charts/TrendLine";
import { Icon } from "../../components/Icon";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SkeletonCard } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { useTodayKey } from "../../hooks/useTodayKey";
import { cycleApi, isNetworkError, type DayEntry, type Predictions } from "../../lib/api";
import { seriesFromLogs, shortDay, summarize, weeklyAverages, type Point } from "../../lib/chartData";
import { getMonthKey } from "../../lib/format";
import { useSecureScreen } from "../../lib/screenPrivacy";

/**
 * Graphs & Reports (Profile → Graphs & Reports): one chart per measure,
 * drawn with the shared chart kit (components/charts/, react-native-gifted-
 * charts) to the dataviz rules: one filter row (30/90 days) above
 * everything, one colour per measure, headline number + one caption line,
 * press/tap to read a value, a list view twin for every chart.
 */

type GraphsData = { logs: DayEntry[]; cycles: { month: string; length: number }[] };

/** Typical cycle length (days), as the backend's normal range. */
const TYPICAL = { min: 21, max: 35 };

async function loadGraphsData(): Promise<GraphsData> {
  const today = new Date();
  // A network error on predictions means nothing here is real: show the
  // offline state rather than empty charts.
  const [predictions, months] = await Promise.all([
    cycleApi.getPredictions().catch<Predictions | null>((error) => {
      if (isNetworkError(error)) throw error;
      return null;
    }),
    Promise.all(
      [0, 1, 2, 3].map((offset) => cycleApi.getMonthLogs(getMonthKey(new Date(today.getFullYear(), today.getMonth() - offset, 1))).catch<DayEntry[]>(() => [])),
    ),
  ]);
  const cycles = (predictions?.analyticsData ?? [])
    .filter((c) => c.length > 0)
    .slice(-6)
    .map((c) => ({ month: c.month, length: c.length }));
  return { logs: months.flat(), cycles };
}

/** "2026-09" / "2026-09-14" → "Sep"; anything else as given, short. */
function monthLabel(month: string) {
  const m = /^(\d{4})-(\d{2})/.exec(month);
  if (!m) return month.slice(0, 3);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
}

/** "2026-09" → "September 2026". */
function monthLong(month: string) {
  const m = /^(\d{4})-(\d{2})/.exec(month);
  if (!m) return month;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

const RANGES = [
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
] as const;

function ReportRow({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  trailing,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  trailing: React.ReactNode;
  onPress: () => void;
}) {
  const { colors, isDark, fonts } = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: 16,
        borderRadius: 20, borderCurve: "continuous",
        backgroundColor: colors.surface,
        marginBottom: 12,
        ...getShadow(colors, isDark),
      }}
    >
      <View
        style={{ width: 46, height: 46, borderRadius: 14, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: iconBg }}
      >
        <Icon set="ion" name={icon} size={22} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800", fontFamily: fonts.heading }}>
          {title}
        </Text>
        <Text style={{ color: colors.mutedText, fontSize: 13.5, marginTop: 2, fontFamily: fonts.body }}>
          {subtitle}
        </Text>
      </View>
      {trailing}
    </TouchableOpacity>
  );
}

export default function GraphsAndReportsScreen() {
  useSecureScreen("graphs-reports");
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const todayKey = useTodayKey();
  const [rangeKey, setRangeKey] = useState<"30" | "90">("30");
  const days = RANGES.find((r) => r.key === rangeKey)!.days;

  const { data, loading, refreshing, error, offline, reload } = useAsyncLoad<GraphsData>(loadGraphsData, [], { refreshOn: ["cycle"] });

  const series = useMemo(() => {
    const logs = data?.logs ?? [];
    const pick = (f: "weight" | "temperature" | "sleepHours" | "waterIntake") => seriesFromLogs(logs, f, todayKey, days);
    return { weight: pick("weight"), temperature: pick("temperature"), water: pick("waterIntake"), sleep: pick("sleepHours") };
  }, [data, todayKey, days]);

  /** Daily bars for 30 days; weekly averages for 90 (90 bars would be noise). */
  const toBars = (points: Point[]): Bar[] =>
    (days > 30 ? weeklyAverages(points, todayKey, days) : points).map((p) => ({
      label: shortDay(p.key).split(" ")[0] + (days > 30 ? ` ${shortDay(p.key).split(" ")[1]}` : ""),
      value: p.value,
      detail: days > 30 ? `Week of ${shortDay(p.key)} (average)` : shortDay(p.key),
    }));
  const listOf = (points: Point[], fmt: (v: number) => string) => [...points].reverse().map((p) => ({ label: shortDay(p.key), value: fmt(p.value) }));

  const cycles = data?.cycles ?? [];
  const cycleAvg = cycles.length ? cycles.reduce((s, c) => s + c.length, 0) / cycles.length : null;
  const outside = (len: number) => len < TYPICAL.min || len > TYPICAL.max;
  const outsideCount = cycles.filter((c) => outside(c.length)).length;
  const cycleSentence =
    cycleAvg == null
      ? ""
      : `Your latest cycle. ${cycles.length > 1 ? `They average ${Math.round(cycleAvg)} days` : "That's"}${
          outsideCount === 0
            ? `, ${cycles.length > 1 ? "all " : ""}within the typical ${TYPICAL.min}–${TYPICAL.max}.`
            : `; ${outsideCount} of ${cycles.length} fell outside the typical ${TYPICAL.min}–${TYPICAL.max}.`
        }`;
  const trendSentence = (c: number | null, unit: string, decimals: number) =>
    c == null || Math.abs(c) < 10 ** -decimals / 2
      ? `Your latest. Steady over the ${rangeLabel}.`
      : `Your latest. ${c > 0 ? "Up" : "Down"} ${Math.abs(c).toFixed(decimals)} ${unit} over the ${rangeLabel}.`;
  const weight = summarize(series.weight);
  const temp = summarize(series.temperature);
  const water = summarize(series.water);
  const sleep = summarize(series.sleep);
  const rangeLabel = `last ${days} days`;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Graphs & Reports" />
        <LoadingErrorState
          loading={loading}
          error={error}
          offline={offline}
          onRetry={() => reload()}
          loadingLabel="Crunching your trends…"
          errorTitle="Couldn't load your graphs"
          skeleton={
            <View className="gap-4 px-6 pt-4">
              <SkeletonCard />
              <SkeletonCard />
            </View>
          }
        >
          {data ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 60 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />}
            >
              {/* One filter row for every daily chart below */}
              <SegmentedControl
                segments={RANGES.map((r) => ({ key: r.key, label: r.label, accessibilityLabel: `Show the last ${r.label}` }))}
                value={rangeKey}
                onChange={setRangeKey}
                style={{ marginBottom: 16 }}
              />

              <ChartCard
                title="Cycle length"
                color={chartColor("cycle", isDark)}
                value={cycles.length ? String(cycles[cycles.length - 1].length) : null}
                unit="days"
                caption={cycleSentence}
                list={[...cycles].reverse().map((c) => ({ label: monthLabel(c.month), value: `${c.length} days` }))}
                empty="Log two or more periods to see how long your cycles are."
              >
                {cycles.length ? (
                  <BarSeries
                    bars={cycles.map((c) => ({
                      label: monthLabel(c.month),
                      value: c.length,
                      detail: `${monthLong(c.month)} cycle`,
                      note: outside(c.length) ? `Outside the typical ${TYPICAL.min}–${TYPICAL.max} days` : `In the typical ${TYPICAL.min}–${TYPICAL.max} days`,
                    }))}
                    color={chartColor("cycle", isDark)}
                    unit="days"
                    band={{ min: TYPICAL.min, max: TYPICAL.max, label: `typical ${TYPICAL.min}–${TYPICAL.max}` }}
                  />
                ) : null}
              </ChartCard>

              <ChartCard
                title="Weight"
                color={chartColor("weight", isDark)}
                value={weight ? weight.latest.value.toFixed(1) : null}
                unit="kg"
                caption={weight ? trendSentence(weight.change, "kg", 1) : ""}
                list={listOf(series.weight, (v) => `${v.toFixed(1)} kg`)}
                empty={`No weight logged in the ${rangeLabel}. Add it in a day log.`}
              >
                {series.weight.length > 1 ? (
                  <TrendLine title="Weight" points={series.weight} color={chartColor("weight", isDark)} unit="kg" minSpan={2} />
                ) : null}
              </ChartCard>

              <ChartCard
                title="Basal body temperature"
                color={chartColor("temperature", isDark)}
                value={temp ? temp.latest.value.toFixed(2) : null}
                unit="°C"
                caption={temp ? "Your latest reading. It usually rises 0.2–0.5 °C after ovulation and stays up until your period." : ""}
                list={listOf(series.temperature, (v) => `${v.toFixed(2)} °C`)}
                empty={`No temperature logged in the ${rangeLabel}. Take it on waking and add it in a day log.`}
              >
                {series.temperature.length > 1 ? (
                  <TrendLine title="Temperature" points={series.temperature} color={chartColor("temperature", isDark)} unit="°C" decimals={2} minSpan={0.6} />
                ) : null}
              </ChartCard>

              <ChartCard
                title="Water"
                color={chartColor("water", isDark)}
                value={water ? Math.round(water.avg).toLocaleString("en-IN") : null}
                unit="ml a day"
                caption={water ? `On average, from ${water.count} day${water.count === 1 ? "" : "s"} you logged in the ${rangeLabel}.` : ""}
                list={listOf(series.water, (v) => `${Math.round(v).toLocaleString("en-IN")} ml`)}
                empty={`No water logged in the ${rangeLabel}. Add it in a day log.`}
              >
                {series.water.length ? (
                  <BarSeries
                    bars={toBars(series.water)}
                    color={chartColor("water", isDark)}
                    unit="ml"
                    average={water?.avg}
                    labelEvery={days > 30 ? 3 : 7}
                  />
                ) : null}
              </ChartCard>

              <ChartCard
                title="Sleep"
                color={chartColor("sleep", isDark)}
                value={sleep ? sleep.avg.toFixed(1) : null}
                unit="hrs a night"
                caption={sleep ? `On average, from ${sleep.count} night${sleep.count === 1 ? "" : "s"} you logged in the ${rangeLabel}.` : ""}
                list={listOf(series.sleep, (v) => `${v.toFixed(1)} hrs`)}
                empty={`No sleep logged in the ${rangeLabel}. Add it in a day log.`}
              >
                {series.sleep.length ? (
                  <BarSeries
                    bars={toBars(series.sleep)}
                    color={chartColor("sleep", isDark)}
                    unit="hrs"
                    average={sleep?.avg}
                    formatValue={(v) => v.toFixed(1)}
                    labelEvery={days > 30 ? 3 : 7}
                  />
                ) : null}
              </ChartCard>

              <SectionHeader title="Reports" style={{ marginTop: 14, marginBottom: 12 }} />
              <ReportRow
                icon="water-outline"
                iconBg={colors.roseLight}
                iconColor={colors.rose}
                title="Symptom report"
                subtitle="Your symptoms and moods, counted."
                trailing={<Icon set="feather" name="chevron-right" size={18} color={colors.mutedText} />}
                onPress={() => router.push("/symptom-report")}
              />
              <ReportRow
                icon="document-text-outline"
                iconBg={colors.dangerLight}
                iconColor={colors.danger}
                title="Download doctor report"
                subtitle="A PDF to share with your doctor."
                trailing={<Icon set="feather" name="download" size={18} color={colors.mutedText} />}
                onPress={() => router.push({ pathname: "/documents", params: { openReport: "1" } })}
              />
            </ScrollView>
          ) : null}
        </LoadingErrorState>
      </SafeAreaView>
    </>
  );
}
