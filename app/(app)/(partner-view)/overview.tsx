import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../../components/auth-context";
import { EmptyState } from "../../../components/EmptyState";
import { OverviewHeader } from "../../../components/partner-view/OverviewHeader";
import { formatDateKey } from "../../../components/partner-view/dateLabel";
import { SkeletonBlock, SkeletonCard } from "../../../components/Skeleton";
import { useTheme } from "../../../components/theme";
import { MOOD_OPTIONS, getHeroGradient, getShadow, getScreenGradient, withAlpha } from "../../../components/ui-tokens";
import { GradientCard } from "../../../components/GradientCard";
import { ListGroup, ListRow } from "../../../components/ListGroup";
import { SectionHeader } from "../../../components/ScreenHeader";
import { flowOptions, symptomOptions } from "../../../components/logOptions";
import { PARTNER_PHASE_COPY, inDays, logTags } from "../../../lib/partnerView";
import { useDataRefresh } from "../../../hooks/useDataRefresh";
import { getFriendlyErrorMessage, isNetworkError, partnerApi, type PartnerSharedData } from "../../../lib/api";
import { partnerDisplayName } from "../../../lib/partnerChat";
import { usePartnerViewState } from "../../../components/partner-view-state";
import { getSharedHubTiles } from "../../../lib/hubTiles";
import { isFeatureVisible } from "../../../lib/appConfig";
import { useAppConfig } from "../../../components/app-config";
import { useSecureScreen } from "../../../lib/screenPrivacy";
import { Icon } from "../../../components/Icon";

// Readable names for logged values (moods, flow, symptoms) in "Recent days".
const LOG_LABELS: Record<string, string> = Object.fromEntries(
  [...MOOD_OPTIONS, ...flowOptions, ...symptomOptions].map((o) => [String(o.value), o.label]),
);

