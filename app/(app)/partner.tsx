import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { alert } from "../../lib/alert";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonBlock, SkeletonCard } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { useDataRefresh } from "../../hooks/useDataRefresh";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import {
  getFriendlyErrorMessage,
  isFeatureLockedError,
  isNetworkError,
  partnerApi,
  type PartnerPermissions,
  type PartnerProfile,
} from "../../lib/api";
import { shareWithAppLink } from "../../lib/share";
import { useRealtimeSocket, type RealtimeMessage } from "../../hooks/useRealtimeSocket";
import { usePartnerChat } from "../../hooks/usePartnerChat";
import { partnerDisplayName, type LocalPartnerMessage } from "../../lib/partnerChat";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { SendStatusLabel } from "../../components/partner-view/SendStatusLabel";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Button";
import { SendButton } from "../../components/SendButton";
import { FilterChips } from "../../components/FilterChips";

const DEFAULT_PERMS: PartnerPermissions = {
  shareCyclePhase: true,
  shareSymptoms: false,
  shareIntimacyLog: false,
  shareAlerts: true,
  shareReports: false,
};

export default function Partner() {
  useSecureScreen("partner");
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const chatScrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [activeTab, setActiveTab] = useState<"info" | "invite" | "access" | "chat">("info");

  // Invite
  const [generatingCode, setGeneratingCode] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const { hasAccess, refresh: refreshSubscriptionAccess } = useSubscriptionAccess();
  const [inviteCode, setInviteCode] = useState("");

  // Permissions (local mirrors, saved on toggle). Writes go out one at a
  // time, newest state last, so a slow earlier request can never land after
  // a later one and re-enable sharing the user just turned off.
  const [perms, setPerms] = useState(DEFAULT_PERMS);
  const permsRef = useRef(DEFAULT_PERMS); // what the switches show
  const savedPermsRef = useRef(DEFAULT_PERMS); // what the server last confirmed
  const permSeqRef = useRef(0);
  const permWritesInFlightRef = useRef(0);
  const permChainRef = useRef<Promise<void>>(Promise.resolve());

  // Chat
  const [chatMessages, setChatMessages] = useState<LocalPartnerMessage[]>([]);
  const [typedMessage, setTypedMessage] = useState("");
  const {
    loadMessages,
    sendMessage,
    retryMessage,
    receiveMessage,
  } = usePartnerChat({ setMessages: setChatMessages, onLocked: () => setPaywallVisible(true) });

  const softTints = getSoftTints(colors);

  const load = useCallback(async () => {
    try {
      const p = await partnerApi.getProfile();
      setProfile(p);
      setLoadError(null);
      if (p.permissions) {
        const serverPerms = { ...DEFAULT_PERMS, ...p.permissions };
        savedPermsRef.current = serverPerms;
        // Don't overwrite switches whose save is still on its way.
        if (permWritesInFlightRef.current === 0) {
          permsRef.current = serverPerms;
          setPerms(serverPerms);
        }
      }
      if (p.inviteCode) setInviteCode(p.inviteCode);
    } catch (err) {
      // Shown only while there's no profile yet; a failed background refresh
      // keeps what's on screen.
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // `load` already fails silently and never shows a loader after mount.
  // Skipped while focused: this screen's own writes (permissions, invite
  // code) already update it, and a late refetch could undo a toggle mid-tap.
  useDataRefresh(["partner"], ({ whileFocused }) => (whileFocused ? undefined : load()));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([load(), activeTab === "chat" ? loadMessages() : Promise.resolve()]);
    } finally {
      setRefreshing(false);
    }
  }, [load, loadMessages, activeTab]);

  useEffect(() => {
    if (activeTab === "chat") loadMessages();
  }, [activeTab, loadMessages]);

  // Realtime chat sync — only join the partner room while the chat tab is
  // actually open and the pairing is connected.
  const partnerChatRoom =
    activeTab === "chat" && profile?._id && profile.isConnected ? `partner_${profile._id}` : null;

  useRealtimeSocket({
    enabled: Boolean(partnerChatRoom),
    onMessage: useCallback(
      (data: RealtimeMessage) => {
        if (!partnerChatRoom) return;
        if (data.type === "message" && data.room === partnerChatRoom && data.message) {
          receiveMessage(data.message);
        }
      },
      // Deliberately narrow: only re-bind on room identity changes, not every
      // `profile` mutation (e.g. incoming messages).
      [partnerChatRoom, receiveMessage],
    ),
    // Back after a drop: fetch what arrived while the socket was down.
    onConnectionChange: useCallback(
      (open: boolean) => {
        if (open) loadMessages();
      },
      [loadMessages],
    ),
    rooms: partnerChatRoom ? [partnerChatRoom] : [],
  });

  // While connected, also listen (on any tab) for the partner ending the
  // connection from their side, so this screen drops back to the invite
  // state instead of showing a stale "connected" pairing. The event arrives
  // on the personal user_<id> room every socket auto-joins; the partner room
  // here is just what keeps the shared socket open.
  const partnerStatusRoom = profile?._id && profile.isConnected ? `partner_${profile._id}` : null;
  useRealtimeSocket({
    enabled: Boolean(partnerStatusRoom),
    onMessage: useCallback(
      (data: RealtimeMessage) => {
        if (data.type === "partner_disconnected") load();
      },
      [load],
    ),
    rooms: partnerStatusRoom ? [partnerStatusRoom] : [],
  });


  const generateCode = async () => {
    setGeneratingCode(true);
    try {
      const result = await partnerApi.generateInviteCode();
      setInviteCode(result.inviteCode);
      setProfile((p) => p ? { ...p, inviteCode: result.inviteCode } : p);
      alert("Code Generated 🎉", `Your private sync key is:\n${result.inviteCode}\n\nShare this with your partner to connect.`);
    } catch (err) {
      if (isFeatureLockedError(err)) {
        setPaywallVisible(true);
      } else {
        alert("Couldn't generate a code", getFriendlyErrorMessage(err));
      }
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleGenerateCode = () => {
    if (!hasAccess("partner_connect")) {
      setPaywallVisible(true);
      return;
    }
    generateCode();
  };

  const handleNativeShare = async () => {
    if (!inviteCode) return;
    await shareWithAppLink(
      `Connect with me on Nura as my wellness support buddy. Use our private authentication key: ${inviteCode}`,
      `partner-connect?code=${inviteCode}`,
    );
  };


  const updatePerm = (key: keyof PartnerPermissions, value: boolean) => {
    const next = { ...permsRef.current, [key]: value };
    permsRef.current = next;
    setPerms(next);
    const seq = ++permSeqRef.current;
    permWritesInFlightRef.current += 1;
    permChainRef.current = permChainRef.current.then(async () => {
      try {
        // A newer toggle is queued behind this one and sends the full latest
        // state, this change included.
        if (seq !== permSeqRef.current) return;
        const sent = permsRef.current;
        await partnerApi.updatePermissions(sent);
        savedPermsRef.current = sent;
      } catch (err) {
        // Only the newest write rolls back; an older failure is superseded.
        if (seq === permSeqRef.current) {
          permsRef.current = savedPermsRef.current;
          setPerms(savedPermsRef.current);
          alert("Couldn't update sharing", getFriendlyErrorMessage(err));
        }
      } finally {
        permWritesInFlightRef.current -= 1;
      }
    });
  };

  const handleDisconnect = () => {
    alert(
      "Disconnect partner?",
      `This removes ${partnerName}'s access to everything you share. They'll need a new invite code to reconnect.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              await partnerApi.disconnect();
              setProfile((p) =>
                p ? { ...p, isConnected: false, partnerId: undefined, connectionStatus: "disconnected" } : p,
              );
              setInviteCode("");
              setChatMessages([]);
              setActiveTab("invite");
            } catch (err) {
              alert("Couldn't disconnect", getFriendlyErrorMessage(err));
            }
          },
        },
      ],
    );
  };

  const handleSendMessage = () => {
    if (!typedMessage.trim()) return;
    sendMessage(typedMessage);
    setTypedMessage("");
  };

  const isConnected = profile?.isConnected ?? false;
  const partnerName = partnerDisplayName(profile) ?? "Your Partner";

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          behavior="padding"
          className="flex-1"
          keyboardVerticalOffset={8}
        >
        <ScreenHeader
          title="Partner Sync"
          onBack={() => router.back()}
          right={
            isConnected ? (
              <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: softTints.emerald }}>
                <View className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.success }} />
                <Text className="text-xs font-black" style={{ color: colors.success, fontFamily: fonts.body }}>Connected</Text>
              </View>
            ) : inviteCode ? (
              <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: softTints.pink }}>
                <View className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.primary }} />
                <Text className="text-xs font-black" style={{ color: colors.primary, fontFamily: fonts.body }}>Invite Pending</Text>
              </View>
            ) : null
          }
        />

        {/* Tab pills */}
        <View className="mt-5">
          <FilterChips
            options={[
              { key: "info", label: "Overview" },
              { key: "invite", label: "Link partner" },
              { key: "access", label: "Permissions" },
              { key: "chat", label: "Private chat" },
            ]}
            value={activeTab}
            onChange={(key: string) => setActiveTab(key as any)}
          />
        </View>

        <ScrollView
          ref={chatScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom:
              activeTab === "chat"
                ? Math.max(124, insets.bottom + 104)
                : Math.max(120, insets.bottom + 90),
          }}
          className="flex-1"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          // The thread grows at the bottom: keep the newest message in view.
          onContentSizeChange={() => {
            if (activeTab === "chat") chatScrollRef.current?.scrollToEnd({ animated: false });
          }}
          refreshControl={
            // Not on the chat tab — a pull there would fight the auto-scroll.
            activeTab === "chat" ? undefined : (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            )
          }
        >
          <View className="mx-6 mt-6">
            {/* Until the first profile fetch resolves, don't render the
                (default "not connected") tab content — it would flash the
                invite flow at an already-connected user. */}
            {!profile ? (
              <LoadingErrorState
                loading={loading}
                error={loadError ? getFriendlyErrorMessage(loadError) : null}
                offline={isNetworkError(loadError)}
                onRetry={() => {
                  setLoading(true);
                  load();
                }}
                skeleton={
                  <View className="gap-4">
                    <SkeletonBlock width="100%" height={72} radius={16} />
                    <SkeletonCard />
                    <SkeletonCard />
                  </View>
                }
              >
                {null}
              </LoadingErrorState>
            ) : (
            <>
            {/* ── OVERVIEW ── */}
            {activeTab === "info" && (
              <View className="gap-5">
                {isConnected && (
                  <View
                    className="flex-row items-center p-4 rounded-2xl border gap-3"
                    style={{ backgroundColor: softTints.emerald, borderColor: colors.successLight }}
                  >
                    <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.success }} />
                    <Text className="text-xs font-black flex-1" style={{ color: colors.success, fontFamily: fonts.body }}>
                      Synced with {partnerName}
                    </Text>
                  </View>
                )}

                {[
                  { icon: "people-outline", bg: softTints.pink, color: colors.primary, title: "What's Shared", desc: "You choose what your partner sees." },
                  { icon: "heart-outline", bg: softTints.emerald, color: colors.success, title: "Better Support", desc: "Help them know what care helps." },
                  { icon: "shield-checkmark-outline", bg: softTints.pink, color: colors.primary, title: "Privacy First", desc: "Change what you share any time." },
                ].map((card) => (
                  <View
                    key={card.title}
                    className="rounded-3xl p-5 flex-row items-center"
                    style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
                  >
                    <View className="p-3 rounded-2xl mr-4" style={{ backgroundColor: card.bg }}>
                      <Icon set="ion" name={card.icon as any} size={20} color={card.color} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-black tracking-tight" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                        {card.title}
                      </Text>
                      <Text className="text-xs mt-1 leading-4" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                        {card.desc}
                      </Text>
                    </View>
                  </View>
                ))}

                <Button
                  label={isConnected ? "Manage permissions" : "Set up sync"}
                  onPress={() => setActiveTab(isConnected ? "access" : "invite")}
                  fullWidth
                  style={{ marginTop: 16 }}
                />
              </View>
            )}

            {/* ── INVITE / CONNECT ── */}
            {activeTab === "invite" && (
              <View className="gap-5">
                {/* Generate code section */}
                <View
                  className="rounded-3xl p-6 items-center"
                  style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
                >
                  <View className="p-4 rounded-2xl mb-4" style={{ backgroundColor: softTints.pink }}>
                    <Icon set="mci" name="heart-flash" size={32} color={colors.primary} />
                  </View>
                  <Text className="text-base font-black tracking-tight" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                    Invite Your Partner
                  </Text>
                  <Text className="text-xs text-center mt-1.5 leading-4 px-4" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                    Share an invite code so your partner can connect.
                  </Text>

                  {inviteCode ? (
                    <View className="w-full mt-6 gap-3">
                      <LinearGradient
                        colors={[colors.surface, colors.primaryLight]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        className="p-4 rounded-xl border"
                        style={{ borderColor: `${colors.primary}30` }}
                      >
                        <Text className="text-[11.5px] text-center font-bold uppercase" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                          Your Secure Sync Key
                        </Text>
                        <Text className="text-center text-xl font-black mt-1 tracking-widest" style={{ color: colors.primary, fontFamily: fonts.mono }}>
                          {inviteCode}
                        </Text>
                      </LinearGradient>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={handleNativeShare}
                        className="w-full rounded-xl py-3.5 items-center justify-center border"
                        style={{ backgroundColor: softTints.pink, borderColor: `${colors.primary}30` }}
                      >
                        <Text className="text-xs font-bold" style={{ color: colors.primary, fontFamily: fonts.body }}>
                          Share Invite Code
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={handleGenerateCode} className="mt-1 py-1">
                        <Text className="text-center text-xs font-bold underline" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                          Generate new code
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Button label="Generate invite code" onPress={handleGenerateCode} loading={generatingCode} fullWidth style={{ marginTop: 24 }} />
                  )}
                      {/* Connect using a code block has been removed, connection is now handled during login/signup */}
                </View>
              </View>
            )}

            {/* ── PERMISSIONS ── */}
            {activeTab === "access" && (
              <View className="gap-4 pt-1">
                <View
                  className="flex-row items-center gap-3 p-4 rounded-2xl border"
                  style={{ backgroundColor: isConnected ? softTints.emerald : colors.surface, borderColor: colors.border }}
                >
                  <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: isConnected ? colors.success : colors.mutedText }} />
                  <Text className="text-xs font-black flex-1" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    Partner: {isConnected ? `● ${partnerName} is linked` : "No partner connected yet"}
                  </Text>
                </View>

                <Text className="text-xs font-black tracking-widest uppercase mt-3 px-1" style={{ color: colors.primary, fontFamily: fonts.heading }}>
                    Sharing Permissions
                </Text>

                <View
                  className="flex-row items-start p-3.5 rounded-2xl border gap-2.5"
                  style={{ backgroundColor: softTints.pink, borderColor: colors.border }}
                >
                  <Icon set="ion" name="shield-checkmark-outline" size={15} color={colors.primary} style={{ marginTop: 1 }} />
                  <Text className="flex-1 text-xs font-semibold leading-4" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    You&apos;re in control — change these anytime, and disconnecting removes access immediately.
                  </Text>
                </View>

                <View
                  className="rounded-3xl p-4 gap-4"
                  style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
                >
                  {[
                    { key: "shareCyclePhase" as const, title: "Cycle Phase", desc: "Current phase and days to next period.", value: perms.shareCyclePhase },
                    { key: "shareSymptoms" as const, title: "Symptoms", desc: "Mood, energy and flow.", value: perms.shareSymptoms },
                    { key: "shareIntimacyLog" as const, title: "Intimacy Notes", desc: "Very personal. Off by default.", value: perms.shareIntimacyLog },
                    { key: "shareAlerts" as const, title: "Care Alerts", desc: "A gentle heads-up before your period.", value: perms.shareAlerts },
                    { key: "shareReports" as const, title: "Health Reports", desc: "Let care tips use your uploaded reports too. Off by default.", value: perms.shareReports },
                  ].map((item, i, arr) => (
                    <View key={item.key}>
                      <View className="flex-row justify-between items-center">
                        <View className="flex-1 pr-4">
                          <Text className="text-xs font-extrabold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                            {item.title}
                          </Text>
                          <Text className="text-xs mt-0.5 font-medium leading-3.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                            {item.desc}
                          </Text>
                        </View>
                        <Switch
                          value={item.value}
                          onValueChange={(v) => updatePerm(item.key, v)}
                          trackColor={{ false: colors.border, true: colors.success }}
                          thumbColor={colors.surface}
                          ios_backgroundColor={colors.border}
                        />
                      </View>
                      {i < arr.length - 1 && (
                        <View className="h-[1px] w-full mt-4" style={{ backgroundColor: colors.border }} />
                      )}
                    </View>
                  ))}
                </View>

                {isConnected && (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleDisconnect}
                    className="mt-2 rounded-2xl py-3.5 items-center justify-center border"
                    style={{ backgroundColor: colors.dangerLight, borderColor: colors.danger }}
                  >
                    <Text className="text-xs font-bold" style={{ color: colors.danger, fontFamily: fonts.body }}>
                      Disconnect Partner
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ── CHAT ── */}
            {activeTab === "chat" && (
              <View className="gap-4 pb-28">
                {!isConnected ? (
                  <View className="items-center py-16">
                    <Icon set="mci" name="account-heart-outline" size={48} color={colors.mutedText} />
                    <Text className="mt-4 text-sm font-bold text-center" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                      No partner connected
                    </Text>
                    <Text className="mt-2 text-xs text-center" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                      Link a partner first to start messaging.
                    </Text>
                    <Button label="Link partner" onPress={() => setActiveTab("invite")} size="md" style={{ marginTop: 20 }} />
                  </View>
                ) : chatMessages.length === 0 ? (
                  <View className="items-center py-12">
                    <Icon set="mci" name="chat-outline" size={40} color={colors.mutedText} />
                    <Text className="mt-3 text-xs text-center" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                      No messages yet. Say hello! 👋
                    </Text>
                  </View>
                ) : (
                  chatMessages.map((msg, i) => {
                    const isPartner = msg.sender === "partner";
                    return (
                      <View key={msg.localId ?? msg._id ?? i} className={isPartner ? "self-start max-w-[80%]" : "self-end items-end max-w-[80%]"}>
                        <View
                          className={`p-4 rounded-2xl ${isPartner ? "rounded-tl-none border" : "rounded-tr-none"}`}
                          style={{
                            backgroundColor: isPartner ? colors.surface : colors.primaryDark,
                            borderColor: isPartner ? colors.border : undefined,
                            opacity: msg.status === "failed" ? 0.6 : 1,
                          }}
                        >
                          <Text
                            className="text-xs font-medium leading-5"
                            style={{ color: isPartner ? colors.foreground : "#FFFFFF", fontFamily: fonts.body }}
                          >
                            {msg.text}
                          </Text>
                        </View>
                        <SendStatusLabel status={msg.status} onRetry={() => retryMessage(msg)} />
                      </View>
                    );
                  })
                )}
              </View>
            )}
            </>
            )}
          </View>
        </ScrollView>

        {/* Chat input footer */}
        {activeTab === "chat" && isConnected && (
          <View
            className="absolute bottom-0 left-0 right-0 px-4 py-3.5 border-t flex-row items-center gap-3"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: Math.max(14, insets.bottom + 8),
            }}
          >
            <TextInput
              accessibilityLabel="Private message to your partner"
              placeholder="Send a private message..."
              placeholderTextColor={colors.mutedText}
              value={typedMessage}
              onChangeText={setTypedMessage}
              className="flex-1 px-4 py-3 rounded-xl text-sm"
              style={{ backgroundColor: colors.input, color: colors.foreground, fontFamily: fonts.body }}
              onSubmitEditing={handleSendMessage}
              submitBehavior="submit"
              returnKeyType="send"
            />
            <SendButton onPress={handleSendMessage} disabled={!typedMessage.trim()} size={40} accessibilityLabel="Send message" />
          </View>
        )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        featureKey="partner_connect"
        onUnlocked={() => {
          refreshSubscriptionAccess();
          generateCode();
        }}
      />
    </>
  );
}
