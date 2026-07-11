import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../components/theme";
import {
  getActionGradient,
  getSoftTints,
  getSurfaceGradient,
} from "../../components/ui-tokens";
import { cycleApi, type Predictions as CyclePredictions } from "../../lib/api";

const PHASE_META: Record<string, { label: string; color: string; description: string }> = {
  period: { label: "Period", color: "#e11d48", description: "Rest, hydrate, and notice what your body needs." },
  follicular: { label: "Follicular", color: "#d97706", description: "Energy often starts to rise after bleeding slows." },
  ovulation: { label: "Ovulation", color: "#d9467d", description: "A common peak-fertility window for many cycles." },
  luteal: { label: "Luteal", color: "#7c3aed", description: "Mood, cravings, and sleep can shift before your period." },
};

export default function Predictions() {
  const { colors, isDark } = useTheme();
  const router = useRouter();

  const [data, setData] = useState<CyclePredictions | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const softTints = getSoftTints(colors);
  const surfaceGradient = getSurfaceGradient(colors, isDark) as [string, string];
  const actionGradient = getActionGradient(colors) as [string, string];

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const predictions = await cycleApi.getPredictions();
      setData(predictions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load predictions");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const phaseMeta = data ? PHASE_META[data.currentPhase] ?? PHASE_META.follicular : null;

  const maxBarLength = data?.analyticsData?.length
    ? Math.max(...data.analyticsData.map((d) => d.length), 1)
    : 35;

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        {/* Navigation */}
        <View className="flex-row items-center gap-2 px-6 pt-6">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="p-2 -ml-2 rounded-full border"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <Text className="flex-1 text-2xl font-black tracking-tight ml-2" style={{ color: colors.foreground }}>
            Smart Predictions
          </Text>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="mt-4 text-sm font-semibold" style={{ color: colors.mutedText }}>
              Computing your cycle…
            </Text>
          </View>
        ) : error ? (
          <View className="flex-1 items-center justify-center px-8">
            <MaterialCommunityIcons name="calendar-alert" size={48} color={colors.primary} />
            <Text className="mt-4 text-base font-bold text-center" style={{ color: colors.foreground }}>
              {error.includes("setup") ? "No cycle data yet" : "Couldn't load predictions"}
            </Text>
            <Text className="mt-2 text-xs text-center leading-5" style={{ color: colors.mutedText }}>
              {error.includes("setup")
                ? "Set up your cycle settings in the tracker to unlock predictions."
                : error}
            </Text>
            <TouchableOpacity
              onPress={() => load()}
              className="mt-6 px-6 py-3 rounded-2xl"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-sm font-bold" style={{ color: colors.buttonText }}>
                {error.includes("setup") ? "Go to Tracker" : "Retry"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : data ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 60 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor={colors.primary}
              />
            }
          >
            <View className="mx-6 mt-8">
              {/* Current Phase Badge */}
              {phaseMeta && (
                <View
                  className="flex-row items-center gap-3 p-4 rounded-2xl border mb-5"
                  style={{ backgroundColor: colors.surface, borderColor: `${phaseMeta.color}40` }}
                >
                  <View className="w-3 h-3 rounded-full" style={{ backgroundColor: phaseMeta.color }} />
                  <View className="flex-1">
                    <Text className="text-xs font-black uppercase tracking-widest" style={{ color: phaseMeta.color }}>
                      {phaseMeta.label} Phase — Day {data.currentCycleDay}
                    </Text>
                    <Text className="text-[11px] mt-0.5 font-medium" style={{ color: colors.mutedText }}>
                      {phaseMeta.description}
                    </Text>
                  </View>
                </View>
              )}

              {/* Hero: Next Period */}
              <View
                className="rounded-3xl border overflow-hidden shadow-lg mb-5"
                style={{ borderColor: colors.border }}
              >
                <LinearGradient
                  colors={surfaceGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  className="p-6 flex-row items-center justify-between"
                >
                  <View className="flex-1 pr-4">
                    <Text className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: colors.primary }}>
                      Next Period
                    </Text>
                    <Text className="text-3xl font-black tracking-tighter" style={{ color: colors.foreground }}>
                      {data.nextPeriodDate}
                    </Text>
                    <Text className="mt-1.5 text-xs font-semibold" style={{ color: colors.mutedText }}>
                      {data.nextPeriodDaysAway === 0
                        ? "Starting today"
                        : `In ${data.nextPeriodDaysAway} days`}
                    </Text>
                  </View>
                  <View className="p-3.5 rounded-2xl" style={{ backgroundColor: softTints.pink }}>
                    <MaterialCommunityIcons name="calendar-heart" size={28} color={colors.primary} />
                  </View>
                </LinearGradient>
              </View>

              {/* Fertile Window + Ovulation */}
              <View className="flex-row gap-4 mb-5">
                <View
                  className="flex-1 rounded-3xl border p-5 shadow-sm justify-between min-h-[140px]"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                >
                  <View className="self-start p-2.5 rounded-xl" style={{ backgroundColor: softTints.blue }}>
                    <Ionicons name="heart-outline" size={18} color={colors.secondary} />
                  </View>
                  <View className="mt-4">
                    <Text className="text-[11px] font-bold tracking-wide" style={{ color: colors.mutedText }}>
                      Fertile Window
                    </Text>
                    <Text className="text-lg font-black tracking-tight mt-0.5" style={{ color: colors.foreground }}>
                      {data.fertileWindowRange}
                    </Text>
                    <Text className="text-[10px] font-semibold mt-0.5" style={{ color: colors.mutedText }}>
                      {data.fertileWindowDuration}
                    </Text>
                  </View>
                </View>

                <View
                  className="flex-1 rounded-3xl border p-5 shadow-sm justify-between min-h-[140px]"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                >
                  <View className="self-start p-2.5 rounded-xl" style={{ backgroundColor: softTints.amber }}>
                    <Feather name="zap" size={16} color={colors.accent} />
                  </View>
                  <View className="mt-4">
                    <Text className="text-[11px] font-bold tracking-wide" style={{ color: colors.mutedText }}>
                      Ovulation Day
                    </Text>
                    <Text className="text-lg font-black tracking-tight mt-0.5" style={{ color: colors.foreground }}>
                      {data.ovulationDate}
                    </Text>
                    <Text className="text-[10px] font-semibold mt-0.5" style={{ color: colors.mutedText }}>
                      {data.ovulationDaysAway === 0 ? "Today!" : `In ${data.ovulationDaysAway} days`}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Analytics graph */}
              {data.analyticsData?.length > 0 && (
                <View
                  className="rounded-3xl border overflow-hidden shadow-sm mb-5"
                  style={{ borderColor: colors.border }}
                >
                  <LinearGradient
                    colors={surfaceGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    className="p-5"
                  >
                    <Text className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: colors.secondary }}>
                      Analytics
                    </Text>
                    <Text className="text-base font-extrabold tracking-tight mb-5" style={{ color: colors.foreground }}>
                      Cycle Length Trends
                    </Text>
                    <View className="h-32 flex-row justify-between items-end px-2">
                      {data.analyticsData.map((d, i) => {
                        const heightPct = Math.max(0.15, d.length / maxBarLength);
                        const isLatest = i === data.analyticsData.length - 1;
                        return (
                          <View key={i} className="items-center flex-1 gap-1.5">
                            <Text className="text-[10px] font-bold" style={{ color: colors.mutedText }}>
                              {d.length}d
                            </Text>
                            <View
                              className="w-4 rounded-full overflow-hidden"
                              style={{ height: 100 * heightPct, backgroundColor: colors.surfaceSoft }}
                            >
                              <LinearGradient
                                colors={isLatest ? actionGradient : [colors.secondary, colors.info]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={{ flex: 1, opacity: isLatest ? 1 : 0.5 }}
                              />
                            </View>
                            <Text className="text-[10px] font-bold mt-0.5" style={{ color: colors.mutedText }}>
                              {d.month}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </LinearGradient>
                </View>
              )}

              {/* Cycle stats */}
              <View className="flex-row gap-3 mb-5">
                {[
                  { label: "Cycle Length", value: `${data.cycleLength}d`, icon: "repeat", color: colors.accent },
                  { label: "Period Length", value: `${data.periodLength}d`, icon: "droplet", color: colors.primary },
                ].map((s) => (
                  <View
                    key={s.label}
                    className="flex-1 rounded-2xl border p-4 items-center"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    <Feather name={s.icon as any} size={18} color={s.color} />
                    <Text className="mt-2 text-lg font-black" style={{ color: colors.foreground }}>
                      {s.value}
                    </Text>
                    <Text className="text-[10px] font-semibold mt-0.5" style={{ color: colors.mutedText }}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>

              {/* AI notice */}
              <View
                className="p-5 rounded-2xl border flex-row items-start gap-4"
                style={{ backgroundColor: colors.surface, borderColor: colors.border }}
              >
                <View className="p-2 rounded-xl" style={{ backgroundColor: softTints.emerald }}>
                  <MaterialCommunityIcons name="shield-check-outline" size={18} color={colors.success} />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold" style={{ color: colors.foreground }}>
                    {data.isDataHighlyAccurate ? "✓ High accuracy" : "Improving accuracy"}
                  </Text>
                  <Text className="mt-1 text-xs leading-4 font-medium" style={{ color: colors.mutedText }}>
                    Built from your logged cycle history. Keep logging regularly
                    to make predictions more personal and useful.
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </>
  );
}
