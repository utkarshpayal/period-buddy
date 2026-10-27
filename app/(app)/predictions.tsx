import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { useDataRefresh } from "../../hooks/useDataRefresh";
import { cycleApi, type Predictions as CyclePredictions, getFriendlyErrorMessage } from "../../lib/api";
import { getCyclePhase, type CyclePhase } from "../../lib/cycle";
import { addDays } from "../../lib/cycleCalendar";
import { dateFromDayKey } from "../../lib/format";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { Icon } from "../../components/Icon";
import { motion } from "../../components/motion";
import { Button } from "../../components/Button";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Stages named by when they happen; the medical name is small print. */
const STAGES: Record<CyclePhase, { title: string; bar: string; note: string }> = {
  period: { title: "During your period", bar: "Period", note: "Rest, stay hydrated, and go easy on yourself." },
  follicular: { title: "After your period", bar: "After", note: "Energy and mood often lift around now." },
  ovulation: { title: "Your fertile days", bar: "Fertile", note: "The days you could get pregnant, most likely the 2 days before ovulation." },
  luteal: { title: "Before your period", bar: "Before", note: "Cravings, mood or sleep can shift before your period." },
};

const startOfToday = () => dateFromDayKey(new Date());
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS);
const fmtDay = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const fmtLong = (d: Date) => `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const fmtRange = (a: Date, b: Date) =>
  a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}` : `${fmtDay(a)} – ${fmtDay(b)}`;

function inDays(n: number) {
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n > 1) return `In ${n} days`;
  return n === -1 ? "Yesterday" : `${-n} days ago`;
}

/** First and last cycle day of each phase for this cycle length. */
function phaseDayRanges(periodLength: number, cycleLength: number) {
  const ranges = {} as Record<CyclePhase, { from: number; to: number }>;
  for (let day = 1; day <= cycleLength; day++) {
    const phase = getCyclePhase(day, periodLength, cycleLength);
    const r = ranges[phase];
    if (r) r.to = day;
    else ranges[phase] = { from: day, to: day };
  }
  return ranges;
}

