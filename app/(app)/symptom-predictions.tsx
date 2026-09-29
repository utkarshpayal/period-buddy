import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getSeverityColor, getShadow, getSoftTints } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { FeatureGate } from "../../components/subscription/FeatureGate";
import { cycleApi, type SymptomPrediction } from "../../lib/api";
import { formatShortDate } from "../../lib/format";

const PHASE_LABELS: Record<string, string> = {
  period: "Menstrual",
  follicular: "Follicular",
  ovulation: "Ovulation",
  luteal: "Luteal",
};

const PHASE_ORDER = ["period", "follicular", "ovulation", "luteal"];

type SymptomPredictionsData = { nextCycleStart: string | null; predictions: SymptomPrediction[] };

export default function SymptomPredictionsScreen() {
  return (
    <FeatureGate
      featureKey="symptom_predictions"
      title="Symptom Predictions"
      description="Symptoms to expect in each phase."
    >
      <SymptomPredictionsContent />
    </FeatureGate>
  );
}

function SymptomPredictionsContent() {
  const { colors, isDark, fonts } = useTheme();
  const softTints = getSoftTints(colors);

  const { data, loading, refreshing, error, offline, reload } = useAsyncLoad<SymptomPredictionsData>(async () => {
    const result = await cycleApi.getSymptomPredictions();
    return { nextCycleStart: result.nextCycleStart, predictions: result.predictions ?? [] };
  }, [], { refreshOn: ["cycle"] });

  const nextCycleStart = data?.nextCycleStart ?? null;
  const predictions = useMemo(() => data?.predictions ?? [], [data]);

  const byPhase = useMemo(() => {
    const map = new Map<string, SymptomPrediction[]>();
    predictions.forEach((p) => {
      const list = map.get(p.phase) ?? [];
      list.push(p);
      map.set(p.phase, list);
    });
    map.forEach((list) => list.sort((a, b) => b.likelihood - a.likelihood));
    return map;
  }, [predictions]);

  const availablePhases = useMemo(() => {
    const ordered = [
      ...PHASE_ORDER.filter((p) => byPhase.has(p)),
      ...Array.from(byPhase.keys()).filter((p) => !PHASE_ORDER.includes(p)),
    ];
    return ordered;
  }, [byPhase]);

  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPhase && availablePhases.length > 0) {
      setSelectedPhase(availablePhases[0]);
    }
  }, [availablePhases, selectedPhase]);

  const activePhase = selectedPhase && byPhase.has(selectedPhase) ? selectedPhase : availablePhases[0];
  const activeItems = activePhase ? byPhase.get(activePhase) ?? [] : [];
  const cyclesAnalyzed = activeItems[0]?.cyclesAnalyzed;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Symptom Predictions" />

        <LoadingErrorState
          loading={loading}
          error={error}
          offline={offline}
          onRetry={() => reload()}
          loadingLabel="Analyzing your cycle history…"
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
          {predictions.length === 0 ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 60 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />
              }
            >
              <View className="mx-6 mt-5">
                <View
                  className="border p-6 items-center"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24, ...getShadow(colors, isDark) }}
                >
                  <MaterialCommunityIcons name="database-search-outline" size={30} color={colors.mutedText} />
                  <Text className="mt-3 text-sm font-bold text-center" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                    Not enough cycle history yet
                  </Text>
                  <Text className="mt-1.5 text-xs text-center leading-5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                    This isn&apos;t a sign of low risk — we simply need a few more logged cycles before we can predict
                    symptom patterns for you. Keep logging in the tracker.
                  </Text>
                </View>
              </View>
            </ScrollView>
          ) : (
            <View className="flex-1">
              {/* Phase tab strip — mirrors mockup's horizontal pill selector */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 14, gap: 8 }}
              >
                {availablePhases.map((phase) => {
                  const selected = phase === activePhase;
                  return (
                    <TouchableOpacity
                      key={phase}
                      activeOpacity={0.8}
                      onPress={() => setSelectedPhase(phase)}
                      className="px-3.5 py-2 rounded-xl"
                      style={{ backgroundColor: selected ? colors.primary : colors.surface }}
                    >
                      <Text
                        className="text-xs font-extrabold"
                        style={{ color: selected ? colors.buttonText : colors.mutedText, fontFamily: fonts.body }}
                      >
                        {PHASE_LABELS[phase] ?? phase}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 60 }}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />
                }
              >
                <View className="px-6">
                  {nextCycleStart ? (
                    <View
                      className="flex-row items-center gap-3 p-4 border mb-4"
                      style={{ backgroundColor: softTints.pink, borderColor: colors.border, borderRadius: 20 }}
                    >
                      <MaterialCommunityIcons name="calendar-heart" size={20} color={colors.primary} />
                      <Text className="flex-1 text-xs font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                        Predictions cover your next cycle, starting {formatShortDate(nextCycleStart)}.
                      </Text>
                    </View>
                  ) : null}

                  <Text className="text-xs font-semibold leading-5 mb-4" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                    {cyclesAnalyzed
                      ? `Based on your last ${cyclesAnalyzed} cycles, here's what's likely during your ${(PHASE_LABELS[activePhase ?? ""] ?? activePhase ?? "").toLowerCase()} phase.`
                      : `Here's what's likely during your ${(PHASE_LABELS[activePhase ?? ""] ?? activePhase ?? "").toLowerCase()} phase.`}
                  </Text>

                  <View style={{ gap: 14 }}>
                    {activeItems.map((item, idx) => {
                      const color = getSeverityColor(item.likelihood, colors);
                      return (
                        <View key={`${item.symptom}-${idx}`}>
                          <View className="flex-row items-center justify-between mb-1.5">
                            <Text className="text-sm font-extrabold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                              {item.symptom}
                            </Text>
                            <Text className="text-sm font-black" style={{ color, fontFamily: fonts.mono }}>
                              {Math.round(item.likelihood)}%
                            </Text>
                          </View>
                          <View className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: colors.border }}>
                            <View
                              style={{
                                width: `${Math.min(100, Math.max(2, item.likelihood))}%`,
                                height: "100%",
                                backgroundColor: color,
                                borderRadius: 999,
                              }}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  <View
                    className="p-4 border flex-row items-start gap-3 mt-6"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20 }}
                  >
                    <Feather name="info" size={14} color={colors.mutedText} style={{ marginTop: 1 }} />
                    <Text className="flex-1 text-xs leading-4 font-medium" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                      Based on your own logs. Not a diagnosis.
                    </Text>
                  </View>
                </View>
              </ScrollView>
            </View>
          )}
        </LoadingErrorState>
      </SafeAreaView>
    </>
  );
}
