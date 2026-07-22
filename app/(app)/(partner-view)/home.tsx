import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../../components/auth-context";
import { alert } from "../../../lib/alert";
import { useTheme } from "../../../components/theme";
import { getShadow, getScreenGradient } from "../../../components/ui-tokens";
import {
  getWebSocketUrl,
  partnerApi,
  type AppNotification,
  type AuthUser,
  type PartnerMessage,
  type PartnerProfile,
  type PartnerSharedData,
} from "../../../lib/api";

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

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PartnerViewHome() {
  const { colors, isDark, fonts } = useTheme();
  const { user, signOut, updateUser } = useAuth();
  const router = useRouter();
  const chatScrollRef = useRef<ScrollView>(null);

  const [activeTab, setActiveTab] = useState<"overview" | "chat">("overview");
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  const [data, setData] = useState<PartnerSharedData | null>(null);
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isNotifModalVisible, setIsNotifModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [chatMessages, setChatMessages] = useState<PartnerMessage[]>([]);
  const [typedMessage, setTypedMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

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
  }, []);

  useEffect(() => {
    setIsLoading(true);
    load().finally(() => setIsLoading(false));
  }, [load]);

  async function onRefresh() {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }

  const loadMessages = useCallback(async () => {
    try {
      const msgs = await partnerApi.getMessages();
      setChatMessages(msgs);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 100);
    } catch {
      // keep empty
    }
  }, []);

  useEffect(() => {
    if (activeTab === "chat") loadMessages();
  }, [activeTab, loadMessages]);

  // WebSocket live sync for chat and notifications, same room convention as the owner-side
  // Partner screen (partner_<partnerDocId>) so messages/alerts arrive in real time.
  useEffect(() => {
    if (!profile?._id || !profile.isConnected) return;

    let socket: WebSocket | null = null;
    let isDisconnected = false;

    async function connectWS() {
      try {
        const wsUrl = await getWebSocketUrl();
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          if (isDisconnected) return;
          socket?.send(JSON.stringify({ type: "join", room: `partner_${profile!._id}` }));
        };

        socket.onmessage = (event) => {
          if (isDisconnected) return;
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === "message" && parsed.room === `partner_${profile!._id}` && parsed.message) {
              setChatMessages((prev) => {
                const next = [...prev];
                let found = false;
                for (let i = 0; i < next.length; i++) {
                  const m = next[i];
                  if (m._id === parsed.message._id) {
                    found = true;
                    break;
                  }
                  const isOptimisticMatch =
                    !m._id &&
                    m.sender === parsed.message.sender &&
                    m.text === parsed.message.text;
                  const isTimeMatch =
                    m.sender === parsed.message.sender &&
                    m.text === parsed.message.text &&
                    m.sentAt &&
                    parsed.message.sentAt &&
                    Math.abs(new Date(m.sentAt).getTime() - new Date(parsed.message.sentAt).getTime()) < 5000;
                  if (isOptimisticMatch || isTimeMatch) {
                    next[i] = parsed.message;
                    found = true;
                    break;
                  }
                }
                if (!found) next.push(parsed.message);
                return next;
              });
              setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
            } else if (parsed.type === "partner_notification") {
              // Real-time notification received! Refresh all data and append notification
              load();
              if (parsed.notification) {
                setNotifications((prev) => [parsed.notification, ...prev]);
              }
            }
          } catch (err) {
            console.error("Error parsing WebSocket message:", err);
          }
        };

        socket.onerror = (err) => console.warn("WebSocket error:", err);
      } catch (err) {
        console.warn("Failed to setup WebSocket:", err);
      }
    }

    connectWS();

    return () => {
      isDisconnected = true;
      if (socket) {
        try {
          socket.send(JSON.stringify({ type: "leave", room: `partner_${profile!._id}` }));
        } catch {}
        socket.close();
      }
    };
  }, [profile?._id, profile?.isConnected, load]);

  async function handleSendMessage() {
    if (!typedMessage.trim() || sendingMessage) return;
    const text = typedMessage.trim();
    setTypedMessage("");
    setSendingMessage(true);

    setChatMessages((prev) => [...prev, { sender: "user", text, sentAt: new Date().toISOString() }]);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      await partnerApi.sendMessage(text);
    } catch {
      // stays optimistically
    } finally {
      setSendingMessage(false);
    }
  }

  function handleDisconnect() {
    alert(
      "Disconnect from this account?",
      `You'll stop seeing what ${partnerName} shares with you. You can reconnect later with a new invite code.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              await partnerApi.disconnect();
              updateUser({ ...(user ?? {}), partnerRole: null } as AuthUser);
              router.replace("/(app)/(dashboard)/tracker");
            } catch (err) {
              alert("Error", err instanceof Error ? err.message : "Failed to disconnect");
            }
          },
        },
      ],
    );
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
        {/* Header - visually distinct "partner mode" banner */}
        <View className="flex-row items-center justify-between px-5 py-4">
          <View className="flex-row items-center gap-2">
            <View
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.primaryLight }}
            >
              <Ionicons name="eye-outline" size={14} color={colors.primary} />
            </View>
            <View>
              <Text
                className="text-sm font-black tracking-wide"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                Partner View
              </Text>
              <Text
                style={{ fontSize: 10.5, color: colors.mutedText, fontFamily: fonts.body }}
              >
                {isConnected && partnerName !== "your partner"
                  ? `Supporting ${partnerName}`
                  : "Read-only · shared with you"}
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2">
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
            {/* Notification Bell */}
            <TouchableOpacity
              onPress={() => setIsNotifModalVisible(true)}
              className="flex-row items-center justify-center w-8 h-8 rounded-full border relative mr-1"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <Ionicons name="notifications-outline" size={14} color={colors.foreground} />
              {unreadCount > 0 && (
                <View
                  className="absolute -top-1.5 -right-1.5 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: colors.danger,
                    minWidth: 14,
                    height: 14,
                    paddingHorizontal: 2,
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 8.5, fontWeight: "900" }}>
                    {unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {isConnected && (
              <TouchableOpacity
                onPress={handleDisconnect}
                className="flex-row items-center justify-center w-8 h-8 rounded-full border mr-1"
                style={{ borderColor: colors.border, backgroundColor: colors.surface }}
              >
                <Ionicons name="unlink-outline" size={14} color={colors.mutedText} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => signOut()}
              className="flex-row items-center px-3 py-2 rounded-full border"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <Ionicons name="log-out-outline" size={14} color={colors.mutedText} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab switcher */}
        <View className="flex-row px-5 mb-3 gap-2">
          {(
            [
              { key: "overview", label: "Overview", icon: "sparkles-outline" },
              { key: "chat", label: "Chat", icon: "chatbubble-ellipses-outline" },
            ] as const
          ).map((tab) => {
            const focused = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.85}
                className="flex-row items-center px-4 py-2 rounded-full border"
                style={{
                  borderColor: focused ? colors.primary : colors.border,
                  backgroundColor: focused ? colors.primaryLight : colors.surface,
                }}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={13}
                  color={focused ? colors.primary : colors.mutedText}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={{
                    fontSize: 11.5,
                    fontWeight: "800",
                    color: focused ? colors.primary : colors.mutedText,
                    fontFamily: fonts.body,
                  }}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === "overview" ? (
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 48 }}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
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
                    className="w-10 h-10 rounded-2xl items-center justify-center mr-3"
                    style={{ backgroundColor: colors.primaryLight }}
                  >
                    <Ionicons name="medkit-outline" size={18} color={colors.primary} />
                  </View>
                  <View className="flex-1">
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

                {/* Cycle status card */}
                {hasCycle && (
                  <View
                    className="rounded-3xl border p-5 mb-4"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      ...getShadow(colors, isDark),
                    }}
                  >
                    <Text
                      className="text-[10px] font-black uppercase tracking-widest mb-2"
                      style={{ color: colors.primary, fontFamily: fonts.body }}
                    >
                      Cycle status
                    </Text>
                    <Text
                      className="text-xl font-black mb-1"
                      style={{ color: colors.foreground, fontFamily: fonts.heading }}
                    >
                      {(data?.cycle?.currentPhase &&
                        PHASE_LABEL[data.cycle.currentPhase]) ||
                        data?.cycle?.currentPhase ||
                        "—"}
                    </Text>
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      Day {data?.cycle?.currentCycleDay ?? "—"} of cycle
                      {typeof data?.cycle?.nextPeriodDaysAway === "number"
                        ? ` · Next period in ${data.cycle.nextPeriodDaysAway} day${
                            data.cycle.nextPeriodDaysAway === 1 ? "" : "s"
                          }`
                        : ""}
                    </Text>
                    {(data?.cycle?.nextPeriodDate ||
                      data?.cycle?.fertileWindowRange ||
                      typeof data?.cycle?.ovulationDaysAway === "number") && (
                      <View
                        className="flex-row flex-wrap gap-2 mt-3 pt-3 border-t"
                        style={{ borderColor: colors.border }}
                      >
                        {data?.cycle?.nextPeriodDate && (
                          <View className="flex-1 min-w-[45%]">
                            <Text
                              className="text-[9.5px] font-black uppercase tracking-wider mb-0.5"
                              style={{ color: colors.mutedText, fontFamily: fonts.body }}
                            >
                              Next period
                            </Text>
                            <Text
                              className="text-xs font-bold"
                              style={{ color: colors.foreground, fontFamily: fonts.body }}
                            >
                              {data.cycle.nextPeriodDate}
                            </Text>
                          </View>
                        )}
                        {data?.cycle?.fertileWindowRange && (
                          <View className="flex-1 min-w-[45%]">
                            <Text
                              className="text-[9.5px] font-black uppercase tracking-wider mb-0.5"
                              style={{ color: colors.mutedText, fontFamily: fonts.body }}
                            >
                              Fertile window
                            </Text>
                            <Text
                              className="text-xs font-bold"
                              style={{ color: colors.foreground, fontFamily: fonts.body }}
                            >
                              {data.cycle.fertileWindowRange}
                            </Text>
                          </View>
                        )}
                        {typeof data?.cycle?.ovulationDaysAway === "number" && (
                          <View className="flex-1 min-w-[45%]">
                            <Text
                              className="text-[9.5px] font-black uppercase tracking-wider mb-0.5"
                              style={{ color: colors.mutedText, fontFamily: fonts.body }}
                            >
                              Ovulation
                            </Text>
                            <Text
                              className="text-xs font-bold"
                              style={{ color: colors.foreground, fontFamily: fonts.body }}
                            >
                              {data.cycle.ovulationDaysAway === 0
                                ? "Today"
                                : `In ${data.cycle.ovulationDaysAway} day${
                                    data.cycle.ovulationDaysAway === 1 ? "" : "s"
                                  }`}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
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
                          <View className="flex-row items-center justify-between">
                            <Text
                              className="text-xs font-bold"
                              style={{ color: colors.foreground, fontFamily: fonts.body }}
                            >
                              {formatDateKey(log.dateKey)}
                            </Text>
                            <Text
                              className="text-[11px] font-semibold"
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

                {/* Caring Guide - practical suggestions, placed after the raw data it's based on */}
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

                    {/* Do's & Don'ts */}
                    {((data?.careSuggestions?.dos && data.careSuggestions.dos.length > 0) ||
                      (data?.careSuggestions?.donts && data.careSuggestions.donts.length > 0)) && (
                      <View className="border-t pt-4" style={{ borderColor: colors.border, gap: 16 }}>
                        {data.careSuggestions.dos && data.careSuggestions.dos.length > 0 && (
                          <View>
                            <Text
                              className="text-xs font-bold mb-2 flex-row items-center gap-1"
                              style={{ color: colors.success, fontFamily: fonts.heading }}
                            >
                              👍 Do's for support
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
                              ⚠️ Don'ts to keep in mind
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
                      {partnerName !== "your partner" ? partnerName : "Your partner"} hasn't
                      turned on sharing yet. Nothing's wrong — they can enable it anytime
                      from their Partner Sync settings.
                    </Text>
                  </View>
                )}

                {/* Knowledge & Resources - same educational content the owner gets, so a partner can learn without needing their own tracking account */}
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
        ) : (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1"
            keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
          >
            {!isConnected ? (
              <View className="flex-1 items-center justify-center px-8">
                <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.mutedText} style={{ marginBottom: 10 }} />
                <Text
                  className="text-center text-xs font-semibold leading-5"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  No partner connected yet.
                </Text>
              </View>
            ) : (
              <>
                <ScrollView
                  ref={chatScrollRef}
                  className="flex-1"
                  contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
                  onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: false })}
                >
                  {chatMessages.length === 0 ? (
                    <Text
                      className="text-center text-xs font-semibold mt-8"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      Say hi to {partnerName || "your partner"}.
                    </Text>
                  ) : (
                    chatMessages.map((msg, idx) => {
                      const mine = msg.sender === "user";
                      return (
                        <View
                          key={msg._id ?? idx}
                          className="mb-2"
                          style={{ alignItems: mine ? "flex-end" : "flex-start" }}
                        >
                          <View
                            className="rounded-2xl px-3.5 py-2"
                            style={{
                              maxWidth: "80%",
                              backgroundColor: mine ? colors.primary : colors.surface,
                              borderWidth: mine ? 0 : 1,
                              borderColor: colors.border,
                            }}
                          >
                            <Text
                              className="text-xs font-semibold"
                              style={{
                                color: mine ? colors.buttonText : colors.foreground,
                                fontFamily: fonts.body,
                              }}
                            >
                              {msg.text}
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>

                <View
                  className="flex-row items-center px-4 py-3 border-t gap-2"
                  style={{ borderColor: colors.border, backgroundColor: colors.background }}
                >
                  <TextInput
                    value={typedMessage}
                    onChangeText={setTypedMessage}
                    placeholder="Message..."
                    placeholderTextColor={colors.mutedText}
                    onSubmitEditing={handleSendMessage}
                    className="flex-1 rounded-full px-4 py-2.5 text-xs font-semibold outline-none"
                    style={{
                      backgroundColor: colors.input,
                      color: colors.foreground,
                      fontFamily: fonts.body,
                    }}
                  />
                  <TouchableOpacity
                    disabled={!typedMessage.trim() || sendingMessage}
                    onPress={handleSendMessage}
                    className="w-9 h-9 rounded-full items-center justify-center"
                    style={{ backgroundColor: typedMessage.trim() ? colors.primary : colors.border }}
                  >
                    {sendingMessage ? (
                      <ActivityIndicator size="small" color={colors.buttonText} />
                    ) : (
                      <Feather name="arrow-up" size={16} color={typedMessage.trim() ? colors.buttonText : colors.mutedText} />
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>

      {/* Notification Drawer Modal */}
      {isNotifModalVisible && (
        <View
          className="absolute inset-0 z-50 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          {/* Touch outside to close */}
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
                              setNotifications((prev) =>
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
