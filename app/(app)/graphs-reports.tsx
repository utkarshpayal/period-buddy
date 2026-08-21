import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { useTheme, type ThemeColors } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { cycleApi, reportApi, type DayEntry, type HealthReportCycleStats, type Predictions } from "../../lib/api";

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

type GraphsData = {
  cycleLengths: number[];
  cycleLength: number;
  currentCycleDay: number;
  latestWeight?: { value: number; dateKey: string };
  latestTemperature?: { value: number; dateKey: string };
  report: HealthReportCycleStats | null;
};

async function loadGraphsData(): Promise<GraphsData> {
  const today = new Date();
  const rangeStart = new Date(today);
  rangeStart.setDate(rangeStart.getDate() - 90);

  const [predictions, monthsLogs, report] = await Promise.all([
    cycleApi.getPredictions().catch<Predictions | null>(() => null),
    Promise.all(
      [0, 1, 2].map((offset) => {
        const d = new Date(today.getFullYear(), today.getMonth() - offset, 1);
        return cycleApi.getMonthLogs(getMonthKey(d)).catch<DayEntry[]>(() => []);
      }),
    ),
    reportApi
      .getHealthReport({ startDate: getDateKey(rangeStart), endDate: getDateKey(today) })
      .then((res) => res.cycle)
      .catch<HealthReportCycleStats | null>(() => null),
  ]);

  const allLogs = monthsLogs.flat().sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));

  const cycleLengths = (predictions?.analyticsData ?? [])
    .map((entry) => entry.length)
    .filter((length): length is number => Boolean(length) && length > 0)
    .slice(-3);

  const latestWeightEntry = [...allLogs].reverse().find((log) => typeof log.weight === "number");
  const latestTempEntry = [...allLogs].reverse().find((log) => typeof log.temperature === "number");

  return {
    cycleLengths,
    cycleLength: predictions?.cycleLength ?? 28,
    currentCycleDay: predictions?.currentCycleDay ?? 1,
    latestWeight: latestWeightEntry
      ? { value: latestWeightEntry.weight as number, dateKey: latestWeightEntry.dateKey }
      : undefined,
    latestTemperature: latestTempEntry
      ? { value: latestTempEntry.temperature as number, dateKey: latestTempEntry.dateKey }
      : undefined,
    report,
  };
}

function StatCard({
  title,
  tint,
  icon,
  onPress,
  children,
}: {
  title: string;
  tint: { from: string; to: string; accent: string };
  icon: React.ReactNode;
  onPress?: () => void;
  children: React.ReactNode;
}) {
  const { colors, isDark, fonts } = useTheme();
  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      activeOpacity={0.88}
      onPress={onPress}
      style={{ borderRadius: 26, overflow: "hidden", marginBottom: 14, ...getShadow(colors, isDark) }}
    >
      <LinearGradient
        colors={[tint.from, tint.to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 20, minHeight: 118 }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <Text
            style={{ color: tint.accent, fontSize: 12.5, fontWeight: "800", fontFamily: fonts.heading }}
          >
            {title}
          </Text>
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.55)",
            }}
          >
            <Feather name="arrow-up-right" size={14} color={tint.accent} />
          </View>
        </View>

        <View style={{ marginTop: 10 }}>{children}</View>

        {/* Decorative watermark icon, bottom-right — purely visual, matches the
            reference app's illustrated stat cards. */}
        <View style={{ position: "absolute", right: 14, bottom: 10, opacity: 0.28 }}>{icon}</View>
      </LinearGradient>
    </Wrapper>
  );
}

function CycleLengthBars({
  values,
  colors,
  fonts,
  accent,
}: {
  values: number[];
  colors: ThemeColors;
  fonts: { mono: string };
  accent: string;
}) {
  if (values.length === 0) {
    return (
      <Text style={{ color: accent, fontSize: 12, fontWeight: "600", opacity: 0.85 }}>
        Log a couple more cycles to see your trend here.
      </Text>
    );
  }

  const max = Math.max(...values, 20);

  return (
    <View style={{ gap: 8, width: "78%" }}>
      {values.map((value, index) => {
        const widthPct = Math.max((value / max) * 100, 22);
        // Most recent cycle reads fully opaque; older ones fade slightly —
        // draws the eye to "now" without needing separate labels.
        const opacity = 1 - (values.length - 1 - index) * 0.22;
        return (
          <View
            key={`${value}-${index}`}
            style={{
              alignSelf: "flex-start",
              minWidth: 74,
              width: `${widthPct}%`,
              borderRadius: 999,
              paddingVertical: 6,
              paddingHorizontal: 12,
              backgroundColor: "rgba(255,255,255,0.62)",
              opacity: Math.max(opacity, 0.45),
            }}
          >
            <Text style={{ color: accent, fontSize: 12, fontWeight: "800", fontFamily: fonts.mono }}>
              {value} days
            </Text>
          </View>
        );
      })}
    </View>
  );
}

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
        borderRadius: 20,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 12,
        ...getShadow(colors, isDark),
      }}
    >
      <View
        style={{ width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: iconBg }}
      >
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800", fontFamily: fonts.heading }}>
          {title}
        </Text>
        <Text style={{ color: colors.mutedText, fontSize: 11.5, marginTop: 2, fontFamily: fonts.body }}>
          {subtitle}
        </Text>
      </View>
      {trailing}
    </TouchableOpacity>
  );
}

