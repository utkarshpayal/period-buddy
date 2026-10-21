import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { RefreshControl, ScrollView, StatusBar, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { reportApi, type HealthReportCycleStats, type ReportCountItem } from "../../lib/api";
import { getDateKey } from "../../lib/format";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { Icon } from "../../components/Icon";

const RANGE_DAYS = 90;

async function loadReport(): Promise<HealthReportCycleStats> {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - RANGE_DAYS);
  const result = await reportApi.getHealthReport({
    startDate: getDateKey(start),
    endDate: getDateKey(today),
  });
  return result.cycle;
}

function CountBarList({
  items,
  color,
  trackColor,
  fonts,
  textColor,
  mutedColor,
}: {
  items: ReportCountItem[];
  color: string;
  trackColor: string;
  fonts: { body: string; mono: string };
  textColor: string;
  mutedColor: string;
}) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <View style={{ gap: 14 }}>
      {items.slice(0, 8).map((item, idx) => {
        const pct = Math.max((item.value / max) * 100, 6);
        return (
          <View key={`${item.label}-${idx}`}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <Text
                numberOfLines={1}
                style={{ flex: 1, color: textColor, fontSize: 14, fontWeight: "700", fontFamily: fonts.body }}
              >
                {item.label}
              </Text>
              {/* Values wear text ink, not the bar colour, so they stay legible
                  in both themes; the bar beside them carries the category hue. */}
              <Text style={{ color: textColor, fontSize: 15, fontWeight: "800", fontFamily: fonts.mono }}>
                {item.value}
                <Text style={{ color: mutedColor, fontSize: 12, fontWeight: "600" }}>{item.value === 1 ? " day" : " days"}</Text>
              </Text>
            </View>
            <View style={{ height: 10, borderRadius: 999, overflow: "hidden", backgroundColor: trackColor }}>
              <View style={{ width: `${pct}%`, height: "100%", backgroundColor: color, borderRadius: 999 }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SectionCard({
  title,
  icon,
  iconColor,
  iconBg,
  children,
}: {
  title: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  iconColor: string;
  iconBg: string;
  children: React.ReactNode;
}) {
  const { colors, isDark, fonts } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: isDark ? colors.surfaceStrong : colors.border,
        borderWidth: 1.5,
        borderRadius: 24, borderCurve: "continuous",
        padding: 20,
        marginBottom: 14,
        ...getShadow(colors, isDark),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: iconBg }}>
          <Icon set="mci" name={icon} size={19} color={iconColor} />
        </View>
        <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "800", fontFamily: fonts.heading }}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

export default function SymptomReportScreen() {
  useSecureScreen("symptom-report");
  const { colors, isDark, fonts } = useTheme();
  const softTints = getSoftTints(colors);

  const { data, loading, refreshing, error, offline, reload } = useAsyncLoad<HealthReportCycleStats>(
    loadReport,
    [],
    { refreshOn: ["cycle"] },
  );

  const hasAnyData =
    !!data &&
    (data.symptomCounts.length > 0 ||
      data.moodCounts.length > 0 ||
      data.flowCounts.length > 0 ||
      data.daysLogged > 0);

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Symptom Report" />

        <LoadingErrorState
          loading={loading}
          error={error}
          offline={offline}
          onRetry={() => reload()}
          loadingLabel="Reviewing your logged symptoms…"
          errorTitle="Couldn't load your symptom report"
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
              <View style={{ paddingHorizontal: 24, paddingTop: 18 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    padding: 14,
                    borderRadius: 18, borderCurve: "continuous",
                    backgroundColor: softTints.pink,
                    marginBottom: 18,
                  }}
                >
                  <Icon set="feather" name="calendar" size={16} color={colors.primary} />
                  <Text style={{ flex: 1, color: colors.foreground, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>
                    Last {RANGE_DAYS} days · {data.daysLogged} day{data.daysLogged === 1 ? "" : "s"} logged ·{" "}
                    {data.periodDays} period day{data.periodDays === 1 ? "" : "s"}
                  </Text>
                </View>

                {!hasAnyData ? (
                  <EmptyState
                    icon="clipboard-text-search-outline"
                    title="Nothing logged yet"
                    message="Log symptoms, mood, and flow in your tracker and they'll show up here as a review of your cycle."
                  />
                ) : (
                  <>
                    {data.symptomCounts.length > 0 ? (
                      <SectionCard title="Top symptoms" icon="pulse" iconColor={colors.warning} iconBg={softTints.amber}>
                        <CountBarList
                          items={data.symptomCounts}
                          color={colors.warning}
                          trackColor={isDark ? colors.track : softTints.amber}
                          fonts={fonts}
                          textColor={colors.foreground}
                          mutedColor={colors.mutedText}
                        />
                      </SectionCard>
                    ) : null}

                    {data.moodCounts.length > 0 ? (
                      <SectionCard title="Mood patterns" icon="emoticon-outline" iconColor={colors.accentText} iconBg={softTints.mint}>
                        <CountBarList
                          items={data.moodCounts}
                          color={colors.accentText}
                          trackColor={isDark ? colors.track : softTints.mint}
                          fonts={fonts}
                          textColor={colors.foreground}
                          mutedColor={colors.mutedText}
                        />
                      </SectionCard>
                    ) : null}

                    {data.flowCounts.length > 0 ? (
                      <SectionCard title="Flow days" icon="water" iconColor={colors.rose} iconBg={softTints.rose}>
                        <CountBarList
                          items={data.flowCounts}
                          color={colors.rose}
                          trackColor={isDark ? colors.track : softTints.rose}
                          fonts={fonts}
                          textColor={colors.foreground}
                          mutedColor={colors.mutedText}
                        />
                      </SectionCard>
                    ) : null}

                    <SectionCard title="Averages" icon="chart-bar" iconColor={colors.sky} iconBg={softTints.sky}>
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        {[
                          { label: "Sleep", value: data.averages.sleepHours, unit: "hrs" },
                          { label: "Water", value: data.averages.waterIntake, unit: "ml" },
                          { label: "Stress", value: data.averages.stressLevel, unit: "/10" },
                        ].map((stat) => (
                          <View
                            key={stat.label}
                            style={{
                              flex: 1,
                              paddingVertical: 12,
                              paddingHorizontal: 10,
                              borderRadius: 16, borderCurve: "continuous",
                              backgroundColor: softTints.sky,
                              borderWidth: 1,
                              borderColor: `${colors.sky}33`,
                            }}
                          >
                            <Text
                              numberOfLines={1}
                              maxFontSizeMultiplier={1.3}
                              style={{ color: colors.mutedText, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6, fontFamily: fonts.body }}
                            >
                              {stat.label.toUpperCase()}
                            </Text>
                            <Text
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              maxFontSizeMultiplier={1.3}
                              style={{ color: colors.foreground, marginTop: 4, fontFamily: fonts.mono }}
                            >
                              <Text style={{ fontSize: 22, fontWeight: "800" }}>
                                {stat.value != null ? `${Math.round(stat.value * 10) / 10}` : "—"}
                              </Text>
                              {stat.value != null ? (
                                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedText }}>{` ${stat.unit}`}</Text>
                              ) : null}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </SectionCard>
                  </>
                )}

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: 14,
                    borderRadius: 18, borderCurve: "continuous",
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    marginTop: 6,
                  }}
                >
                  <Icon set="feather" name="info" size={14} color={colors.mutedText} style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, color: colors.mutedText, fontSize: 12.5, lineHeight: 16, fontFamily: fonts.body }}>
                    A summary of what you&apos;ve logged — educational only, not a diagnosis. For a
                    shareable clinical summary, use Download doctor report on the Graphs & Reports screen.
                  </Text>
                </View>
              </View>
            </ScrollView>
          ) : null}
        </LoadingErrorState>
      </SafeAreaView>
    </>
  );
}
