import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
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
import { useAuth } from "../../../components/auth-context";
import { useTheme } from "../../../components/theme";
import { getShadow, getScreenGradient } from "../../../components/ui-tokens";
import { formatShortDate } from "../../../lib/format";
import {
  partnerApi,
  type AppNotification,
  type PartnerSharedData,
} from "../../../lib/api";
import { usePartnerViewState } from "../../../components/partner-view-state";

const PHASE_LABEL: Record<string, string> = {
  follicular: "Follicular phase",
  luteal: "Luteal phase",
  ovulation: "Ovulation",
  period: "On her period",
};

const KNOWLEDGE_LINKS = [
  { title: "Blogs", desc: "Articles on cycle health", icon: "book-outline", route: "/(app)/blogs" },
  { title: "Videos", desc: "Short, expert-made reels", icon: "play-circle-outline", route: "/(app)/reels" },
  { title: "Health Concerns", desc: "Irregularities & symptoms", icon: "alert-circle-outline", route: "/(app)/health-issues" },
  { title: "Anonymous Q&A", desc: "Ask privately, expert-answered", icon: "help-circle-outline", route: "/(app)/qa" },
  { title: "Hygiene & Care", desc: "Product guidance & comfort", icon: "leaf-outline", route: "/(app)/hygiene" },
  { title: "Sexual Wellbeing", desc: "Consent, intimacy & safety", icon: "heart-outline", route: "/(app)/sexual-wellbeing" },
] as const;

function formatDateKey(dateKey?: string) {
  if (!dateKey) return "—";
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;

  const todayKey = new Date().toISOString().slice(0, 10);
  const yesterdayKey = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateKey === todayKey) return "Today";
  if (dateKey === yesterdayKey) return "Yesterday";

  return formatShortDate(date);
}