export default function GraphsAndReportsScreen() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();

  const { data, loading, refreshing, error, offline, reload } = useAsyncLoad<GraphsData>(loadGraphsData, []);

  const cardTints = useMemo(
    () => ({
      cycle: { from: colors.roseLight, to: colors.surface, accent: colors.rose },
      weight: { from: colors.successLight, to: colors.surface, accent: colors.success },
      bbt: { from: colors.warningLight, to: colors.surface, accent: colors.warning },
      water: { from: colors.skyLight, to: colors.surface, accent: colors.sky },
      sleep: { from: colors.accentLight, to: colors.surface, accent: colors.accent },
    }),
    [colors],
  );

  const avgSleep = data?.report?.averages.sleepHours;
  const avgWater = data?.report?.averages.waterIntake;

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
              <SkeletonCard />
            </View>
          }
        >
          {data ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 60 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />
              }
            >
              <View style={{ paddingHorizontal: 24, paddingTop: 18 }}>
                <StatCard
                  title="Cycle length"
                  tint={cardTints.cycle}
                  icon={<MaterialCommunityIcons name="calendar-sync-outline" size={54} color={cardTints.cycle.accent} />}
                >
                  <CycleLengthBars
                    values={data.cycleLengths}
                    colors={colors}
                    fonts={fonts}
                    accent={cardTints.cycle.accent}
                  />
                </StatCard>

                <StatCard
                  title="Weight"
                  tint={cardTints.weight}
                  icon={<MaterialCommunityIcons name="scale-bathroom" size={52} color={cardTints.weight.accent} />}
                >
                  <Text style={{ color: cardTints.weight.accent, fontSize: 22, fontWeight: "900", fontFamily: fonts.mono }}>
                    {data.latestWeight ? `${data.latestWeight.value} kg` : "No data yet"}
                  </Text>
                  <Text style={{ color: cardTints.weight.accent, fontSize: 11, marginTop: 2, opacity: 0.8, fontFamily: fonts.body }}>
                    {data.latestWeight ? `Last logged ${data.latestWeight.dateKey}` : "Log your weight in a day entry"}
                  </Text>
                </StatCard>

                <StatCard
                  title="Basal body temperature"
                  tint={cardTints.bbt}
                  icon={<MaterialCommunityIcons name="thermometer" size={54} color={cardTints.bbt.accent} />}
                >
                  <Text style={{ color: cardTints.bbt.accent, fontSize: 22, fontWeight: "900", fontFamily: fonts.mono }}>
                    {data.latestTemperature ? `${data.latestTemperature.value}°C` : "No data yet"}
                  </Text>
                  <Text style={{ color: cardTints.bbt.accent, fontSize: 11, marginTop: 2, opacity: 0.8, fontFamily: fonts.body }}>
                    {data.latestTemperature ? `Last logged ${data.latestTemperature.dateKey}` : "Log BBT in a day entry"}
                  </Text>
                </StatCard>

                <StatCard
                  title="Water intake"
                  tint={cardTints.water}
                  icon={<Ionicons name="water" size={50} color={cardTints.water.accent} />}
                >
                  <Text style={{ color: cardTints.water.accent, fontSize: 22, fontWeight: "900", fontFamily: fonts.mono }}>
                    {avgWater ? `${Math.round(avgWater)} ml` : "No data yet"}
                  </Text>
                  <Text style={{ color: cardTints.water.accent, fontSize: 11, marginTop: 2, opacity: 0.8, fontFamily: fonts.body }}>
                    {avgWater ? "90-day daily average" : "Log water intake in a day entry"}
                  </Text>
                </StatCard>

                <StatCard
                  title="Sleep"
                  tint={cardTints.sleep}
                  icon={<Ionicons name="moon" size={50} color={cardTints.sleep.accent} />}
                >
                  <Text style={{ color: cardTints.sleep.accent, fontSize: 22, fontWeight: "900", fontFamily: fonts.mono }}>
                    {avgSleep ? `${avgSleep.toFixed(1)} hrs` : "No data yet"}
                  </Text>
                  <Text style={{ color: cardTints.sleep.accent, fontSize: 11, marginTop: 2, opacity: 0.8, fontFamily: fonts.body }}>
                    {avgSleep ? "90-day nightly average" : "Log sleep hours in a day entry"}
                  </Text>
                </StatCard>

                <Text
                  style={{ color: colors.foreground, fontSize: 15, fontWeight: "900", marginTop: 8, marginBottom: 12, fontFamily: fonts.heading }}
                >
                  Reports
                </Text>

                <ReportRow
                  icon="water-outline"
                  iconBg={colors.roseLight}
                  iconColor={colors.rose}
                  title="Symptom report"
                  subtitle="Review your symptoms and cycle."
                  trailing={<Feather name="chevron-right" size={18} color={colors.mutedText} />}
                  onPress={() => router.push("/symptom-report")}
                />

                <ReportRow
                  icon="document-text-outline"
                  iconBg={colors.dangerLight}
                  iconColor={colors.danger}
                  title="Download doctor report"
                  subtitle="Understand your cycle and health."
                  trailing={<Feather name="download" size={18} color={colors.mutedText} />}
                  onPress={() => router.push({ pathname: "/documents", params: { openReport: "1" } })}
                />
              </View>
            </ScrollView>
          ) : null}
        </LoadingErrorState>
      </SafeAreaView>
    </>
  );
}
