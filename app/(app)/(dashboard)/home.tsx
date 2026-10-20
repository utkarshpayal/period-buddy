import { Ionicons } from "@expo/vector-icons";
import { invalidateQueries } from "../../../lib/queryCache";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { useAuth } from "../../../components/auth-context";
import { genZLabel, useGenZLabel, useGenZMode } from "../../../components/genz-mode";
import { ListGroup, ListRow } from "../../../components/ListGroup";
import { ColumnLabel } from "../../../components/ColumnLabel";
import { SkeletonBlock, SkeletonCard } from "../../../components/Skeleton";
import StatCard from "../../../components/StatCard";
import { useTheme } from "../../../components/theme";
import { getHeroGradient, getShadow } from "../../../components/ui-tokens";
import { useUserStats } from "../../../hooks/useUserStats";
import { useDataRefresh } from "../../../hooks/useDataRefresh";
import {
  cycleApi,
  partnerApi,
  type Predictions,
} from "../../../lib/api";
import { getCyclePhase } from "../../../lib/cycle";
import { addDays } from "../../../lib/cycleCalendar";
import { HomeSectionKey, describeHub, hubTilesFor, sectionText, shownSections } from "../../../lib/appConfig";
import { useViewer } from "../../../hooks/useViewer";
import { PromoPopup } from "../../../components/PromoPopup";
import { useAppConfig } from "../../../components/app-config";
import { PromoBanners } from "../../../components/PromoBanners";
import { useContentWidth } from "../../../lib/layout";
import { useHomeLayout } from "../../../components/home-layout";
import { STAT_OPTIONS, applyHomeLayout, blockItems, blockTitle, styledShortcuts } from "../../../lib/homeLayout";
import { LOG_FOCUS } from "../../../lib/logFocus";
import { useQuickLog } from "../../../hooks/useQuickLog";
import { HeaderIconButton, SectionHeader } from "../../../components/ScreenHeader";
import { HomeShortcuts } from "../../../components/HomeShortcuts";
import { EmptyState } from "../../../components/EmptyState";
import { buildCurrentWeekStrip } from "../../../lib/weekStrip";
import { dateFromDayKey } from "../../../lib/format";
import { useTodayKey } from "../../../hooks/useTodayKey";
import { useSecureScreen } from "../../../lib/screenPrivacy";
import { Icon } from "../../../components/Icon";
import { PressableScale } from "../../../components/PressableScale";
import Animated from "react-native-reanimated";
import { listEntering } from "../../../components/motion";

// The Cycle length card is narrower than Cycle health, so both peek in.
const TREND_CARD_WIDTH = 200;

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

// Only the unread total is needed for the bell's dot — ask for a single item
// and read the server's count (falls back to scanning what came back on a
// backend without pagination, which ignores `limit` and sends the newest 50).
async function fetchHasUnread() {
  const res = await partnerApi.getNotificationsPage({ page: 1, limit: 1 });
  return res.unreadCount !== undefined
    ? res.unreadCount > 0
    : res.notifications.some((n) => !n.isRead);
}

/**
 * "Oct 22-Oct 28" → "Oct 22–28", "Oct 30-Nov 5" → "Oct 30 – Nov 5", with
 * non-breaking spaces so the range never splits across lines.
 */
function compactRange(range: string): string {
  const m = /^(\w+) (\d+)-(\w+) (\d+)$/.exec(range.trim());
  const nb = (t: string) => t.replace(/ /g, "\u00A0");
  if (!m) return nb(range);
  return m[1] === m[3] ? nb(`${m[1]} ${m[2]}–${m[4]}`) : nb(`${m[1]} ${m[2]} – ${m[3]} ${m[4]}`);
}