export default function PartnerViewOverview() {
  const { colors, isDark, fonts } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { profile, setProfile, notifications, setNotifications } = usePartnerViewState();

  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [data, setData] = useState<PartnerSharedData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isNotifModalVisible, setIsNotifModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async () => {
    try {
      setErrorMessage("");
      const [shared, partnerProfile, notifs] = await Promise.all([
        partnerApi.getSharedData(),
        partnerApi.getProfile(),
        partnerApi.getNotifications().catch(() => []),
      ]);
      setData(shared);
      setProfile(partnerProfile);
      setNotifications(notifs);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load shared data.",
      );
    }
  }, [setProfile, setNotifications]);

  useEffect(() => {
    setIsLoading(true);
    load().finally(() => setIsLoading(false));
  }, [load]);

  async function onRefresh() {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }

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
  const partnerName =
    profile?.partnerId && typeof profile.partnerId === "object"
      ? `${profile.partnerId.firstName ?? ""} ${profile.partnerId.lastName ?? ""}`.trim()
      : "your partner";

  return (
    <LinearGradient colors={screenGradient} className="flex-1">
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />
      <SafeAreaView className="flex-1">
        {/* Header — greeting pattern with avatar, mirroring the owner
            dashboard's home header layout/spacing for a consistent feel. */}
        <View className="flex-row items-center justify-between px-5 py-4 gap-3">
          <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
            <View
              className="w-[38px] h-[38px] rounded-full items-center justify-center shrink-0"
              style={{ backgroundColor: colors.primaryLight }}
            >
              <Text
                className="text-sm font-black"
                style={{ color: colors.primary, fontFamily: fonts.heading }}
              >
                {(user?.firstName?.[0] ?? "P").toUpperCase()}
              </Text>
            </View>
            <View className="flex-1 min-w-0">
              <Text
                className="text-base font-black"
                numberOfLines={1}
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                Hi {user?.firstName || "there"}
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontSize: 11, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body }}
              >
                {isConnected && partnerName !== "your partner"
                  ? `Here's how ${partnerName}'s doing`
                  : "Read-only · shared with you"}
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2 shrink-0">
            {typeof data?.streak?.count === "number" && data.streak.count > 0 && (
              <View
                className="flex-row items-center px-3 py-2 rounded-full border"
                style={{ borderColor: colors.border, backgroundColor: colors.surface }}
              >
                <Ionicons name="flame" size={13} color={colors.primary} style={{ marginRight: 4 }} />
                <Text
                  style={{ fontSize: 11, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}
                >
                  {data.streak.count}
                </Text>
              </View>
            )}
            {/* Notification Bell — previously plain-surface + foreground-tinted
                at 15px, which read as inert chrome rather than a tappable
                button next to the equally-quiet streak pill. Bumped size and
                switched to a primary-tinted treatment (stronger still, and
                unmissable, once there's something unread) so it actually
                reads as its own actionable control in the header. */}
            <TouchableOpacity
              onPress={() => setIsNotifModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              className="flex-row items-center justify-center w-10 h-10 rounded-full border relative"
              style={{
                borderColor: unreadCount > 0 ? colors.primary : colors.border,
                backgroundColor: unreadCount > 0 ? colors.primaryLight : colors.surface,
              }}
            >
              <Ionicons name="notifications-outline" size={18} color={colors.primary} />
              {unreadCount > 0 && (
                <View
                  className="absolute -top-1.5 -right-1.5 rounded-full items-center justify-center border"
                  style={{
                    backgroundColor: colors.danger,
                    borderColor: colors.surface,
                    borderWidth: 1.5,
                    minWidth: 16,
                    height: 16,
                    paddingHorizontal: 3,
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 9, fontWeight: "900" }}>
                    {unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 140 }}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View className="items-center justify-center py-20">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : errorMessage ? (
            <View
              className="rounded-2xl border px-4 py-4"
              style={{ backgroundColor: colors.dangerLight, borderColor: colors.danger }}
            >
              <Text
                className="text-xs font-bold text-center"
                style={{ color: colors.danger, fontFamily: fonts.body }}
              >
                {errorMessage}
              </Text>
            </View>
          ) : (
            <>
              {/* Book a consultation quick-action */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push("/(app)/consultation")}
                className="flex-row items-center rounded-3xl border p-4 mb-4"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  ...getShadow(colors, isDark),
                }}
              >
                <View
                  className="w-10 h-10 rounded-2xl items-center justify-center mr-3 shrink-0"
                  style={{ backgroundColor: colors.primaryLight }}
                >
                  <Ionicons name="medkit-outline" size={18} color={colors.primary} />
                </View>
                <View className="flex-1 min-w-0">
                  <Text
                    className="text-xs font-black"
                    style={{ color: colors.foreground, fontFamily: fonts.heading }}
                  >
                    Talk to a gynaecologist
                  </Text>
                  <Text
                    className="text-[10.5px] mt-0.5 font-semibold"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    Book your own video consultation
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
              </TouchableOpacity>

              {/* Cycle status hero */}
              {hasCycle && (
                <LinearGradient
                  colors={[colors.primary, colors.primaryLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ borderRadius: 22, padding: 20, marginBottom: 14 }}
                >
                  <Text
                    className="text-[11px] font-bold uppercase"
                    style={{ color: "rgba(255,255,255,0.85)", fontFamily: fonts.body }}
                  >
                    {(partnerName !== "your partner" ? partnerName.toUpperCase() : "CYCLE")} · DAY{" "}
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
                            className="text-[9.5px] font-black uppercase tracking-wider mb-0.5"
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
                            className="text-[9.5px] font-black uppercase tracking-wider mb-0.5"
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
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => router.push("/(app)/(partner-view)/chat?prefill=1")}
                  className="flex-row items-center justify-between rounded-3xl border p-4 mb-4"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    ...getShadow(colors, isDark),
                  }}
                >
                  <Text
                    className="flex-1 text-xs font-black mr-3"
                    numberOfLines={1}
                    style={{ color: colors.foreground, fontFamily: fonts.heading }}
                  >
                    Send {partnerName !== "your partner" ? partnerName : "them"} a check-in
                  </Text>
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center shrink-0"
                    style={{ backgroundColor: colors.primaryLight }}
                  >
                    <Ionicons name="heart" size={14} color={colors.primary} />
                  </View>
                </TouchableOpacity>
              )}

              {/* "How to support today" tip */}
              {hasCare && data?.careSuggestions?.suggestions?.[0] && (
                <View
                  className="rounded-3xl border p-4 mb-4"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    ...getShadow(colors, isDark),
                  }}
                >
                  <Text
                    className="text-[13.5px] font-black mb-1.5"
                    style={{ color: colors.foreground, fontFamily: fonts.heading }}
                  >
                    💡 How to support today
                  </Text>
                  <Text
                    className="text-xs font-semibold leading-5"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    {data.careSuggestions.suggestions[0].message}
                  </Text>
                </View>
              )}

              {/* Alerts */}
              {hasAlerts && (
                <View
                  className="rounded-3xl border p-5 mb-4"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    ...getShadow(colors, isDark),
                  }}
                >
                  <Text
                    className="text-[10px] font-black uppercase tracking-widest mb-3"
                    style={{ color: colors.primary, fontFamily: fonts.body }}
                  >
                    Alerts
                  </Text>
                  {data?.alerts?.map((alert, idx) => (
                    <View
                      key={idx}
                      className="flex-row items-start mb-2 last:mb-0"
                    >
                      <Ionicons
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
                </View>
              )}

              {/* Recent symptoms */}
              {hasSymptoms && (
                <View
                  className="rounded-3xl border p-5 mb-4"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    ...getShadow(colors, isDark),
                  }}
                >
                  <Text
                    className="text-[10px] font-black uppercase tracking-widest mb-3"
                    style={{ color: colors.primary, fontFamily: fonts.body }}
                  >
                    Recent symptoms
                  </Text>
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
                            className="text-[11px] font-semibold flex-1 text-right"
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
                              className="text-[10px] font-semibold mt-1"
                              style={{ color: colors.mutedText, fontFamily: fonts.body }}
                            >
                              {wellbeingBits.join(" · ")}
                            </Text>
                          ) : (
                            <TouchableOpacity
                              onPress={() => setExpandedLogs((prev) => ({ ...prev, [logKey]: true }))}
                              className="mt-1"
                            >
                              <Text
                                className="text-[10px] font-bold underline"
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
                </View>
              )}

              {/* Intimacy Logs */}
              {hasIntimacy && (
                <View
                  className="rounded-3xl border p-5 mb-4"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    ...getShadow(colors, isDark),
                  }}
                >
                  <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-row items-center gap-1.5">
                      <Ionicons name="heart-outline" size={15} color={colors.primary} />
                      <Text
                        className="text-[10px] font-black uppercase tracking-widest"
                        style={{ color: colors.primary, fontFamily: fonts.body }}
                      >
                        Intimacy Notes
                      </Text>
                    </View>
                    <Ionicons name="lock-closed-outline" size={12} color={colors.mutedText} />
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
                          className="text-[11.5px] font-black mb-1"
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
                </View>
              )}

              {/* Caring Guide */}
              {hasCare && (
                <View
                  className="rounded-3xl border p-5 mb-4"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    ...getShadow(colors, isDark),
                  }}
                >
                  <View className="flex-row items-center gap-1.5 mb-3">
                    <Ionicons name="rose-outline" size={15} color={colors.primary} />
                    <Text
                      className="text-[10px] font-black uppercase tracking-widest"
                      style={{ color: colors.primary, fontFamily: fonts.body }}
                    >
                      Partner Caring Guide
                    </Text>
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
                                  className="text-[9px] font-bold uppercase tracking-wider"
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
                              className="text-[11.5px] leading-5 font-medium"
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
                          <Text
                            className="text-xs font-bold mb-2 flex-row items-center gap-1"
                            style={{ color: colors.success, fontFamily: fonts.heading }}
                          >
                            👍 Do&apos;s for support
                          </Text>
                          <View style={{ gap: 6 }}>
                            {data.careSuggestions.dos.map((item, idx) => (
                              <View key={idx} className="flex-row items-start gap-2">
                                <Ionicons
                                  name="checkmark-circle-outline"
                                  size={14}
                                  color={colors.success}
                                  style={{ marginTop: 1 }}
                                />
                                <Text
                                  className="flex-1 text-[11.5px] leading-5 font-semibold"
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
                          <Text
                            className="text-xs font-bold mb-2 flex-row items-center gap-1"
                            style={{ color: colors.danger, fontFamily: fonts.heading }}
                          >
                            ⚠️ Don&apos;ts to keep in mind
                          </Text>
                          <View style={{ gap: 6 }}>
                            {data.careSuggestions.donts.map((item, idx) => (
                              <View key={idx} className="flex-row items-start gap-2">
                                <Ionicons
                                  name="close-circle-outline"
                                  size={14}
                                  color={colors.danger}
                                  style={{ marginTop: 1 }}
                                />
                                <Text
                                  className="flex-1 text-[11.5px] leading-5 font-semibold"
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
                </View>
              )}

              {nothingShared && (
                <View
                  className="rounded-3xl border p-6 items-center"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={22}
                    color={colors.mutedText}
                    style={{ marginBottom: 10 }}
                  />
                  <Text
                    className="text-center text-xs font-semibold leading-5"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    {partnerName !== "your partner" ? partnerName : "Your partner"} hasn&apos;t
                    turned on sharing yet. Nothing&apos;s wrong — they can enable it anytime
                    from their Partner Sync settings.
                  </Text>
                </View>
              )}

              {/* Knowledge & Resources */}
              <View
                className="rounded-3xl border p-5 mb-4"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  ...getShadow(colors, isDark),
                }}
              >
                <Text
                  className="text-[10px] font-black uppercase tracking-widest mb-3"
                  style={{ color: colors.primary, fontFamily: fonts.body }}
                >
                  Knowledge & resources
                </Text>
                <View className="flex-row flex-wrap justify-between" style={{ gap: 10 }}>
                  {KNOWLEDGE_LINKS.map((link) => (
                    <TouchableOpacity
                      key={link.title}
                      activeOpacity={0.7}
                      onPress={() => router.push(link.route as any)}
                      className="border"
                      style={{
                        width: "48%",
                        backgroundColor: colors.surfaceSoft,
                        borderColor: colors.border,
                        borderRadius: 16,
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
                        <Ionicons name={link.icon as any} size={16} color={colors.primary} />
                      </View>
                      <Text
                        className="text-xs font-black"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        {link.title}
                      </Text>
                      <Text
                        className="text-[10px] mt-0.5 font-semibold"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
                        numberOfLines={1}
                      >
                        {link.desc}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Notification Drawer Modal */}
      {isNotifModalVisible && (
        <View
          className="absolute inset-0 z-50 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <TouchableOpacity
            activeOpacity={1}
            className="absolute inset-0"
            onPress={() => setIsNotifModalVisible(false)}
          />

          <View
            className="rounded-t-3xl border-t p-5"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              maxHeight: "75%",
              ...getShadow(colors, isDark),
            }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text
                className="text-base font-black"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                Updates & Notifications
              </Text>
              <TouchableOpacity
                onPress={() => setIsNotifModalVisible(false)}
                className="w-7 h-7 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.surfaceSoft }}
              >
                <Ionicons name="close" size={16} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: 20 }}>
              {notifications.length === 0 ? (
                <View className="items-center justify-center py-10">
                  <Ionicons
                    name="notifications-off-outline"
                    size={24}
                    color={colors.mutedText}
                    style={{ marginBottom: 8 }}
                  />
                  <Text
                    className="text-xs font-semibold text-center"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    No notifications yet.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {notifications.map((notif) => {
                    const formattedTime = notif.createdAt
                      ? new Date(notif.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "";

                    return (
                      <TouchableOpacity
                        key={notif._id}
                        activeOpacity={0.8}
                        onPress={async () => {
                          if (!notif.isRead) {
                            try {
                              await partnerApi.markNotificationAsRead(notif._id);
                              setNotifications((prev: AppNotification[]) =>
                                prev.map((n) =>
                                  n._id === notif._id ? { ...n, isRead: true } : n,
                                ),
                              );
                            } catch (err) {
                              console.error(err);
                            }
                          }
                        }}
                        className="p-3.5 rounded-2xl border"
                        style={{
                          backgroundColor: notif.isRead ? colors.surfaceSoft : colors.primaryLight,
                          borderColor: notif.isRead ? colors.border : colors.primary,
                          borderWidth: notif.isRead ? 1 : 1.5,
                        }}
                      >
                        <View className="flex-row items-start justify-between mb-1">
                          <Text
                            className="text-xs font-black flex-1 mr-2"
                            style={{ color: colors.foreground, fontFamily: fonts.body }}
                          >
                            {notif.title}
                          </Text>
                          {!notif.isRead && (
                            <View
                              className="w-1.5 h-1.5 rounded-full animate-pulse"
                              style={{ backgroundColor: colors.primary }}
                            />
                          )}
                        </View>
                        {notif.body && (
                          <Text
                            className="text-[11.5px] leading-5 font-semibold mb-1.5"
                            style={{ color: colors.mutedText, fontFamily: fonts.body }}
                          >
                            {notif.body}
                          </Text>
                        )}
                        <Text
                          className="text-[9px] font-bold"
                          style={{ color: colors.mutedText, fontFamily: fonts.body }}
                        >
                          {formattedTime}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </LinearGradient>
  );
}
