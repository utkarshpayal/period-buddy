import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import { useTheme } from "../../components/theme";

// --- STRUCTURAL BACKEND REGISTRY CONTRACTS ---
interface PeriodBuddy {
  id: string;
  alias: string; // Anonymous names to support extreme user privacy controls
  avatarSeed: string;
  cyclePhase: string;
  cycleOverlapDays: number;
  lastUpdate: string;
  compatibility: number;
  similarities: string[];
}

interface BuddyMessage {
  id: string;
  sender: "me" | "buddy";
  text: string;
  time: string;
}

export default function BuddyNomination() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { earnTokens } = useAppState();
  const scrollViewRef = useRef<ScrollView>(null);

  // Interface Functional Controllers
  const [searchQuery, setSearchQuery] = useState("");
  const [activeNominatedId, setActiveNominatedId] = useState<string | null>(
    null,
  );
  const [isChatConsoleOpen, setIsChatConsoleOpen] = useState(false);
  const [typedMessage, setTypedMessage] = useState("");

  // Curated matches payload collection structures ready for dynamic DB query parsing
  const [nominees, setNominees] = useState<PeriodBuddy[]>([
    {
      id: "b_1",
      alias: "Mystic Peony 🌸",
      avatarSeed: "🦄",
      cyclePhase: "Ovulation Phase",
      cycleOverlapDays: 26,
      lastUpdate: "Updated today",
      compatibility: 95,
      similarities: ["28-Day Cycle", "PMDD Fatigue", "Craves Dark Chocolate"],
    },
    {
      id: "b_2",
      alias: "Cosmic Fern 🌿",
      avatarSeed: "🦊",
      cyclePhase: "Luteal Phase",
      cycleOverlapDays: 22,
      lastUpdate: "Updated today",
      compatibility: 88,
      similarities: ["31-Day Cycle", "Insomnia Spikes", "Hot Yoga Routine"],
    },
    {
      id: "b_3",
      alias: "Aura Amber 🌙",
      avatarSeed: "🐼",
      cyclePhase: "Follicular Phase",
      cycleOverlapDays: 19,
      lastUpdate: "Updated 2 days ago",
      compatibility: 85,
      similarities: ["26-Day Cycle", "Anxiety Spikes", "Chamomile Tea Log"],
    },
  ]);

  // Private live dialogue log data array container
  const [chatLog, setChatLog] = useState<BuddyMessage[]>([
    {
      id: "m1",
      sender: "buddy",
      text: "Hey period buddy! It is crazy how accurately our cycle schedules match up. Are you experiencing the intense ovulation fatigue too today? 🥱",
      time: "2:40 PM",
    },
  ]);

  const filteredNominees = nominees.filter((girl) =>
    [girl.alias, girl.cyclePhase]
      .join(" ")
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase()),
  );

  const activeBuddyData = nominees.find((b) => b.id === activeNominatedId);

  const softTints = {
    pink: isDark ? "#3b1a2d" : "#fff0f6",
    emerald: isDark ? "#062e20" : "#ecfdf5",
  };

  // --- BUSINESS OPERATION MECHANICS ---
  function handleNominateBuddy(id: string) {
    if (activeNominatedId) {
      Alert.alert(
        "Nomination Limit Reached",
        "You can cleanly secure exactly one active anonymous Period Buddy per monthly hormonal cycle window.",
      );
      return;
    }

    setActiveNominatedId(id);
    earnTokens(25); // Trigger token addition instantly inside local global scopes
    Alert.alert(
      "Buddy Locked! 🌟",
      "Your secure monthly communication workspace has been instantiated anonymously.",
    );
  }

  function handleSendBuddyMessage() {
    if (!typedMessage.trim()) return;

    const myPayload: BuddyMessage = {
      id: `msg_u_${Date.now()}`,
      sender: "me",
      text: typedMessage.trim(),
      time: "Just now",
    };

    setChatLog((prev) => [...prev, myPayload]);
    setTypedMessage("");
    setTimeout(
      () => scrollViewRef.current?.scrollToEnd({ animated: true }),
      50,
    );

    // Humanized peer-to-peer anonymous response emulation script matching layout
    setTimeout(() => {
      setChatLog((prev) => [
        ...prev,
        {
          id: `msg_b_${Date.now()}`,
          sender: "buddy",
          text: "Omg totally agree! Let's check our shared habit tree updates later to see if tracking logs match up tonight too. 🌸",
          time: "Just now",
        },
      ]);
      setTimeout(
        () => scrollViewRef.current?.scrollToEnd({ animated: true }),
        50,
      );
    }, 1200);
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
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: isChatConsoleOpen ? 20 : 120,
          }}
        >
          {/* Header Action Row Bar */}
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
              Period Buddy
            </Text>
          </View>

          <View className="mx-6 mt-6">
            {/* BRAND INTRO HERO EXCLUSIVES INFOCARD */}
            {!isChatConsoleOpen && (
              <View
                className="rounded-3xl border p-5 shadow-xs relative overflow-hidden mb-6"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <View
                  className="absolute -right-6 -top-6 w-20 h-20 rounded-full opacity-35"
                  style={{ backgroundColor: softTints.pink }}
                />

                <View className="flex-row items-center gap-2 mb-3.5">
                  <MaterialCommunityIcons
                    name="moon-waning-crescent"
                    size={16}
                    color={colors.primary}
                  />
                  <Text
                    className="text-xs font-black tracking-widest uppercase"
                    style={{ color: colors.foreground }}
                  >
                    Monthly Peer Match
                  </Text>
                </View>

                <Text
                  className="text-base font-black tracking-tight leading-5 mb-1.5"
                  style={{ color: colors.foreground }}
                >
                  Nominate Your Period Buddy 🌙
                </Text>
                <Text
                  className="text-xs leading-4"
                  style={{ color: colors.mutedText }}
                >
                  Sync timelines anonymously with another profile holding
                  identical cycle milestones. Cross-compare biological trends
                  and chat completely safe.
                </Text>
              </View>
            )}

            {/* CONDITIONAL CONTROLLER HUB SWITCH: DISCOVERY FEED VS PRIVATE ACTIVE CONSOLE */}
            {!isChatConsoleOpen ? (
              <View>
                {/* Search Inputs Component controller block */}
                <View
                  className="flex-row items-center rounded-2xl border px-4 shadow-3xs mb-5"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <Feather name="search" size={16} color={colors.mutedText} />
                  <TextInput
                    placeholder="Search identical cycle profiles safely..."
                    placeholderTextColor={colors.mutedText}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    className="ml-3 flex-1 py-4 text-sm"
                    style={{ color: colors.foreground }}
                  />
                </View>

                <Text
                  className="text-xs font-black tracking-widest uppercase mb-4 px-1"
                  style={{ color: colors.primary }}
                >
                  Top Match Profiles for You
                </Text>

                {/* MATCH STACK FEED TIMELINE LOOP */}
                <View className="gap-4">
                  {filteredNominees.map((girl) => {
                    const isSelectedBuddy = activeNominatedId === girl.id;
                    const isAnyBuddyLocked = activeNominatedId !== null;

                    return (
                      <View
                        key={girl.id}
                        className="rounded-3xl border shadow-2xl overflow-hidden"
                        style={{
                          backgroundColor: colors.surface,
                          borderColor: isSelectedBuddy
                            ? colors.primary
                            : colors.border,
                          opacity:
                            isAnyBuddyLocked && !isSelectedBuddy ? 0.45 : 1,
                        }}
                      >
                        <View className="flex-row items-center justify-between p-5">
                          <View className="flex-row items-center gap-4 flex-1">
                            <View className="h-14 w-14 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200/40">
                              <Text className="text-2xl">
                                {girl.avatarSeed}
                              </Text>
                            </View>

                            <View className="flex-1">
                              <Text
                                className="text-sm font-black tracking-tight"
                                style={{ color: colors.foreground }}
                              >
                                {girl.alias}
                              </Text>
                              <View className="flex-row items-center gap-1.5 mt-0.5">
                                <View className="w-1.5 h-1.5 rounded-full bg-pink-500" />
                                <Text
                                  className="text-[11px] font-bold"
                                  style={{ color: colors.mutedText }}
                                >
                                  {girl.cyclePhase}
                                </Text>
                              </View>
                              <Text className="mt-1 text-[9px] font-black uppercase text-neutral-400">
                                {girl.lastUpdate}
                              </Text>
                            </View>
                          </View>

                          {/* Compatibility Badge Circle parameters layout */}
                          <View className="items-center">
                            <View
                              className="h-11 w-11 items-center justify-center rounded-full"
                              style={{ backgroundColor: softTints.emerald }}
                            >
                              <Text className="text-xs font-black text-emerald-500">
                                {girl.compatibility}%
                              </Text>
                            </View>
                            <Text className="mt-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                              Overlap
                            </Text>
                          </View>
                        </View>

                        {/* SUB ELEMENT: PILL ATTRIBUTES LABELS COMPARE ROW */}
                        <View className="flex-row flex-wrap gap-1.5 px-5 pb-4">
                          {girl.similarities.map((chip, cIdx) => (
                            <View
                              key={cIdx}
                              className="px-2.5 py-1 rounded-md bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800"
                            >
                              <Text className="text-[9px] font-bold text-neutral-500">
                                #{chip}
                              </Text>
                            </View>
                          ))}
                        </View>

                        {/* CALL TO TASK DYNAMIC NOMINATIONS BAR FOOTER BUTTON */}
                        <TouchableOpacity
                          activeOpacity={0.8}
                          disabled={isAnyBuddyLocked && !isSelectedBuddy}
                          className="mx-5 mb-5 rounded-xl py-3 items-center justify-center border shadow-3xs"
                          onPress={() => handleNominateBuddy(girl.id)}
                          style={{
                            backgroundColor: isSelectedBuddy
                              ? softTints.emerald
                              : colors.primary,
                            borderColor: isSelectedBuddy
                              ? "#10b981"
                              : colors.primary,
                          }}
                        >
                          <Text
                            className="text-xs font-bold tracking-wide"
                            style={{
                              color: isSelectedBuddy
                                ? "#10b981"
                                : colors.buttonText,
                            }}
                          >
                            {isSelectedBuddy
                              ? "Nominated Expert Locked ✓"
                              : "Nominate as Buddy ✨"}
                          </Text>
                        </TouchableOpacity>

                        {/* Short cut console trigger accessible once synced configuration activates */}
                        {isSelectedBuddy && (
                          <TouchableOpacity
                            onPress={() => setIsChatConsoleOpen(true)}
                            className="mx-5 mb-5 -mt-2 p-3 bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-xl flex-row items-center justify-center gap-2"
                          >
                            <Ionicons
                              name="chatbubble-ellipses-outline"
                              size={14}
                              color={colors.primary}
                            />
                            <Text
                              className="text-xs font-black"
                              style={{ color: colors.foreground }}
                            >
                              Enter Secure Anonymous Workspace
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              /* ACTIVE ANONYMOUS PEER TALK LIVE STREAM MODULE VIEW CONSOLE */
              activeBuddyData && (
                <View className="pt-2 pb-24">
                  {/* Top Sticky Mini Meta Header Banner */}
                  <View className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 p-4 rounded-2xl flex-row justify-between items-center mb-6">
                    <View className="flex-row items-center gap-3">
                      <Text className="text-lg">
                        {activeBuddyData.avatarSeed}
                      </Text>
                      <View>
                        <Text
                          className="text-xs font-black"
                          style={{ color: colors.foreground }}
                        >
                          {activeBuddyData.alias}
                        </Text>
                        <Text className="text-[10px] font-bold text-emerald-500 mt-0.5">
                          Secure Encrypted Session Active
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => setIsChatConsoleOpen(false)}
                      className="px-3 py-1.5 rounded-lg bg-neutral-200/60 dark:bg-neutral-800"
                    >
                      <Text
                        className="text-[10px] font-black"
                        style={{ color: colors.foreground }}
                      >
                        View Stack
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Message Bubble Feed Row blocks lists loop mapping */}
                  <View className="gap-3.5">
                    {chatLog.map((message) => {
                      const isMe = message.sender === "me";
                      return (
                        <View
                          key={message.id}
                          className={`max-w-[80%] p-4 rounded-2xl ${
                            isMe
                              ? "self-end rounded-tr-none shadow-2xs"
                              : "self-start rounded-tl-none border border-neutral-100 dark:border-neutral-800"
                          }`}
                          style={{
                            backgroundColor: isMe
                              ? colors.primary
                              : colors.surface,
                          }}
                        >
                          <Text
                            className="text-xs font-medium leading-5"
                            style={{
                              color: isMe
                                ? colors.buttonText
                                : colors.foreground,
                            }}
                          >
                            {message.text}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )
            )}
          </View>
        </ScrollView>

        {/* SECURE FIXED FLOATING MESSAGING WRAPPER FOOTER ATTACHMENT CONSOLE ROW */}
        {isChatConsoleOpen && (
          <View
            className="absolute bottom-0 left-0 right-0 px-4 py-3.5 border-t border-neutral-100 dark:border-neutral-900 flex-row items-center gap-3"
            style={{ backgroundColor: colors.surface }}
          >
            <TextInput
              placeholder="Type anonymous message to buddy..."
              placeholderTextColor={colors.mutedText}
              value={typedMessage}
              onChangeText={setTypedMessage}
              className="flex-1 bg-neutral-100 dark:bg-neutral-800 px-4 py-3 rounded-xl text-sm"
              style={{ color: colors.foreground }}
            />
            <TouchableOpacity
              disabled={!typedMessage.trim()}
              onPress={handleSendBuddyMessage}
              className="p-2.5 rounded-full items-center justify-center"
              style={{
                backgroundColor: typedMessage.trim()
                  ? colors.primary
                  : colors.border,
              }}
            >
              <Feather
                name="send"
                size={14}
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
