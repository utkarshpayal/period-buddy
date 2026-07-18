import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
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
import { BuddyVideoCall, type BuddyVideoCallHandle } from "../../components/BuddyVideoCall";
import { alert } from "../../lib/alert";
import { useTheme } from "../../components/theme";
import { getSoftTints } from "../../components/ui-tokens";
import {
  buddyApi,
  getWebSocketUrl,
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
  sentAt?: string;
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
    id: match.matchKey ?? match.buddyUserId ?? match.id ?? match._id ?? match.alias,
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
    sentAt: message.sentAt,
  };
}

function mergeBuddyMessages(prev: BuddyMessage[], newMsgs: ApiBuddyMessage[]): BuddyMessage[] {
  const next = [...prev];
  for (const msg of newMsgs) {
    const mapped = mapBuddyMessage(msg);
    let found = false;
    for (let i = 0; i < next.length; i++) {
      const m = next[i];
      if (m.id === mapped.id) {
        found = true;
        break;
      }

      const isOptimisticMatch =
        String(m.id).startsWith("msg_u_") &&
        m.sender === mapped.sender &&
        m.text === mapped.text;

      const isTimeMatch =
        m.sender === mapped.sender &&
        m.text === mapped.text &&
        m.sentAt &&
        mapped.sentAt &&
        Math.abs(new Date(m.sentAt).getTime() - new Date(mapped.sentAt).getTime()) < 5000;

      if (isOptimisticMatch || isTimeMatch) {
        next[i] = mapped;
        found = true;
        break;
      }
    }
    if (!found) {
      next.push(mapped);
    }
  }
  return next;
}

