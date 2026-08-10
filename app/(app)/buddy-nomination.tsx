import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import { BuddyVideoCall, type BuddyVideoCallHandle } from "../../components/BuddyVideoCall";
import { alert } from "../../lib/alert";
import { useTheme } from "../../components/theme";
import { SkeletonRow } from "../../components/Skeleton";
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import {
  buddyApi,
  getWebSocketUrl,
  type BuddyMatch as ApiBuddyMatch,
  type BuddyMessage as ApiBuddyMessage,
} from "../../lib/api";

// --- STRUCTURAL BACKEND REGISTRY CONTRACTS ---
interface PeriodBuddy {
  id: string;
  name: string;
  // Only set once this candidate has actually been nominated into a persisted
  // BuddyMatch (undefined for unnominated discovery-list previews). Chat/call
  // signaling is scoped to this key, not `id`, so it can't collide across pairings.
  roomKey?: string;
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

// How often we announce presence over the buddy room, and how long a buddy
// can go quiet before we stop treating them as online. The timeout is a
// multiple of the ping interval so a single dropped/late packet doesn't
// falsely flip someone to offline.
const PRESENCE_PING_INTERVAL_MS = 8000;
const PRESENCE_TIMEOUT_MS = 20000;

const fallbackNominees: PeriodBuddy[] = [
  {
    id: "b_1",
    name: "Priya Malhotra",
    avatarSeed: "PM",
    cyclePhase: "Ovulation Phase",
    cycleOverlapDays: 26,
    lastUpdate: "Updated today",
    compatibility: 95,
    similarities: ["28-Day Cycle", "PMDD Fatigue", "Craves Dark Chocolate"],
  },
  {
    id: "b_2",
    name: "Ananya Kapoor",
    avatarSeed: "AK",
    cyclePhase: "Luteal Phase",
    cycleOverlapDays: 22,
    lastUpdate: "Updated today",
    compatibility: 88,
    similarities: ["31-Day Cycle", "Insomnia Spikes", "Hot Yoga Routine"],
  },
  {
    id: "b_3",
    name: "Riya Sharma",
    avatarSeed: "RS",
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
    name: match.alias,
    roomKey: match.roomKey,
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
  const buddyLastSeenRef = useRef<number>(0);
  const [isBuddyOnline, setIsBuddyOnline] = useState(false);

  // Interface Functional Controllers
  const [searchQuery, setSearchQuery] = useState("");
  const [activeNominatedId, setActiveNominatedId] = useState<string | null>(
    null,
  );
  const [isChatConsoleOpen, setIsChatConsoleOpen] = useState(false);
  const [typedMessage, setTypedMessage] = useState("");

  const [nominees, setNominees] = useState<PeriodBuddy[]>([]);
  const [loadingNominees, setLoadingNominees] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Private live dialogue log data array container
  const [chatLog, setChatLog] = useState<BuddyMessage[]>([
    {
      id: "m1",
      sender: "buddy",
      text: "Hey period buddy. Our cycle windows are really close this month. Are you feeling ovulation fatigue today too?",
      time: "2:40 PM",
    },
  ]);

  const loadBuddySpace = useCallback(async () => {
    try {
      const [matchesResponse, activeBuddy, messages] = await Promise.all([
        buddyApi.getMatches().catch(() => ({ matches: [] })),
        buddyApi.getActive().catch(() => null),
        buddyApi.getMessages().catch(() => []),
      ]);

      let finalNominees = [...fallbackNominees];
      if (matchesResponse && matchesResponse.matches && matchesResponse.matches.length > 0) {
        finalNominees = matchesResponse.matches.map(mapBuddy);
      }

      if (activeBuddy) {
        const mappedActive = mapBuddy(activeBuddy);
        setActiveNominatedId(mappedActive.id);

        // The active match is authoritative (it has roomKey; a same-id discovery-list
        // preview from getBuddyMatches never does), so overwrite any preview entry
        // instead of only adding one when it's missing.
        const exists = finalNominees.some((b) => b.id === mappedActive.id);
        finalNominees = exists
          ? finalNominees.map((b) => (b.id === mappedActive.id ? mappedActive : b))
          : [mappedActive, ...finalNominees];
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
      setNominees(fallbackNominees);
    } finally {
      setLoadingNominees(false);
    }
  }, []);

  useEffect(() => {
    loadBuddySpace();
  }, [loadBuddySpace]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadBuddySpace();
    } finally {
      setRefreshing(false);
    }
  }, [loadBuddySpace]);

  const activeBuddyData = nominees.find((b) => b.id === activeNominatedId);
  // Unique per pairing (see roomKey on the backend BuddyMatch model) so this room can
  // never be reused by a later, unrelated pairing the way a userId-derived name could.
  const activeRoomKey = activeBuddyData?.roomKey;

  // WebSocket live synchronization
  useEffect(() => {
    if (!isChatConsoleOpen || !activeNominatedId || !activeRoomKey) return;

    let socket: WebSocket | null = null;
    let isDisconnected = false;
    let presenceHeartbeat: ReturnType<typeof setInterval> | null = null;
    let presenceWatchdog: ReturnType<typeof setInterval> | null = null;

    buddyLastSeenRef.current = 0;
    setIsBuddyOnline(false);

    const room = `buddy_${activeRoomKey}`;

    async function connectWS() {
      try {
        const wsUrl = await getWebSocketUrl();
        socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          if (isDisconnected) return;
          console.log("WebSocket connected for buddy chat");
          socket?.send(JSON.stringify({ type: "join", room }));
          // Announce presence immediately, then keep pinging so the buddy's
          // client can tell "online" apart from "was online a while ago".
          socket?.send(JSON.stringify({ type: "presence_ping", room }));

          presenceHeartbeat = setInterval(() => {
            try {
              socket?.send(JSON.stringify({ type: "presence_ping", room }));
            } catch {}
          }, PRESENCE_PING_INTERVAL_MS);

          presenceWatchdog = setInterval(() => {
            if (Date.now() - buddyLastSeenRef.current > PRESENCE_TIMEOUT_MS) {
              setIsBuddyOnline(false);
            }
          }, PRESENCE_PING_INTERVAL_MS);
        };

        socket.onmessage = (event) => {
          if (isDisconnected) return;
          try {
            const data = JSON.parse(event.data);

            // Chat messages and the buddy_ended notice both arrive on this user's
            // personal room (`user_<ownId>`, auto-joined for every authenticated
            // connection), not the buddy_<roomKey> signaling room below — they're
            // delivered per-recipient rather than broadcast symmetrically to both sides.
            if (data.type === "message") {
              if (data.messages && Array.isArray(data.messages)) {
                setChatLog((prev) => mergeBuddyMessages(prev, data.messages));
                setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
              }
              return;
            }

            if (data.type === "buddy_ended") {
              setIsChatConsoleOpen(false);
              setActiveNominatedId(null);
              setChatLog([]);
              alert("Buddy pairing ended", "Your Period Buddy left this pairing.");
              return;
            }

            if (data.room !== room) return;

            if (data.type === "presence_ping") {
              buddyLastSeenRef.current = Date.now();
              setIsBuddyOnline(true);
              try {
                socket?.send(JSON.stringify({ type: "presence_pong", room }));
              } catch {}
            } else if (data.type === "presence_pong") {
              buddyLastSeenRef.current = Date.now();
              setIsBuddyOnline(true);
            } else if (data.type === "presence_leave") {
              buddyLastSeenRef.current = 0;
              setIsBuddyOnline(false);
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
      if (presenceHeartbeat) clearInterval(presenceHeartbeat);
      if (presenceWatchdog) clearInterval(presenceWatchdog);
      if (socket) {
        try {
          socket.send(JSON.stringify({ type: "presence_leave", room }));
          socket.send(JSON.stringify({ type: "leave", room }));
        } catch {}
        socket.close();
      }
      socketRef.current = null;
      setIsBuddyOnline(false);
    };
  }, [isChatConsoleOpen, activeNominatedId, activeRoomKey]);


  const sortedNominees = React.useMemo(() => {
    const filtered = nominees.filter((buddy) =>
      [buddy.name, buddy.cyclePhase]
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

  const softTints = getSoftTints(colors);

  // --- BUSINESS OPERATION MECHANICS ---
  async function handleNominateBuddy(id: string) {
    if (activeNominatedId) {
      alert(
        "Nomination Limit Reached",
        "You can keep one active Period Buddy for each cycle window.",
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
        // The discovery-list preview for this candidate has no roomKey (only a
        // persisted BuddyMatch does) — merge in the real match data now that it exists.
        const mapped = mapBuddy(matchObj);
        setNominees((prev) => {
          const exists = prev.some((b) => b.id === activeId);
          if (!exists) return [mapped, ...prev];
          return prev.map((b) => (b.id === activeId ? { ...b, ...mapped } : b));
        });
      }
      if (result.tokensAwarded) earnTokens(result.tokensAwarded);
    } catch (err) {
      console.warn("Failed to nominate buddy:", err);
      // Keep the local buddy active for offline development.
    }

    alert("Buddy nominated", "Your Period Buddy space is ready.");
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
      "This ends your space with this buddy for good. Use this if a call or chat made you uncomfortable.",
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
          refreshControl={
            // Disabled while chatting so a pull doesn't reload/disrupt the thread.
            isChatConsoleOpen ? undefined : (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            )
          }
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
            {/* Intro copy — mirrors the mockup's plain subtitle under the header */}
            {!isChatConsoleOpen && (
              <Text
                className="text-xs font-semibold leading-5 mb-5"
                style={{ color: colors.mutedText, fontFamily: fonts.body }}
              >
                Choose someone who checks in on you — sync timelines with a member who has similar cycle
                milestones and chat with privacy in mind.
              </Text>
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
                    height: 50,
                  }}
                >
                  <Feather name="search" size={16} color={colors.mutedText} />
                  <TextInput
                    placeholder="Search identical cycle profiles safely..."
                    placeholderTextColor={colors.mutedText}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    returnKeyType="search"
                    className="ml-3 flex-1 text-sm"
                    style={{ color: colors.foreground, fontFamily: fonts.body, height: "100%", paddingVertical: 0 }}
                  />
                </View>

                <Text
                  className="text-xs font-black tracking-widest uppercase mb-4 px-1"
                  style={{ color: colors.primary, fontFamily: fonts.heading }}
                >
                  Top Match Profiles for You
                </Text>

                {/* MATCH STACK FEED TIMELINE LOOP */}
                {loadingNominees && nominees.length === 0 ? (
                  <View className="gap-2.5">
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </View>
                ) : (
                <View className="gap-2.5">
                  {sortedNominees.map((buddy) => {
                    const isSelectedBuddy = activeNominatedId === buddy.id;
                    const isAnyBuddyLocked = activeNominatedId !== null;

                    return (
                      <View
                        key={buddy.id}
                        className="rounded-2xl border p-3.5"
                        style={{
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          opacity: isAnyBuddyLocked && !isSelectedBuddy ? 0.45 : 1,
                          ...getShadow(colors, isDark),
                        }}
                      >
                        {/* Compact row: avatar + name/meta + pill CTA, mirrors mockup's flat contact row */}
                        <View className="flex-row items-center gap-3">
                          <View
                            className="h-10 w-10 items-center justify-center rounded-full"
                            style={{ backgroundColor: softTints.pink }}
                          >
                            <Text className="text-sm font-black" style={{ color: colors.primary, fontFamily: fonts.body }}>
                              {buddy.avatarSeed}
                            </Text>
                          </View>

                          <View className="flex-1">
                            <Text
                              className="text-[13.5px] font-extrabold"
                              style={{ color: colors.foreground, fontFamily: fonts.body }}
                              numberOfLines={1}
                            >
                              {buddy.name}
                            </Text>
                            <Text
                              className="text-[11px] font-semibold mt-0.5"
                              style={{ color: colors.mutedText, fontFamily: fonts.body }}
                              numberOfLines={1}
                            >
                              {buddy.cyclePhase} · {buddy.compatibility}% overlap
                            </Text>
                          </View>

                          <TouchableOpacity
                            activeOpacity={0.8}
                            disabled={isAnyBuddyLocked && !isSelectedBuddy}
                            onPress={() => {
                              if (isSelectedBuddy) {
                                setIsChatConsoleOpen(true);
                              } else {
                                handleNominateBuddy(buddy.id);
                              }
                            }}
                            className="rounded-full px-4 py-2 flex-row items-center gap-1.5"
                            style={
                              isSelectedBuddy
                                ? { backgroundColor: colors.success }
                                : { borderWidth: 1.5, borderColor: colors.primary }
                            }
                          >
                            <Text
                              className="text-[11.5px] font-extrabold"
                              style={{ color: isSelectedBuddy ? "#fff" : colors.primary, fontFamily: fonts.body }}
                            >
                              {isSelectedBuddy ? "Added" : "Invite"}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {/* Similarity tags — compact, single line under the row */}
                        {buddy.similarities.length > 0 && (
                          <Text
                            className="text-[10px] font-semibold mt-2.5 pl-[52px]"
                            style={{ color: colors.mutedText, fontFamily: fonts.body }}
                            numberOfLines={1}
                          >
                            {buddy.similarities.map((s) => `#${s}`).join("  ")}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
                )}
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
                          {activeBuddyData.name}
                        </Text>
                        <View className="flex-row items-center gap-1 mt-0.5">
                          <View
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: isBuddyOnline ? colors.success : colors.mutedText }}
                          />
                          <Text
                            className="text-[10px] font-bold uppercase tracking-wide"
                            style={{ color: isBuddyOnline ? colors.success : colors.mutedText, fontFamily: fonts.body }}
                          >
                            {isBuddyOnline ? "Online now" : "Offline"}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <TouchableOpacity
                        onPress={() => {
                          if (!isBuddyOnline) {
                            alert(
                              `${activeBuddyData.name} is offline`,
                              "Video calls need both of you online at the same time. Try again once they're active in the app.",
                            );
                            return;
                          }
                          videoCallRef.current?.startCall();
                        }}
                        activeOpacity={0.8}
                        className="w-8 h-8 rounded-full items-center justify-center"
                        style={{ backgroundColor: isBuddyOnline ? colors.primaryLight : colors.surfaceSoft, opacity: isBuddyOnline ? 1 : 0.6 }}
                      >
                        <Ionicons name="videocam" size={15} color={isBuddyOnline ? colors.primary : colors.mutedText} />
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
              placeholder="Type a message..."
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
              submitBehavior="submit"
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

      {isChatConsoleOpen && activeBuddyData && activeRoomKey && (
        <BuddyVideoCall
          ref={videoCallRef}
          buddyAlias={activeBuddyData.name}
          roomId={`buddy_${activeRoomKey}`}
          socketRef={socketRef}
        />
      )}
    </>
  );
}