// How many days "Recent days" shows before "Show all".
const RECENT_DAYS_SHOWN = 3;
// Do's and don'ts shown before "Show more".
const CARE_ITEMS_SHOWN = 2;

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

  const [showAllDays, setShowAllDays] = useState(false);
  const [showAllCare, setShowAllCare] = useState(false);
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

  const cycle = data?.cycle;
  const phase = cycle?.currentPhase ? PARTNER_PHASE_COPY[cycle.currentPhase] : undefined;
  const heroGradient = getHeroGradient(colors, isDark);
  const tip = data?.careSuggestions?.suggestions?.[0];
  // The first suggestion is "How to help today"; the list shows the rest.
  const moreSuggestions = data?.careSuggestions?.suggestions?.slice(1) ?? [];
  const firstName = partnerName?.split(" ")[0] ?? null;
  const days = data?.recentSymptoms ?? [];
  const shownDays = showAllDays ? days : days.slice(0, RECENT_DAYS_SHOWN);
  const card = { backgroundColor: colors.surface, borderRadius: 24, borderCurve: "continuous" as const, ...getShadow(colors, isDark) };

  const dos = data?.careSuggestions?.dos ?? [];
  const donts = data?.careSuggestions?.donts ?? [];
  const careHidden = moreSuggestions.length + Math.max(0, dos.length - CARE_ITEMS_SHOWN) + Math.max(0, donts.length - CARE_ITEMS_SHOWN);
  const shownDos = showAllCare ? dos : dos.slice(0, CARE_ITEMS_SHOWN);
  const shownDonts = showAllCare ? donts : donts.slice(0, CARE_ITEMS_SHOWN);

  return (
    <LinearGradient colors={screenGradient} className="flex-1">
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />
      <SafeAreaView className="flex-1">
        <OverviewHeader
          firstName={user?.firstName}
          subtitle={isConnected && firstName ? `Here's how ${firstName} is doing` : "Read-only · shared with you"}
          streakCount={data?.streak?.count}
          unreadCount={unreadCount}
          onOpenNotifications={() => router.push("/(app)/notifications")}
        />

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View style={{ gap: 16 }}>
              <SkeletonBlock width="100%" height={200} radius={28} />
              <SkeletonBlock width="100%" height={92} radius={22} />
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
              {/* Cycle: the first thing a partner opens this for */}
              {hasCycle && cycle ? (
                <GradientCard colors={heroGradient} style={{ padding: 22 }} containerStyle={{ marginBottom: 18 }}>
                  <View className="flex-row items-center justify-between" style={{ gap: 10 }}>
                    <Text numberOfLines={1} style={{ flexShrink: 1, color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", fontFamily: fonts.body }}>
                      {`${firstName ?? "Cycle"} · Day ${cycle.currentCycleDay ?? "–"}`}
                    </Text>
                    {phase ? (
                      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)" }}>
                        <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>{phase.medical}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text maxFontSizeMultiplier={1.3} style={{ color: "#FFFFFF", fontSize: 28, lineHeight: 34, fontWeight: "800", letterSpacing: -0.6, marginTop: 8, fontFamily: fonts.heading }}>
                    {phase?.title ?? cycle.currentPhase ?? "Cycle"}
                  </Text>
                  {phase ? (
                    <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: 14, lineHeight: 20, marginTop: 4, fontFamily: fonts.body }}>{phase.note}</Text>
                  ) : null}

                  {(typeof cycle.nextPeriodDaysAway === "number" || cycle.fertileWindowRange) ? (
                    <View className="flex-row" style={{ gap: 10, marginTop: 18 }}>
                      {typeof cycle.nextPeriodDaysAway === "number" ? (
                        <View style={{ flex: 1, padding: 12, borderRadius: 16, borderCurve: "continuous", backgroundColor: "rgba(255,255,255,0.16)" }}>
                          <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 11.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, fontFamily: fonts.body }}>Next period</Text>
                          <Text numberOfLines={1} style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800", marginTop: 4, fontFamily: fonts.heading }}>
                            {inDays(cycle.nextPeriodDaysAway)}
                          </Text>
                          {cycle.nextPeriodDate ? (
                            <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 1, fontFamily: fonts.body }}>{cycle.nextPeriodDate}</Text>
                          ) : null}
                        </View>
                      ) : null}
                      {cycle.fertileWindowRange ? (
                        <View style={{ flex: 1, padding: 12, borderRadius: 16, borderCurve: "continuous", backgroundColor: "rgba(255,255,255,0.16)" }}>
                          <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 11.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, fontFamily: fonts.body }}>Fertile window</Text>
                          <Text numberOfLines={1} style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800", marginTop: 4, fontFamily: fonts.heading }}>
                            {cycle.fertileWindowRange}
                          </Text>
                          {typeof cycle.ovulationDaysAway === "number" ? (
                            <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 1, fontFamily: fonts.body }}>
                              {`Ovulation ${inDays(cycle.ovulationDaysAway)}`}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </GradientCard>
              ) : null}

              {/* Today's tip */}
              {tip ? (
                <View style={{ ...card, padding: 18, marginBottom: 22, flexDirection: "row", gap: 14 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 14, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.goldLight }}>
                    <Icon set="ion" name="bulb-outline" size={20} color={colors.gold} />
                  </View>
                  <View className="flex-1" style={{ minWidth: 0 }}>
                    <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", fontFamily: fonts.heading }}>How to help today</Text>
                    <Text style={{ color: colors.mutedText, fontSize: 13.5, lineHeight: 20, marginTop: 4, fontFamily: fonts.body }}>{tip.message}</Text>
                  </View>
                </View>
              ) : null}

              {/* Alerts */}
              {hasAlerts ? (
                <>
                  <SectionHeader title="Heads-up" />
                  <View style={{ ...card, paddingVertical: 6, marginBottom: 22 }}>
                    {data?.alerts?.map((alert, idx) => (
                      <View key={idx} className="flex-row items-start" style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
                        <Icon set="ion" name="alert-circle" size={18} color={colors.warning} style={{ marginTop: 1 }} />
                        <Text style={{ flex: 1, color: colors.foreground, fontSize: 14, lineHeight: 20, fontFamily: fonts.body }}>{alert}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}

              {/* Recent days */}
              {hasSymptoms ? (
                <>
                  <SectionHeader
                    title="Recent days"
                    actionLabel={days.length > RECENT_DAYS_SHOWN ? (showAllDays ? "Show less" : `Show all ${days.length}`) : undefined}
                    onAction={() => setShowAllDays((v) => !v)}
                  />
                  <View style={{ ...card, paddingVertical: 4, marginBottom: 22 }}>
                    {shownDays.map((log, idx) => {
                      const tags = logTags(log, LOG_LABELS);
                      const wellbeing = [
                        typeof log.sleepHours === "number" ? `${log.sleepHours}h sleep` : null,
                        typeof log.waterIntake === "number" ? `${log.waterIntake} ml water` : null,
                        typeof log.stressLevel === "number" ? `Stress ${log.stressLevel}/10` : null,
                      ].filter(Boolean);
                      return (
                        <View key={log.dateKey ?? idx} style={{ paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: colors.track }}>
                          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700", fontFamily: fonts.body }}>{formatDateKey(log.dateKey)}</Text>
                          {tags.length ? (
                            <View className="flex-row flex-wrap" style={{ gap: 6, marginTop: 8 }}>
                              {tags.map((tag) => (
                                <View key={tag} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.surfaceSoft }}>
                                  <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: fonts.body }}>{tag}</Text>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={{ color: colors.mutedText, fontSize: 13, marginTop: 4, fontFamily: fonts.body }}>Nothing logged</Text>
                          )}
                          {wellbeing.length ? (
                            <Text style={{ color: colors.mutedText, fontSize: 13, marginTop: 8, fontFamily: fonts.body }}>{wellbeing.join(" · ")}</Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </>
              ) : null}

              {/* Private notes */}
              {hasIntimacy ? (
                <>
                  <SectionHeader title="Private notes" subtitle="Shared only with you" />
                  <View style={{ ...card, paddingVertical: 4, marginBottom: 22 }}>
                    {data?.intimacyLogs?.map((log, idx) => (
                      <View key={log.dateKey ?? idx} style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: colors.track }}>
                        <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700", fontFamily: fonts.body }}>{formatDateKey(log.dateKey)}</Text>
                        <Text style={{ color: colors.mutedText, fontSize: 13.5, lineHeight: 19, marginTop: 2, fontFamily: fonts.body }}>
                          {log.note || "Marked as an intimate day, no note."}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}

              {/* Ways to help */}
              {hasCare && (moreSuggestions.length || dos.length || donts.length) ? (
                <>
                  <SectionHeader
                    title="Ways to help"
                    actionLabel={careHidden > 0 ? (showAllCare ? "Show less" : "Show more") : undefined}
                    onAction={() => setShowAllCare((v) => !v)}
                  />
                  <View style={{ gap: 12, marginBottom: 22 }}>
                    {(showAllCare ? moreSuggestions : []).map((suggestion, idx) => (
                      <View key={idx} style={{ ...card, padding: 16 }}>
                        <View style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.primaryLight }}>
                          <Text style={{ color: colors.primaryDark, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase", fontFamily: fonts.body }}>
                            {suggestion.category}
                          </Text>
                        </View>
                        <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", marginTop: 10, fontFamily: fonts.heading }}>{suggestion.title}</Text>
                        <Text style={{ color: colors.mutedText, fontSize: 13.5, lineHeight: 20, marginTop: 4, fontFamily: fonts.body }}>{suggestion.message}</Text>
                      </View>
                    ))}

                    {(dos.length || donts.length) ? (
                      <View style={{ ...card, padding: 16, gap: 16 }}>
                        {shownDos.length ? (
                          <View style={{ gap: 10 }}>
                            <Text style={{ color: colors.success, fontSize: 14, fontWeight: "800", fontFamily: fonts.heading }}>Do</Text>
                            {shownDos.map((item, idx) => (
                              <View key={idx} className="flex-row items-start" style={{ gap: 10 }}>
                                <Icon set="ion" name="checkmark-circle" size={18} color={colors.success} style={{ marginTop: 1 }} />
                                <Text style={{ flex: 1, color: colors.foreground, fontSize: 14, lineHeight: 20, fontFamily: fonts.body }}>{item}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                        {shownDos.length && shownDonts.length ? (
                          <View style={{ height: 1, backgroundColor: colors.track }} />
                        ) : null}
                        {shownDonts.length ? (
                          <View style={{ gap: 10 }}>
                            <Text style={{ color: colors.danger, fontSize: 14, fontWeight: "800", fontFamily: fonts.heading }}>Try to avoid</Text>
                            {shownDonts.map((item, idx) => (
                              <View key={idx} className="flex-row items-start" style={{ gap: 10 }}>
                                <Icon set="ion" name="close-circle" size={18} color={colors.danger} style={{ marginTop: 1 }} />
                                <Text style={{ flex: 1, color: colors.foreground, fontSize: 14, lineHeight: 20, fontFamily: fonts.body }}>{item}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </>
              ) : null}

              {nothingShared ? (
                <View style={{ ...card, padding: 24, alignItems: "center", marginBottom: 22 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(colors.primary, 0.12) }}>
                    <Icon set="ion" name="lock-closed-outline" size={22} color={colors.primary} />
                  </View>
                  <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "800", marginTop: 12, textAlign: "center", fontFamily: fonts.heading }}>Nothing shared yet</Text>
                  <Text style={{ color: colors.mutedText, fontSize: 13.5, lineHeight: 20, marginTop: 4, textAlign: "center", fontFamily: fonts.body }}>
                    {`${partnerName ?? "Your partner"} can choose what to share from their Partner Sync settings. Nothing's wrong.`}
                  </Text>
                </View>
              ) : null}

              {/* Learn together */}
              <>
                  <SectionHeader title="Learn together" />
                  <ListGroup>
                    <ListRow
                      icon="medkit-outline"
                      iconColor={colors.success}
                      iconBg={colors.successLight}
                      title="Talk to a gynaecologist"
                      description="Book your own video consultation"
                      onPress={() => router.push("/(app)/consultation")}
                    />
                    {knowledgeLinks.map((link) => (
                      <ListRow
                        key={link.id}
                        icon={link.icon as never}
                        iconColor={colors.primary}
                        iconBg={colors.primaryLight}
                        title={link.title}
                        description={link.desc}
                        onPress={() => router.push(link.route as never)}
                      />
                    ))}
                  </ListGroup>
              </>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}