export default function Home() {
  useSecureScreen("home");
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
  const insets = useSafeAreaInsets();

  // One-tap logging (hooks/useQuickLog.tsx): Log period saves straight away,
  // Symptoms and Mood open a small sheet; other buttons open the full log.
  const quick = useQuickLog({ toastBottom: 62 + Math.max(insets.bottom, 12) + 14 });
  const { periodLoggedToday, logPeriodNow, onQuickAction, loggedCount } = quick;
  const { config: appConfig, refresh: refreshAppConfig } = useAppConfig();
  const viewer = useViewer();
  // The CMS's blocks for this viewer, then the person's own hides/order on
  // top (Profile → Customize Home, lib/homeLayout.ts).
  const { layout: homeLayout, ready: homeLayoutReady } = useHomeLayout();
  const shownHome = applyHomeLayout(shownSections(appConfig, "home", viewer), homeLayout);
  const homeShortcuts = styledShortcuts(appConfig, viewer, homeLayout);
  // A hub with nothing visible for this user drops off "More for you".
  const hubHasFeatures = {
    care: hubTilesFor(appConfig, "care_hub", viewer).length > 0,
    wellness: hubTilesFor(appConfig, "wellness_hub", viewer).length > 0,
    explore: hubTilesFor(appConfig, "explore_hub", viewer).length > 0,
  };
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
      // A failed refresh keeps the last predictions: dropping them made the
      // hero fall back to made-up numbers.
      .then(setPredictions, () => {})
      .finally(() => setHomeLoaded(true));
    const notificationsTask = fetchHasUnread().then(setHasUnreadNotifications, () => {});
    await Promise.all([predictionsTask, notificationsTask]);
  }, []);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  // Home is a tab, so it stays mounted while the user logs days in the
  // tracker or reads notifications. Refetch quietly on return, keeping what's
  // on screen if a request fails. Streak/points refresh via useUserStats.
  useDataRefresh(["cycle", "notifications"], async () => {
    await Promise.allSettled([
      cycleApi.getPredictions().then(setPredictions),
      fetchHasUnread().then(setHasUnreadNotifications),
    ]);
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    invalidateQueries("cycle:predictions");
    invalidateQueries("auth:dashboard");
    try {
      // Also re-pulls the App CMS layout, so a just-published change can be
      // checked without restarting the app.
      await Promise.all([loadHome(), refreshStats(), refreshAppConfig()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadHome, refreshStats, refreshAppConfig]);

  // These must reflect the signed-in account's real data only — never a
  // locally-cached demo/fallback number, which would silently show a
  // previous (or nonexistent) account's stats on this device/browser.
  const loggedDays = Math.max(dashboard?.trackedDays ?? 0, 0);
  const cycleDay = Math.max(
    predictions?.currentCycleDay ??
    dashboard?.predictions?.currentCycleDay ??
    1,
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

  // The last three finished cycles, oldest first, for the Cycle length card.
  const recentLengths = useMemo(
    () => (predictions?.analyticsData ?? []).map((e) => e.length).filter((n) => n > 0).slice(-3),
    [predictions?.analyticsData],
  );
  const maxRecentLength = Math.max(...recentLengths, 1);

  const treeHealth =
    dashboard?.forestHealth ?? Math.min(100, Math.max(45, 55 + loggedDays * 6));
  const healthTone =
    treeHealth > 75
      ? { label: "Great", color: colors.success, bg: colors.successLight }
      : treeHealth > 50
        ? { label: "Healthy", color: colors.primaryDark, bg: colors.primaryLight }
        : { label: "Needs logging", color: colors.warning, bg: colors.warningLight };

  // Same fertile-window pivot tracker.tsx's calendar uses, so the week strip
  // below agrees with the rest of the app instead of eyeballing its own
  // definition of "fertile".
  const cycleLength = predictions?.cycleLength ?? 28;
  const ovulationDayPivot = Math.max(periodLength + 1, cycleLength - 13);
  // Rolls over at midnight (and on returning to the app), so the strip and
  // "today" never stick on the day Home was first opened.
  const todayKey = useTodayKey();
  const cycleStartDate = useMemo(
    () =>
      predictions?.currentPeriodStartDateISO
        ? dateFromDayKey(predictions.currentPeriodStartDateISO)
        : addDays(dateFromDayKey(todayKey), -(cycleDay - 1)),
    [predictions?.currentPeriodStartDateISO, cycleDay, todayKey],
  );
  const weekStrip = useMemo(
    () =>
      buildCurrentWeekStrip(
        dateFromDayKey(todayKey),
        cycleStartDate,
        cycleLength,
        periodLength,
        ovulationDayPivot,
      ),
    [todayKey, cycleStartDate, cycleLength, periodLength, ovulationDayPivot],
  );
  const heroGradient = getHeroGradient(colors, isDark);
  // Cheap pure function of the current hour — recompute every render rather
  // than memoizing with an empty dep array, which would freeze it at
  // whatever greeting was correct the moment this screen first mounted.
  const greeting = getGreeting(new Date().getHours());
  const screenWidth = useContentWidth();
  // Leaves the next card peeking in at the right edge — the standard
  // "there's more, swipe" affordance instead of two full-width blocks
  // stacked back to back.
  const insightCardWidth = Math.min(290, screenWidth - 92);

  // Every stat the "Stats" block can show; the person picks which (lib/homeLayout.ts).
  // Negative while late, so the stat reads "N days late".
  const daysToPeriod = predictions?.isLate
    ? -(predictions.daysLate ?? 0)
    : predictions?.nextPeriodDaysAway ?? dashboard?.predictions?.nextPeriodDaysAway;
  // A number with a small muted unit after it ("1 day").
  const withUnit = (value: string, unit: string) => (
    <>
      {value}
      <Text style={{ fontSize: 13, fontWeight: "500", color: colors.mutedText }}>{` ${unit}`}</Text>
    </>
  );
  const statValues: Record<string, { icon: React.ComponentProps<typeof Ionicons>["name"]; color: string; bg: string; value: React.ReactNode; label: string }> = {
    streak: { icon: "water", color: colors.primary, bg: colors.primaryLight, value: withUnit(`${streakCount}`, streakCount === 1 ? "day" : "days"), label: "Logging streak" },
    points: { icon: "trophy-outline", color: colors.success, bg: colors.successLight, value: isStatsLoading ? "…" : walletBalance.toLocaleString("en-US"), label: "Wallet points" },
    cycleDay: { icon: "sync-outline", color: colors.info, bg: colors.infoLight, value: homeLoaded ? `${cycleDay}` : "…", label: "Cycle day" },
    nextPeriod: {
      icon: "calendar-outline",
      color: colors.primary,
      bg: colors.primaryLight,
      value: !homeLoaded
        ? "…"
        : daysToPeriod == null
          ? "–"
          : daysToPeriod < 0
            ? withUnit(`${-daysToPeriod}`, -daysToPeriod === 1 ? "day late" : "days late")
            : withUnit(`${daysToPeriod}`, daysToPeriod === 1 ? "day" : "days"),
      label: "To period",
    },
    trackedDays: { icon: "checkmark-done-outline", color: colors.info, bg: colors.infoLight, value: isStatsLoading ? "…" : `${loggedDays}`, label: "Days tracked" },
    forest: { icon: "leaf-outline", color: colors.success, bg: colors.successLight, value: isStatsLoading ? "…" : `${treeHealth}%`, label: "Forest" },
  };

  const hubCards: Record<string, React.ReactNode> = {
    care: (
      <ListRow
        key="care"
        icon="pulse-outline"
        iconColor={colors.primaryDark}
        iconBg={colors.primaryLight}
        title={appConfig.screenTitles.care_hub ?? careInsightsLabel}
        description={describeHub(appConfig, "care_hub", "Predictions, insights & doctors", viewer)}
        onPress={() => router.push("/(app)/care-hub")}
      />
    ),
    wellness: (
      <ListRow
        key="wellness"
        icon="heart-outline"
        iconColor={colors.info}
        iconBg={colors.infoLight}
        title={appConfig.screenTitles.wellness_hub ?? wellnessSupportLabel}
        description={describeHub(appConfig, "wellness_hub", "Nura AI, concerns & care", viewer)}
        onPress={() => router.push("/(app)/wellness-hub")}
      />
    ),
    explore: (
      <ListRow
        key="explore"
        icon="compass-outline"
        iconColor={colors.success}
        iconBg={colors.successLight}
        title={appConfig.screenTitles.explore_hub ?? exploreLabel}
        description={describeHub(appConfig, "explore_hub", "Forest, blogs, videos & habits", viewer)}
        onPress={() => router.push("/(app)/explore-hub")}
      />
    ),
  };

  // Home's blocks, keyed by the App CMS section ids. The CMS decides their
  // order and which are shown (lib/appConfig.ts `homeSections`); the
  // defaults reproduce the original fixed layout. promo_* are banner slots.
  const homeSections: Record<HomeSectionKey, React.ReactNode> = {
    statPills: (
      <>
      {/* STAT PILLS ROW — which stats, in what order, is the person's pick
          (Profile → Customize Home, lib/homeLayout.ts STAT_OPTIONS). */}
      <View className="mx-6 mt-3 mb-6 flex-row" style={{ gap: 12 }}>
        {blockItems(homeLayout, "statPills").map((key, _i, picked) => {
          const stat = statValues[key];
          if (!stat) return null;
          return (
            <StatCard
              key={key}
              // Three across leaves no room beside the icon: stack them instead.
              variant={picked.length >= 3 || screenWidth < 360 ? "tile-stack" : "tile"}
              icon={stat.icon}
              iconColor={stat.color}
              iconBg={stat.bg}
              value={stat.value}
              label={STAT_OPTIONS.find((o) => o.key === key)?.label ?? stat.label}
              valueColor={colors.foreground}
              labelColor={colors.mutedText}
              valueFontFamily={fonts.heading}
              labelFontFamily={fonts.body}
              backgroundColor={colors.surface}
              containerStyle={getShadow(colors, isDark)}
            />
          );
        })}
      </View>
      </>
    ),
    weekStrip: (
      <>
      {/* WEEK STRIP — today filled, upcoming days dashed; the dot marks
          period days (paler when predicted) and fertile days. */}
      <View className="mx-6 mb-5 flex-row">
        {weekStrip.map((day, idx) => (
          <View key={idx} className="items-center" style={{ flex: 1, gap: 8 }}>
            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: day.isToday ? "700" : "500", color: day.isToday ? colors.primaryDark : colors.mutedText, fontFamily: fonts.body }}>
              {day.letter}
            </Text>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: day.isToday ? colors.primary : "transparent",
                borderWidth: day.isFuture && day.isPeriod ? 1.5 : 0,
                borderColor: colors.rose,
                borderStyle: "dashed",
                ...(day.isToday
                  ? { shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.32, shadowRadius: 14, elevation: 4 }
                  : null),
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: day.isToday ? "700" : "500",
                  color: day.isToday ? colors.buttonText : colors.foreground,
                  fontFamily: fonts.body,
                }}
              >
                {day.dayNumber}
              </Text>
            </View>
            {/* Fixed-height slot so the dot (or its absence) never shifts the row. */}
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 3,
                backgroundColor: day.isPeriod ? colors.primary : day.isFertile ? colors.secondary : "transparent",
                opacity: day.isFuture ? 0.4 : 1,
              }}
            />
          </View>
        ))}
      </View>
      </>
    ),
    promo_top: <PromoBanners placement="home_top" style={{ marginBottom: 16 }} />,
    phaseHero: (
      <>
      {/* CYCLE PHASE HERO CARD */}
      {!homeLoaded ? (
        <View className="mx-6 mb-6">
          <SkeletonBlock width="100%" height={150} radius={24} />
        </View>
      ) : (
      <View className="mx-6 mb-6">
        <LinearGradient
          colors={heroGradient as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 24,
            padding: 20,
            gap: 14,
            overflow: "hidden",
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: isDark ? 0.3 : 0.25,
            shadowRadius: 28,
            elevation: 6,
          }}
        >
          <Icon set="ion"
            name={PHASE_WATERMARK_ICONS[phaseKey] ?? "water"}
            size={170}
            color="#fff"
            style={{ position: "absolute", right: -36, bottom: -48, opacity: 0.12 }}
          />
          <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
            <View className="flex-1" style={{ gap: 4 }}>
              <Text
                style={{
                  fontSize: 12,
                  lineHeight: 16,
                  fontWeight: "700",
                  color: "#fff",
                  letterSpacing: 1,
                  fontFamily: fonts.body,
                  textTransform: "uppercase",
                  opacity: 0.85,
                }}
              >
                Cycle day {cycleDay}
              </Text>
              <Text
                numberOfLines={2}
                maxFontSizeMultiplier={1.3}
                style={{ fontSize: 24, lineHeight: 32, fontWeight: "700", color: "#fff", fontFamily: fonts.heading }}
              >
                {phaseLabel} phase
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => void logPeriodNow()}
              accessibilityRole="button"
              accessibilityLabel={periodLoggedToday ? "Period logged today. Change flow" : "Log period for today"}
              hitSlop={6}
              style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: "rgba(255,255,255,0.22)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.35)",
                alignItems: "center", justifyContent: "center",
              }}
            >
              <Icon set="ion" name={periodLoggedToday ? "checkmark" : "water"} size={18} color="#fff" />
            </TouchableOpacity>
          </View>
          {/* Dates, not "6 day window": what people plan around. No fertile
              dates when the cycle is too irregular to estimate them. */}
          <View className="flex-row" style={{ gap: 10 }}>
            {[
              { label: "Next period", value: expectedEndDate },
              ...(predictions?.fertileWindowRange && predictions.ovulationReliable !== false
                ? [{ label: "Fertile window", value: compactRange(predictions.fertileWindowRange) }]
                : []),
            ].map((item) => (
              <View
                key={item.label}
                style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, gap: 2 }}
              >
                <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ fontSize: 12, lineHeight: 16, color: "#fff", opacity: 0.85, fontFamily: fonts.body }}>
                  {item.label}
                </Text>
                <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ fontSize: 14, lineHeight: 20, fontWeight: "700", color: "#fff", fontFamily: fonts.body }}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
        </LinearGradient>
      </View>
      )}
      </>
    ),
    quickActions: (
      <>
      {/* QUICK ACTIONS — the person's own buttons (lib/logFocus.ts), first one filled. */}
      {blockTitle(homeLayout, "quickActions") ? (
        <SectionHeader title={blockTitle(homeLayout, "quickActions")!} style={{ marginHorizontal: 24 }} />
      ) : null}
      {/* Equal columns (1–4), so long labels wrap within their own column. */}
      <View className="mx-6 mb-7 flex-row justify-center">
        {blockItems(homeLayout, "quickActions")
          .map((key) => LOG_FOCUS.find((f) => f.key === key))
          .filter((f): f is (typeof LOG_FOCUS)[number] => Boolean(f))
          .map((f, idx) => {
            const done = f.key === "flow" && periodLoggedToday;
            return {
              key: f.key,
              label: done ? "Period logged" : f.label,
              icon: done ? "checkmark" : f.icon,
              primary: idx === 0,
              count: loggedCount(f.key),
            };
          })
          .map((action) => (
          <PressableScale
            key={action.key}
            accessibilityLabel={action.count ? `${action.label}, ${action.count} logged today` : action.label}
            accessibilityRole="button"
            onPress={() => onQuickAction(action.key)}
            style={{ alignItems: "center", flex: 1, maxWidth: 110, paddingHorizontal: 3 }}
          >
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: action.primary ? colors.primary : colors.surface,
                ...(action.primary
                  ? { shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 18, elevation: 5 }
                  : getShadow(colors, isDark)),
              }}
            >
              <Icon set="ion"
                name={action.icon as any}
                size={24}
                color={action.primary ? colors.buttonText : colors.primary}
              />
              {action.count > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    minWidth: 22,
                    height: 22,
                    paddingHorizontal: 6,
                    borderRadius: 11,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.primary,
                    borderWidth: 2,
                    borderColor: colors.background,
                  }}
                >
                  <Text style={{ color: colors.buttonText, fontSize: 11, fontWeight: "700", fontFamily: fonts.body }}>{action.count}</Text>
                </View>
              ) : null}
            </View>
            <ColumnLabel lineHeight={18} style={{ fontSize: 13, fontWeight: "500", color: colors.foreground, fontFamily: fonts.body, marginTop: 10 }}>
              {genZLabel(action.label, genZModeEnabled)}
            </ColumnLabel>
          </PressableScale>
        ))}
      </View>
      </>
    ),
    shortcuts:
      homeShortcuts.length === 0 ? null : (
        <>
          <SectionHeader
            title={homeLayout.blocks.shortcuts?.title ?? genZLabel("Shortcuts", genZModeEnabled)}
            style={{ marginHorizontal: 24 }}
          />
          <HomeShortcuts tiles={homeShortcuts} style={{ marginBottom: 28 }} />
        </>
      ),
    promo_middle: <PromoBanners placement="home_middle" style={{ marginBottom: 18 }} />,
    insights: (
      <>
      {/* INSIGHTS — cycle health + recent cycle lengths as a peeking
          carousel; "See all" opens the full predictions screen. */}
      <View className="mb-5">
        <SectionHeader
          title={homeLayout.blocks.insights?.title ?? sectionText(shownHome, "insights", insightsLabel)}
          actionLabel={seeAllLabel}
          onAction={() => router.push("/(app)/predictions")}
          style={{ marginHorizontal: 24 }}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          // Room above and below the cards: a horizontal ScrollView clips its
          // children, so without it the cards' bottom edge and shadow get cut
          // and the next section sits on them.
          contentContainerStyle={{ paddingLeft: 24, paddingRight: 24, paddingTop: 6, paddingBottom: 16, gap: 12 }}
        >
          {!homeLoaded ? (
            <>
              <SkeletonCard style={{ width: insightCardWidth }} />
              <SkeletonCard style={{ width: TREND_CARD_WIDTH }} />
            </>
          ) : (
          <>
          {/* Cycle health */}
          <View style={{ width: insightCardWidth, backgroundColor: colors.surface, borderRadius: 22, padding: 18, gap: 16, ...getShadow(colors, isDark) }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-4" style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "700", color: colors.primaryDark, letterSpacing: 0.7, fontFamily: fonts.body, textTransform: "uppercase" }}>
                  Cycle health
                </Text>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>
                    {treeHealth}
                  </Text>
                  <View style={{ backgroundColor: healthTone.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: healthTone.color, fontFamily: fonts.body }}>
                      {healthTone.label}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={{ position: "relative", width: 60, height: 60 }}>
                <Svg width={60} height={60} viewBox="0 0 60 60">
                  <Circle cx="30" cy="30" r="26" fill="none" stroke={colors.primaryLight} strokeWidth={6} />
                  <Circle cx="30" cy="30" r="26" fill="none" stroke={colors.primary} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${(treeHealth / 100) * 163.4} 163.4`} transform="rotate(-90 30 30)" />
                </Svg>
                <View style={{ position: "absolute", inset: 0, justifyContent: "center", alignItems: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                    {treeHealth}%
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: colors.track }} />

            <View className="flex-row items-center">
              {[
                // Short labels that fit one line in a third of the card.
                { value: loggedDays, label: "Days logged" },
                { value: periodLength || 5, label: "Period days" },
                { value: typeof fertileWindow === "number" ? fertileWindow : 6, label: "Fertile days" },
              ].map((stat, i) => (
                <View
                  key={i}
                  className="flex-1 items-center"
                  style={{ gap: 2, borderLeftWidth: i === 0 ? 0 : 1, borderColor: colors.track }}
                >
                  <Text style={{ fontSize: 18, lineHeight: 24, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>
                    {stat.value}
                  </Text>
                  <ColumnLabel style={{ fontSize: 12, color: colors.mutedText, fontFamily: fonts.body }}>{stat.label}</ColumnLabel>
                </View>
              ))}
            </View>
          </View>

          {/* Cycle length: the average plus the last three cycles as bars, newest solid. */}
          <View style={{ width: TREND_CARD_WIDTH, backgroundColor: colors.surface, borderRadius: 22, padding: 18, gap: 12, ...getShadow(colors, isDark) }}>
            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "700", color: colors.primaryDark, letterSpacing: 0.7, fontFamily: fonts.body, textTransform: "uppercase" }}>
              Cycle length
            </Text>
            <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>
              {predictions?.cycleLength ?? 28}
              <Text style={{ fontSize: 13, fontWeight: "500", color: colors.mutedText }}> days avg</Text>
            </Text>
            <View
              className="flex-row items-end"
              style={{ height: 52, gap: 10 }}
              accessible
              accessibilityLabel={recentLengths.length ? `Last cycles: ${recentLengths.join(", ")} days` : "No past cycles yet"}
            >
              {recentLengths.length === 0 ? (
                <Text style={{ fontSize: 12, color: colors.mutedText, fontFamily: fonts.body }}>Shows after your next period</Text>
              ) : (
                recentLengths.map((length, idx) => (
                  <View
                    key={idx}
                    style={{
                      width: 14,
                      height: `${Math.max(20, (length / maxRecentLength) * 100)}%`,
                      borderRadius: 7,
                      backgroundColor: idx === recentLengths.length - 1 ? colors.primary : colors.primaryLight,
                    }}
                  />
                ))
              )}
            </View>
          </View>
          </>
          )}
        </ScrollView>
      </View>
      </>
    ),
    moreForYou: !blockItems(homeLayout, "moreForYou").some((h) => hubHasFeatures[h as keyof typeof hubHasFeatures]) ? null : (
      <>
      {/* MORE FOR YOU — one row per hub (care-hub / wellness-hub /
          explore-hub). Home stays a short dashboard; new destinations go in
          the hubs, not here. */}
      <View className="mx-6 mb-7">
        <SectionHeader title={homeLayout.blocks.moreForYou?.title ?? sectionText(shownHome, "moreForYou", moreForYouLabel)} />
        <ListGroup>
          {blockItems(homeLayout, "moreForYou").map((hub) => (hubHasFeatures[hub as keyof typeof hubHasFeatures] ? hubCards[hub] : null))}
        </ListGroup>
      </View>
      </>
    ),
  };

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        {/* FIXED HEADER - stays in place while body scrolls */}
        <View
          className="px-6 pt-3 pb-2 flex-row items-center"
          style={{ backgroundColor: colors.background, gap: 12 }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colors.primaryLight,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon set="ion" name="happy-outline" size={22} color={colors.primaryDark} />
          </View>
          <View className="flex-1">
            <Text
              style={{ fontSize: 18, lineHeight: 24, fontWeight: "700", letterSpacing: -0.2, color: colors.foreground, fontFamily: fonts.heading }}
              numberOfLines={1}
            >
              {greeting}, {user?.firstName || "there"}
            </Text>
            <Text
              style={{ fontSize: 13, lineHeight: 20, color: colors.mutedText, fontFamily: fonts.body }}
              numberOfLines={1}
            >
              You&apos;ve got this today
            </Text>
          </View>

          <View>
            <HeaderIconButton
              icon="notifications-outline"
              accessibilityLabel={hasUnreadNotifications ? "Notifications, unread" : "Notifications"}
              onPress={() => router.push("/(app)/notifications")}
            />
            {hasUnreadNotifications && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 10,
                  right: 11,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: colors.primary,
                  borderWidth: 2,
                  borderColor: colors.surface,
                }}
              />
            )}
          </View>
        </View>

        {/* SCROLLABLE BODY */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {/* Wait for the person's saved layout so Home doesn't draw the default first. */}
          {!homeLayoutReady ? (
            <View className="mx-6 mt-3" style={{ gap: 16 }}>
              <SkeletonBlock width="100%" height={72} radius={20} />
              <SkeletonBlock width="100%" height={150} radius={24} />
            </View>
          ) : (
            // Sections fade up in order once the layout is known; later
            // refreshes keep the same keys, so they don't animate again.
            shownHome.map((section, i) => (
              <Animated.View key={section.key} entering={listEntering(i, 6)}>
                {homeSections[section.key]}
              </Animated.View>
            ))
          )}
          {homeLayoutReady && shownHome.every((s) => s.key.startsWith("promo_")) ? (
            <EmptyState
              icon="view-grid-outline"
              title="Your Home is empty"
              message="Turn blocks back on in Customize Home."
              actionLabel="Customize Home"
              onAction={() => router.push("/(app)/customize-home")}
            />
          ) : null}
        </ScrollView>
      </SafeAreaView>
      {quick.overlays}
      <PromoPopup />
    </>
  );
}