export default function Predictions() {
  useSecureScreen("predictions");
  const { colors, isDark, fonts } = useTheme();

  const [data, setData] = useState<CyclePredictions | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setData(await cycleApi.getPredictions({ force: isRefresh }));
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
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
    })
  );

  const stageColors = useMemo<Record<CyclePhase, { solid: string; soft: string }>>(
    () => ({
      period: { solid: colors.rose, soft: colors.roseLight },
      follicular: { solid: colors.mint, soft: colors.mintLight },
      ovulation: { solid: colors.lavender, soft: colors.lavenderLight },
      luteal: { solid: colors.gold, soft: colors.goldLight },
    }),
    [colors]
  );

  const view = useMemo(() => {
    if (!data) return null;
    const today = startOfToday();
    const cycleLength = Math.max(data.cycleLength || 28, 1);
    const periodLength = data.periodLength || 5;
    const phase: CyclePhase = (["period", "follicular", "ovulation", "luteal"] as const).includes(data.currentPhase as CyclePhase)
      ? (data.currentPhase as CyclePhase)
      : getCyclePhase(data.currentCycleDay, periodLength, cycleLength);

    const nextPeriod = data.nextPeriodDateKey
      ? dateFromDayKey(data.nextPeriodDateKey)
      : data.nextPeriodDateISO
        ? dateFromDayKey(data.nextPeriodDateISO)
        : addDays(today, data.nextPeriodDaysAway);
    const windowStart = data.predictedPeriodStartEarliestISO ? dateFromDayKey(data.predictedPeriodStartEarliestISO) : null;
    const windowEnd = data.predictedPeriodStartLatestISO ? dateFromDayKey(data.predictedPeriodStartLatestISO) : null;

    // Next fertile window: this cycle's if it hasn't ended yet, else next cycle's.
    // The window is the 5 days before ovulation plus ovulation day (Wilcox 1995).
    let ovulation = data.ovulationDateISO ? dateFromDayKey(data.ovulationDateISO) : addDays(today, data.ovulationDaysAway);
    if (daysBetween(today, ovulation) < 0) ovulation = addDays(ovulation, cycleLength);
    const fertileStart = addDays(ovulation, -5);
    const fertileEnd = ovulation;
    const fertileNow = daysBetween(fertileStart, today) >= 0 && daysBetween(today, fertileEnd) >= 0;

    const history = (data.cycleLengthHistory?.length ? data.cycleLengthHistory : data.analyticsData.map((a) => a.length)).filter((n) => n > 0).slice(-6);

    return {
      isLate: !!data.isLate,
      daysLate: data.daysLate ?? 0,
      today,
      cycleLength,
      periodLength,
      phase,
      cycleDay: data.currentCycleDay,
      nextPeriod,
      daysAway: daysBetween(today, nextPeriod),
      windowStart,
      windowEnd,
      ovulation,
      fertileStart,
      fertileEnd,
      fertileNow,
      ranges: phaseDayRanges(periodLength, cycleLength),
      history,
    };
  }, [data]);

  const card = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
    ...getShadow(colors, isDark),
  } as const;

  const sectionTitle = (title: string, subtitle?: string) => (
    <View style={{ marginTop: 28, marginBottom: 12 }}>
      <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>
        {title}
      </Text>
      {subtitle ? <Text style={{ marginTop: 2, fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>{subtitle}</Text> : null}
    </View>
  );

  const needsSetup = !!error && error.toLowerCase().includes("setup");

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Smart Predictions" subtitle={data?.cyclesAnalyzed ? `Based on ${data.cyclesAnalyzed} cycles you logged` : undefined} />

        {loading ? (
          <View className="px-6 mt-6 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : error ? (
          <View className="flex-1 items-center justify-center px-8">
            <Icon set="ion" name="calendar-outline" size={44} color={colors.primary} />
            <Text style={{ marginTop: 14, fontSize: 17, fontWeight: "700", textAlign: "center", color: colors.foreground, fontFamily: fonts.heading }}>
              {needsSetup ? "Tell us about your cycle first" : "Couldn't load predictions"}
            </Text>
            <Text style={{ marginTop: 6, fontSize: 14, lineHeight: 20, textAlign: "center", color: colors.mutedText, fontFamily: fonts.body }}>
              {needsSetup ? "Add when your last period started and we'll predict the next one." : "Check your connection and try again."}
            </Text>
            <Button label={needsSetup ? "Go to tracker" : "Try again"} size="md" onPress={() => (needsSetup ? router.push("/(app)/(dashboard)/tracker") : load())} style={{ marginTop: 20 }} />
          </View>
        ) : data && view ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 60 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
          >
            {/* Out-of-date warning, with the fix one tap away */}
            {data.isStale ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: 16,
                  marginBottom: 16,
                  borderRadius: 20, borderCurve: "continuous",
                  backgroundColor: colors.warningLight,
                }}
              >
                <Icon set="feather" name="alert-circle" size={18} color={colors.warning} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>These dates may be off</Text>
                  <Text style={{ marginTop: 2, fontSize: 13, lineHeight: 18, color: colors.foreground, opacity: 0.8, fontFamily: fonts.body }}>
                    {`You haven't logged a period in ${typeof data.daysSinceLastActualPeriod === "number" ? `${data.daysSinceLastActualPeriod} days` : "a while"}. Log your next one and we'll correct them.`}
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: "/(app)/(dashboard)/tracker", params: { log: "today", focus: "flow" } })}
                    accessibilityRole="button"
                    hitSlop={6}
                    style={{ marginTop: 8, alignSelf: "flex-start" }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "800", color: colors.primaryDark, fontFamily: fonts.body }}>Log period</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* 1. Next period */}
            {view.isLate ? (
              <Animated.View entering={FadeInDown.duration(motion.duration.slow)} style={{ ...card, padding: 20, marginBottom: 16, backgroundColor: stageColors.period.soft, borderColor: isDark ? colors.border : "transparent" }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body }}>
                  {`Was due ${fmtLong(view.nextPeriod)}`}
                </Text>
                <Text style={{ marginTop: 6, fontSize: 24, lineHeight: 30, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                  {`Your period is ${view.daysLate} ${view.daysLate === 1 ? "day" : "days"} late`}
                </Text>
                <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, color: colors.foreground, fontFamily: fonts.body }}>
                  {data.noPeriodTooLong
                    ? "You haven't had a period in over 3 months. Please see a doctor: causes like thyroid problems, PCOS, stress or weight change are common and treatable."
                    : view.daysLate >= 7
                      ? "If there's any chance you could be pregnant, take a home pregnancy test now. It's most reliable from the day your period was due. If it's negative and your period still doesn't come, test again in a few days or see a doctor."
                      : "A few days late is common. Stress, illness, travel or a change in routine can delay ovulation. If there's any chance you could be pregnant, a home test is reliable from the day your period was due."}
                </Text>
                <Button
                  label="It started: log period"
                  size="sm"
                  onPress={() => router.push({ pathname: "/(app)/(dashboard)/tracker", params: { log: "today", focus: "flow" } })}
                  style={{ marginTop: 14, alignSelf: "flex-start" }}
                />
              </Animated.View>
            ) : null}

            <Animated.View entering={FadeInDown.duration(motion.duration.slow)} style={{ ...card, padding: 20 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body }}>
                {view.isLate ? "Where you are in this cycle" : "Your next period"}
              </Text>
              {!view.isLate ? (
              <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
                <Text style={{ flexShrink: 1, fontSize: 26, lineHeight: 32, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                  {fmtLong(view.nextPeriod)}
                </Text>
                <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: stageColors.period.soft }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}>{inDays(view.daysAway)}</Text>
                </View>
              </View>
              ) : null}
              {!view.isLate && view.windowStart && view.windowEnd ? (
                <Text style={{ marginTop: 6, fontSize: 14, lineHeight: 20, color: colors.mutedText, fontFamily: fonts.body }}>
                  {data.isEstimate
                    ? `Your cycles vary, so it could come anytime between ${fmtRange(view.windowStart, view.windowEnd)}.`
                    : `Most likely between ${fmtRange(view.windowStart, view.windowEnd)}. Even regular cycles shift by a day or two.`}
                </Text>
              ) : null}

              {/* Where you are in this cycle */}
              <View style={{ marginTop: 20 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                    {view.isLate ? `Day ${view.cycleDay} · period due` : `Day ${view.cycleDay} · ${STAGES[view.phase].title.toLowerCase()}`}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.mono }}>{`${view.cycleLength}-day cycle`}</Text>
                </View>
                <View style={{ height: 30 }}>
                  <View style={{ position: "absolute", top: 8, left: 0, right: 0, flexDirection: "row", gap: 2 }}>
                    {(["period", "follicular", "ovulation", "luteal"] as const).map((p) => {
                      const r = view.ranges[p];
                      if (!r) return null;
                      return (
                        <View
                          key={p}
                          style={{
                            flex: r.to - r.from + 1,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: stageColors[p].solid,
                            opacity: p === view.phase ? 1 : 0.4,
                          }}
                        />
                      );
                    })}
                  </View>
                  {/* Today marker */}
                  <View
                    style={{
                      position: "absolute",
                      top: 2,
                      left: `${Math.min(99, Math.max(0, ((Math.min(view.cycleDay, view.cycleLength) - 0.5) / view.cycleLength) * 100))}%`,
                      marginLeft: -11,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 4,
                      borderColor: colors.surface,
                      backgroundColor: colors.foreground,
                    }}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 2, marginTop: 2 }}>
                  {(["period", "follicular", "ovulation", "luteal"] as const).map((p) => {
                    const r = view.ranges[p];
                    if (!r) return null;
                    return (
                      <Text
                        key={p}
                        numberOfLines={1}
                        style={{
                          flex: r.to - r.from + 1,
                          fontSize: 11.5,
                          fontWeight: p === view.phase ? "800" : "600",
                          color: p === view.phase ? colors.foreground : colors.mutedText,
                          fontFamily: fonts.body,
                        }}
                      >
                        {STAGES[p].bar}
                      </Text>
                    );
                  })}
                </View>
                {!view.isLate ? (
                  <Text style={{ marginTop: 10, fontSize: 13.5, lineHeight: 19, color: colors.mutedText, fontFamily: fonts.body }}>{STAGES[view.phase].note}</Text>
                ) : null}
              </View>
            </Animated.View>

            {/* 2. Coming up */}
            {sectionTitle("Coming up")}
            <View style={{ ...card, paddingHorizontal: 16 }}>
              {[
                {
                  key: "period",
                  icon: "water-outline" as const,
                  tint: stageColors.period,
                  title: "Period starts",
                  detail: view.isLate ? `Was due ${fmtLong(view.nextPeriod)}` : fmtLong(view.nextPeriod),
                  when: view.isLate ? "Any day" : inDays(view.daysAway),
                },
                view.isLate
                  ? {
                      key: "fertile",
                      icon: "egg-outline" as const,
                      tint: stageColors.ovulation,
                      title: "Fertile days",
                      detail: "We'll work these out once your period starts",
                      when: "",
                    }
                  : data.fertileWindowReliable === false || data.ovulationReliable === false
                  ? {
                      key: "fertile",
                      icon: "egg-outline" as const,
                      tint: stageColors.ovulation,
                      title: "Fertile days",
                      detail: "Hard to predict when cycles vary a lot",
                      when: "",
                    }
                  : {
                      key: "fertile",
                      icon: "egg-outline" as const,
                      tint: stageColors.ovulation,
                      title: "Fertile days",
                      detail: `${fmtRange(view.fertileStart, view.fertileEnd)} · most likely to get pregnant`,
                      when: view.fertileNow ? "Now" : inDays(daysBetween(view.today, view.fertileStart)),
                    },
                ...(data.ovulationReliable === false || view.isLate
                  ? []
                  : [
                      {
                        key: "ovulation",
                        icon: "ellipse-outline" as const,
                        tint: stageColors.ovulation,
                        title: "Ovulation",
                        detail: `${fmtLong(view.ovulation)} · your egg is released`,
                        when: inDays(daysBetween(view.today, view.ovulation)),
                      },
                    ]),
              ]
                .sort((a, b) => {
                  const at = a.key === "period" ? view.nextPeriod : a.key === "fertile" ? view.fertileStart : view.ovulation;
                  const bt = b.key === "period" ? view.nextPeriod : b.key === "fertile" ? view.fertileStart : view.ovulation;
                  return at.getTime() - bt.getTime();
                })
                .map((row, i, rows) => (
                  <View
                    key={row.key}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 14,
                      borderBottomWidth: i < rows.length - 1 ? 1 : 0,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: row.tint.soft }}>
                      <Icon set="ion" name={row.icon} size={18} color={colors.foreground} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>{row.title}</Text>
                      <Text style={{ marginTop: 1, fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>{row.detail}</Text>
                    </View>
                    {row.when ? (
                      <Text style={{ fontSize: 13, fontWeight: "800", color: row.when === "Now" ? colors.primaryDark : colors.foreground, fontFamily: fonts.body }}>
                        {row.when}
                      </Text>
                    ) : null}
                  </View>
                ))}
            </View>

            {/* 3. Recent cycles */}
            {sectionTitle("Your recent cycles", "Days from the start of one period to the next")}
            <View style={{ ...card, padding: 18 }}>
              {view.history.length >= 2 ? (
                <>
                  {(() => {
                    const min = Math.min(...view.history);
                    const max = Math.max(...view.history);
                    const spread = max - min;
                    // Regular per FIGO: shortest-to-longest within 7–9 days (decided by the backend).
                    const range = data.normalCycleRange ?? { min: 24, max: 38 };
                    return (
                      <>
                        <Text style={{ fontSize: 15, lineHeight: 22, color: colors.foreground, fontFamily: fonts.body }}>
                          {min === max ? "Your cycles are " : "Your cycles are usually "}
                          <Text style={{ fontWeight: "800" }}>{min === max ? `${min} days` : `${min}–${max} days`}</Text>
                          {data.isRegular === true
                            ? ". That's regular."
                            : data.isRegular === false
                              ? `. They vary by ${spread} days, which counts as irregular and makes dates harder to predict.`
                              : "."}
                        </Text>
                        {data.outsideNormalRange ? (
                          <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 18, color: colors.foreground, fontFamily: fonts.body }}>
                            {`A typical cycle is ${range.min}–${range.max} days. Yours is often outside that, so it's worth mentioning to a doctor.`}
                          </Text>
                        ) : null}
                        {data.isRegular === false && !data.outsideNormalRange ? (
                          <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 18, color: colors.mutedText, fontFamily: fonts.body }}>
                            Some variation is normal. If it keeps happening, a doctor can check for things like thyroid problems or PCOS.
                          </Text>
                        ) : null}
                        {data.longPeriod ? (
                          <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 18, color: colors.foreground, fontFamily: fonts.body }}>
                            {`Your last period lasted ${data.lastPeriodDays} days. Bleeding for more than 8 days is worth checking with a doctor.`}
                          </Text>
                        ) : null}
                      </>
                    );
                  })()}
                  <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 130, marginTop: 18 }}>
                    {view.history.map((len, i) => {
                      const top = Math.max(...view.history, 35);
                      const latest = i === view.history.length - 1;
                      return (
                        <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                          <Text style={{ fontSize: 13.5, fontWeight: latest ? "800" : "600", color: colors.foreground, fontFamily: fonts.mono, marginBottom: 4 }}>{len}</Text>
                          <View
                            style={{
                              width: "70%",
                              maxWidth: 28,
                              height: `${Math.max(12, (len / top) * 78)}%`,
                              borderTopLeftRadius: 6,
                              borderTopRightRadius: 6,
                              backgroundColor: latest ? colors.primary : colors.primaryLight,
                            }}
                          />
                        </View>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }}>
                    {view.history.map((_, i) => (
                      <Text
                        key={i}
                        numberOfLines={1}
                        style={{ flex: 1, textAlign: "center", fontSize: 11.5, color: colors.mutedText, fontFamily: fonts.body }}
                      >
                        {i === view.history.length - 1 ? "Latest" : `${view.history.length - 1 - i} ago`}
                      </Text>
                    ))}
                  </View>
                </>
              ) : (
                <Text style={{ fontSize: 14, lineHeight: 20, color: colors.mutedText, fontFamily: fonts.body }}>
                  Log at least 2 periods and you&apos;ll see how long your cycles are here.
                </Text>
              )}

              <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
                {[
                  { label: "Usual cycle", value: `${view.cycleLength} days`, icon: "repeat" as const },
                  { label: "Usual period", value: `${view.periodLength} days`, icon: "droplet" as const },
                ].map((s) => (
                  <View key={s.label} style={{ flex: 1, padding: 14, borderRadius: 16, borderCurve: "continuous", backgroundColor: colors.surfaceSoft }}>
                    <Icon set="feather" name={s.icon} size={15} color={colors.mutedText} />
                    <Text style={{ marginTop: 8, fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: fonts.monoSemiBold ?? fonts.mono }}>{s.value}</Text>
                    <Text style={{ marginTop: 1, fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* 4. How sure we are */}
            {sectionTitle("How sure are we?")}
            {(() => {
              const level = data.confidence === "high" ? 3 : data.confidence === "medium" ? 2 : 1;
              const headline = level === 3 ? "Very sure" : level === 2 ? "Fairly sure" : "A rough guess for now";
              const reason =
                level === 3
                  ? `Your last ${data.cyclesAnalyzed ?? "few"} cycles were steady, so these dates should be close.`
                  : level === 2
                    ? "We have some history, but a few more logged periods will sharpen these dates."
                    : "We need more logged periods to learn your pattern. Each one you log makes this better.";
              return (
                <View style={{ ...card, padding: 18 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>{headline}</Text>
                    <View style={{ flexDirection: "row", gap: 4 }} accessibilityLabel={`${level} of 3`}>
                      {[1, 2, 3].map((n) => (
                        <View key={n} style={{ width: 22, height: 8, borderRadius: 4, backgroundColor: n <= level ? colors.primary : colors.track }} />
                      ))}
                    </View>
                  </View>
                  <Text style={{ marginTop: 6, fontSize: 14, lineHeight: 20, color: colors.mutedText, fontFamily: fonts.body }}>{reason}</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                    <Icon set="feather" name="info" size={14} color={colors.mutedText} style={{ marginTop: 2 }} />
                    <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: colors.mutedText, fontFamily: fonts.body }}>
                      Predictions are estimates from your own logs. Don&apos;t rely on fertile days alone for birth control.
                    </Text>
                  </View>
                </View>
              );
            })()}
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </>
  );
}
