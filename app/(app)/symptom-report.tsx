import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StatusBar, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { chartColor } from "../../components/charts/chartColors";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SkeletonCard } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getShadow, MOOD_OPTIONS, withAlpha } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { useTodayKey } from "../../hooks/useTodayKey";
import { cycleApi } from "../../lib/api";
import { buildSymptomReport, mainFlow, type Count, type FlowKey } from "../../lib/symptomReport";
import { shiftKey } from "../../lib/chartData";
import { useSecureScreen } from "../../lib/screenPrivacy";

/**
 * Symptom Report (Graphs & Reports → Symptom report): what you logged, how
 * often. Counted on the phone from the day logs (lib/symptomReport.ts), no AI
 * call. One 30/90-day filter, three summary numbers, then symptoms, moods and
 * flow, each with a plain sentence first. When symptoms happen is Symptom
 * Trends' job (linked at the bottom), and sleep/water live on Graphs & Reports,
 * so neither is repeated here.
 */

const RANGES = [
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
] as const;
const MOOD_LABELS = new Map(MOOD_OPTIONS.map((m) => [m.value as string, m.label]));
const FLOW_ORDER: FlowKey[] = ["spotting", "light", "medium", "heavy"];
const FLOW_LABEL: Record<FlowKey, string> = { spotting: "Spotting", light: "Light", medium: "Medium", heavy: "Heavy" };
/** Light → deep, one hue (heavier flow, deeper colour). */
const FLOW_RAMP_LIGHT = ["#F7C6D7", "#EE8DB0", "#D9487E", "#A82457"];
const FLOW_RAMP_DARK = ["#5A2B42", "#8C3359", "#C2426F", "#F07DA6"];
const TOP_N = 6;

async function loadLogs(todayKey: string) {
  const year = Number(todayKey.slice(0, 4));
  const earliest = Number(shiftKey(todayKey, -90).slice(0, 4));
  const years = earliest < year ? [earliest, year] : [year];
  return (await Promise.all(years.map((y) => cycleApi.getYearLogs(y)))).flat();
}

