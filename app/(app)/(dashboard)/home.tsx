import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { useAuth } from "../../../components/auth-context";
import StatCard from "../../../components/StatCard";
import { useTheme } from "../../../components/theme";
import { getHeroGradient, getShadow } from "../../../components/ui-tokens";
import { useUserStats } from "../../../hooks/useUserStats";
import {
  authApi,
  cycleApi,
  partnerApi,
  type DashboardSummary,
  type Predictions,
} from "../../../lib/api";
import { getCyclePhase } from "../../../lib/cycle";

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

function getGreeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// lib/cycle.ts's getCyclePhase returns the lowercase enum ("period" etc);
// this maps it (and the backend's identical vocabulary) to the capitalized
// label this screen displays.
const PHASE_LABELS: Record<string, string> = {
  period: "Menstrual",
  follicular: "Follicular",
  ovulation: "Ovulatory",
  luteal: "Luteal",
};

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Mirrors tracker.tsx's getCycleDay so the home week-strip's period/fertile
// dots agree with the full calendar instead of drifting from a second,
// slightly different definition.
function getCycleDayForDate(date: Date, cycleStartDate: Date, cycleLength: number) {
  const diff = Math.floor(
    (startOfDay(date).getTime() - startOfDay(cycleStartDate).getTime()) / MS_PER_DAY,
  );
  return (((diff % cycleLength) + cycleLength) % cycleLength) + 1;
}

// Builds the current Mon–Sun week (day letter + date number), plus, for each
// day, whether it falls in the period or fertile window — same thresholds
// tracker.tsx's calendar uses — so the strip reads as real cycle context
// instead of a plain date picker.
function buildCurrentWeekStrip(
  today: Date,
  cycleStartDate: Date,
  cycleLength: number,
  periodLength: number,
  ovulationDayPivot: number,
) {
  const jsDay = today.getDay(); // 0 = Sun ... 6 = Sat
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const cycleDayForDate = getCycleDayForDate(date, cycleStartDate, cycleLength);
    return {
      letter: WEEKDAY_LETTERS[i],
      dayNumber: date.getDate(),
      isToday: date.getTime() === todayStart.getTime(),
      isFuture: date.getTime() > todayStart.getTime(),
      isPeriod: cycleDayForDate <= periodLength,
      isFertile:
        cycleDayForDate >= ovulationDayPivot - 5 &&
        cycleDayForDate <= ovulationDayPivot + 1,
    };
  });
}

