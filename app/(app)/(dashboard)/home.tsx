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
import { genZLabel, useGenZLabel, useGenZMode } from "../../../components/genz-mode";
import HubEntryCard from "../../../components/HubEntryCard";
import { SkeletonBlock, SkeletonCard } from "../../../components/Skeleton";
import StatCard from "../../../components/StatCard";
import { useTheme } from "../../../components/theme";
import { getHeroGradient, getShadow } from "../../../components/ui-tokens";
import { useUserStats } from "../../../hooks/useUserStats";
import {
  cycleApi,
  partnerApi,
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

// Large faint watermark glyph behind the hero card's text — a small touch of
// depth so the card reads as "designed" per-phase rather than a flat gradient
// box that never changes shape.
const PHASE_WATERMARK_ICONS: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  period: "water",
  follicular: "leaf",
  ovulation: "sunny",
  luteal: "moon",
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
  const { enabled: genZModeEnabled } = useGenZMode();
  const insightsLabel = useGenZLabel("Insights");
  const seeAllLabel = useGenZLabel("See all");
  const moreForYouLabel = useGenZLabel("More for you");
  const careInsightsLabel = useGenZLabel("Care & Insights");
  const wellnessSupportLabel = useGenZLabel("Wellness & Support");
  const exploreLabel = useGenZLabel("Explore");
  const { user } = useAuth();
  // Home reuses useUserStats()'s dashboard fetch instead of independently
  // calling authApi.getDashboard() again on every mount (the two used to
  // race two copies of the same request).
  const { streakCount, walletBalance, dashboard, isLoading: isStatsLoading, refresh: refreshStats } = useUserStats();
  const router = useRouter();
  const [predictions, setPredictions] = useState<Predictions | null>(null);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // False until the first predictions fetch settles, so the hero card and
  // insights show a skeleton instead of flashing local "Day 1" estimates.
  const [homeLoaded, setHomeLoaded] = useState(false);

  const loadHome = useCallback(async () => {
    // Settled independently so a slow notifications call never holds the
    // hero card / insights skeleton open.
    const predictionsTask = cycleApi
      .getPredictions()
      .then(
        (value) => setPredictions(value),
        () => setPredictions(null),
      )
      .finally(() => setHomeLoaded(true));
    const notificationsTask = partnerApi
      .getNotifications()
      .then(
        (notifs) => setHasUnreadNotifications(notifs.some((n) => !n.isRead)),
        () => {},
      );
    await Promise.all([predictionsTask, notificationsTask]);
  }, []);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadHome(), refreshStats()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadHome, refreshStats]);

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
  const phaseKey =
    predictions?.currentPhase ??
    getCyclePhase(cycleDay, periodLength, predictions?.cycleLength ?? 28);
  const phaseLabel = PHASE_LABELS[phaseKey];

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
          {!homeLoaded ? (
            <View className="mx-6 mb-4">
              <SkeletonBlock width="100%" height={140} radius={22} />
            </View>
          ) : (
          <View className="mx-6 mb-4">
            <LinearGradient
              colors={heroGradient as [string, string, ...string[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: 22,
                padding: 20,
                overflow: "hidden",
                ...getShadow(colors, isDark),
              }}
            >
              <Ionicons
                name={PHASE_WATERMARK_ICONS[phaseKey] ?? "water"}
                size={120}
                color="#fff"
                style={{ position: "absolute", right: -26, bottom: -30, opacity: 0.12 }}
              />
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
          )}

          {/* QUICK ACTIONS */}
          <View className="mx-6 mb-5 flex-row justify-around">
            {[
              { label: "Log period", icon: "water", route: "/(app)/tracker?log=today&focus=flow", primary: true },
              { label: "Symptoms", icon: "pulse-outline", route: "/(app)/tracker?log=today&focus=symptoms", primary: false },
              { label: "Mood", icon: "happy-outline", route: "/(app)/tracker?log=today&focus=mood", primary: false },
            ].map((action, idx) => (
              <TouchableOpacity
                key={idx}
                accessibilityLabel={action.label}
                accessibilityRole="button"
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
                  {genZLabel(action.label, genZModeEnabled)}
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
              <View className="flex-row items-center" style={{ gap: 7 }}>
                <View style={{ width: 5, height: 14, borderRadius: 3, backgroundColor: colors.secondary }} />
                <Text style={{ fontSize: 14.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                  {insightsLabel}
                </Text>
              </View>
              <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/(app)/predictions")} className="flex-row items-center" style={{ gap: 2 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary, fontFamily: fonts.body }}>
                  {seeAllLabel}
                </Text>
                <Ionicons name="chevron-forward" size={13} color={colors.primary} />
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
              {!homeLoaded ? (
                <>
                  <SkeletonCard style={{ width: insightCardWidth }} />
                  <SkeletonCard style={{ width: insightCardWidth }} />
                </>
              ) : (
              <>
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
                      <Circle cx="32" cy="32" r="27" fill="none" stroke={colors.track} strokeWidth={6} />
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
                        <View style={{ height: 80, width: 14, backgroundColor: colors.track, borderRadius: 99, justifyContent: "flex-end", overflow: "hidden" }}>
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
              </>
              )}
            </ScrollView>
          </View>

          {/* MORE FOR YOU — three nested "hub" entry points instead of three
              stacked grids of 4-6 tiles each. Home stays a short, glanceable
              dashboard; the full destination list for each area lives one
              tap away on its own screen (care-hub / wellness-hub /
              explore-hub), which is also where new destinations should be
              added going forward rather than growing this list further. */}
          <View className="mx-6 mb-8">
            <View className="mb-2.5 flex-row items-center" style={{ gap: 7 }}>
              <View style={{ width: 5, height: 14, borderRadius: 3, backgroundColor: colors.primary }} />
              <Text style={{ fontSize: 14.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                {moreForYouLabel}
              </Text>
            </View>

            <View style={{ gap: 10 }}>
              <HubEntryCard
                icon="pulse-outline"
                iconColor={colors.primary}
                iconBg={colors.primaryLight}
                title={careInsightsLabel}
                description="Predictions, insights, symptom trends & consults"
                onPress={() => router.push("/(app)/care-hub")}
              />
              <HubEntryCard
                icon="heart-outline"
                iconColor={colors.secondary}
                iconBg={colors.secondaryLight}
                title={wellnessSupportLabel}
                description="Health concerns, private Q&A, hygiene & more"
                onPress={() => router.push("/(app)/wellness-hub")}
              />
              <HubEntryCard
                icon="compass-outline"
                iconColor={colors.accent}
                iconBg={colors.accentLight}
                title={exploreLabel}
                description="Forest, blogs, videos, habits & your buddy"
                onPress={() => router.push("/(app)/explore-hub")}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
