import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { useAuth } from "../../../components/auth-context";
import { useTheme } from "../../../components/theme";
import { getShadow } from "../../../components/ui-tokens";
import {
  authApi,
  cycleApi,
  type DashboardSummary,
  type Predictions,
} from "../../../lib/api";

type AnalyticsBar = {
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
  entries: Predictions["analyticsData"] = [],
): AnalyticsBar[] {
  const cleanEntries = entries
    .filter((entry) => entry.month)
    .slice(-5)
    .map((entry) => {
      const monthIndex = parseMonthIndex(entry.month);

      return {
        length: entry.length,
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
      length: entry?.length ?? 0,
      month,
    };
  });
}

// Mirrors the backend's getCyclePhase (src/utils/cycle.js) so the fallback
// (used only before predictions load) scales with the user's actual cycle
// length instead of the fixed 28-day 11/16-day thresholds.
function getCyclePhase(cycleDay: number, periodLength = 5, cycleLength = 28) {
  if (cycleDay <= periodLength) return "Menstrual";
  const ovulationDay = Math.max(periodLength + 1, cycleLength - 13);
  if (cycleDay < ovulationDay - 5) return "Follicular";
  if (cycleDay <= ovulationDay + 1) return "Ovulatory";
  return "Luteal";
}

const PHASE_LABELS: Record<string, string> = {
  period: "Menstrual",
  follicular: "Follicular",
  ovulation: "Ovulatory",
  luteal: "Luteal",
};

