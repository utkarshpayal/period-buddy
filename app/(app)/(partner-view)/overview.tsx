import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../../components/auth-context";
import { EmptyState } from "../../../components/EmptyState";
import { OverviewHeader } from "../../../components/partner-view/OverviewHeader";
import { SectionCard, SectionLabel } from "../../../components/partner-view/SectionCard";
import { formatDateKey } from "../../../components/partner-view/dateLabel";
import { SkeletonBlock, SkeletonCard } from "../../../components/Skeleton";
import { useTheme } from "../../../components/theme";
import { getShadow, getScreenGradient } from "../../../components/ui-tokens";
import { useDataRefresh } from "../../../hooks/useDataRefresh";
import { getFriendlyErrorMessage, isNetworkError, partnerApi, type PartnerSharedData } from "../../../lib/api";
import { partnerDisplayName } from "../../../lib/partnerChat";
import { usePartnerViewState } from "../../../components/partner-view-state";
import { getSharedHubTiles } from "../../../lib/hubTiles";
import { isFeatureVisible } from "../../../lib/appConfig";
import { useAppConfig } from "../../../components/app-config";
import { useSecureScreen } from "../../../lib/screenPrivacy";
import { Icon } from "../../../components/Icon";

const PHASE_LABEL: Record<string, string> = {
  follicular: "Follicular phase",
  luteal: "Luteal phase",
  ovulation: "Ovulation",
  period: "On her period",
};

// Same tile definitions the owner-side hubs use (docs/fixes.md 2.8) — kept as one
// shared source so this list can't silently drift from theirs.
const KNOWLEDGE_LINKS = getSharedHubTiles([
  "blogs",
  "videos",
  "healthConcerns",
  "nuraAi",
  "hygiene",
  "sexualWellbeing",
]).map((tile) => ({ id: tile.id, title: tile.title === "Nura AI" ? "Anonymous Q&A" : tile.title, desc: tile.desc, icon: tile.icon, route: tile.route }));