export default function BuddyNomination() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const { earnTokens } = useAppState();
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const socketRef = useRef<WebSocket | null>(null);
  const videoCallRef = useRef<BuddyVideoCallHandle>(null);

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
          buddyApi.getMatches().catch(() => ({ matches: [] })),
          buddyApi.getActive().catch(() => null),
          buddyApi.getMessages().catch(() => []),
        ]);

        if (!isMounted) return;

        let finalNominees = [...fallbackNominees];
        if (matchesResponse && matchesResponse.matches && matchesResponse.matches.length > 0) {
          finalNominees = matchesResponse.matches.map(mapBuddy);
        }

        if (activeBuddy) {
          const mappedActive = mapBuddy(activeBuddy);
          setActiveNominatedId(mappedActive.id);

          // Ensure the active buddy is in the nominees list
          const exists = finalNominees.some((b) => b.id === mappedActive.id);
          if (!exists) {
            finalNominees = [mappedActive, ...finalNominees];
          }
          setIsChatConsoleOpen(true);
        }

        setNominees(finalNominees);

        const chatMessages = (messages && messages.length > 0)
          ? messages
          : (activeBuddy && activeBuddy.messages && activeBuddy.messages.length > 0)
            ? activeBuddy.messages
            : [];

        if (chatMessages.length > 0) {
          setChatLog(chatMessages.map(mapBuddyMessage));
        }
      } catch (err) {
        console.warn("Failed to load buddy space:", err);
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

  // WebSocket live synchronization
  useEffect(() => {
    if (!isChatConsoleOpen || !activeNominatedId) return;

    let socket: WebSocket | null = null;
    let isDisconnected = false;

    async function connectWS() {
      try {
        const wsUrl = await getWebSocketUrl();
        socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          if (isDisconnected) return;
          console.log("WebSocket connected for buddy chat");
          socket?.send(JSON.stringify({
            type: "join",
            room: `buddy_${activeNominatedId}`,
          }));
        };

        socket.onmessage = (event) => {
          if (isDisconnected) return;
          try {
            const data = JSON.parse(event.data);
            if (data.room !== `buddy_${activeNominatedId}`) return;

            if (data.type === "message") {
              if (data.messages && Array.isArray(data.messages)) {
                setChatLog((prev) => mergeBuddyMessages(prev, data.messages));
                setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
              }
            } else if (data.type && data.type !== "join" && data.type !== "leave") {
              // Video-call signaling (call_request/accept/decline/end, webrtc_*).
              videoCallRef.current?.handleSignal(data);
            }
          } catch (err) {
            console.error("Error parsing WebSocket message:", err);
          }
        };

        socket.onerror = (err) => {
          console.warn("WebSocket error:", err);
        };

        socket.onclose = () => {
          console.log("WebSocket closed");
        };
      } catch (err) {
        console.warn("Failed to setup WebSocket:", err);
      }
    }

    connectWS();

    return () => {
      isDisconnected = true;
      if (socket) {
        try {
          socket.send(JSON.stringify({
            type: "leave",
            room: `buddy_${activeNominatedId}`,
          }));
        } catch {}
        socket.close();
      }
      socketRef.current = null;
    };
  }, [isChatConsoleOpen, activeNominatedId]);


  const sortedNominees = React.useMemo(() => {
    const filtered = nominees.filter((buddy) =>
      [buddy.alias, buddy.cyclePhase]
        .join(" ")
        .toLowerCase()
        .includes(searchQuery.trim().toLowerCase()),
    );
    return [...filtered].sort((a, b) => {
      const aIsActive = a.id === activeNominatedId;
      const bIsActive = b.id === activeNominatedId;
      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;
      return 0;
    });
  }, [nominees, activeNominatedId, searchQuery]);

  const activeBuddyData = nominees.find((b) => b.id === activeNominatedId);

  const softTints = getSoftTints(colors);

  // --- BUSINESS OPERATION MECHANICS ---
  async function handleNominateBuddy(id: string) {
    if (activeNominatedId) {
      alert(
        "Nomination Limit Reached",
        "You can keep one active anonymous Period Buddy for each cycle window.",
      );
      return;
    }

    setActiveNominatedId(id);
    earnTokens(25);
    setIsChatConsoleOpen(true);

    try {
      const result = await buddyApi.nominate(id);
      const matchObj = result.match ?? result.buddy;
      if (matchObj) {
        const activeId = matchObj.matchKey ?? matchObj.buddyUserId ?? matchObj.id ?? matchObj._id ?? id;
        setActiveNominatedId(activeId);
      }
      if (result.tokensAwarded) earnTokens(result.tokensAwarded);
    } catch (err) {
      console.warn("Failed to nominate buddy:", err);
      // Keep the local buddy active for offline development.
    }

    alert("Buddy nominated", "Your anonymous buddy space is ready.");
  }

  async function handleSendBuddyMessage() {
    if (!typedMessage.trim()) return;

    const myPayload: BuddyMessage = {
      id: `msg_u_${Date.now()}`,
      sender: "me",
      text: typedMessage.trim(),
      time: "Just now",
      sentAt: new Date().toISOString(),
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
      if (result.messages && result.messages.length > 0) {
        setChatLog((prev) => mergeBuddyMessages(prev, result.messages));
      }
    } catch (err) {
      console.warn("Failed to send buddy message:", err);
    }
  }

  function handleLeavePairing() {
    alert(
      "Leave this buddy pairing?",
      "This ends your anonymous space with this buddy for good. Use this if a call or chat made you uncomfortable.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              await buddyApi.endActive();
            } catch (err) {
              console.warn("Failed to end buddy pairing:", err);
            }
            setActiveNominatedId(null);
            setIsChatConsoleOpen(false);
            setChatLog([]);
          },
        },
      ],
    );
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
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
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
                    style={{ color: colors.foreground, fontFamily: fonts.heading }}
                  >
                    Monthly Peer Match
                  </Text>
                </View>

                <Text
                  className="text-base font-black tracking-tight leading-5 mb-1.5"
                  style={{ color: colors.foreground, fontFamily: fonts.heading }}
                >
                  Nominate Your Period Buddy
                </Text>
                <Text
                  className="text-xs leading-4"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
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
                    style={{ color: colors.foreground, fontFamily: fonts.body }}
                  />
                </View>

                <Text
                  className="text-xs font-black tracking-widest uppercase mb-4 px-1"
                  style={{ color: colors.primary, fontFamily: fonts.heading }}
                >
                  Top Match Profiles for You
                </Text>

                {/* MATCH STACK FEED TIMELINE LOOP */}
                <View className="gap-4">
                  {sortedNominees.map((buddy) => {
                    const isSelectedBuddy = activeNominatedId === buddy.id;
                    const isAnyBuddyLocked = activeNominatedId !== null;

                    return (
                      <View
                        key={buddy.id}
                        className="rounded-3xl border shadow-2xl overflow-hidden"
                        style={{
                          backgroundColor: isSelectedBuddy
                            ? colors.primaryLight
                            : colors.surface,
                          borderColor: isSelectedBuddy
                            ? colors.primary
                            : colors.border,
                          borderWidth: isSelectedBuddy ? 2.5 : 1,
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
                              <Text className="text-2xl" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                                {buddy.avatarSeed}
                              </Text>
                            </View>

                            <View className="flex-1">
                              <View className="flex-row items-center gap-2 flex-wrap">
                                <Text
                                  className="text-sm font-black tracking-tight"
                                  style={{ color: colors.foreground, fontFamily: fonts.heading }}
                                >
                                  {buddy.alias}
                                </Text>
                                {isSelectedBuddy && (
                                  <View
                                    className="px-2 py-0.5 rounded-full flex-row items-center gap-1"
                                    style={{
                                      backgroundColor: colors.successLight,
                                      borderColor: `${colors.success}33`,
                                      borderWidth: 1,
                                    }}
                                  >
                                    <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.success }} />
                                    <Text
                                      className="text-[8px] font-black uppercase tracking-wider"
                                      style={{ color: colors.success, fontFamily: fonts.body }}
                                    >
                                      Active
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <View className="flex-row items-center gap-1.5 mt-0.5">
                                <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.primary }} />
                                <Text
                                  className="text-[11px] font-bold"
                                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                                >
                                  {buddy.cyclePhase}
                                </Text>
                              </View>
                              <Text className="mt-1 text-[9px] font-black uppercase" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
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
                              <Text className="text-xs font-black" style={{ color: colors.success, fontFamily: fonts.mono }}>
                                {buddy.compatibility}%
                              </Text>
                            </View>
                            <Text className="mt-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
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
                                style={{ color: colors.foreground, fontFamily: fonts.body }}
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
                          className="mx-5 mb-5 rounded-xl py-3 flex-row items-center justify-center gap-2 border shadow-3xs"
                          onPress={() => {
                            if (isSelectedBuddy) {
                              setIsChatConsoleOpen(true);
                            } else {
                              handleNominateBuddy(buddy.id);
                            }
                          }}
                          style={{
                            backgroundColor: colors.primary,
                            borderColor: colors.primary,
                          }}
                        >
                          {isSelectedBuddy ? (
                            <>
                              <Ionicons name="chatbubble-ellipses" size={15} color={colors.buttonText} />
                              <Text
                                className="text-xs font-bold tracking-wide"
                                style={{ color: colors.buttonText, fontFamily: fonts.body }}
                              >
                                Chat with Buddy
                              </Text>
                            </>
                          ) : (
                            <Text
                              className="text-xs font-bold tracking-wide"
                              style={{ color: colors.buttonText, fontFamily: fonts.body }}
                            >
                              Nominate as Buddy
                            </Text>
                          )}
                        </TouchableOpacity>
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
                      <Text className="text-lg" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                        {activeBuddyData.avatarSeed}
                      </Text>
                      <View>
                        <Text
                          className="text-xs font-black"
                          style={{ color: colors.foreground, fontFamily: fonts.heading }}
                        >
                          {activeBuddyData.alias}
                        </Text>
                        <Text className="text-[10px] font-bold uppercase tracking-wide mt-0.5" style={{ color: colors.success, fontFamily: fonts.body }}>
                          Secure Encrypted Session
                        </Text>
                      </View>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <TouchableOpacity
                        onPress={() => videoCallRef.current?.startCall()}
                        className="w-8 h-8 rounded-full items-center justify-center"
                        style={{ backgroundColor: colors.primaryLight }}
                      >
                        <Ionicons name="videocam" size={15} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleLeavePairing}
                        className="w-8 h-8 rounded-full items-center justify-center"
                        style={{ backgroundColor: colors.surfaceSoft }}
                      >
                        <Ionicons name="exit-outline" size={15} color={colors.mutedText} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setIsChatConsoleOpen(false)}
                        className="px-3 py-1.5 rounded-lg"
                        style={{ backgroundColor: colors.surfaceSoft }}
                      >
                        <Text
                          className="text-[10px] font-black"
                          style={{ color: colors.foreground, fontFamily: fonts.body }}
                        >
                          View Stack
                        </Text>
                      </TouchableOpacity>
                    </View>
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
                              fontFamily: fonts.body,
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
                fontFamily: fonts.body,
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
                name="arrow-up"
                size={16}
                color={
                  typedMessage.trim() ? colors.buttonText : colors.mutedText
                }
              />
            </TouchableOpacity>
          </View>
        )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      {isChatConsoleOpen && activeBuddyData && (
        <BuddyVideoCall
          ref={videoCallRef}
          buddyAlias={activeBuddyData.alias}
          roomId={`buddy_${activeNominatedId}`}
          socketRef={socketRef}
        />
      )}
    </>
  );
}
