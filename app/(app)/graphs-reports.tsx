import { Ionicons } from "@expo/vector-icons";
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
import { cycleApi, isNetworkError, reportApi, type DayEntry, type HealthReportCycleStats, type Predictions } from "../../lib/api";
import { dateFromDayKey, formatShortDate, getDateKey, getMonthKey } from "../../lib/format";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { Icon } from "../../components/Icon";

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

  // Each part may fail on its own, but a network error on predictions means
  // nothing here is real: throw so the screen shows the offline state instead
  // of default numbers (28-day cycle, day 1).
  const [predictions, monthsLogs, report] = await Promise.all([
    cycleApi.getPredictions().catch<Predictions | null>((error) => {
      if (isNetworkError(error)) throw error;
      return null;
    }),
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

type CardTint = { light: string; accent: string; text: string };

function StatCard({
  title,
  tint,
  icon,
  children,
}: {
  title: string;
  tint: CardTint;
  icon: (props: { size: number; color: string }) => React.ReactNode;
  children: React.ReactNode;
}) {
  const { colors, isDark, fonts } = useTheme();

  return (
    <View
      style={{
        borderRadius: 24,
        marginBottom: 14,
        backgroundColor: colors.surface,
        borderWidth: 1.5,
        // Accent-tinted border so each card reads as its own colour, in dark
        // mode too (where the pale *Light washes are nearly invisible).
        borderColor: `${tint.accent}${isDark ? "59" : "47"}`,
        ...getShadow(colors, isDark),
        shadowOpacity: isDark ? 0.4 : 0.1,
        elevation: 4,
      }}
    >
      <LinearGradient
        colors={[isDark ? `${tint.accent}33` : tint.light, colors.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 18, minHeight: 124, borderRadius: 22.5, overflow: "hidden" }}
      >
        {/* Decorative watermark icon, bottom-right — purely visual. */}
        <View pointerEvents="none" style={{ position: "absolute", right: 12, bottom: 8, opacity: isDark ? 0.12 : 0.1 }}>
          {icon({ size: 64, color: tint.accent })}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 11,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: tint.accent,
            }}
          >
            {icon({ size: 18, color: colors.surface })}
          </View>
          <Text
            numberOfLines={1}
            style={{ flexShrink: 1, color: tint.text, fontSize: 14.5, fontWeight: "800", fontFamily: fonts.heading }}
          >
            {title}
          </Text>
        </View>

        <View style={{ marginTop: 14 }}>{children}</View>
      </LinearGradient>
    </View>
  );
}

function StatValue({ value, unit, caption }: { value: string | null; unit?: string; caption: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View>
      {value != null ? (
        <Text style={{ color: colors.foreground, fontFamily: fonts.mono }}>
          <Text style={{ fontSize: 30, fontWeight: "800" }}>{value}</Text>
          {unit ? <Text style={{ fontSize: 15, fontWeight: "700", color: colors.mutedText }}>{` ${unit}`}</Text> : null}
        </Text>
      ) : (
        <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800", fontFamily: fonts.heading }}>No data yet</Text>
      )}
      <Text style={{ color: colors.mutedText, fontSize: 13, fontWeight: "600", marginTop: 2, fontFamily: fonts.body }}>
        {caption}
      </Text>
    </View>
  );
}

const CYCLE_ROW_LABELS = ["Latest", "Previous", "2 cycles ago"];