export default function Home() {
  const { colors, isDark, fonts } = useTheme();
  const { user, updateUser } = useAuth();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [predictions, setPredictions] = useState<Predictions | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      try {
        const [dashboardSummary, cyclePredictions] = await Promise.all([
          authApi.getDashboard(),
          cycleApi.getPredictions(),
        ]);

        if (isMounted) {
          setDashboard(dashboardSummary);
          setPredictions(cyclePredictions);
          if (dashboardSummary.user) {
            updateUser(dashboardSummary.user);
          }
        }
      } catch {
        if (isMounted) {
          setDashboard(null);
          setPredictions(null);
        }
      } finally {
        if (isMounted) setIsDashboardLoading(false);
      }
    }

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [updateUser]);

  // These must reflect the signed-in account's real data only — never a
  // locally-cached demo/fallback number, which would silently show a
  // previous (or nonexistent) account's stats on this device/browser.
  const loggedDays = Math.max(dashboard?.trackedDays ?? 0, 0);
  const dashboardTokens = dashboard?.tokens ?? 0;
  const cycleDay = Math.max(
    predictions?.currentCycleDay ??
    dashboard?.predictions?.currentCycleDay ??
    (loggedDays || 1),
    1,
  );
  const expectedEndDate =
    predictions?.nextPeriodDate ??
    dashboard?.predictions?.nextPeriodDate ??
    "soon";
  const periodLength = predictions?.periodLength ?? 5;
  const fertileWindow = predictions?.fertileWindowDuration ?? "6 days";
  // Prefer the backend's authoritative phase (already computed from real
  // settings/logs); only fall back to a local estimate before it loads.
  const phaseLabel =
    (predictions?.currentPhase && PHASE_LABELS[predictions.currentPhase]) ??
    getCyclePhase(cycleDay, periodLength, predictions?.cycleLength ?? 28);

  const analyticGraphData = useMemo(
    () => buildFiveMonthAnalytics(predictions?.analyticsData),
    [predictions?.analyticsData],
  );
  const maxBarLength = Math.max(
    ...analyticGraphData.map((item) => item.length),
    predictions?.cycleLength ?? 28,
    28,
  );

  const treeHealth =
    dashboard?.forestHealth ?? Math.min(100, Math.max(45, 55 + loggedDays * 6));

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        {/* FIXED HEADER - stays in place while body scrolls */}
        <View
          className="px-6 pt-3 pb-2.5 flex-row justify-between items-center"
          style={{ backgroundColor: colors.background }}
        >
          <View className="flex-1 mr-4">
            <Text
              className="font-black tracking-tight"
              style={{ fontSize: 17, color: colors.foreground, fontFamily: fonts.heading }}
              numberOfLines={1}
            >
              {isDark ? "Good evening, " : "Good morning, "}
              {user?.firstName || "Utkarsh"} 👋
            </Text>
            {/* <Text
              className="mt-0.5"
              style={{ fontSize: 11.5, color: colors.mutedText, fontFamily: fonts.body }}
              numberOfLines={1}
            >
              Day {cycleDay} · {phaseLabel} phase ·{" "}
              {predictions?.nextPeriodDaysAway !== undefined
                ? predictions.nextPeriodDaysAway
                : Math.max(1, 28 - cycleDay)}{" "}
              days to period
            </Text> */}
          </View>

          <View className="flex-row items-center gap-2">
            <View
              className="flex-row items-center rounded-full"
              style={{
                backgroundColor: isDark ? colors.primaryLight : colors.primaryLight,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Ionicons name="flame" size={12} color={colors.primary} style={{ marginRight: 5 }} />
              <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary, fontFamily: fonts.body }}>
                {dashboard?.user?.streakCount ?? user?.streakCount ?? 1}d
              </Text>
            </View>

            <View
              className="flex-row items-center rounded-full border"
              style={{ backgroundColor: colors.surface, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Ionicons name="trophy" size={12} color={colors.primary} style={{ marginRight: 5 }} />
              <Text style={{ fontSize: 11, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}>
                {isDashboardLoading ? "…" : dashboardTokens}
              </Text>
            </View>
          </View>
        </View>

        {/* SCROLLABLE BODY */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
        >
          {/* TODAY'S PHASE CARD */}
          <View className="mx-6 mb-3.5 mt-2">
            <View
              className="p-5 border"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: 24,
                ...getShadow(colors, isDark),
              }}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "800",
                      color: colors.primary,
                      letterSpacing: 0.6,
                      fontFamily: fonts.body,
                      textTransform: "uppercase",
                    }}
                  >
                    Today · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
                  </Text>
                  <Text
                    className="mt-1"
                    style={{
                      fontSize: 20,
                      fontWeight: "800",
                      color: colors.foreground,
                      fontFamily: fonts.heading,
                    }}
                  >
                    Day {cycleDay} · {phaseLabel} phase
                  </Text>
                  <Text
                    className="mt-1"
                    style={{ fontSize: 11, color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    Expected period: {expectedEndDate !== "soon" ? new Date(expectedEndDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "soon"} · Fertile window: {fertileWindow}
                  </Text>
                </View>
                <View
                  style={{
                    width: 38, height: 38, borderRadius: 11,
                    backgroundColor: colors.primaryLight,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Ionicons name="water" size={17} color={colors.primary} />
                </View>
              </View>
            </View>
          </View>

          {/* CYCLE HEALTH STAT CARD */}
          <View className="mx-6 mb-3.5">
            <View className="border p-5" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24, ...getShadow(colors, isDark) }}>
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-4">
                  <Text style={{ fontSize: 10, fontWeight: "800", color: colors.primary, letterSpacing: 0.6, fontFamily: fonts.body, textTransform: "uppercase" }}>
                    CYCLE HEALTH
                  </Text>
                  <View className="flex-row items-baseline mt-1" style={{ gap: 6 }}>
                    <Text style={{ fontSize: 24, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                      {treeHealth}
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: treeHealth > 75 ? colors.success : treeHealth > 50 ? colors.primary : colors.warning, fontFamily: fonts.body }}>
                      {treeHealth > 75 ? "Great" : treeHealth > 50 ? "Healthy" : "Needs Logging"}
                    </Text>
                  </View>
                </View>

                <View style={{ position: "relative", width: 56, height: 56 }}>
                  <Svg width={56} height={56} viewBox="0 0 64 64">
                    <Circle cx="32" cy="32" r="27" fill="none" stroke={isDark ? colors.surfaceStrong : "#E3E7ED"} strokeWidth={6} />
                    <Circle cx="32" cy="32" r="27" fill="none" stroke={colors.primary} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${(treeHealth / 100) * 170} 170`} transform="rotate(-90 32 32)" />
                  </Svg>
                  <View style={{ position: "absolute", inset: 0, justifyContent: "center", alignItems: "center" }}>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground, fontFamily: fonts.mono }}>
                      {treeHealth}%
                    </Text>
                  </View>
                </View>
              </View>

              <View className="my-4 h-[1px] w-full" style={{ backgroundColor: colors.border }} />

              <View className="flex-row justify-between items-center">
                {[
                  { value: loggedDays, label: "Days logged" },
                  { value: periodLength || 5, label: "Period length" },
                  { value: typeof fertileWindow === "number" ? fertileWindow : 6, label: "Fertile window" },
                ].map((stat, i) => (
                  <View key={i} className="flex-1 items-center">
                    <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, fontFamily: fonts.mono }}>
                      {stat.value}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.mutedText, fontFamily: fonts.body, marginTop: 2, textAlign: "center" }}>
                      {stat.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* CYCLE LENGTH TREND — ALWAYS VISIBLE */}
          <View className="mx-6 mb-3.5">
            <View className="border p-5" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24, ...getShadow(colors, isDark) }}>
              <View className="flex-row justify-between items-center mb-5">
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                  Cycle length trend
                </Text>
                <Text style={{ fontSize: 11.5, color: colors.mutedText, fontFamily: fonts.body }}>
                  Avg {predictions?.cycleLength ?? 28} days
                </Text>
              </View>

              <View className="flex-row justify-around items-end" style={{ height: 120 }}>
                {analyticGraphData.map((data, idx) => {
                  const barHeight = Math.max(12, (data.length / maxBarLength) * 80);
                  const isLatest = idx === analyticGraphData.length - 1;
                  return (
                    <View key={`${data.month}-${idx}`} className="items-center" style={{ width: 44 }}>
                      <Text style={{ fontSize: 9.5, fontWeight: "600", color: isLatest ? colors.primary : colors.mutedText, fontFamily: fonts.mono, marginBottom: 6 }}>
                        {data.length > 0 ? `${data.length}d` : "—"}
                      </Text>
                      <View style={{ height: 80, width: 14, backgroundColor: isDark ? colors.surfaceStrong : "#E8EDF3", borderRadius: 99, justifyContent: "flex-end", overflow: "hidden" }}>
                        <View style={{ height: barHeight, width: "100%", backgroundColor: colors.primary, opacity: isLatest ? 1 : 0.5, borderRadius: 99 }} />
                      </View>
                      <Text style={{ fontSize: 10, fontWeight: "600", color: isLatest ? colors.foreground : colors.mutedText, fontFamily: fonts.body, marginTop: 8 }}>
                        {data.month}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          {/* YOUR CARE LIST */}
          <View className="mx-6 mb-6">
            <Text className="mb-2.5" style={{ fontSize: 14.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
              Your care
            </Text>

            <View style={{ gap: 9 }}>
              {[
                { title: "Smart Predictions", desc: "Cycle forecasts, windows, and trends", icon: "trending-up-outline", route: "/(app)/predictions" },
                { title: "Gynecologist Consultation", desc: "Private specialist booking, secure chat", icon: "chatbubbles-outline", route: "/(app)/consultation" },
              ].map((careItem, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => router.push(careItem.route as any)}
                  activeOpacity={0.7}
                  className="flex-row items-center border"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, padding: 13 }}
                >
                  <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                    <Ionicons name={careItem.icon as any} size={17} color={colors.primary} />
                  </View>
                  <View className="flex-1">
                    <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}>{careItem.title}</Text>
                    <Text style={{ fontSize: 11, color: colors.mutedText, marginTop: 1, fontFamily: fonts.body }}>{careItem.desc}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.mutedText} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* WELLNESS & SUPPORT GRID */}
          <View className="mx-6 mb-6">
            <Text className="mb-2.5" style={{ fontSize: 14.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
              Wellness & support
            </Text>

            <View className="flex-row flex-wrap justify-between" style={{ gap: 10 }}>
              {[
                { title: "Health Concerns", desc: "Irregularities & symptoms", icon: "alert-circle-outline", route: "/(app)/health-issues" },
                { title: "Anonymous Q&A", desc: "Ask privately, expert-answered", icon: "help-circle-outline", route: "/(app)/qa" },
                { title: "Hygiene & Care", desc: "Product guidance & comfort", icon: "leaf-outline", route: "/(app)/hygiene" },
                { title: "Sexual Wellbeing", desc: "Consent, intimacy & safety", icon: "heart-outline", route: "/(app)/sexual-wellbeing" },
              ].map((wellness, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => router.push(wellness.route as any)}
                  activeOpacity={0.7}
                  className="border"
                  style={{ width: "48%", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, padding: 12 }}
                >
                  <View style={{ alignSelf: "flex-start", padding: 8, borderRadius: 10, backgroundColor: colors.primaryLight, marginBottom: 10 }}>
                    <Ionicons name={wellness.icon as any} size={16} color={colors.primary} />
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}>{wellness.title}</Text>
                  <Text style={{ fontSize: 10, color: colors.mutedText, marginTop: 2, fontFamily: fonts.body }} numberOfLines={1}>{wellness.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* EXPLORE GRID */}
          <View className="mx-6 mb-8">
            <Text className="mb-2.5" style={{ fontSize: 14.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
              Explore
            </Text>

            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              {[
                { title: "Forest", icon: "leaf-outline", route: "/(app)/forest", color: colors.success, bg: colors.successLight },
                { title: "Blogs", icon: "book-outline", route: "/(app)/blogs", color: colors.info, bg: colors.infoLight },
                { title: "Videos", icon: "play-circle-outline", route: "/(app)/reels", color: colors.primary, bg: colors.primaryLight },
                { title: "Partner sync", icon: "git-merge-outline", route: "/(app)/partner", color: colors.accent, bg: colors.accentLight },
                { title: "Habits", icon: "checkmark-done-outline", route: "/(app)/habits", color: colors.success, bg: colors.successLight },
                { title: "Nominate Buddy", icon: "star-outline", route: "/(app)/buddy-nomination", color: colors.accent, bg: colors.accentLight },
              ].map((exp, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => router.push(exp.route as any)}
                  activeOpacity={0.8}
                  className="border items-center justify-center"
                  style={{ width: "31%", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8 }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 11,
                      backgroundColor: exp.bg,
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 8,
                    }}
                  >
                    <Ionicons name={exp.icon as any} size={17} color={exp.color} />
                  </View>
                  <Text style={{ fontSize: 10.5, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }} numberOfLines={1}>
                    {exp.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

