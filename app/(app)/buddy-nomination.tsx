import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import { useTheme } from "../../components/theme";
import { getSoftTints } from "../../components/ui-tokens";
import {
  buddyApi,
  type BuddyMatch as ApiBuddyMatch,
  type BuddyMessage as ApiBuddyMessage,
} from "../../lib/api";

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

const fallbackNominees: PeriodBuddy[] = [
  {
    id: "b_1",
    alias: "Mystic Peony",
    avatarSeed: "MP",
    cyclePhase: "Ovulation Phase",
    cycleOverlapDays: 26,
    lastUpdate: "Updated today",
    compatibility: 95,
    similarities: ["28-Day Cycle", "PMDD Fatigue", "Craves Dark Chocolate"],
  },
  {
    id: "b_2",
    alias: "Cosmic Fern",
    avatarSeed: "CF",
    cyclePhase: "Luteal Phase",
    cycleOverlapDays: 22,
    lastUpdate: "Updated today",
    compatibility: 88,
    similarities: ["31-Day Cycle", "Insomnia Spikes", "Hot Yoga Routine"],
  },
  {
    id: "b_3",
    alias: "Aura Amber",
    avatarSeed: "AA",
    cyclePhase: "Follicular Phase",
    cycleOverlapDays: 19,
    lastUpdate: "Updated 2 days ago",
    compatibility: 85,
    similarities: ["26-Day Cycle", "Anxiety Spikes", "Chamomile Tea Log"],
  },
];



function mapBuddy(match: ApiBuddyMatch): PeriodBuddy {
  return {
    id: match.id ?? match._id ?? match.alias,
    alias: match.alias,
    avatarSeed: match.avatarSeed,
    cyclePhase: match.cyclePhase,
    cycleOverlapDays: match.cycleOverlapDays,
    lastUpdate: "Updated today",
    compatibility: match.compatibility,
    similarities: match.similarities,
  };
}

function mapBuddyMessage(message: ApiBuddyMessage): BuddyMessage {
  return {
    id: message.id ?? message._id ?? `${message.sender}_${message.sentAt}`,
    sender: message.sender,
    text: message.text,
    time: message.sentAt
      ? new Date(message.sentAt).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })
      : "Just now",
  };
}

