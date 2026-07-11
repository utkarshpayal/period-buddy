import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StatusBar,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../components/theme";
import { getSoftTints } from "../../components/ui-tokens";
import {
  partnerApi,
  type PartnerMessage,
  type PartnerProfile,
} from "../../lib/api";

export default function Partner() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const chatScrollRef = useRef<ScrollView>(null);

  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"info" | "invite" | "access" | "chat">("info");

  // Invite
  const [generatingCode, setGeneratingCode] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [connectCode, setConnectCode] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Permissions (local mirrors, saved on toggle)
  const [perms, setPerms] = useState({
    shareCyclePhase: true,
    shareSymptoms: false,
    shareIntimacyLog: true,
    shareAlerts: true,
  });

  // Chat
  const [chatMessages, setChatMessages] = useState<PartnerMessage[]>([]);
  const [typedMessage, setTypedMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const softTints = getSoftTints(colors);

  const load = useCallback(async () => {
    try {
      const p = await partnerApi.getProfile();
      setProfile(p);
      if (p.permissions) {
        setPerms({
          shareCyclePhase: p.permissions.shareCyclePhase ?? true,
          shareSymptoms: p.permissions.shareSymptoms ?? false,
          shareIntimacyLog: p.permissions.shareIntimacyLog ?? true,
          shareAlerts: p.permissions.shareAlerts ?? true,
        });
      }
      if (p.inviteCode) setInviteCode(p.inviteCode);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, []);

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
    load();
  }, [load]);

  useEffect(() => {
    if (activeTab === "chat") loadMessages();
  }, [activeTab, loadMessages]);

  const handleGenerateCode = async () => {
    setGeneratingCode(true);
    try {
      const result = await partnerApi.generateInviteCode();
      setInviteCode(result.inviteCode);
      setProfile((p) => p ? { ...p, inviteCode: result.inviteCode } : p);
      Alert.alert("Code Generated 🎉", `Your private sync key is:\n${result.inviteCode}\n\nShare this with your partner to connect.`);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to generate code");
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleNativeShare = async () => {
    if (!inviteCode) return;
    await Share.share({
      message: `Connect with me on Nura as my wellness support buddy. Use our private authentication key: ${inviteCode}`,
    });
  };

  const handleConnect = async () => {
    if (!connectCode.trim()) {
      Alert.alert("Error", "Please enter a partner invite code");
      return;
    }
    setConnecting(true);
    try {
      await partnerApi.connectPartner(connectCode.trim());
      await load();
      setConnectCode("");
      setActiveTab("access");
      Alert.alert("Connected", "Your partner has been linked. Configure sharing permissions below.");
    } catch (err) {
      Alert.alert("Connection Failed", err instanceof Error ? err.message : "Invalid or expired invite code");
    } finally {
      setConnecting(false);
    }
  };

  const updatePerm = async (key: keyof typeof perms, value: boolean) => {
    const next = { ...perms, [key]: value };
    setPerms(next);
    try {
      await partnerApi.updatePermissions(next);
    } catch {
      // revert on failure
      setPerms(perms);
    }
  };

  const handleSendMessage = async () => {
    if (!typedMessage.trim() || sendingMessage) return;
    const text = typedMessage.trim();
    setTypedMessage("");
    setSendingMessage(true);

    // Optimistic
    setChatMessages((prev) => [...prev, { sender: "user", text, sentAt: new Date().toISOString() }]);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      await partnerApi.sendMessage(text);
    } catch {
      // stays optimistically
    } finally {
      setSendingMessage(false);
    }
  };

  const isConnected = profile?.isConnected ?? false;
  const partnerName =
    profile?.partnerId && typeof profile.partnerId === "object"
      ? `${profile.partnerId.firstName} ${profile.partnerId.lastName}`
      : "Your Partner";

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        {/* Nav */}
        <View className="flex-row items-center gap-2 px-6 pt-6">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="p-2.5 -ml-2 rounded-full border"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <Text className="flex-1 text-2xl font-black tracking-tight ml-2" style={{ color: colors.foreground }}>
            Partner Sync
          </Text>
          {isConnected && (
            <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: softTints.emerald }}>
              <View className="w-2 h-2 rounded-full bg-emerald-500" />
              <Text className="text-[10px] font-black text-emerald-600">Connected</Text>
            </View>
          )}
        </View>

        {/* Tab pills */}
        <View className="mt-5">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
          >
            {[
              { id: "info", label: "Overview" },
              { id: "invite", label: "Link Partner" },
              { id: "access", label: "Permissions" },
              { id: "chat", label: "Private Chat" },
            ].map((tab) => {
              const isSelected = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id as any)}
                  activeOpacity={0.8}
                  className="rounded-full px-5 py-2.5 border shadow-sm"
                  style={{
                    backgroundColor: isSelected ? colors.primary : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    className="text-xs font-bold tracking-wide"
                    style={{ color: isSelected ? colors.buttonText : colors.foreground }}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <ScrollView
          ref={chatScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: activeTab === "chat" ? 80 : 120 }}
          className="flex-1"
        >
          <View className="mx-6 mt-6">
            {/* ── OVERVIEW ── */}
            {activeTab === "info" && (
              <View className="gap-5">
                {isConnected && (
                  <View
                    className="flex-row items-center p-4 rounded-2xl border gap-3"
                    style={{ backgroundColor: softTints.emerald, borderColor: colors.successLight }}
                  >
                    <View className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <Text className="text-xs font-black text-emerald-700 flex-1">
                      Synced with {partnerName}
                    </Text>
                  </View>
                )}

                {[
                  { icon: "people-outline", bg: softTints.pink, color: colors.primary, title: "What's Shared", desc: "Cycle phase, comfort tips, and alerts can be shared only when you allow them." },
                  { icon: "heart-outline", bg: softTints.emerald, color: colors.success, title: "Better Support", desc: "Help your partner understand what kind of care, space, or reminders may help." },
                  { icon: "shield-checkmark-outline", bg: softTints.lavender, color: colors.accent, title: "Privacy First", desc: "Everything shared is your choice. You can change permissions any time." },
                ].map((card) => (
                  <View
                    key={card.title}
                    className="rounded-3xl border p-5 shadow-sm flex-row items-center"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    <View className="p-3 rounded-2xl mr-4" style={{ backgroundColor: card.bg }}>
                      <Ionicons name={card.icon as any} size={20} color={card.color} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-black tracking-tight" style={{ color: colors.foreground }}>
                        {card.title}
                      </Text>
                      <Text className="text-xs mt-1 leading-4" style={{ color: colors.mutedText }}>
                        {card.desc}
                      </Text>
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setActiveTab(isConnected ? "access" : "invite")}
                  className="mt-4 rounded-2xl py-4 items-center justify-center shadow-md"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text className="text-sm font-bold tracking-wide text-white">
                    {isConnected ? "Manage Permissions" : "Proceed to Sync Setup"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── INVITE / CONNECT ── */}
            {activeTab === "invite" && (
              <View className="gap-5">
                {/* Generate code section */}
                <View
                  className="rounded-3xl border p-6 items-center shadow-sm"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                >
                  <View className="p-4 rounded-2xl mb-4" style={{ backgroundColor: softTints.pink }}>
                    <MaterialCommunityIcons name="heart-flash" size={32} color={colors.primary} />
                  </View>
                  <Text className="text-base font-black tracking-tight" style={{ color: colors.foreground }}>
                    Invite Your Partner
                  </Text>
                  <Text className="text-xs text-center mt-1.5 leading-4 px-4" style={{ color: colors.mutedText }}>
                    Generate a secure invite code and share it with your partner so they can connect to your profile.
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
                        <Text className="text-[10px] text-center font-bold uppercase text-neutral-400">
                          Your Secure Sync Key
                        </Text>
                        <Text className="text-center text-xl font-black mt-1 tracking-widest" style={{ color: colors.primary }}>
                          {inviteCode}
                        </Text>
                      </LinearGradient>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={handleNativeShare}
                        className="w-full rounded-xl py-3.5 items-center justify-center border"
                        style={{ backgroundColor: softTints.pink, borderColor: `${colors.primary}30` }}
                      >
                        <Text className="text-xs font-bold" style={{ color: colors.primary }}>
                          Share Invite Code
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={handleGenerateCode} className="mt-1 py-1">
                        <Text className="text-center text-[11px] font-bold underline" style={{ color: colors.mutedText }}>
                          Generate new code
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      disabled={generatingCode}
                      onPress={handleGenerateCode}
                      className="mt-6 w-full rounded-xl py-3.5 items-center justify-center"
                      style={{ backgroundColor: colors.primary, opacity: generatingCode ? 0.7 : 1 }}
                    >
                      {generatingCode ? (
                        <ActivityIndicator color={colors.buttonText} />
                      ) : (
                        <Text className="text-xs font-bold tracking-wide text-white uppercase">
                          Generate Unique Code
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                {/* Connect using a code */}
                {!isConnected && (
                  <View
                    className="rounded-3xl border p-5 shadow-sm"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    <Text className="text-sm font-black mb-3" style={{ color: colors.foreground }}>
                      Got a Partner Code?
                    </Text>
                    <View
                      className="flex-row items-center rounded-2xl border px-4 mb-3"
                      style={{ backgroundColor: colors.background, borderColor: colors.border }}
                    >
                      <TextInput
                        placeholder="Enter invite code e.g. NURA-ABC123"
                        placeholderTextColor={colors.mutedText}
                        value={connectCode}
                        onChangeText={(t) => setConnectCode(t.toUpperCase())}
                        autoCapitalize="characters"
                        className="flex-1 py-3 text-sm font-bold"
                        style={{ color: colors.foreground }}
                      />
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      disabled={connecting || !connectCode.trim()}
                      onPress={handleConnect}
                      className="rounded-xl py-3.5 items-center justify-center"
                      style={{
                        backgroundColor: connectCode.trim() ? colors.primary : colors.border,
                        opacity: connecting ? 0.7 : 1,
                      }}
                    >
                      {connecting ? (
                        <ActivityIndicator color={colors.buttonText} />
                      ) : (
                        <Text className="text-sm font-bold text-white">Connect Partner</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ── PERMISSIONS ── */}
            {activeTab === "access" && (
              <View className="gap-4 pt-1">
                <View
                  className="flex-row items-center gap-3 p-4 rounded-2xl border"
                  style={{ backgroundColor: isConnected ? softTints.emerald : colors.surface, borderColor: colors.border }}
                >
                  <View className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-emerald-500" : "bg-neutral-400"}`} />
                  <Text className="text-xs font-black flex-1" style={{ color: colors.foreground }}>
                    Partner: {isConnected ? `● ${partnerName} is linked` : "No partner connected yet"}
                  </Text>
                </View>

                <Text className="text-xs font-black tracking-widest uppercase mt-3 px-1" style={{ color: colors.primary }}>
                    Sharing Permissions
                </Text>

                <View
                  className="rounded-3xl border shadow-sm p-4 gap-4"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                >
                  {[
                    { key: "shareCyclePhase" as const, title: "Cycle Phase", desc: "Share phase names like luteal, ovulation, or period day.", value: perms.shareCyclePhase },
                    { key: "shareSymptoms" as const, title: "Symptoms", desc: "Share selected symptoms such as cramps, fatigue, or mood changes.", value: perms.shareSymptoms },
                    { key: "shareIntimacyLog" as const, title: "Intimacy Notes", desc: "Share intimacy-related logs only if you are comfortable.", value: perms.shareIntimacyLog },
                    { key: "shareAlerts" as const, title: "Care Alerts", desc: "Send gentle reminders before expected period or PMS days.", value: perms.shareAlerts },
                  ].map((item, i, arr) => (
                    <View key={item.key}>
                      <View className="flex-row justify-between items-center">
                        <View className="flex-1 pr-4">
                          <Text className="text-xs font-extrabold" style={{ color: colors.foreground }}>
                            {item.title}
                          </Text>
                          <Text className="text-[10px] mt-0.5 font-medium leading-3.5" style={{ color: colors.mutedText }}>
                            {item.desc}
                          </Text>
                        </View>
                        <Switch
                          value={item.value}
                          onValueChange={(v) => updatePerm(item.key, v)}
                          trackColor={{ true: colors.primary }}
                        />
                      </View>
                      {i < arr.length - 1 && (
                        <View className="h-[1px] w-full mt-4" style={{ backgroundColor: colors.border }} />
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ── CHAT ── */}
            {activeTab === "chat" && (
              <View className="gap-4 pb-28">
                {!isConnected ? (
                  <View className="items-center py-16">
                    <MaterialCommunityIcons name="account-heart-outline" size={48} color={colors.mutedText} />
                    <Text className="mt-4 text-sm font-bold text-center" style={{ color: colors.foreground }}>
                      No partner connected
                    </Text>
                    <Text className="mt-2 text-xs text-center" style={{ color: colors.mutedText }}>
                      Link a partner first to start messaging.
                    </Text>
                    <TouchableOpacity
                      onPress={() => setActiveTab("invite")}
                      className="mt-5 px-6 py-3 rounded-2xl"
                      style={{ backgroundColor: colors.primary }}
                    >
                      <Text className="text-sm font-bold text-white">Link Partner</Text>
                    </TouchableOpacity>
                  </View>
                ) : chatMessages.length === 0 ? (
                  <View className="items-center py-12">
                    <MaterialCommunityIcons name="chat-outline" size={40} color={colors.mutedText} />
                    <Text className="mt-3 text-xs text-center" style={{ color: colors.mutedText }}>
                      No messages yet. Say hello! 👋
                    </Text>
                  </View>
                ) : (
                  chatMessages.map((msg, i) => {
                    const isPartner = msg.sender === "partner";
                    return (
                      <View
                        key={msg._id ?? i}
                        className={`max-w-[80%] p-4 rounded-2xl ${isPartner ? "self-start rounded-tl-none border" : "self-end rounded-tr-none"}`}
                        style={{
                          backgroundColor: isPartner ? colors.surface : colors.primary,
                          borderColor: isPartner ? colors.border : undefined,
                        }}
                      >
                        <Text
                          className="text-xs font-medium leading-5"
                          style={{ color: isPartner ? colors.foreground : colors.buttonText }}
                        >
                          {msg.text}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Chat input footer */}
        {activeTab === "chat" && isConnected && (
          <View
            className="absolute bottom-0 left-0 right-0 px-4 py-3.5 border-t flex-row items-center gap-3"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            <TextInput
              placeholder="Send a private message..."
              placeholderTextColor={colors.mutedText}
              value={typedMessage}
              onChangeText={setTypedMessage}
              className="flex-1 px-4 py-3 rounded-xl text-sm"
              style={{ backgroundColor: colors.input, color: colors.foreground }}
              onSubmitEditing={handleSendMessage}
              returnKeyType="send"
            />
            <TouchableOpacity
              disabled={!typedMessage.trim() || sendingMessage}
              onPress={handleSendMessage}
              className="p-2.5 rounded-full items-center justify-center"
              style={{ backgroundColor: typedMessage.trim() ? colors.primary : colors.border }}
            >
              {sendingMessage ? (
                <ActivityIndicator size="small" color={colors.buttonText} />
              ) : (
                <Feather name="arrow-up" size={16} color={typedMessage.trim() ? colors.buttonText : colors.mutedText} />
              )}
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </>
  );
}
