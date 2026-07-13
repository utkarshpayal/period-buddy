import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
import { useAppState } from "../../../components/AppState";
import { useAuth } from "../../../components/auth-context";
import { useTheme } from "../../../components/theme";
import {
  getHeroGradient,
  getShadow,
  getSoftTints,
  getSurfaceGradient,
} from "../../../components/ui-tokens";
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

export default function Home() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { tokens, trackedDays } = useAppState();
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
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
        }
      } catch {
        if (isMounted) {
          setDashboard(null);
          setPredictions(null);
        }
      }
    }

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const loggedDays = Math.max(dashboard?.trackedDays ?? trackedDays, 0);
  const dashboardTokens = dashboard?.tokens ?? tokens;
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

  const analyticGraphData = useMemo(
    () => buildFiveMonthAnalytics(predictions?.analyticsData),
    [predictions?.analyticsData],
  );
  const hasAnalyticsHistory = analyticGraphData.some((item) => item.length > 0);
  const maxBarLength = Math.max(
    ...analyticGraphData.map((item) => item.length),
    predictions?.cycleLength ?? 1,
    1,
  );

  const treeHealth =
    dashboard?.forestHealth ?? Math.min(100, Math.max(45, 55 + loggedDays * 6));
  const softTints = getSoftTints(colors);
  const surfaceGradient = getSurfaceGradient(colors, isDark) as [string, string];
  const heroGradient = getHeroGradient(colors, isDark) as [
    string,
    string,
    string,
  ];

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
        >
          {/* Header Section */}
          <View className="px-6 pt-6 flex-row justify-between items-center">
            <View>
              <View className="flex-row items-center gap-1">
                <Text
                  className="text-2xl font-black tracking-tight"
                  style={{ color: colors.foreground }}
                >
                  Hey {user?.firstName || "there"}!
                </Text>
              </View>
              <Text
                className="mt-1 text-xs font-semibold tracking-wide"
                style={{ color: colors.mutedText }}
              >
                Cycle day {cycleDay} • Next period around {expectedEndDate}
              </Text>
            </View>

            {/* Tokens Pill Badge */}
            <View
              className="flex-row items-center gap-2 px-4 py-2 rounded-full border shadow-xs"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <MaterialCommunityIcons
                name="trophy-outline"
                size={16}
                color={colors.primary}
              />
              <Text
                className="text-xs font-bold tracking-wider"
                style={{ color: colors.foreground }}
              >
                {dashboardTokens}
              </Text>
            </View>
          </View>

          {/* FOREST STATUS CORE CARD */}
          <View className="mx-6 my-6">
            <View
              className="rounded-3xl border overflow-hidden shadow-lg"
              style={{
                borderColor: colors.border,
                ...getShadow(colors, isDark),
              }}
            >
              <LinearGradient
                colors={heroGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                className="p-6 flex-row items-center justify-between"
              >
                {/* Left Column: Context Text */}
                <View className="flex-1 pr-4">
                  <Text
                    className="text-xs font-bold tracking-widest uppercase mb-1"
                    style={{ color: colors.primary }}
                  >
                    Forest Status
                  </Text>
                  <Text
                    className="text-lg font-extrabold tracking-tight leading-6"
                    style={{ color: colors.foreground }}
                  >
                    Your wellness forest is{" "}
                    {treeHealth > 75
                      ? "Thriving"
                      : treeHealth > 50
                        ? "Healthy"
                        : "Needs Attention"}
                  </Text>
                  <Text
                    className="mt-2 text-xs leading-4"
                    style={{ color: colors.mutedText }}
                  >
                    Log your symptoms or habits today to keep your wellness
                    forest growing.
                  </Text>
                </View>

                {/* Right Column: Premium Concentric Progress Ring */}
                <View className="items-center justify-center">
                  <View
                    className="w-24 h-24 rounded-full border-4 items-center justify-center relative"
                    style={{
                      borderColor: isDark ? colors.border : "#efe7e4",
                    }}
                  >
                    {/* Subtle inner ambient pulse layout */}
                    <View
                      className="absolute inset-1 rounded-full opacity-10"
                      style={{
                        backgroundColor:
                          treeHealth > 75
                            ? colors.success
                            : treeHealth > 50
                              ? colors.warning
                              : colors.danger,
                      }}
                    />

                    {/* Numerical Stat Display inside the Ring */}
                    <Text
                      className="text-xl font-black tracking-tighter"
                      style={{ color: colors.foreground }}
                    >
                      {treeHealth}%
                    </Text>
                    <Text
                      className="text-[9px] font-bold uppercase tracking-wider mt-0.5"
                      style={{
                        color:
                          treeHealth > 75
                            ? colors.success
                            : treeHealth > 50
                              ? colors.warning
                              : colors.danger,
                      }}
                    >
                      Health
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            </View>
          </View>

          {/* NEW GRAPH SECTION: Premium Cycle Insights Trends */}
          <View className="mx-6 mb-6">
            <View
              className="rounded-3xl border overflow-hidden shadow-lg"
              style={{
                borderColor: colors.border,
                ...getShadow(colors, isDark),
              }}
            >
              <LinearGradient
                colors={surfaceGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                className="p-5"
              >
                <View className="flex-row justify-between items-center mb-6">
                  <View>
                    <Text
                      className="text-xs font-bold tracking-widest uppercase"
                      style={{ color: colors.secondary }}
                    >
                      Analytics
                    </Text>
                    <Text
                      className="text-base font-extrabold tracking-tight"
                      style={{ color: colors.foreground }}
                    >
                      Last 5 Cycle Entries
                    </Text>
                    <Text
                      className="mt-1 text-[11px] font-semibold leading-4"
                      style={{ color: colors.mutedText }}
                    >
                      {hasAnalyticsHistory
                        ? "Missing months stay visible as 0 for a clearer trend."
                        : "Log cycle history to start building this graph."}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Text
                      className="text-xs font-bold"
                      style={{ color: colors.foreground }}
                    >
                      Avg: {predictions?.cycleLength ?? 28} Days
                    </Text>
                    <Feather
                      name="trending-up"
                      size={14}
                      color={colors.success}
                    />
                  </View>
                </View>

                {/* Minimal Clean Graph Canvas Bars */}
                <View className="h-36 flex-row justify-between items-end px-2 pt-2">
                  {analyticGraphData.map((data, index) => {
                    const heightPct =
                      data.length > 0
                        ? Math.max(0.15, data.length / maxBarLength)
                        : 0;
                    const isLatest = index === analyticGraphData.length - 1;

                    return (
                      <View
                        key={`${data.month}-${index}`}
                        className="items-center flex-1 gap-1.5"
                      >
                        <Text
                          className="text-[10px] font-bold"
                          style={{
                            color: data.length
                              ? colors.foreground
                              : colors.mutedText,
                          }}
                        >
                          {data.length}d
                        </Text>

                        <View
                          className="w-5 rounded-full relative overflow-hidden justify-end"
                          style={{
                            backgroundColor: colors.surfaceSoft,
                            borderColor: colors.border,
                            borderWidth: 1,
                            height: 108,
                          }}
                        >
                          {data.length > 0 ? (
                            <LinearGradient
                              colors={
                                isLatest
                                  ? [colors.primary, colors.secondary]
                                  : [colors.secondary, colors.accent]
                              }
                              start={{ x: 0, y: 0 }}
                              end={{ x: 0, y: 1 }}
                              style={{
                                borderRadius: 999,
                                height: 108 * heightPct,
                                opacity: isLatest ? 1 : 0.5,
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

                        <Text
                          className="text-[10px] font-bold mt-0.5"
                          style={{ color: colors.mutedText }}
                        >
                          {data.month}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </LinearGradient>
            </View>
          </View>

          {/* Minimal Metric Tiles */}
          <View className="mx-6 mt-2 flex-row gap-3">
            {[
              {
                label: "Days Logged",
                value: `${loggedDays} Days`,
                icon: "calendar-outline",
                color: colors.primary,
                bg: softTints.pink,
              },
              {
                label: "Period Length",
                value: `${periodLength} Days`,
                icon: "hourglass-outline",
                color: colors.secondary,
                bg: softTints.mint,
              },
              {
                label: "Fertile Window",
                value:
                  typeof fertileWindow === "number"
                    ? `${fertileWindow} Days`
                    : fertileWindow,
                icon: "heart-outline",
                color: colors.accent,
                bg: softTints.amber,
              },
            ].map((metric, i) => (
              <View
                key={i}
                className="flex-1 items-center rounded-2xl border overflow-hidden shadow-sm relative min-h-[110px]"
                style={{
                  borderColor: colors.border,
                }}
              >
                <LinearGradient
                  colors={surfaceGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  className="absolute inset-0"
                />
                <View className="items-center p-4 w-full">
                  <View
                    className="p-2.5 rounded-xl"
                    style={{ backgroundColor: metric.bg }}
                  >
                    <Ionicons
                      name={metric.icon as any}
                      size={18}
                      color={metric.color}
                    />
                  </View>
                  <Text
                    className="mt-3 text-sm font-extrabold tracking-tight"
                    style={{ color: colors.foreground }}
                  >
                    {metric.value}
                  </Text>
                  <Text
                    className="text-[10px] font-semibold mt-0.5 text-center"
                    style={{ color: colors.mutedText }}
                  >
                    {metric.label}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Features Layout Section */}
          <View className="mt-8 px-6">
            <Text
              className="mb-4 text-base font-bold tracking-tight"
              style={{ color: colors.foreground }}
            >
              Your Core Features
            </Text>

            {/* CATEGORY 1: High-Priority Daily Trackers (Wide Rows) */}
            <View className="gap-3 mb-6">
              {[
                {
                  title: "Period Tracker",
                  desc: "Log flow, mood, symptoms, and notes",
                  icon: "water-outline",
                  route: "/(app)/(dashboard)/tracker",
                  bg: softTints.pink,
                  iconColor: colors.primary,
                },
                {
                  title: "Smart Predictions",
                  desc: "Cycle forecasts, windows, and trend charts",
                  icon: "analytics-outline",
                  route: "/(app)/predictions",
                  bg: softTints.lavender,
                  iconColor: colors.secondary,
                },
                {
                  title: "Gynec Consultation",
                  desc: "Private specialist booking and secure chat",
                  icon: "chatbubble-ellipses-outline",
                  route: "/(app)/consultation",
                  bg: softTints.emerald,
                  iconColor: colors.success,
                },
              ].map((f) => (
                <TouchableOpacity
                  key={f.title}
                  onPress={() => router.push(f.route as any)}
                  activeOpacity={0.7}
                  className="rounded-2xl border overflow-hidden shadow-sm"
                  style={{
                    borderColor: colors.border,
                  }}
                >
                  <LinearGradient
                    colors={surfaceGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    className="flex-row items-center p-4"
                  >
                    <View
                      className="p-3 rounded-xl mr-4"
                      style={{ backgroundColor: f.bg }}
                    >
                      <Ionicons
                        name={f.icon as any}
                        size={20}
                        color={f.iconColor}
                      />
                    </View>
                    <View className="flex-1">
                      <Text
                        className="text-sm font-bold"
                        style={{ color: colors.foreground }}
                      >
                        {f.title}
                      </Text>
                      <Text
                        className="text-xs mt-0.5"
                        style={{ color: colors.mutedText }}
                      >
                        {f.desc}
                      </Text>
                    </View>
                    <Feather
                      name="chevron-right"
                      size={16}
                      color={colors.mutedText}
                    />
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>

            {/* CATEGORY 2: Discovery & Medical Support (Comfortable 2x2 Grid) */}
            <Text
              className="mb-4 text-base font-bold tracking-tight"
              style={{ color: colors.foreground }}
            >
              Wellness & Support
            </Text>
            <View className="flex-row flex-wrap justify-between gap-3 mb-6">
              {[
                {
                  title: "Health Issues",
                  desc: "Irregularities & symptom tracking",
                  icon: "alert-circle-outline",
                  route: "/(app)/health-issues",
                  bg: softTints.amber,
                  iconColor: colors.accent,
                },
                {
                  title: "Anonymous Q&A",
                  desc: "Safe, anonymous health questions",
                  icon: "help-circle-outline",
                  route: "/(app)/qa",
                  bg: softTints.blue,
                  iconColor: colors.info,
                },
                {
                  title: "Hygiene & Care",
                  desc: "Product hygiene and comfort tips",
                  icon: "leaf-outline",
                  route: "/(app)/hygiene",
                  bg: softTints.emerald,
                  iconColor: colors.secondary,
                },
                {
                  title: "Sexual Wellbeing",
                  desc: "Consent, intimacy, and safety resources",
                  icon: "heart-outline",
                  route: "/(app)/sexual-wellbeing",
                  bg: softTints.pink,
                  iconColor: colors.primary,
                },
              ].map((f) => (
                <TouchableOpacity
                  key={f.title}
                  onPress={() => router.push(f.route as any)}
                  activeOpacity={0.7}
                  className="w-[48%] rounded-2xl border overflow-hidden min-h-[110px]"
                  style={{
                    borderColor: colors.border,
                  }}
                >
                  <LinearGradient
                    colors={surfaceGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    className="p-4 flex-1 justify-between"
                  >
                    <View
                      className="self-start p-2 rounded-xl"
                      style={{ backgroundColor: f.bg }}
                    >
                      <Ionicons
                        name={f.icon as any}
                        size={18}
                        color={f.iconColor}
                      />
                    </View>
                    <View className="mt-3">
                      <Text
                        className="text-xs font-bold"
                        style={{ color: colors.foreground }}
                      >
                        {f.title}
                      </Text>
                      <Text
                        className="text-[10px] mt-0.5"
                        numberOfLines={1}
                        style={{ color: colors.mutedText }}
                      >
                        {f.desc}
                      </Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>

            {/* CATEGORY 3: Media & Ecosystem Options (Sleek Three-Column Footer Grid) */}
            <Text
              className="mb-4 text-base font-bold tracking-tight"
              style={{ color: colors.foreground }}
            >
              Explore More
            </Text>
            <View className="flex-row flex-wrap gap-2.5">
              {[
                {
                  title: "Forest",
                  icon: "leaf-outline",
                  route: "/(app)/forest",
                  color: colors.secondary,
                },
                {
                  title: "Blogs",
                  icon: "book-open-outline",
                  route: "/(app)/blogs",
                  color: colors.info,
                },
                {
                  title: "Video Content",
                  icon: "play-circle-outline",
                  route: "/(app)/reels",
                  color: colors.accent,
                },
                {
                  title: "Partner sync",
                  icon: "git-merge-outline",
                  route: "/(app)/partner",
                  color: colors.primary,
                },
                {
                  title: "Build Habits",
                  icon: "toggle-outline",
                  route: "/(app)/habits",
                  color: colors.info,
                },
                {
                  title: "Nominate Buddy",
                  icon: "star-outline",
                  route: "/(app)/buddy-nomination",
                  color: colors.accent,
                },
              ].map((f) => (
                <TouchableOpacity
                  key={f.title}
                  onPress={() => router.push(f.route as any)}
                  activeOpacity={0.8}
                  className="w-[31.2%] rounded-xl border overflow-hidden"
                  style={{
                    borderColor: colors.border,
                  }}
                >
                  <LinearGradient
                    colors={surfaceGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    className="items-center justify-center p-3"
                  >
                    <Ionicons name={f.icon as any} size={18} color={f.color} />
                    <Text
                      className="mt-1.5 text-center text-[10px] font-bold"
                      numberOfLines={1}
                      style={{ color: colors.foreground }}
                    >
                      {f.title}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