export default function BuddyNomination() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { earnTokens } = useAppState();
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  // Interface Functional Controllers
  const [searchQuery, setSearchQuery] = useState("");
  const [activeNominatedId, setActiveNominatedId] = useState<string | null>(
    null,
  );
  const [isChatConsoleOpen, setIsChatConsoleOpen] = useState(false);
  const [typedMessage, setTypedMessage] = useState("");

  const [nominees, setNominees] = useState<PeriodBuddy[]>(fallbackNominees);

  // Private live dialogue log data array container
  const [chatLog, setChatLog] = useState<BuddyMessage[]>([
    {
      id: "m1",
      sender: "buddy",
      text: "Hey period buddy. Our cycle windows are really close this month. Are you feeling ovulation fatigue today too?",
      time: "2:40 PM",
    },
  ]);

  useEffect(() => {
    let isMounted = true;

    async function loadBuddySpace() {
      try {
        const [matchesResponse, activeBuddy, messages] = await Promise.all([
          buddyApi.getMatches(),
          buddyApi.getActive(),
          buddyApi.getMessages(),
        ]);

        if (!isMounted) return;

        if (matchesResponse.matches.length > 0) {
          setNominees(matchesResponse.matches.map(mapBuddy));
        }
        if (activeBuddy) {
          setActiveNominatedId(activeBuddy.id ?? activeBuddy._id ?? null);
        }
        if (messages.length > 0) {
          setChatLog(messages.map(mapBuddyMessage));
        }
      } catch {
        if (isMounted) {
          setNominees(fallbackNominees);
        }
      }
    }

    loadBuddySpace();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredNominees = nominees.filter((buddy) =>
    [buddy.alias, buddy.cyclePhase]
      .join(" ")
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase()),
  );

  const activeBuddyData = nominees.find((b) => b.id === activeNominatedId);

  const softTints = getSoftTints(colors);

  // --- BUSINESS OPERATION MECHANICS ---
  async function handleNominateBuddy(id: string) {
    if (activeNominatedId) {
      Alert.alert(
        "Nomination Limit Reached",
        "You can keep one active anonymous Period Buddy for each cycle window.",
      );
      return;
    }

    setActiveNominatedId(id);
    earnTokens(25);

    try {
      const result = await buddyApi.nominate(id);
      setActiveNominatedId(result.buddy.id ?? result.buddy._id ?? id);
      if (result.tokensAwarded) earnTokens(result.tokensAwarded);
    } catch {
      // Keep the local buddy active for offline development.
    }

    Alert.alert("Buddy nominated", "Your anonymous buddy space is ready.");
  }

  async function handleSendBuddyMessage() {
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

    try {
      const result = await buddyApi.sendMessage(myPayload.text);
      if (result.tokensAwarded) earnTokens(result.tokensAwarded);
      if (result.messages.length > 0) {
        setChatLog(result.messages.map(mapBuddyMessage));
      }
    } catch {
      setTimeout(() => {
        setChatLog((prev) => [
          ...prev,
          {
            id: `msg_b_${Date.now()}`,
            sender: "buddy",
            text: "Totally. Let's check our habit updates later and compare how the day felt.",
            time: "Just now",
          },
        ]);
        setTimeout(
          () => scrollViewRef.current?.scrollToEnd({ animated: true }),
          50,
        );
      }, 1200);
    }
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
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: isChatConsoleOpen
              ? Math.max(120, insets.bottom + 98)
              : Math.max(120, insets.bottom + 84),
          }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
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
                  Nominate Your Period Buddy
                </Text>
                <Text
                  className="text-xs leading-4"
                  style={{ color: colors.mutedText }}
                >
                  Sync timelines anonymously with another profile holding
                  similar cycle milestones. Compare patterns and chat with
                  privacy in mind.
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
                    returnKeyType="search"
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
                  {filteredNominees.map((buddy) => {
                    const isSelectedBuddy = activeNominatedId === buddy.id;
                    const isAnyBuddyLocked = activeNominatedId !== null;

                    return (
                      <View
                        key={buddy.id}
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
                            <View
                              className="h-14 w-14 items-center justify-center rounded-full border"
                              style={{
                                backgroundColor: colors.surfaceSoft,
                                borderColor: colors.border,
                              }}
                            >
                              <Text className="text-2xl">
                                {buddy.avatarSeed}
                              </Text>
                            </View>

                            <View className="flex-1">
                              <Text
                                className="text-sm font-black tracking-tight"
                                style={{ color: colors.foreground }}
                              >
                                {buddy.alias}
                              </Text>
                              <View className="flex-row items-center gap-1.5 mt-0.5">
                                <View className="w-1.5 h-1.5 rounded-full bg-pink-500" />
                                <Text
                                  className="text-[11px] font-bold"
                                  style={{ color: colors.mutedText }}
                                >
                                  {buddy.cyclePhase}
                                </Text>
                              </View>
                              <Text className="mt-1 text-[9px] font-black uppercase text-neutral-400">
                                {buddy.lastUpdate}
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
                                {buddy.compatibility}%
                              </Text>
                            </View>
                            <Text className="mt-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                              Overlap
                            </Text>
                          </View>
                        </View>

                        {/* SUB ELEMENT: PILL ATTRIBUTES LABELS COMPARE ROW */}
                        <View className="flex-row flex-wrap gap-1.5 px-5 pb-4">
                          {buddy.similarities.map((chip, cIdx) => (
                            <View
                              key={cIdx}
                              className="px-2.5 py-1 rounded-md"
                              style={{
                                backgroundColor: colors.surfaceSoft,
                                borderWidth: 1,
                                borderColor: colors.border,
                              }}
                            >
                              <Text
                                className="text-[9px] font-bold"
                                style={{ color: colors.foreground }}
                              >
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
                          onPress={() => handleNominateBuddy(buddy.id)}
                          style={{
                            backgroundColor: isSelectedBuddy
                              ? softTints.emerald
                              : colors.primary,
                            borderColor: isSelectedBuddy
                              ? colors.success
                              : colors.primary,
                          }}
                        >
                          <Text
                            className="text-xs font-bold tracking-wide"
                            style={{
                              color: isSelectedBuddy
                                ? colors.success
                                : colors.buttonText,
                            }}
                          >
                            {isSelectedBuddy
                              ? "Buddy Nominated"
                              : "Nominate as Buddy"}
                          </Text>
                        </TouchableOpacity>

                        {/* Short cut console trigger accessible once synced configuration activates */}
                        {isSelectedBuddy && (
                          <TouchableOpacity
                            onPress={() => setIsChatConsoleOpen(true)}
                            className="mx-5 mb-5 -mt-2 p-3 rounded-xl flex-row items-center justify-center gap-2"
                            style={{
                              backgroundColor: colors.surfaceSoft,
                              borderWidth: 1,
                              borderColor: colors.border,
                            }}
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
                              Open Anonymous Chat
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
                  <View
                    className="border p-4 rounded-2xl flex-row justify-between items-center mb-6"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    }}
                  >
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
                      className="px-3 py-1.5 rounded-lg"
                      style={{ backgroundColor: colors.surfaceSoft }}
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
                              : "self-start rounded-tl-none"
                          }`}
                          style={{
                            backgroundColor: isMe
                              ? colors.primary
                              : colors.surface,
                            borderWidth: isMe ? 0 : 1,
                            borderColor: isMe ? undefined : colors.border,
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
            className="absolute bottom-0 left-0 right-0 px-4 py-3.5 flex-row items-center gap-3"
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.surface,
              paddingBottom: Math.max(14, insets.bottom + 8),
            }}
          >
            <TextInput
              placeholder="Type an anonymous message..."
              placeholderTextColor={colors.mutedText}
              value={typedMessage}
              onChangeText={setTypedMessage}
              className="flex-1 px-4 py-3 rounded-xl text-sm"
              style={{
                backgroundColor: colors.input,
                color: colors.foreground,
              }}
              onSubmitEditing={handleSendBuddyMessage}
              blurOnSubmit={false}
              returnKeyType="send"
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
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}
