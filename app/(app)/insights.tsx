import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, StatusBar, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import { SkeletonBlock } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { insightsApi } from "../../lib/api";
import type { CyclePhase } from "../../lib/cycle";
import { isCyclePhase, PHASE_COPY } from "../../lib/cycleCopy";

type DailyInsights = Awaited<ReturnType<typeof insightsApi.getDaily>>;
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const PHASE_ICONS: Record<CyclePhase, IconName> = {
  period: "water-outline",
  follicular: "sprout-outline",
  ovulation: "flower-outline",
  luteal: "moon-waning-crescent",
};

function useCardStyle() {
  const { colors, isDark } = useTheme();
  return {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
    ...getShadow(colors, isDark),
  };
}

function TintIcon({ name, color, bg, size = 36 }: { name: IconName; color: string; bg: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <MaterialCommunityIcons name={name} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

/** One "how today may feel" row (hormones / mood / energy / skin). */
function InsightRow({
  icon,
  title,
  body,
  color,
  bg,
  first,
}: {
  icon: IconName;
  title: string;
  body: string;
  color: string;
  bg: string;
  first: boolean;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 14, paddingVertical: 16, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
      <TintIcon name={icon} color={color} bg={bg} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ flexShrink: 1, fontSize: 15, lineHeight: 21, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>
          {title}
        </Text>
        <Text style={{ marginTop: 4, fontSize: 15, lineHeight: 22, fontWeight: "400", color: colors.foreground, fontFamily: fonts.body }}>
          {body}
        </Text>
      </View>
    </View>
  );
}

/** A titled card of short suggestions, each a bullet row with a small icon. */
function SuggestionGroup({
  icon,
  title,
  items,
  color,
  bg,
}: {
  icon: IconName;
  title: string;
  items: string[];
  color: string;
  bg: string;
}) {
  const { colors, fonts } = useTheme();
  const card = useCardStyle();
  return (
    <View style={[card, { padding: 18 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <TintIcon name={icon} color={color} bg={bg} size={32} />
        <Text accessibilityRole="header" numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>
          {title}
        </Text>
      </View>
      {items.map((item, idx) => (
        <View key={`${item}-${idx}`} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingTop: 8 }}>
          <MaterialCommunityIcons name="circle-medium" size={18} color={color} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 22, fontWeight: "400", color: colors.foreground, fontFamily: fonts.body }}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

function InsightsSkeleton() {
  const card = useCardStyle();
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 20, gap: 28 }}>
      <View style={[card, { padding: 18, gap: 12 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <SkeletonBlock width={44} height={44} radius={22} />
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonBlock width="60%" height={20} />
            <SkeletonBlock width="35%" height={12} />
          </View>
        </View>
        <SkeletonBlock width="100%" height={14} />
        <SkeletonBlock width="85%" height={14} />
      </View>
      <View style={{ gap: 12 }}>
        <SkeletonBlock width="40%" height={18} />
        <View style={[card, { paddingHorizontal: 18, paddingVertical: 4 }]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flexDirection: "row", gap: 14, paddingVertical: 16 }}>
              <SkeletonBlock width={36} height={36} radius={18} />
              <View style={{ flex: 1, gap: 8 }}>
                <SkeletonBlock width="45%" height={14} />
                <SkeletonBlock width="100%" height={12} />
                <SkeletonBlock width="75%" height={12} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export default function DailyInsightsScreen() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const card = useCardStyle();

  const { data, loading, refreshing, error, offline, reload } = useAsyncLoad<DailyInsights>(
    () => insightsApi.getDaily(),
    [],
    { refreshOn: ["cycle"] },
  );

  const logToday = () => router.push({ pathname: "/(app)/(dashboard)/tracker", params: { log: "today" } });

  // Phase copy only for the four known phases, and never in pregnancy mode;
  // anything else (no settings yet, "late", …) gets a neutral "Today" hero.
  const phase: CyclePhase | null = data && !data.pregnancyMode && isCyclePhase(data.phase) ? data.phase : null;
  const phaseTone: Record<CyclePhase, { solid: string; soft: string }> = {
    period: { solid: colors.rose, soft: colors.roseLight },
    follicular: { solid: colors.mint, soft: colors.mintLight },
    ovulation: { solid: colors.lavender, soft: colors.lavenderLight },
    luteal: { solid: colors.gold, soft: colors.goldLight },
  };
  const tone = phase ? phaseTone[phase] : { solid: colors.primaryDark, soft: colors.primaryLight };

  const insights = data
    ? [
        { key: "hormones", icon: "pulse" as const, title: "Your hormones today", body: data.hormoneExplanation, color: colors.lavender, bg: colors.lavenderLight },
        { key: "mood", icon: "emoticon-happy-outline" as const, title: "Mood", body: data.moodInsight, color: colors.sky, bg: colors.skyLight },
        { key: "energy", icon: "lightning-bolt-outline" as const, title: "Energy", body: data.energyInsight, color: colors.gold, bg: colors.goldLight },
        { key: "skin", icon: "face-woman-outline" as const, title: "Skin", body: data.skinInsight, color: colors.rose, bg: colors.roseLight },
      ].filter((i) => !!i.body)
    : [];

  const suggestions = data
    ? [
        { key: "exercise", icon: "walk" as const, title: "Exercise", items: data.exerciseSuggestions ?? [], color: colors.mint, bg: colors.mintLight },
        { key: "food", icon: "food-apple-outline" as const, title: "Food and drink", items: data.nutritionSuggestions ?? [], color: colors.gold, bg: colors.goldLight },
        { key: "sleep", icon: "weather-night" as const, title: "Sleep", items: data.sleepSuggestions ?? [], color: colors.lavender, bg: colors.lavenderLight },
        { key: "selfcare", icon: "heart-outline" as const, title: "Self-care", items: data.wellnessRecommendations ?? [], color: colors.rose, bg: colors.roseLight },
      ].filter((s) => s.items.length > 0)
    : [];

  const nothingYet = !!data && !data.dailySummary && insights.length === 0 && suggestions.length === 0;
  const summary = data?.dailySummary || (phase ? PHASE_COPY[phase].note : "");

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Daily insights" />

        <LoadingErrorState
          loading={loading}
          error={error}
          offline={offline}
          onRetry={() => reload()}
          errorTitle="Couldn't load today's insights"
          skeleton={<InsightsSkeleton />}
        >
          {!data ? (
            <EmptyState
              icon="lightbulb-on-outline"
              title="No insights yet"
              message="Log how you feel today and we'll build your daily briefing."
              actionLabel="Log today"
              onAction={logToday}
            />
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 60, gap: 28 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />
              }
            >
              {data.pregnancyMode ? (
                <View style={[card, { padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }]}>
                  <TintIcon name="baby-face-outline" color={colors.success} bg={colors.successLight} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>Pregnancy mode is on</Text>
                    <Text style={{ marginTop: 2, fontSize: 14, lineHeight: 20, color: colors.foreground, fontFamily: fonts.body }}>
                      Cycle phase tips are paused while you&apos;re pregnant.
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Today hero: surface underneath so the (translucent in dark mode) tint reads the same on both themes. */}
              <View style={[card, { overflow: "hidden" }]}>
                <View style={{ backgroundColor: tone.soft, padding: 18 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <TintIcon name={phase ? PHASE_ICONS[phase] : "white-balance-sunny"} color={tone.solid} bg={colors.surface} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text maxFontSizeMultiplier={1.4} style={{ fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6, color: colors.foreground, fontFamily: fonts.heading }}>
                        TODAY
                      </Text>
                      <Text accessibilityRole="header" numberOfLines={2} style={{ flexShrink: 1, fontSize: 22, lineHeight: 28, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                        {phase ? PHASE_COPY[phase].title : "Your day"}
                      </Text>
                      {phase ? (
                        <Text style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>{PHASE_COPY[phase].medical}</Text>
                      ) : null}
                    </View>
                  </View>
                  {summary ? (
                    <Text style={{ marginTop: 14, fontSize: 16, lineHeight: 24, fontWeight: "500", color: colors.foreground, fontFamily: fonts.body }}>
                      {summary}
                    </Text>
                  ) : null}
                </View>
              </View>

              {nothingYet ? (
                <View style={card}>
                  <EmptyState
                    compact
                    icon="lightbulb-on-outline"
                    title="Nothing personal yet"
                    message="Log a few days in your tracker so we can shape today's insights around you."
                    actionLabel="Log today"
                    onAction={logToday}
                  />
                </View>
              ) : null}

              {insights.length ? (
                <View>
                  <SectionHeader title="Picked for you" subtitle="How today may feel" />
                  <View style={[card, { paddingHorizontal: 18, paddingVertical: 2 }]}>
                    {insights.map((i, idx) => (
                      <InsightRow key={i.key} icon={i.icon} title={i.title} body={i.body} color={i.color} bg={i.bg} first={idx === 0} />
                    ))}
                  </View>
                </View>
              ) : null}

              {suggestions.length ? (
                <View>
                  <SectionHeader title="Ideas for today" subtitle="Small things that may help" />
                  <View style={{ gap: 14 }}>
                    {suggestions.map((s) => (
                      <SuggestionGroup key={s.key} icon={s.icon} title={s.title} items={s.items} color={s.color} bg={s.bg} />
                    ))}
                  </View>
                </View>
              ) : null}

              {!nothingYet ? (
                <Text style={{ fontSize: 13, lineHeight: 19, textAlign: "center", color: colors.mutedText, fontFamily: fonts.body }}>
                  Based on your logs and today&apos;s cycle phase · Updated today · General guidance, not medical advice.
                </Text>
              ) : null}
            </ScrollView>
          )}
        </LoadingErrorState>
      </SafeAreaView>
    </>
  );
}
