import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
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

// --- TELEHEALTH & PARTNER METRIC SCHEMAS ---
interface ChatMessage {
  id: string;
  sender: "user" | "partner";
  text: string;
  time: string;
}

export default function Partner() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);

  // Core Screen Navigation UI State
  const [activeTab, setActiveTab] = useState<
    "info" | "invite" | "access" | "chat"
  >("info");

  // Invite System States
  const [inviteCode, setInviteCode] = useState("");
  const [isPartnerConnected, setIsPartnerConnected] = useState(false);

  // Dynamic Granular Access Permissions State Switches
  const [shareCyclePhase, setShareCyclePhase] = useState(true);
  const [shareSymptoms, setShareSymptoms] = useState(false);
  const [shareIntimacyLog, setShareIntimacyLog] = useState(true);
  const [shareAlerts, setShareAlerts] = useState(true);

  // Live Chat Stream States
  const [typedMessage, setTypedMessage] = useState("");
  const [chatLog, setChatLog] = useState<ChatMessage[]>([
    {
      id: "m1",
      sender: "partner",
      text: "Hey! Just set up the sync code on my phone. App says you are on Cycle Day 6 today, let me know if you need anything comforting brought over! ❤️",
      time: "10:14 AM",
    },
  ]);

  const softTints = {
    pink: isDark ? "#3b1a2d" : "#fff0f6",
    emerald: isDark ? "#062e20" : "#ecfdf5",
    purple: isDark ? "#231942" : "#f3e8ff",
    orange: isDark ? "#361e12" : "#fff7ed",
  };

  // --- BUSINESS LOGIC DRIVERS ---
  function generateInviteCode() {
    const rawCode = `NURA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    setInviteCode(rawCode);
    Alert.alert("Code Generated 🎉", `Your private sync key is: ${rawCode}`);
  }

  async function handleNativeShare() {
    if (!inviteCode) return;
    await Share.share({
      message: `Connect with me on Nura as my wellness support buddy. Use our private authentication key: ${inviteCode}`,
    });
  }

  function simulatePartnerConnection() {
    setIsPartnerConnected(true);
    setActiveTab("access");
    Alert.alert(
      "Connected Successfully! ✨",
      "Your partner's device profile has synchronized. Configure sharing filters below.",
    );
  }

  function handleSendChatMessage() {
    if (!typedMessage.trim()) return;

    const userPayload: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      sender: "user",
      text: typedMessage.trim(),
      time: "Just now",
    };

    setChatLog((prev) => [...prev, userPayload]);
    setTypedMessage("");
    setTimeout(
      () => scrollViewRef.current?.scrollToEnd({ animated: true }),
      50,
    );

    // Warm, organic couple-centric response generation simulation logic
    setTimeout(() => {
      setChatLog((prev) => [
        ...prev,
        {
          id: `msg_p_${Date.now()}`,
          sender: "partner",
          text: "Got it! Thanks for updating the permissions. Love how minimal this setup feels. Let me know if those cramps flare up later. 🌸",
          time: "Just now",
        },
      ]);
      setTimeout(
        () => scrollViewRef.current?.scrollToEnd({ animated: true }),
        50,
      );
    }, 1500);
  }

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
      >
        {/* Navigation Action Header */}
        <View className="flex-row items-center gap-2 px-6 pt-6">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="p-2.5 -ml-2 rounded-full border"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <Text
            className="flex-1 text-2xl font-black tracking-tight ml-2"
            style={{ color: colors.foreground }}
          >
            Partner Options
          </Text>
        </View>

        {/* PREMIUM HORIZONTAL SCROLLABLE TAB SELECTORS */}
        <View className="mt-5">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
          >
            {[
              { id: "info", label: "Overview" },
              { id: "invite", label: "Link Partner" },
              { id: "access", label: "Permissions Options" },
              { id: "chat", label: "Private Chat" },
            ].map((tab) => {
              const isSelected = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id as any)}
                  activeOpacity={0.8}
                  className="rounded-full px-5 py-2.5 border shadow-3xs"
                  style={{
                    backgroundColor: isSelected
                      ? colors.primary
                      : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    className="text-xs font-bold tracking-wide"
                    style={{
                      color: isSelected ? colors.buttonText : colors.foreground,
                    }}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* MAIN BODY SCROLL VIEW PORT WINDOW */}
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: activeTab === "chat" ? 20 : 120,
          }}
          className="flex-1"
        >
          <View className="mx-6 mt-6">
            {/* SEGMENT 1: OVERVIEW CARD LAYOUTS */}
            {activeTab === "info" && (
              <View className="gap-5">
                <Text
                  className="text-xs font-semibold px-1 leading-4"
                  style={{ color: colors.mutedText }}
                >
                  Sync synchronization logs securely to cultivate healthier
                  communication loops during heavy cycle workloads.
                </Text>

                <View
                  className="rounded-3xl border p-5 shadow-2xs flex-row items-center"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <View
                    className="p-3 rounded-2xl mr-4"
                    style={{ backgroundColor: softTints.pink }}
                  >
                    <Ionicons
                      name="people-outline"
                      size={20}
                      color={colors.primary}
                    />
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-sm font-black tracking-tight"
                      style={{ color: colors.foreground }}
                    >
                      What's Shared Natively
                    </Text>
                    <Text
                      className="text-xs mt-1 leading-4"
                      style={{ color: colors.mutedText }}
                    >
                      Live cycle spacing indicators, targeted physiological
                      comfort tips, and customized alert structures.
                    </Text>
                  </View>
                </View>

                <View
                  className="rounded-3xl border p-5 shadow-2xs flex-row items-center"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <View
                    className="p-3 rounded-2xl mr-4"
                    style={{ backgroundColor: softTints.emerald }}
                  >
                    <Ionicons name="leaf-outline" size={20} color="#10b981" />
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-sm font-black tracking-tight"
                      style={{ color: colors.foreground }}
                    >
                      Ecosystem Benefits
                    </Text>
                    <Text
                      className="text-xs mt-1 leading-4"
                      style={{ color: colors.mutedText }}
                    >
                      Bypasses awkward transactional explanations completely.
                      Down-regulates daily miscommunication drops.
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setActiveTab("invite")}
                  className="mt-4 rounded-2xl py-4 items-center justify-center shadow-md"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text
                    className="text-sm font-bold tracking-wide"
                    style={{ color: colors.buttonText }}
                  >
                    Proceed to Sync Setup
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* SEGMENT 2: INVITE ENCRYPTION KEY SETUP */}
            {activeTab === "invite" && (
              <View className="gap-4 pt-2">
                <View
                  className="rounded-3xl border p-6 items-center shadow-xs"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <View
                    className="p-4 rounded-2xl mb-4"
                    style={{ backgroundColor: softTints.pink }}
                  >
                    <MaterialCommunityIcons
                      name="heart-flash"
                      size={32}
                      color={colors.primary}
                    />
                  </View>
                  <Text
                    className="text-base font-black tracking-tight"
                    style={{ color: colors.foreground }}
                  >
                    Invite Support Buddy
                  </Text>
                  <Text
                    className="text-xs text-center mt-1.5 leading-4 px-4"
                    style={{ color: colors.mutedText }}
                  >
                    Generate a sandboxed secure device hash key below to unlock
                    matching dashboard mirrors for your partner.
                  </Text>

                  {!inviteCode ? (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={generateInviteCode}
                      className="mt-6 w-full rounded-xl py-3.5 items-center justify-center"
                      style={{ backgroundColor: colors.primary }}
                    >
                      <Text className="text-xs font-bold tracking-wide text-white uppercase">
                        Generate Unique Code
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View className="w-full mt-6 gap-3">
                      <View className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 p-4 rounded-xl">
                        <Text className="text-[10px] text-center font-bold uppercase text-neutral-400">
                          Your Secure Sync Key
                        </Text>
                        <Text className="text-center text-xl font-black mt-1 text-pink-500 tracking-widest">
                          {inviteCode}
                        </Text>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={handleNativeShare}
                        className="w-full rounded-xl py-3.5 items-center justify-center border border-pink-500/30"
                        style={{ backgroundColor: softTints.pink }}
                      >
                        <Text className="text-xs font-bold text-pink-500">
                          Dispatch Hash Invitation
                        </Text>
                      </TouchableOpacity>

                      {/* SIMULATION FOR TESTING ACTION PIPELINES */}
                      {!isPartnerConnected && (
                        <TouchableOpacity
                          onPress={simulatePartnerConnection}
                          className="mt-2 py-1"
                        >
                          <Text className="text-center text-[11px] font-bold text-neutral-400 underline">
                            Simulate Partner Acceptance
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* SEGMENT 3: GRANULAR GRANULAR ACCESS CONTROLS (THE CORE USER ASK) */}
            {activeTab === "access" && (
              <View className="gap-4 pt-1">
                <View className="bg-pink-50/50 dark:bg-pink-950/20 px-4 py-3 rounded-2xl border border-pink-100 dark:border-pink-900/40 flex-row items-center gap-3">
                  <View className="w-2 h-2 rounded-full bg-emerald-500" />
                  <Text
                    className="text-xs font-bold"
                    style={{ color: colors.foreground }}
                  >
                    Partner Connection Status:{" "}
                    {isPartnerConnected
                      ? "Active Stream"
                      : "Awaiting Pairing Hash"}
                  </Text>
                </View>

                <Text
                  className="text-xs font-black tracking-widest uppercase mt-3 px-1"
                  style={{ color: colors.primary }}
                >
                  Privacy & Data Release Configuration
                </Text>

                {/* Grid Framework list mapping switch selectors */}
                <View
                  className="rounded-3xl border shadow-3xs p-4 gap-4"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  {/* Toggle 1 */}
                  <View className="flex-row justify-between items-center">
                    <View className="flex-1 pr-4">
                      <Text
                        className="text-xs font-extrabold"
                        style={{ color: colors.foreground }}
                      >
                        Cycle Phase Index Tracker
                      </Text>
                      <Text
                        className="text-[10px] mt-0.5 font-medium leading-3.5"
                        style={{ color: colors.mutedText }}
                      >
                        Allows partner to view live phase names (e.g. Luteal,
                        Period Day 6).
                      </Text>
                    </View>
                    <Switch
                      value={shareCyclePhase}
                      onValueChange={setShareCyclePhase}
                      trackColor={{ true: colors.primary }}
                    />
                  </View>

                  <View className="h-[1px] w-full bg-neutral-100 dark:bg-neutral-900/60" />

                  {/* Toggle 2 */}
                  <View className="flex-row justify-between items-center">
                    <View className="flex-1 pr-4">
                      <Text
                        className="text-xs font-extrabold"
                        style={{ color: colors.foreground }}
                      >
                        Physical Symptoms Breakdown
                      </Text>
                      <Text
                        className="text-[10px] mt-0.5 font-medium leading-3.5"
                        style={{ color: colors.mutedText }}
                      >
                        Shares specific log attributes like severe cramps,
                        fatigue, or mood dips.
                      </Text>
                    </View>
                    <Switch
                      value={shareSymptoms}
                      onValueChange={setShareSymptoms}
                      trackColor={{ true: colors.primary }}
                    />
                  </View>

                  <View className="h-[1px] w-full bg-neutral-100 dark:bg-neutral-900/60" />

                  {/* Toggle 3 */}
                  <View className="flex-row justify-between items-center">
                    <View className="flex-1 pr-4">
                      <Text
                        className="text-xs font-extrabold"
                        style={{ color: colors.foreground }}
                      >
                        Intimacy & Intercourse History
                      </Text>
                      <Text
                        className="text-[10px] mt-0.5 font-medium leading-3.5"
                        style={{ color: colors.mutedText }}
                      >
                        Exposes safe sex trackers or shared habit game
                        parameters cleanly.
                      </Text>
                    </View>
                    <Switch
                      value={shareIntimacyLog}
                      onValueChange={setShareIntimacyLog}
                      trackColor={{ true: colors.primary }}
                    />
                  </View>

                  <View className="h-[1px] w-full bg-neutral-100 dark:bg-neutral-900/60" />

                  {/* Toggle 4 */}
                  <View className="flex-row justify-between items-center">
                    <View className="flex-1 pr-4">
                      <Text
                        className="text-xs font-extrabold"
                        style={{ color: colors.foreground }}
                      >
                        PMS & Flow Proactive Alerts
                      </Text>
                      <Text
                        className="text-[10px] mt-0.5 font-medium leading-3.5"
                        style={{ color: colors.mutedText }}
                      >
                        Pushes automated micro-notifications to partner device 2
                        days before periods.
                      </Text>
                    </View>
                    <Switch
                      value={shareAlerts}
                      onValueChange={setShareAlerts}
                      trackColor={{ true: colors.primary }}
                    />
                  </View>
                </View>
              </View>
            )}

            {/* SEGMENT 4: REAL-TIME THREADS STYLE MESSAGING STREAMS */}
            {activeTab === "chat" && (
              <View className="gap-4 pb-28">
                {chatLog.map((message) => {
                  const isPartner = message.sender === "partner";
                  return (
                    <View
                      key={message.id}
                      className={`max-w-[80%] p-4 rounded-2xl ${
                        isPartner
                          ? "self-start rounded-tl-none border border-neutral-100 dark:border-neutral-800"
                          : "self-end rounded-tr-none"
                      }`}
                      style={{
                        backgroundColor: isPartner
                          ? colors.surface
                          : colors.primary,
                      }}
                    >
                      <Text
                        className="text-xs font-medium leading-5"
                        style={{
                          color: isPartner
                            ? colors.foreground
                            : colors.buttonText,
                        }}
                      >
                        {message.text}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>

        {/* STICKY ABSOLUTE MESSAGE INPUT FOOTER CONSOLE BAR FOR LIVE CONVERSATIONS */}
        {activeTab === "chat" && (
          <View
            className="absolute bottom-0 left-0 right-0 px-4 py-3.5 border-t border-neutral-100 dark:border-neutral-900 flex-row items-center gap-3"
            style={{ backgroundColor: colors.surface }}
          >
            <TextInput
              placeholder="Send secure chat message to partner..."
              placeholderTextColor={colors.mutedText}
              value={typedMessage}
              onChangeText={setTypedMessage}
              className="flex-1 bg-neutral-100 dark:bg-neutral-800 px-4 py-3 rounded-xl text-sm"
              style={{ color: colors.foreground }}
            />
            <TouchableOpacity
              disabled={!typedMessage.trim()}
              onPress={handleSendChatMessage}
              className="p-2.5 rounded-full items-center justify-center"
              style={{
                backgroundColor: typedMessage.trim()
                  ? colors.primary
                  : colors.border,
              }}
            >
              <Feather
                name="arrow-up"
                size={16}
                color={
                  typedMessage.trim() ? colors.buttonText : colors.mutedText
                }
              />
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </>
  );
}