export default function SymptomReportScreen() {
  useSecureScreen("symptom-report");
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const todayKey = useTodayKey();
  const [rangeKey, setRangeKey] = useState<"30" | "90">("30");
  const days = RANGES.find((r) => r.key === rangeKey)!.days;
  const { data: logs, loading, refreshing, error, offline, reload } = useAsyncLoad(() => loadLogs(todayKey), [todayKey], { refreshOn: ["cycle"] });
  const report = useMemo(
    () => buildSymptomReport(logs ?? [], todayKey, days, (v) => MOOD_LABELS.get(v) ?? v),
    [logs, todayKey, days],
  );
  const flowMain = mainFlow(report.flow);
  const flowRamp = isDark ? FLOW_RAMP_DARK : FLOW_RAMP_LIGHT;
  const card = { backgroundColor: colors.surface, borderRadius: 24, borderCurve: "continuous" as const, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 14, ...getShadow(colors, isDark) };
  const titleStyle = { fontSize: 17, fontWeight: "800" as const, color: colors.text, fontFamily: fonts.heading };
  const sentence = { fontSize: 14.5, lineHeight: 21, color: colors.text, fontFamily: fonts.body, marginTop: 6, marginBottom: 14 };

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Symptom Report" />
        <LoadingErrorState
          loading={loading}
          error={error}
          offline={offline}
          onRetry={() => reload()}
          loadingLabel="Counting what you logged…"
          errorTitle="Couldn't load your report"
          skeleton={
            <View className="gap-4 px-6 pt-4">
              <SkeletonCard />
              <SkeletonCard />
            </View>
          }
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 60 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />}
          >
            <SegmentedControl
              segments={RANGES.map((r) => ({ key: r.key, label: r.label, accessibilityLabel: `The last ${r.label}` }))}
              value={rangeKey}
              onChange={setRangeKey}
              style={{ marginBottom: 14 }}
            />

            {report.daysLogged === 0 ? (
              <View style={card}>
                <EmptyState icon="clipboard-text-outline" title={`Nothing logged in the last ${days} days`} message="Log how you feel in the tracker and your report fills in here." compact />
              </View>
            ) : (
              <>
                {/* The three numbers */}
                <View style={{ ...card, flexDirection: "row", paddingVertical: 14 }}>
                  {[
                    { n: report.daysLogged, l: report.daysLogged === 1 ? "day logged" : "days logged" },
                    { n: report.periodDays, l: report.periodDays === 1 ? "period day" : "period days" },
                    { n: report.symptoms.length, l: report.symptoms.length === 1 ? "symptom" : "symptoms" },
                  ].map((s, i) => (
                    <View key={s.l} style={{ flex: 1, alignItems: "center", borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.border }}>
                      <Text style={{ fontSize: 26, fontWeight: "800", color: colors.text, fontFamily: fonts.heading, letterSpacing: -0.5 }}>{s.n}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 13.5, color: colors.mutedText, fontFamily: fonts.body }}>
                        {s.l}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Symptoms */}
                <View style={card}>
                  <Text style={titleStyle}>Symptoms</Text>
                  {report.symptoms.length ? (
                    <>
                      <Text style={sentence}>
                        <Text style={{ fontWeight: "800" }}>{report.symptoms[0].label}</Text>
                        {` was your most common, on ${report.symptoms[0].days} of the ${report.daysLogged} days you logged.`}
                      </Text>
                      <RankedBars items={report.symptoms} total={report.daysLogged} color={chartColor("cycle", isDark)} />
                    </>
                  ) : (
                    <Text style={sentence}>No symptoms logged. That&apos;s a good stretch.</Text>
                  )}
                </View>

                {/* Moods */}
                <View style={card}>
                  <Text style={titleStyle}>Moods</Text>
                  {report.moods.length ? (
                    <>
                      <Text style={sentence}>
                        {"You felt "}
                        <Text style={{ fontWeight: "800" }}>{report.moods[0].label.toLowerCase()}</Text>
                        {` most often, on ${report.moods[0].days} day${report.moods[0].days === 1 ? "" : "s"}.`}
                      </Text>
                      <RankedBars items={report.moods} total={report.daysLogged} color={chartColor("sleep", isDark)} />
                    </>
                  ) : (
                    <Text style={sentence}>No moods logged in this time.</Text>
                  )}
                </View>

                {/* Flow */}
                <View style={card}>
                  <Text style={titleStyle}>Flow</Text>
                  {report.periodDays && flowMain ? (
                    <>
                      <Text style={sentence}>
                        {`${report.periodDays} period day${report.periodDays === 1 ? "" : "s"}, mostly `}
                        <Text style={{ fontWeight: "800" }}>{FLOW_LABEL[flowMain].toLowerCase()}</Text>.
                      </Text>
                      <View style={{ flexDirection: "row", height: 14, gap: 2, borderRadius: 7, overflow: "hidden" }} accessibilityLabel={FLOW_ORDER.map((f) => `${FLOW_LABEL[f]} ${report.flow[f]} days`).join(", ")}>
                        {FLOW_ORDER.filter((f) => report.flow[f]).map((f) => (
                          <View key={f} style={{ flex: report.flow[f], backgroundColor: flowRamp[FLOW_ORDER.indexOf(f)] }} />
                        ))}
                      </View>
                      <View style={{ flexDirection: "row", marginTop: 12 }}>
                        {FLOW_ORDER.map((f, i) => (
                          <View key={f} style={{ flex: 1, gap: 2 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: flowRamp[i] }} />
                              <Text style={{ fontSize: 13.5, color: colors.mutedText, fontFamily: fonts.body }}>{FLOW_LABEL[f]}</Text>
                            </View>
                            <Text style={{ fontSize: 15, fontWeight: "800", color: colors.text, fontFamily: fonts.body }}>{`${report.flow[f]} ${report.flow[f] === 1 ? "day" : "days"}`}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  ) : (
                    <Text style={sentence}>No period logged in this time.</Text>
                  )}
                </View>

                {/* Where "when" lives */}
                <Pressable
                  onPress={() => router.push("/(app)/symptom-predictions" as never)}
                  accessibilityRole="button"
                  style={{ ...card, flexDirection: "row", alignItems: "center", gap: 12 }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(chartColor("cycle", isDark), 0.12) }}>
                    <Icon set="ion" name="pulse-outline" size={19} color={chartColor("cycle", isDark)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text, fontFamily: fonts.body }}>When do they happen?</Text>
                    <Text style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>See your symptoms across your cycle</Text>
                  </View>
                  <Icon set="feather" name="chevron-right" size={18} color={colors.mutedText} />
                </Pressable>
              </>
            )}
          </ScrollView>
        </LoadingErrorState>
      </SafeAreaView>
    </>
  );
}

/** Ranked rows: name, how many days (and the share), a thin bar. Top 6, then "Show all". */
function RankedBars({ items, total, color }: { items: Count[]; total: number; color: string }) {
  const { colors, fonts } = useTheme();
  const [all, setAll] = useState(false);
  const max = Math.max(1, ...items.map((i) => i.days));
  const shown = all ? items : items.slice(0, TOP_N);
  return (
    <View style={{ gap: 14 }}>
      {shown.map((it) => (
        <View key={it.key} accessible accessibilityLabel={`${it.label}: ${it.days} of ${total} days`}>
          <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 6 }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 14.5, fontWeight: "600", color: colors.text, fontFamily: fonts.body }}>
              {it.label}
            </Text>
            <Text style={{ fontSize: 14.5, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"], fontFamily: fonts.body }}>
              {it.days}
              <Text style={{ fontSize: 13.5, fontWeight: "600", color: colors.mutedText }}>{` ${it.days === 1 ? "day" : "days"}`}</Text>
            </Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceSoft, overflow: "hidden" }}>
            <View style={{ width: `${Math.max(4, (it.days / max) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
          </View>
        </View>
      ))}
      {items.length > TOP_N ? (
        <Pressable onPress={() => setAll((v) => !v)} accessibilityRole="button" hitSlop={8} style={{ alignSelf: "flex-start" }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primaryDark, fontFamily: fonts.body }}>{all ? "Show fewer" : `Show all ${items.length}`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
