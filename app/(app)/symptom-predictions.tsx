import React, { useMemo, useState } from "react";
import { LayoutAnimation, RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { SymptomTrendChart } from "../../components/SymptomTrendChart";
import { FeatureGate } from "../../components/subscription/FeatureGate";
import { symptomOptions } from "../../components/logOptions";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { cycleApi, type SymptomPrediction } from "../../lib/api";
import { getCyclePhase, type CyclePhase } from "../../lib/cycle";
import { dateFromDayKey, formatShortDate } from "../../lib/format";
import { SAMPLE_SYMPTOM_PREDICTIONS, sampleNextCycleStart } from "../../lib/symptomDemo";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { Icon } from "../../components/Icon";
import { motion } from "../../components/motion";

const PHASE_ORDER: CyclePhase[] = ["period", "follicular", "ovulation", "luteal"];

/**
 * Stages named by when they happen, not by their medical name (which stays
 * as small print), so the screen reads like a friend explaining your cycle.
 */
const STAGES: Record<CyclePhase, { title: string; medical: string; chart: string; note: string }> = {
  period: { title: "During your period", medical: "Menstrual phase", chart: "Period", note: "Energy is often lower. Rest is normal." },
  follicular: { title: "After your period", medical: "Follicular phase", chart: "After", note: "Many people feel more energetic and upbeat." },
  ovulation: { title: "Middle of your cycle", medical: "Ovulation", chart: "Middle", note: "Your most fertile days. Some feel a twinge on one side." },
  luteal: { title: "Before your period", medical: "Luteal phase", chart: "Before", note: "PMS signs like cravings or mood changes can show up." },
};

// Day-log tags that share the symptoms list but aren't symptoms.
const isNotASymptom = (tag: string) => tag === "everything-is-fine" || tag.includes("-test-");
const SYMPTOM_LABELS = new Map(symptomOptions.map((o) => [o.value, o.label]));
const SYMPTOM_ICONS = new Map(symptomOptions.map((o) => [o.label, o.icon]));
/** The app's label for a symptom tag, else "blood-clots" → "Blood clots". */
const symptomLabel = (tag: string) => {
  const known = SYMPTOM_LABELS.get(tag);
  if (known) return known;
  const words = tag.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** How often, in words, so nobody has to interpret a percentage. */
function howOften(likelihood: number) {
  if (likelihood >= 80) return { words: "Almost every cycle", dots: 5 };
  if (likelihood >= 60) return { words: "Most cycles", dots: 4 };
  if (likelihood >= 40) return { words: "About half the time", dots: 3 };
  if (likelihood >= 20) return { words: "Sometimes", dots: 2 };
  return { words: "Rarely", dots: 1 };
}

/** "cravings, tender breasts and acne" */
function listInWords(items: string[]) {
  const lower = items.map((s) => s.toLowerCase());
  if (lower.length <= 1) return lower.join("");
  return `${lower.slice(0, -1).join(", ")} and ${lower[lower.length - 1]}`;
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

type ScreenData = {
  predictions: SymptomPrediction[];
  nextCycleStart: string | null;
  sample: boolean;
  currentPhase: CyclePhase | null;
  cycleDay: number | null;
  periodLength: number;
  cycleLength: number;
  nextPeriodDaysAway: number | null;
  daysLate: number;
  /** Finished cycles the backend analysed (3+ needed for any pattern). */
  totalCycles: number;
};

export default function SymptomPredictionsScreen() {
  return (
    <FeatureGate featureKey="symptom_predictions" title="Symptom Predictions" description="Symptoms to expect in each phase.">
      <SymptomPredictionsContent />
    </FeatureGate>
  );
}

function SymptomPredictionsContent() {
  useSecureScreen("symptom-predictions");
  const { colors, isDark, fonts } = useTheme();

  const { data, loading, refreshing, error, offline, reload } = useAsyncLoad<ScreenData>(
    async () => {
      // Today's stage is a nice-to-have: the screen still works without it.
      const [result, cycle] = await Promise.all([cycleApi.getSymptomPredictions(), cycleApi.getPredictions().catch(() => null)]);
      let predictions = (result.predictions ?? [])
        .filter((p) => !isNotASymptom(p.symptom))
        .map((p) => ({ ...p, symptom: symptomLabel(p.symptom) }));
      let nextCycleStart = result.nextCycleStart;
      // Dev builds show sample data on an account with no history, so the
      // screen can be reviewed; release builds keep the empty state.
      const sample = __DEV__ && predictions.length === 0;
      if (sample) {
        predictions = SAMPLE_SYMPTOM_PREDICTIONS;
        nextCycleStart = sampleNextCycleStart();
      }
      const phase = (cycle?.currentPhase ?? null) as CyclePhase | null;
      return {
        predictions,
        nextCycleStart,
        sample,
        currentPhase: phase && PHASE_ORDER.includes(phase) ? phase : sample ? "luteal" : null,
        cycleDay: cycle?.currentCycleDay ?? (sample ? 21 : null),
        periodLength: cycle?.periodLength || 5,
        cycleLength: cycle?.cycleLength || 28,
        nextPeriodDaysAway: cycle?.nextPeriodDaysAway ?? (sample ? 9 : null),
        daysLate: cycle?.isLate ? cycle.daysLate ?? 0 : 0,
        totalCycles: sample ? 6 : result.cyclesAnalyzed ?? predictions[0]?.cyclesAnalyzed ?? 0,
      };
    },
    [],
    { refreshOn: ["cycle"] }
  );

  const predictions = useMemo(() => data?.predictions ?? [], [data]);
  const currentPhase = data?.currentPhase ?? null;
  const cyclesAnalyzed = data?.totalCycles ?? 0;
  const ranges = useMemo(() => phaseDayRanges(data?.periodLength ?? 5, data?.cycleLength ?? 28), [data]);

  const stageColors = useMemo<Record<CyclePhase, { solid: string; soft: string }>>(
    () => ({
      period: { solid: colors.rose, soft: colors.roseLight },
      follicular: { solid: colors.mint, soft: colors.mintLight },
      ovulation: { solid: colors.lavender, soft: colors.lavenderLight },
      luteal: { solid: colors.gold, soft: colors.goldLight },
    }),
    [colors]
  );

  const byPhase = useMemo(() => {
    const map = new Map<CyclePhase, SymptomPrediction[]>();
    predictions.forEach((p) => {
      const phase = p.phase as CyclePhase;
      map.set(phase, [...(map.get(phase) ?? []), p]);
    });
    map.forEach((list) => list.sort((a, b) => b.likelihood - a.likelihood));
    return map;
  }, [predictions]);

  // Stable props for the chart, so a scrub (which re-renders this screen)
  // doesn't rebuild every series and path in it.
  const chartPhases = useMemo(() => PHASE_ORDER.filter((p) => byPhase.has(p)), [byPhase]);
  const chartPhaseLabels = useMemo(() => Object.fromEntries(PHASE_ORDER.map((p) => [p, STAGES[p].chart])), []);
  const chartPhaseColors = useMemo(
    () => Object.fromEntries(PHASE_ORDER.map((p) => [p, stageColors[p].solid])),
    [stageColors],
  );

  const [chartOpen, setChartOpen] = useState(false);
  const [chartPhase, setChartPhase] = useState<string | null>(null);

  const card = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
    ...getShadow(colors, isDark),
  } as const;

  const daysLabel = (phase: CyclePhase) => {
    const r = ranges[phase];
    if (!r) return "";
    return r.from === r.to ? `Day ${r.from}` : `Days ${r.from}–${r.to}`;
  };

  const nowItems = currentPhase ? (byPhase.get(currentPhase) ?? []).slice(0, 3) : [];
  const daysAway = data?.nextPeriodDaysAway;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Symptom Predictions" subtitle={data?.sample ? "Sample data · dev builds only" : undefined} />

        <LoadingErrorState
          loading={loading}
          error={error}
          offline={offline}
          onRetry={() => reload()}
          loadingLabel="Looking at your past cycles…"
          errorIcon="chart-line-variant"
          errorTitle="Couldn't load predictions"
          skeleton={
            <View className="gap-4 px-6 pt-4">
              <SkeletonCard />
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
            {predictions.length === 0 ? (
              <View style={{ ...card, padding: 20, marginTop: 8 }}>
                <EmptyState
                  icon="chart-line-variant"
                  title="Not enough cycle history yet"
                  message="Log your period and how you feel for at least 2 cycles. Then we'll show which symptoms usually come at each point in your cycle."
                />
              </View>
            ) : (
              <>
                {/* Intro in one sentence */}
                <Text style={{ fontSize: 15, lineHeight: 22, color: colors.mutedText, fontFamily: fonts.body, marginBottom: 16 }}>
                  {cyclesAnalyzed
                    ? `We looked at ${cyclesAnalyzed} of your past cycles to see which symptoms you usually get, and when.`
                    : "Which symptoms you usually get, and when."}
                </Text>

                {/* Right now, in plain sentences */}
                {currentPhase ? (
                  <Animated.View
                    entering={FadeInDown.duration(motion.duration.slow)}
                    style={{
                      ...card,
                      padding: 20,
                      marginBottom: 28,
                      backgroundColor: stageColors[currentPhase].soft,
                      borderColor: isDark ? colors.border : "transparent",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body }}>
                      {`Today${data?.cycleDay ? ` · day ${data.cycleDay} of your cycle` : ""}`}
                    </Text>
                    <Text style={{ marginTop: 6, fontSize: 22, lineHeight: 29, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                      {data?.daysLate
                        ? `Your period is ${data.daysLate} day${data.daysLate === 1 ? "" : "s"} late`
                        : daysAway != null && daysAway > 0
                        ? `Your period is due in ${daysAway} day${daysAway === 1 ? "" : "s"}`
                        : STAGES[currentPhase].title}
                    </Text>
                    <Text style={{ marginTop: 8, fontSize: 15, lineHeight: 22, color: colors.foreground, fontFamily: fonts.body }}>
                      {nowItems.length
                        ? `Around this time you usually get ${listInWords(nowItems.map((p) => p.symptom))}.`
                        : "You don't usually log symptoms at this point in your cycle."}
                    </Text>
                    {data?.nextCycleStart && daysAway != null && daysAway > 0 ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 }}>
                        <Icon set="ion" name="calendar-outline" size={15} color={colors.mutedText} />
                        <Text style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>
                          Expected around {formatShortDate(dateFromDayKey(data.nextCycleStart))}
                        </Text>
                      </View>
                    ) : null}
                  </Animated.View>
                ) : null}

                {/* The cycle as a timeline, every stage visible */}
                <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>
                  Your usual cycle
                </Text>
                <Text style={{ marginTop: 2, marginBottom: 16, fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>
                  What tends to happen at each point, from day 1 of your period
                </Text>

                {PHASE_ORDER.map((phase, index) => {
                  const items = byPhase.get(phase) ?? [];
                  const isNow = phase === currentPhase;
                  const last = index === PHASE_ORDER.length - 1;
                  return (
                    <Animated.View key={phase} entering={FadeInDown.delay(80 * index).duration(motion.duration.slow)} style={{ flexDirection: "row", gap: 14 }}>
                      {/* Timeline rail */}
                      <View style={{ alignItems: "center", width: 16 }}>
                        <View
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 8,
                            marginTop: 20,
                            backgroundColor: stageColors[phase].solid,
                            borderWidth: isNow ? 3 : 0,
                            borderColor: colors.surface,
                            ...(isNow ? { shadowColor: stageColors[phase].solid, shadowOpacity: 0.6, shadowRadius: 6, elevation: 3 } : null),
                          }}
                        />
                        {!last ? <View style={{ flex: 1, width: 2, marginTop: 4, backgroundColor: colors.border }} /> : null}
                      </View>

                      <View
                        style={{
                          flex: 1,
                          ...card,
                          padding: 16,
                          marginBottom: last ? 0 : 14,
                          borderColor: isNow ? stageColors[phase].solid : colors.border,
                          borderWidth: isNow ? 1.5 : 1,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>{STAGES[phase].title}</Text>
                            <Text style={{ marginTop: 2, fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body }}>
                              {[daysLabel(phase), STAGES[phase].medical].filter(Boolean).join(" · ")}
                            </Text>
                          </View>
                          {isNow ? (
                            <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: stageColors[phase].soft }}>
                              <Text style={{ fontSize: 11.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}>You are here</Text>
                            </View>
                          ) : null}
                        </View>

                        <Text style={{ marginTop: 8, fontSize: 13.5, lineHeight: 19, color: colors.mutedText, fontFamily: fonts.body }}>{STAGES[phase].note}</Text>

                        {items.length === 0 ? (
                          <Text style={{ marginTop: 12, fontSize: 14, color: colors.foreground, fontFamily: fonts.body }}>
                            No regular symptoms here. Usually a calm stretch for you.
                          </Text>
                        ) : (
                          <View style={{ marginTop: 12, gap: 12 }}>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>You usually get</Text>
                            {items.map((item) => {
                              const often = howOften(item.likelihood);
                              return (
                                <View
                                  key={item.symptom}
                                  accessible
                                  accessibilityLabel={`${item.symptom}: ${often.words}, ${item.occurrences} of ${item.cyclesAnalyzed} cycles`}
                                  style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
                                >
                                  <View
                                    style={{
                                      width: 34,
                                      height: 34,
                                      borderRadius: 11,
                                      alignItems: "center",
                                      justifyContent: "center",
                                      backgroundColor: stageColors[phase].soft,
                                    }}
                                  >
                                    <Icon set="ion" name={SYMPTOM_ICONS.get(item.symptom) ?? "ellipse-outline"} size={16} color={colors.foreground} />
                                  </View>
                                  <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                                      {item.symptom}
                                    </Text>
                                    <Text style={{ marginTop: 1, fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body }}>
                                      {`${often.words} · ${item.occurrences} of ${item.cyclesAnalyzed}`}
                                    </Text>
                                  </View>
                                  {/* Five dots: a glanceable "how often" */}
                                  <View style={{ flexDirection: "row", gap: 3 }} importantForAccessibility="no-hide-descendants">
                                    {[1, 2, 3, 4, 5].map((d) => (
                                      <View
                                        key={d}
                                        style={{
                                          width: 7,
                                          height: 7,
                                          borderRadius: 4,
                                          backgroundColor: d <= often.dots ? stageColors[phase].solid : colors.track,
                                        }}
                                      />
                                    ))}
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    </Animated.View>
                  );
                })}

                {/* Detailed chart, for people who want it */}
                <View style={{ marginTop: 28 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setChartOpen((v) => !v);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: chartOpen }}
                    style={{ ...card, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, marginBottom: chartOpen ? 12 : 0 }}
                  >
                    <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSoft }}>
                      <Icon set="feather" name="bar-chart-2" size={16} color={colors.foreground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                        {chartOpen ? "Hide detailed chart" : "See detailed chart"}
                      </Text>
                      <Text style={{ marginTop: 1, fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body }}>Compare symptoms across your cycle</Text>
                    </View>
                    <Icon set="feather" name={chartOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedText} />
                  </TouchableOpacity>
                  {chartOpen ? (
                    <SymptomTrendChart
                      predictions={predictions}
                      phases={chartPhases}
                      phaseLabels={chartPhaseLabels}
                      phaseColors={chartPhaseColors}
                      selectedPhase={chartPhase ?? currentPhase}
                      onSelectPhase={setChartPhase}
                      sample={data?.sample}
                      showHeadline={false}
                    />
                  ) : null}
                </View>

                {/* How we know, in one paragraph */}
                <View style={{ marginTop: 16, padding: 16, borderRadius: 20, backgroundColor: colors.surfaceSoft }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>How we know this</Text>
                  <Text style={{ marginTop: 6, fontSize: 13.5, lineHeight: 20, color: colors.mutedText, fontFamily: fonts.body }}>
                    {predictions[0]
                      ? `Every time you log a symptom, we note where you were in your cycle. "${predictions[0].occurrences} of ${predictions[0].cyclesAnalyzed}" next to ${predictions[0].symptom.toLowerCase()} means that out of the ${predictions[0].cyclesAnalyzed} past cycles where you logged anything at that point, you logged ${predictions[0].symptom.toLowerCase()} in ${predictions[0].occurrences}. We only show a symptom after at least 3 cycles, and your current cycle isn't counted until it ends.`
                      : "Every time you log a symptom, we note where you were in your cycle. The more you log, the more accurate this gets."}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                    <Icon set="feather" name="info" size={14} color={colors.mutedText} style={{ marginTop: 2 }} />
                    <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: colors.mutedText, fontFamily: fonts.body }}>
                      This comes only from your own logs and isn&apos;t a diagnosis. If something feels new, severe or worrying, talk to a doctor.
                    </Text>
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        </LoadingErrorState>
      </SafeAreaView>
    </>
  );
}