export default function Home() {
  const { colors, isDark, fonts } = useTheme();
  const { user, updateUser } = useAuth();
  const { streakCount, walletBalance, isLoading: isStatsLoading } = useUserStats();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [predictions, setPredictions] = useState<Predictions | null>(null);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadHome = useCallback(async () => {
    const [dashboardResult, notifsResult] = await Promise.allSettled([
      Promise.all([authApi.getDashboard(), cycleApi.getPredictions()]),
      partnerApi.getNotifications(),
    ]);

    if (dashboardResult.status === "fulfilled") {
      const [dashboardSummary, cyclePredictions] = dashboardResult.value;
      setDashboard(dashboardSummary);
      setPredictions(cyclePredictions);
      if (dashboardSummary.user) updateUser(dashboardSummary.user);
    } else {
      setDashboard(null);
      setPredictions(null);
    }

    if (notifsResult.status === "fulfilled") {
      setHasUnreadNotifications(notifsResult.value.some((n) => !n.isRead));
    }
  }, [updateUser]);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadHome();
    } finally {
      setRefreshing(false);
    }
  }, [loadHome]);

  // These must reflect the signed-in account's real data only — never a
  // locally-cached demo/fallback number, which would silently show a
  // previous (or nonexistent) account's stats on this device/browser.
  const loggedDays = Math.max(dashboard?.trackedDays ?? 0, 0);
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
    PHASE_LABELS[getCyclePhase(cycleDay, periodLength, predictions?.cycleLength ?? 28)];

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

  // Same fertile-window pivot tracker.tsx's calendar uses, so the week strip
  // below agrees with the rest of the app instead of eyeballing its own
  // definition of "fertile".
  const cycleLength = predictions?.cycleLength ?? 28;
  const ovulationDayPivot = Math.max(periodLength + 1, cycleLength - 13);
  const cycleStartDate = useMemo(
    () =>
      predictions?.currentPeriodStartDateISO
        ? new Date(predictions.currentPeriodStartDateISO)
        : addDays(new Date(), -(cycleDay - 1)),
    [predictions?.currentPeriodStartDateISO, cycleDay],
  );
  const weekStrip = useMemo(
    () =>
      buildCurrentWeekStrip(
        new Date(),
        cycleStartDate,
        cycleLength,
        periodLength,
        ovulationDayPivot,
      ),
    [cycleStartDate, cycleLength, periodLength, ovulationDayPivot],
  );
  const heroGradient = getHeroGradient(colors, isDark);
  // Cheap pure function of the current hour — recompute every render rather
  // than memoizing with an empty dep array, which would freeze it at
  // whatever greeting was correct the moment this screen first mounted.
  const greeting = getGreeting(new Date().getHours());
  const { width: screenWidth } = useWindowDimensions();
  // Leaves the next card peeking in at the right edge — the standard
  // "there's more, swipe" affordance instead of two full-width blocks
  // stacked back to back.
  const insightCardWidth = Math.min(300, screenWidth - 92);

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        {/* FIXED HEADER - stays in place while body scrolls */}
        <View
          className="px-6 pt-3 pb-2 flex-row items-center justify-between"
          style={{ backgroundColor: colors.background }}
        >
          <View className="flex-row items-center flex-1 mr-3">
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: colors.primaryLight,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 10,
              }}
            >
              <Ionicons name="happy" size={19} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text
                className="tracking-tight"
                style={{ fontSize: 16, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}
                numberOfLines={1}
              >
                {greeting}, {user?.firstName || "there"} 👋
              </Text>
              <Text
                style={{ fontSize: 12, color: colors.mutedText, fontFamily: fonts.body, marginTop: 1 }}
                numberOfLines={1}
              >
                You&apos;ve got this today
              </Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push("/(app)/notifications")}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: colors.surface,
              alignItems: "center",
              justifyContent: "center",
              ...getShadow(colors, isDark),
            }}
          >
            <Ionicons name="notifications-outline" size={18} color={colors.foreground} />
            {hasUnreadNotifications && (
              <View
                style={{
                  position: "absolute",
                  top: 8,
                  right: 9,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.danger,
                  borderWidth: 1.5,
                  borderColor: colors.surface,
                }}
              />
            )}
          </TouchableOpacity>
        </View>

        {/* SCROLLABLE BODY */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {/* STAT PILLS ROW */}
          <View className="mx-6 mt-3 mb-4 flex-row" style={{ gap: 10 }}>
            <StatCard
              variant="tile"
              icon="flame"
              iconColor={colors.primary}
              iconBg={colors.primaryLight}
              value={`${streakCount}`}
              label="day streak"
              valueColor={colors.foreground}
              labelColor={colors.mutedText}
              valueFontFamily={fonts.heading}
              labelFontFamily={fonts.body}
              backgroundColor={colors.surface}
              containerStyle={{ borderRadius: 18, ...getShadow(colors, isDark) }}
            />

            <StatCard
              variant="tile"
              icon="trophy"
              iconColor={colors.accent}
              iconBg={colors.accentLight}
              value={isStatsLoading ? "…" : `${walletBalance}`}
              label="wallet pts"
              valueColor={colors.foreground}
              labelColor={colors.mutedText}
              valueFontFamily={fonts.heading}
              labelFontFamily={fonts.body}
              backgroundColor={colors.surface}
              containerStyle={{ borderRadius: 18, ...getShadow(colors, isDark) }}
            />
          </View>

          {/* WEEK STRIP */}
          <View className="mx-6 mb-4 flex-row justify-between">
            {weekStrip.map((day, idx) => (
              <View key={idx} className="items-center" style={{ width: 34 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body, marginBottom: 6 }}>
                  {day.letter}
                </Text>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: day.isToday ? colors.primary : "transparent",
                    borderWidth: day.isFuture && !day.isToday ? 1.5 : 0,
                    borderColor: colors.primary,
                    borderStyle: day.isFuture && !day.isToday ? "dashed" : "solid",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: day.isToday ? "800" : "600",
                      color: day.isToday ? colors.buttonText : colors.foreground,
                      fontFamily: fonts.body,
                    }}
                  >
                    {day.dayNumber}
                  </Text>
                </View>
                {/* Fixed-height slot so the dot (or its absence) never
                    shifts the row — period days in rose, fertile days in
                    a soft green, matching the same thresholds as the
                    tracker's full calendar. */}
                <View style={{ height: 8, marginTop: 5, alignItems: "center", justifyContent: "center" }}>
                  {day.isPeriod ? (
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.danger }} />
                  ) : day.isFertile ? (
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.success }} />
                  ) : null}
                </View>
              </View>
            ))}
          </View>

          {/* CYCLE PHASE HERO CARD */}
          <View className="mx-6 mb-4">
            <LinearGradient
              colors={heroGradient as [string, string, ...string[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: 22,
                padding: 20,
                ...getShadow(colors, isDark),
              }}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "800",
                      color: "#fff",
                      letterSpacing: 0.8,
                      fontFamily: fonts.body,
                      textTransform: "uppercase",
                      opacity: 0.85,
                    }}
                  >
                    Cycle day {cycleDay}
                  </Text>
                  <Text
                    className="mt-1"
                    style={{
                      fontSize: 22,
                      fontWeight: "800",
                      color: "#fff",
                      fontFamily: fonts.heading,
                    }}
                  >
                    {phaseLabel} phase
                  </Text>
                  <Text
                    className="mt-1.5"
                    style={{ fontSize: 12, color: "#fff", opacity: 0.9, fontFamily: fonts.body, lineHeight: 17 }}
                  >
                    Expected period {expectedEndDate} · Fertile window {fertileWindow}
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => router.push("/(app)/tracker?log=today&focus=flow" as any)}
                  accessibilityRole="button"
                  accessibilityLabel="Log today's flow"
                  style={{
                    width: 40, height: 40, borderRadius: 20,
                    backgroundColor: "rgba(255,255,255,0.25)",
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Ionicons name="water" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>

          {/* QUICK ACTIONS */}
          <View className="mx-6 mb-5 flex-row justify-around">
            {[
              { label: "Log period", icon: "water", route: "/(app)/tracker?log=today&focus=flow", primary: true },
              { label: "Symptoms", icon: "pulse-outline", route: "/(app)/tracker?log=today&focus=symptoms", primary: false },
              { label: "Mood", icon: "happy-outline", route: "/(app)/tracker?log=today&focus=mood", primary: false },
            ].map((action, idx) => (
              <TouchableOpacity
                key={idx}
                activeOpacity={0.8}
                onPress={() => router.push(action.route as any)}
                className="items-center"
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: action.primary ? colors.primary : colors.surface,
                    ...getShadow(colors, isDark),
                  }}
                >
                  <Ionicons
                    name={action.icon as any}
                    size={22}
                    color={action.primary ? colors.buttonText : colors.primary}
                  />
                </View>
                <Text
                  style={{ fontSize: 11, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body, marginTop: 6 }}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* INSIGHTS — cycle health + length trend as a swipeable, peeking
              carousel instead of two identical full-width bordered blocks
              stacked back to back; a "See all" link hands off to the full
              predictions screen for anyone who wants more than a glance. */}
          <View className="mb-3.5">
            <View className="mx-6 mb-2.5 flex-row items-center justify-between">
              <Text style={{ fontSize: 14.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                Insights
              </Text>
              <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/(app)/predictions")}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary, fontFamily: fonts.body }}>
                  See all
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={insightCardWidth + 12}
              snapToAlignment="start"
              contentContainerStyle={{ paddingLeft: 24, paddingRight: 24, gap: 12 }}
            >
              {/* Cycle health */}
              <View className="border p-5" style={{ width: insightCardWidth, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, ...getShadow(colors, isDark) }}>
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

              {/* Cycle length trend */}
              <View className="border p-5" style={{ width: insightCardWidth, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, ...getShadow(colors, isDark) }}>
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
            </ScrollView>
          </View>

          {/* YOUR CARE — a compact 2-up tile grid (icon, title, one-line tag)
              instead of a stacked list of sentence-length rows, plus a single
              featured CTA for the one genuinely high-intent action (booking a
              consult) so it doesn't blend into the grid as just another tile. */}
          <View className="mx-6 mb-5">
            <Text className="mb-2.5" style={{ fontSize: 14.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
              Your care
            </Text>

            <View className="flex-row flex-wrap" style={{ gap: 10 }}>
              {[
                { title: "Predictions", tag: "Cycle forecasts & trends", icon: "trending-up-outline", route: "/(app)/predictions", color: colors.primary, bg: colors.primaryLight },
                { title: "Daily Insights", tag: "Mood, hormone & energy", icon: "sparkles-outline", route: "/(app)/insights", color: colors.secondary, bg: colors.secondaryLight },
                { title: "Symptom Trends", tag: "Likely by cycle phase", icon: "pulse-outline", route: "/(app)/symptom-predictions", color: colors.accent, bg: colors.accentLight },
                { title: "Symptom Checker", tag: "PCOS, thyroid & more", icon: "clipboard-outline", route: "/(app)/symptom-checker", color: colors.info, bg: colors.infoLight },
              ].map((careItem, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => router.push(careItem.route as any)}
                  activeOpacity={0.75}
                  className="border"
                  style={{ width: "48%", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, padding: 14 }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: careItem.bg, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                    <Ionicons name={careItem.icon as any} size={17} color={careItem.color} />
                  </View>
                  <Text style={{ fontSize: 12.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}>{careItem.title}</Text>
                  <Text style={{ fontSize: 10.5, color: colors.mutedText, marginTop: 2, fontFamily: fonts.body }} numberOfLines={1}>{careItem.tag}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={() => router.push("/(app)/consultation")}
              activeOpacity={0.85}
              className="flex-row items-center mt-2.5"
              style={{ backgroundColor: colors.primaryLight, borderRadius: 18, padding: 14 }}
            >
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                <Ionicons name="chatbubbles-outline" size={18} color={colors.primary} />
              </View>
              <View className="flex-1">
                <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}>Talk to a gynecologist</Text>
                <Text style={{ fontSize: 10.5, color: colors.mutedText, marginTop: 1, fontFamily: fonts.body }} numberOfLines={1}>Private consult, secure chat</Text>
              </View>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="arrow-forward" size={14} color={colors.buttonText} />
              </View>
            </TouchableOpacity>
          </View>

          {/* WELLNESS & SUPPORT — same tile grid, but each icon gets its own
              accent instead of repeating the same primary tint on every
              card, so the row is scannable at a glance rather than a
              monotone block. */}
          <View className="mx-6 mb-5">
            <Text className="mb-2.5" style={{ fontSize: 14.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
              Wellness & support
            </Text>

            <View className="flex-row flex-wrap" style={{ gap: 10 }}>
              {[
                { title: "Health Concerns", desc: "Irregularities & symptoms", icon: "alert-circle-outline", route: "/(app)/health-issues", color: colors.warning, bg: colors.warningLight },
                { title: "Nura AI", desc: "Ask privately, anytime", icon: "help-circle-outline", route: "/(app)/qa", color: colors.info, bg: colors.infoLight },
                { title: "Hygiene & Care", desc: "Product guidance & comfort", icon: "leaf-outline", route: "/(app)/hygiene", color: colors.accent, bg: colors.accentLight },
                { title: "Sexual Wellbeing", desc: "Consent, intimacy & safety", icon: "heart-outline", route: "/(app)/sexual-wellbeing", color: colors.secondary, bg: colors.secondaryLight },
              ].map((wellness, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => router.push(wellness.route as any)}
                  activeOpacity={0.75}
                  className="border"
                  style={{ width: "48%", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, padding: 14 }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: wellness.bg, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                    <Ionicons name={wellness.icon as any} size={16} color={wellness.color} />
                  </View>
                  <Text style={{ fontSize: 12.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}>{wellness.title}</Text>
                  <Text style={{ fontSize: 10.5, color: colors.mutedText, marginTop: 2, fontFamily: fonts.body }} numberOfLines={1}>{wellness.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* EXPLORE — icon-first, label-only tiles (no descriptions at
              this density); kept as 3-up since these are lighter-weight,
              browse-anytime destinations rather than care actions. */}
          <View className="mx-6 mb-8">
            <Text className="mb-2.5" style={{ fontSize: 14.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
              Explore
            </Text>

            <View className="flex-row flex-wrap" style={{ gap: 10 }}>
              {[
                { title: "Forest", icon: "leaf-outline", route: "/(app)/forest", color: colors.success, bg: colors.successLight },
                { title: "Blogs", icon: "book-outline", route: "/(app)/blogs", color: colors.info, bg: colors.infoLight },
                { title: "Videos", icon: "play-circle-outline", route: "/(app)/reels", color: colors.primary, bg: colors.primaryLight },
                { title: "Partner sync", icon: "git-merge-outline", route: "/(app)/partner", color: colors.accent, bg: colors.accentLight },
                { title: "Habits", icon: "checkmark-done-outline", route: "/(app)/habits", color: colors.warning, bg: colors.warningLight },
                { title: "Nominate Buddy", icon: "star-outline", route: "/(app)/buddy-nomination", color: colors.secondary, bg: colors.secondaryLight },
              ].map((exp, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => router.push(exp.route as any)}
                  activeOpacity={0.8}
                  className="border items-center justify-center"
                  style={{ width: "31%", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 8 }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      backgroundColor: exp.bg,
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 9,
                    }}
                  >
                    <Ionicons name={exp.icon as any} size={18} color={exp.color} />
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