export default function PartnerViewOverview() {
  useSecureScreen("partner-overview");
  const { colors, isDark, fonts } = useTheme();
  // Links to a feature hidden in the App CMS disappear here too (tile ids
  // match the CMS feature keys).
  const { config: appConfig } = useAppConfig();
  const knowledgeLinks = KNOWLEDGE_LINKS.filter((link) => isFeatureVisible(appConfig, link.id));
  const { user } = useAuth();
  const router = useRouter();
  const { profile, notifications, refreshProfile } = usePartnerViewState();

  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [data, setData] = useState<PartnerSharedData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<{ message: string; offline: boolean } | null>(null);
  const loadSeq = useRef(0);

  // Profile and notifications live in PartnerViewStateProvider (it loads them
  // itself); this screen only fetches what the owner shares. A failed refresh
  // keeps what's on screen.
  const loadShared = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const shared = await partnerApi.getSharedData();
      if (seq !== loadSeq.current) return;
      setData(shared);
      setLoadError(null);
    } catch (error) {
      if (seq !== loadSeq.current) return;
      setLoadError({ message: getFriendlyErrorMessage(error), offline: isNetworkError(error) });
    }
  }, []);

  useEffect(() => {
    loadShared().finally(() => setIsLoading(false));
  }, [loadShared]);

  async function onRefresh() {
    setIsRefreshing(true);
    try {
      await Promise.all([loadShared(), refreshProfile()]);
    } finally {
      setIsRefreshing(false);
    }
  }

  // Something the owner logs (and the push about it) shows on this mounted tab.
  useDataRefresh(["partner", "notifications"], () => loadShared());

  // Back from the notifications screen (or another tab): refresh the bell's
  // unread count and the shared data. The first focus is the mount, which
  // already loads both.
  const isInitialFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isInitialFocus.current) {
        isInitialFocus.current = false;
        return;
      }
      refreshProfile();
      loadShared();
    }, [refreshProfile, loadShared]),
  );

  const screenGradient = getScreenGradient(colors, isDark) as [
    string,
    string,
    string,
  ];

  const hasCycle = Boolean(data?.permissions?.shareCyclePhase && data?.cycle);
  const hasAlerts = Boolean(
    data?.permissions?.shareAlerts && data?.alerts?.length,
  );
  const hasSymptoms = Boolean(
    data?.permissions?.shareSymptoms && data?.recentSymptoms?.length,
  );
  const hasIntimacy = Boolean(
    data?.permissions?.shareIntimacyLog && data?.intimacyLogs?.length,
  );
  const hasCare = Boolean(
    data?.careSuggestions &&
      ((data.careSuggestions.suggestions && data.careSuggestions.suggestions.length > 0) ||
        (data.careSuggestions.dos && data.careSuggestions.dos.length > 0) ||
        (data.careSuggestions.donts && data.careSuggestions.donts.length > 0))
  );
  const nothingShared = !isLoading && !hasCycle && !hasAlerts && !hasSymptoms && !hasIntimacy;
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const isConnected = profile?.isConnected ?? false;
  // Null until the owner's name is known.
  const partnerName = partnerDisplayName(profile);

  return (
    <LinearGradient colors={screenGradient} className="flex-1">
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />
      <SafeAreaView className="flex-1">
        <OverviewHeader
          firstName={user?.firstName}
          subtitle={isConnected && partnerName ? `Here's how ${partnerName}'s doing` : "Read-only · shared with you"}
          streakCount={data?.streak?.count}
          unreadCount={unreadCount}
          onOpenNotifications={() => router.push("/(app)/notifications")}
        />

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 140 }}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View className="gap-4">
              <SkeletonBlock width="100%" height={72} radius={24} />
              <SkeletonBlock width="100%" height={140} radius={22} />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : !data && loadError ? (
            <EmptyState
              compact
              icon={loadError.offline ? "wifi-off" : "alert-circle-outline"}
              title={loadError.offline ? "You're offline" : "Couldn't load what's shared"}
              message={loadError.message}
              actionLabel="Try again"
              onAction={() => {
                setIsLoading(true);
                loadShared().finally(() => setIsLoading(false));
              }}
            />
          ) : (
            <>
              {/* Book a consultation quick-action */}
              <TouchableOpacity accessibilityRole="button"
                activeOpacity={0.85}
                onPress={() => router.push("/(app)/consultation")}
                className="flex-row items-center rounded-3xl p-4 mb-4"
                style={{
                  backgroundColor: colors.surface,
                  ...getShadow(colors, isDark),
                }}
              >
                <View
                  className="w-10 h-10 rounded-2xl items-center justify-center mr-3 shrink-0"
                  style={{ backgroundColor: colors.primaryLight }}
                >
                  <Icon set="ion" name="medkit-outline" size={18} color={colors.primary} />
                </View>
                <View className="flex-1 min-w-0">
                  <Text
                    className="text-xs font-black"
                    style={{ color: colors.foreground, fontFamily: fonts.heading }}
                  >
                    Talk to a gynaecologist
                  </Text>
                  <Text
                    className="text-xs mt-0.5 font-semibold"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    Book your own video consultation
                  </Text>
                </View>
                <Icon set="ion" name="chevron-forward" size={16} color={colors.mutedText} />
              </TouchableOpacity>

              {/* Cycle status hero */}
              {hasCycle && (
                <LinearGradient
                  colors={[colors.primary, colors.primaryLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ borderRadius: 22, borderCurve: "continuous", padding: 20, marginBottom: 14 }}
                >
                  <Text
                    className="text-[12px] font-bold uppercase"
                    style={{ color: "rgba(255,255,255,0.85)", fontFamily: fonts.body }}
                  >
                    {(partnerName ? partnerName.toUpperCase() : "CYCLE")} · DAY{" "}
                    {data?.cycle?.currentCycleDay ?? "—"}
                  </Text>
                  <Text
                    className="text-[22px] font-black mt-1 mb-2"
                    style={{ color: "#fff", fontFamily: fonts.heading }}
                  >
                    {(data?.cycle?.currentPhase &&
                      PHASE_LABEL[data.cycle.currentPhase]) ||
                      data?.cycle?.currentPhase ||
                      "—"}
                  </Text>
                  <Text
                    className="text-xs font-semibold leading-5"
                    style={{ color: "rgba(255,255,255,0.92)", fontFamily: fonts.body }}
                  >
                    {typeof data?.cycle?.nextPeriodDaysAway === "number"
                      ? `Next period in ${data.cycle.nextPeriodDaysAway} day${
                          data.cycle.nextPeriodDaysAway === 1 ? "" : "s"
                        }.`
                      : "Cycle details updated by your partner."}
                    {typeof data?.cycle?.ovulationDaysAway === "number"
                      ? ` Ovulation ${
                          data.cycle.ovulationDaysAway === 0
                            ? "is today"
                            : `in ${data.cycle.ovulationDaysAway} day${data.cycle.ovulationDaysAway === 1 ? "" : "s"}`
                        }.`
                      : ""}
                  </Text>
                  {(data?.cycle?.nextPeriodDate || data?.cycle?.fertileWindowRange) && (
                    <View
                      className="flex-row flex-wrap gap-3 mt-3 pt-3 border-t"
                      style={{ borderColor: "rgba(255,255,255,0.3)" }}
                    >
                      {data?.cycle?.nextPeriodDate && (
                        <View className="flex-1 min-w-[45%]">
                          <Text
                            className="text-[11.5px] font-black uppercase tracking-wider mb-0.5"
                            style={{ color: "rgba(255,255,255,0.75)", fontFamily: fonts.body }}
                          >
                            Next period
                          </Text>
                          <Text
                            className="text-xs font-bold"
                            style={{ color: "#fff", fontFamily: fonts.body }}
                          >
                            {data.cycle.nextPeriodDate}
                          </Text>
                        </View>
                      )}
                      {data?.cycle?.fertileWindowRange && (
                        <View className="flex-1 min-w-[45%]">
                          <Text
                            className="text-[11.5px] font-black uppercase tracking-wider mb-0.5"
                            style={{ color: "rgba(255,255,255,0.75)", fontFamily: fonts.body }}
                          >
                            Fertile window
                          </Text>
                          <Text
                            className="text-xs font-bold"
                            style={{ color: "#fff", fontFamily: fonts.body }}
                          >
                            {data.cycle.fertileWindowRange}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </LinearGradient>
              )}

              {/* Send a check-in — jumps to the Chat tab with a starter message */}
              {isConnected && (
                <TouchableOpacity accessibilityRole="button"
                  activeOpacity={0.85}
                  onPress={() => router.push("/(app)/(partner-view)/chat?prefill=1")}
                  className="flex-row items-center justify-between rounded-3xl p-4 mb-4"
                  style={{
                    backgroundColor: colors.surface,
                    ...getShadow(colors, isDark),
                  }}
                >
                  <Text
                    className="flex-1 text-xs font-black mr-3"
                    numberOfLines={1}
                    style={{ color: colors.foreground, fontFamily: fonts.heading }}
                  >
                    Send {partnerName ?? "them"} a check-in
                  </Text>
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center shrink-0"
                    style={{ backgroundColor: colors.primaryLight }}
                  >
                    <Icon set="ion" name="heart" size={14} color={colors.primary} />
                  </View>
                </TouchableOpacity>
              )}

              {/* "How to support today" tip */}
              {hasCare && data?.careSuggestions?.suggestions?.[0] && (
                <SectionCard compact>
                  <View className="flex-row items-center mb-1.5" style={{ gap: 6 }}>
                    <Icon set="ion" name="bulb-outline" size={16} color={colors.primaryDark} />
                    <Text
                      className="text-[13.5px] font-black"
                      style={{ color: colors.foreground, fontFamily: fonts.heading }}
                    >
                      How to support today
                    </Text>
                  </View>
                  <Text
                    className="text-xs font-semibold leading-5"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    {data.careSuggestions.suggestions[0].message}
                  </Text>
                </SectionCard>
              )}

              {/* Alerts */}
              {hasAlerts && (
                <SectionCard>
                  <SectionLabel>Alerts</SectionLabel>
                  {data?.alerts?.map((alert, idx) => (
                    <View
                      key={idx}
                      className="flex-row items-start mb-2 last:mb-0"
                    >
                      <Icon set="ion"
                        name="alert-circle-outline"
                        size={15}
                        color={colors.primary}
                        style={{ marginRight: 8, marginTop: 1 }}
                      />
                      <Text
                        className="flex-1 text-xs font-semibold"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        {alert}
                      </Text>
                    </View>
                  ))}
                </SectionCard>
              )}

              {/* Recent symptoms */}
              {hasSymptoms && (
                <SectionCard>
                  <SectionLabel>Recent symptoms</SectionLabel>
                  {data?.recentSymptoms?.map((log, idx) => {
                    const wellbeingBits = [
                      typeof log.sleepHours === "number" ? `${log.sleepHours}h sleep` : null,
                      typeof log.waterIntake === "number" ? `${log.waterIntake}ml water` : null,
                      typeof log.stressLevel === "number" ? `stress ${log.stressLevel}/10` : null,
                      typeof log.temperature === "number" ? `${log.temperature}°C` : null,
                      typeof log.weight === "number" ? `${log.weight}kg` : null,
                    ].filter(Boolean);
                    const logKey = log.dateKey ?? String(idx);
                    const isExpanded = Boolean(expandedLogs[logKey]);

                    return (
                      <View
                        key={logKey}
                        className="py-2 border-b"
                        style={{ borderColor: colors.border }}
                      >
                        <View className="flex-row items-center justify-between gap-3">
                          <Text
                            className="text-xs font-bold shrink-0"
                            style={{ color: colors.foreground, fontFamily: fonts.body }}
                          >
                            {formatDateKey(log.dateKey)}
                          </Text>
                          <Text
                            className="text-xs font-semibold flex-1 text-right"
                            numberOfLines={1}
                            style={{ color: colors.mutedText, fontFamily: fonts.body }}
                          >
                            {[log.mood, log.energy, log.flow, ...(log.symptoms ?? [])]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </Text>
                        </View>
                        {wellbeingBits.length > 0 && (
                          isExpanded ? (
                            <Text
                              className="text-xs font-semibold mt-1"
                              style={{ color: colors.mutedText, fontFamily: fonts.body }}
                            >
                              {wellbeingBits.join(" · ")}
                            </Text>
                          ) : (
                            <TouchableOpacity accessibilityRole="button"
                              onPress={() => setExpandedLogs((prev) => ({ ...prev, [logKey]: true }))}
                              className="mt-1"
                            >
                              <Text
                                className="text-xs font-bold underline"
                                style={{ color: colors.primary, fontFamily: fonts.body }}
                              >
                                Show details
                              </Text>
                            </TouchableOpacity>
                          )
                        )}
                      </View>
                    );
                  })}
                </SectionCard>
              )}

              {/* Intimacy Logs */}
              {hasIntimacy && (
                <SectionCard>
                  <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-row items-center gap-1.5">
                      <Icon set="ion" name="heart-outline" size={15} color={colors.primary} />
                      <SectionLabel>Intimacy Notes</SectionLabel>
                    </View>
                    <Icon set="ion" name="lock-closed-outline" size={12} color={colors.mutedText} />
                  </View>
                  <View style={{ gap: 8 }}>
                    {data?.intimacyLogs?.map((log, idx) => (
                      <View
                        key={log.dateKey ?? idx}
                        className="p-3 rounded-2xl border"
                        style={{
                          backgroundColor: colors.surfaceSoft,
                          borderColor: colors.border,
                        }}
                      >
                        <Text
                          className="text-xs font-black mb-1"
                          style={{ color: colors.foreground, fontFamily: fonts.body }}
                        >
                          {formatDateKey(log.dateKey)}
                        </Text>
                        <Text
                          className="text-xs font-semibold leading-5"
                          style={{ color: colors.mutedText, fontFamily: fonts.body }}
                        >
                          {log.note || "Tagged as an intimate day — no note added."}
                        </Text>
                      </View>
                    ))}
                  </View>
                </SectionCard>
              )}

              {/* Caring Guide */}
              {hasCare && (
                <SectionCard>
                  <View className="flex-row items-center gap-1.5 mb-3">
                    <Icon set="ion" name="rose-outline" size={15} color={colors.primary} />
                    <SectionLabel>Partner Caring Guide</SectionLabel>
                  </View>

                  {data?.careSuggestions?.suggestions && data.careSuggestions.suggestions.length > 0 && (
                    <View className="mb-4">
                      <Text
                        className="text-xs font-bold mb-2.5"
                        style={{ color: colors.foreground, fontFamily: fonts.heading }}
                      >
                        Caring Suggestions
                      </Text>
                      <View style={{ gap: 8 }}>
                        {data.careSuggestions.suggestions.map((suggestion, idx) => (
                          <View
                            key={idx}
                            className="p-3.5 rounded-2xl border"
                            style={{
                              backgroundColor: colors.surfaceSoft,
                              borderColor: colors.border,
                            }}
                          >
                            <View className="flex-row items-center justify-between mb-1.5">
                              <View
                                className="px-2 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: colors.primaryLight,
                                }}
                              >
                                <Text
                                  className="text-[11.5px] font-bold uppercase tracking-wider"
                                  style={{ color: colors.primary }}
                                >
                                  {suggestion.category}
                                </Text>
                              </View>
                            </View>
                            <Text
                              className="text-xs font-black mb-1"
                              style={{ color: colors.foreground, fontFamily: fonts.body }}
                            >
                              {suggestion.title}
                            </Text>
                            <Text
                              className="text-xs leading-5 font-medium"
                              style={{ color: colors.mutedText, fontFamily: fonts.body }}
                            >
                              {suggestion.message}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {((data?.careSuggestions?.dos && data.careSuggestions.dos.length > 0) ||
                    (data?.careSuggestions?.donts && data.careSuggestions.donts.length > 0)) && (
                    <View className="border-t pt-4" style={{ borderColor: colors.border, gap: 16 }}>
                      {data.careSuggestions.dos && data.careSuggestions.dos.length > 0 && (
                        <View>
                          <View className="flex-row items-center mb-2" style={{ gap: 6 }}>
                            <Icon set="ion" name="thumbs-up-outline" size={14} color={colors.success} />
                            <Text className="text-xs font-bold" style={{ color: colors.success, fontFamily: fonts.heading }}>
                              Do&apos;s for support
                            </Text>
                          </View>
                          <View style={{ gap: 6 }}>
                            {data.careSuggestions.dos.map((item, idx) => (
                              <View key={idx} className="flex-row items-start gap-2">
                                <Icon set="ion"
                                  name="checkmark-circle-outline"
                                  size={14}
                                  color={colors.success}
                                  style={{ marginTop: 1 }}
                                />
                                <Text
                                  className="flex-1 text-xs leading-5 font-semibold"
                                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                                >
                                  {item}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {data.careSuggestions.donts && data.careSuggestions.donts.length > 0 && (
                        <View>
                          <View className="flex-row items-center mb-2" style={{ gap: 6 }}>
                            <Icon set="ion" name="warning-outline" size={14} color={colors.danger} />
                            <Text className="text-xs font-bold" style={{ color: colors.danger, fontFamily: fonts.heading }}>
                              Don&apos;ts to keep in mind
                            </Text>
                          </View>
                          <View style={{ gap: 6 }}>
                            {data.careSuggestions.donts.map((item, idx) => (
                              <View key={idx} className="flex-row items-start gap-2">
                                <Icon set="ion"
                                  name="close-circle-outline"
                                  size={14}
                                  color={colors.danger}
                                  style={{ marginTop: 1 }}
                                />
                                <Text
                                  className="flex-1 text-xs leading-5 font-semibold"
                                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                                >
                                  {item}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                </SectionCard>
              )}

              {nothingShared && (
                <View
                  className="rounded-3xl border p-6 items-center"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                >
                  <Icon set="ion"
                    name="lock-closed-outline"
                    size={22}
                    color={colors.mutedText}
                    style={{ marginBottom: 10 }}
                  />
                  <Text
                    className="text-center text-xs font-semibold leading-5"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    {partnerName ?? "Your partner"} hasn&apos;t
                    turned on sharing yet. Nothing&apos;s wrong — they can enable it anytime
                    from their Partner Sync settings.
                  </Text>
                </View>
              )}

              {/* Knowledge & Resources */}
              <SectionCard>
                <SectionLabel>Knowledge & resources</SectionLabel>
                <View className="flex-row flex-wrap justify-between" style={{ gap: 10 }}>
                  {knowledgeLinks.map((link) => (
                    <TouchableOpacity accessibilityRole="button"
                      key={link.title}
                      activeOpacity={0.7}
                      onPress={() => router.push(link.route as any)}
                      className="border"
                      style={{
                        width: "48%",
                        backgroundColor: colors.surfaceSoft,
                        borderColor: colors.border,
                        borderRadius: 16, borderCurve: "continuous",
                        padding: 12,
                      }}
                    >
                      <View
                        style={{
                          alignSelf: "flex-start",
                          padding: 8,
                          borderRadius: 10,
                          backgroundColor: colors.primaryLight,
                          marginBottom: 10,
                        }}
                      >
                        <Icon set="ion" name={link.icon as any} size={16} color={colors.primary} />
                      </View>
                      <Text
                        className="text-xs font-black"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        {link.title}
                      </Text>
                      <Text
                        className="text-xs mt-0.5 font-semibold"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
                        numberOfLines={1}
                      >
                        {link.desc}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </SectionCard>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}
