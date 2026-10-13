import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { RefreshControl, ScrollView, StatusBar, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getHeroGradient, getShadow, getSoftTints } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { insightsApi } from "../../lib/api";

type DailyInsights = Awaited<ReturnType<typeof insightsApi.getDaily>>;

const PHASE_LABELS: Record<string, string> = {
  period: "Menstrual",
  follicular: "Follicular",
  ovulation: "Ovulatory",
  luteal: "Luteal",
};

function SuggestionChips({
  items,
  bg,
}: {
  items: string[];
  bg: string;
}) {
  const { colors, fonts } = useTheme();
  if (!items.length) return null;
  return (
    <View className="flex-row flex-wrap gap-2 mt-3">
      {items.map((item, idx) => (
        <View
          key={`${item}-${idx}`}
          className="rounded-full px-3 py-1.5"
          style={{ backgroundColor: bg }}
        >
          {/* Text uses foreground, not the accent `color`: the chip's bg is a
              soft tint of that same accent, so accent-on-tint was near-invisible. */}
          <Text className="text-xs font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

function InsightCard({
  icon,
  title,
  body,
  color,
  bg,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  body: string;
  color: string;
  bg: string;
}) {
  const { colors, isDark, fonts } = useTheme();
  if (!body) return null;
  return (
    <View
      className="border p-5 mb-3.5"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 24,
        ...getShadow(colors, isDark),
      }}
    >
      <View className="flex-row items-center gap-2.5 mb-2">
        <View className="p-2 rounded-xl" style={{ backgroundColor: bg }}>
          <Feather name={icon} size={15} color={color} />
        </View>
        <Text className="text-xs font-black uppercase tracking-wide" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
          {title}
        </Text>
      </View>
      <Text className="text-[13px] leading-5 font-medium" style={{ color: colors.foreground, fontFamily: fonts.body }}>
        {body}
      </Text>
    </View>
  );
}

export default function DailyInsightsScreen() {
  const { colors, isDark, fonts } = useTheme();
  const softTints = getSoftTints(colors);

  const { data, loading, refreshing, error, offline, reload } = useAsyncLoad<DailyInsights>(
    () => insightsApi.getDaily(),
    [],
    { refreshOn: ["cycle"] },
  );

  const phaseLabel = data?.phase ? PHASE_LABELS[data.phase] ?? data.phase : null;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Daily Insights" />

        <LoadingErrorState
          loading={loading}
          error={error}
          offline={offline}
          onRetry={() => reload()}
          loadingLabel="Building today's insights…"
          errorTitle="Couldn't load insights"
          skeleton={
            <View className="gap-4 px-6 pt-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          }
        >
          {data ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 60 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />
            }
          >
            <View className="mx-6 mt-5">
              {data.pregnancyMode ? (
                <View
                  className="p-5 border flex-row items-start gap-4 mb-5"
                  style={{
                    backgroundColor: softTints.mint,
                    borderColor: colors.border,
                    borderRadius: 24,
                  }}
                >
                  <MaterialCommunityIcons name="baby-face-outline" size={22} color={colors.success} />
                  <View className="flex-1">
                    <Text className="text-xs font-black uppercase" style={{ color: colors.success, fontFamily: fonts.heading }}>
                      Pregnancy mode
                    </Text>
                    <Text className="mt-1 text-xs leading-5 font-medium" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                      Phase insights are paused in pregnancy mode.
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Phase pill row */}
              <View className="flex-row flex-wrap gap-2 mb-4">
                {(["period", "follicular", "ovulation", "luteal"] as const).map((phase) => {
                  const active = data.phase === phase;
                  return (
                    <View
                      key={phase}
                      className="rounded-full px-3.5 py-2"
                      style={{ backgroundColor: active ? colors.primary : colors.surface }}
                    >
                      <Text
                        className="text-xs font-bold"
                        style={{ color: active ? colors.buttonText : colors.mutedText, fontFamily: fonts.body }}
                      >
                        {PHASE_LABELS[phase]}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Summary hero */}
              <View
                className="border overflow-hidden mb-5"
                style={{ borderColor: colors.border, borderRadius: 22, ...getShadow(colors, isDark) }}
              >
                <LinearGradient colors={getHeroGradient(colors, isDark) as [string, string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="p-[18px]">
                  <Text className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: "#FFFFFF", opacity: 0.85, fontFamily: fonts.heading }}>
                    {phaseLabel ? `${phaseLabel} phase` : "Today"}
                  </Text>
                  <Text className="text-[13.5px] font-semibold leading-6" style={{ color: "#FFFFFF", fontFamily: fonts.body }}>
                    {data.dailySummary || "No summary available yet — keep logging to unlock a fuller picture."}
                  </Text>
                </LinearGradient>
              </View>

              <Text className="text-sm font-black mb-2.5 px-1" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                Picked for you
              </Text>

              <InsightCard
                icon="activity"
                title="Hormones today"
                body={data.hormoneExplanation}
                color={colors.accent}
                bg={softTints.mint}
              />
              <InsightCard
                icon="smile"
                title="Mood"
                body={data.moodInsight}
                color={colors.secondary}
                bg={softTints.lavender}
              />
              <InsightCard
                icon="zap"
                title="Energy"
                body={data.energyInsight}
                color={colors.warning}
                bg={softTints.amber}
              />
              <InsightCard
                icon="sun"
                title="Skin"
                body={data.skinInsight}
                color={colors.primary}
                bg={softTints.pink}
              />

              {/* Suggestion lists */}
              {[
                { title: "Exercise", icon: "activity" as const, items: data.exerciseSuggestions, color: colors.success, bg: softTints.emerald },
                { title: "Nutrition", icon: "coffee" as const, items: data.nutritionSuggestions, color: colors.accent, bg: softTints.mint },
                { title: "Sleep", icon: "moon" as const, items: data.sleepSuggestions, color: colors.secondary, bg: softTints.lavender },
                { title: "Wellness", icon: "heart" as const, items: data.wellnessRecommendations, color: colors.primary, bg: softTints.pink },
              ].map((section) =>
                section.items?.length ? (
                  <View
                    key={section.title}
                    className="border p-5 mb-3.5"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderRadius: 24,
                      ...getShadow(colors, isDark),
                    }}
                  >
                    <View className="flex-row items-center gap-2.5">
                      <View className="p-2 rounded-xl" style={{ backgroundColor: section.bg }}>
                        <Feather name={section.icon} size={15} color={section.color} />
                      </View>
                      <Text className="text-xs font-black uppercase tracking-wide" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                        {section.title} suggestions
                      </Text>
                    </View>
                    <SuggestionChips items={section.items} bg={section.bg} />
                  </View>
                ) : null,
              )}

              {!data.dailySummary &&
              !data.hormoneExplanation &&
              !data.moodInsight &&
              !data.energyInsight &&
              !data.skinInsight &&
              !data.exerciseSuggestions?.length &&
              !data.nutritionSuggestions?.length &&
              !data.sleepSuggestions?.length &&
              !data.wellnessRecommendations?.length ? (
                <View
                  className="border p-6 items-center mb-3.5"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24 }}
                >
                  <Ionicons name="bulb-outline" size={28} color={colors.mutedText} />
                  <Text className="mt-3 text-sm font-bold text-center" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                    Nothing personalized yet
                  </Text>
                  <Text className="mt-1.5 text-xs text-center leading-5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                    Log a few days in your tracker so we can tailor today&apos;s insights to you.
                  </Text>
                </View>
              ) : null}
            </View>
          </ScrollView>
          ) : null}
        </LoadingErrorState>
      </SafeAreaView>
    </>
  );
}