function CycleLengthBars({ values, colors, tint }: { values: number[]; colors: ThemeColors; tint: CardTint }) {
  const { isDark, fonts } = useTheme();
  if (values.length === 0) {
    return (
      <StatValue value={null} caption="Log a couple more cycles to see your trend here." />
    );
  }

  const latestFirst = [...values].reverse();
  const max = Math.max(...values, 35);
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;

  return (
    <View>
      <StatValue
        value={String(latestFirst[0])}
        unit="days"
        caption={values.length > 1 ? `Latest cycle · average ${Math.round(avg * 10) / 10} days` : "Latest cycle"}
      />
      <View style={{ gap: 9, marginTop: 14 }}>
        {latestFirst.map((value, index) => (
          <View key={`${value}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{ width: 92, color: colors.mutedText, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}
            >
              {CYCLE_ROW_LABELS[index] ?? `${index} cycles ago`}
            </Text>
            <View
              style={{
                flex: 1,
                height: 12,
                borderRadius: 999,
                overflow: "hidden",
                backgroundColor: isDark ? colors.track : colors.surface,
                borderWidth: isDark ? 0 : 1,
                borderColor: `${tint.accent}30`,
              }}
            >
              <View
                style={{
                  width: `${Math.max((value / max) * 100, 8)}%`,
                  height: "100%",
                  borderRadius: 999,
                  // Latest cycle solid; older ones lighter so "now" stands out.
                  backgroundColor: index === 0 ? tint.accent : `${tint.accent}8C`,
                }}
              />
            </View>
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ width: 40, textAlign: "right", color: colors.foreground, fontSize: 14, fontWeight: "800", fontFamily: fonts.mono }}
            >
              {value}d
            </Text>
          </View>
        ))}
      </View>
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
        <Icon set="ion" name={icon} size={22} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800", fontFamily: fonts.heading }}>
          {title}
        </Text>
        <Text style={{ color: colors.mutedText, fontSize: 12.5, marginTop: 2, fontFamily: fonts.body }}>
          {subtitle}
        </Text>
      </View>
      {trailing}
    </TouchableOpacity>
  );
}

export default function GraphsAndReportsScreen() {
  useSecureScreen("graphs-reports");
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();

  const { data, loading, refreshing, error, offline, reload } = useAsyncLoad<GraphsData>(loadGraphsData, [], {
    refreshOn: ["cycle"],
  });

  // `accent` fills shapes (icon badge, bars, border); `text` is the
  // title colour — a darker step in light mode so it clears contrast on the
  // pale tint wash (accent/rose alone sit near 3:1 there).
  const cardTints = useMemo(
    () => ({
      cycle: { light: colors.roseLight, accent: colors.rose, text: isDark ? colors.rose : colors.primaryDark },
      weight: { light: colors.successLight, accent: colors.success, text: colors.success },
      bbt: { light: colors.warningLight, accent: colors.warning, text: colors.warning },
      water: { light: colors.skyLight, accent: colors.sky, text: colors.sky },
      sleep: { light: colors.lavenderLight, accent: colors.secondary, text: colors.info },
    }),
    [colors, isDark],
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
                  icon={(p) => <Icon set="mci" name="calendar-sync-outline" {...p} />}
                >
                  <CycleLengthBars values={data.cycleLengths} colors={colors} tint={cardTints.cycle} />
                </StatCard>

                <StatCard
                  title="Weight"
                  tint={cardTints.weight}
                  icon={(p) => <Icon set="mci" name="scale-bathroom" {...p} />}
                >
                  <StatValue
                    value={data.latestWeight ? String(data.latestWeight.value) : null}
                    unit="kg"
                    caption={data.latestWeight ? `Last logged ${formatShortDate(dateFromDayKey(data.latestWeight.dateKey))}` : "Log your weight in a day entry"}
                  />
                </StatCard>

                <StatCard
                  title="Basal body temperature"
                  tint={cardTints.bbt}
                  icon={(p) => <Icon set="mci" name="thermometer" {...p} />}
                >
                  <StatValue
                    value={data.latestTemperature ? String(data.latestTemperature.value) : null}
                    unit="°C"
                    caption={data.latestTemperature ? `Last logged ${formatShortDate(dateFromDayKey(data.latestTemperature.dateKey))}` : "Log BBT in a day entry"}
                  />
                </StatCard>

                <StatCard
                  title="Water intake"
                  tint={cardTints.water}
                  icon={(p) => <Icon set="ion" name="water" {...p} />}
                >
                  <StatValue
                    value={avgWater != null ? String(Math.round(avgWater)) : null}
                    unit="ml"
                    caption={avgWater != null ? "90-day daily average" : "Log water intake in a day entry"}
                  />
                </StatCard>

                <StatCard
                  title="Sleep"
                  tint={cardTints.sleep}
                  icon={(p) => <Icon set="ion" name="moon" {...p} />}
                >
                  <StatValue
                    value={avgSleep != null ? avgSleep.toFixed(1) : null}
                    unit="hrs"
                    caption={avgSleep != null ? "90-day nightly average" : "Log sleep hours in a day entry"}
                  />
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
                  trailing={<Icon set="feather" name="chevron-right" size={18} color={colors.mutedText} />}
                  onPress={() => router.push("/symptom-report")}
                />

                <ReportRow
                  icon="document-text-outline"
                  iconBg={colors.dangerLight}
                  iconColor={colors.danger}
                  title="Download doctor report"
                  subtitle="Understand your cycle and health."
                  trailing={<Icon set="feather" name="download" size={18} color={colors.mutedText} />}
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
