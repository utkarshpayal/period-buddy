import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { JitsiCall } from "../../components/JitsiCall";
import { ActionSheet } from "../../components/ActionSheet";
import { setOpenVideoCall } from "../../lib/consultationPresence";
import { EmptyState } from "../../components/EmptyState";
import { alert } from "../../lib/alert";
import { useTheme } from "../../components/theme";
import { SkeletonCardList } from "../../components/Skeleton";
import { BuddyMatchCard } from "../../components/buddy/BuddyMatchCard";
import PressableFeedback from "../../components/PressableFeedback";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { getShadow } from "../../components/ui-tokens";
import { visibleCandidates } from "../../lib/buddyMatch";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import {
  ApiError,
  buddyApi,
  getFriendlyErrorMessage,
  getWebSocketUrl,
  isFeatureLockedError,
  isNetworkError,
  type BuddyMatch as ApiBuddyMatch,
  type BuddyMessage as ApiBuddyMessage,
} from "../../lib/api";
import { ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import { SendStatusLabel } from "../../components/partner-view/SendStatusLabel";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Icon } from "../../components/Icon";

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
  /** Our own message still on its way, or not delivered (tap to retry). */
  status?: "sending" | "failed";
}

// How often we announce presence over the buddy room, and how long a buddy
// can go quiet before we stop treating them as online. The timeout is a
// multiple of the ping interval so a single dropped/late packet doesn't
// falsely flip someone to offline.
// Tap-to-fill starters for a brand-new chat (never sent automatically).
const ICEBREAKERS = ["Hi! How's your cycle going?", "What helps you on tough days?", "Any tips for cramps?"];

const PRESENCE_PING_INTERVAL_MS = 8000;
const PRESENCE_TIMEOUT_MS = 20000;

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

/** The backend pads a thin discovery list with fictional demo cards (e.g.
 * "Mystic Peony") so the screen isn't empty for a brand-new install — but
 * they can't actually be nominated and read as random strangers/dummy data
 * to a real user, so they're filtered out here rather than shown at all.
 * `isRealUser` is only absent on older cached shapes, which we treat as real. */
function isRealMatch(match: ApiBuddyMatch): boolean {
  return match.isRealUser !== false;
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

function BuddyNomination() {
  const { colors, isDark, fonts } = useTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const socketRef = useRef<WebSocket | null>(null);
  // Video call with the active buddy (self-hosted Jitsi, components/JitsiCall).
  // `ended` is set if the pairing ends mid-call.
  // Who the call is with is captured when it starts, so the call (and its
  // "ended" screen) doesn't depend on the pairing still being on screen.
  const [buddyCall, setBuddyCall] = useState<{ key: string; peerName: string; ended?: string } | null>(null);
  // "<name> started a video call" while the console is open and we're not in it.
  const [incomingCallFrom, setIncomingCallFrom] = useState<string | null>(null);
  // The chat header's "⋯" menu.
  const [menuOpen, setMenuOpen] = useState(false);
  const buddyLastSeenRef = useRef<number>(0);
  const [isBuddyOnline, setIsBuddyOnline] = useState(false);

  // Interface Functional Controllers
  const [searchQuery, setSearchQuery] = useState("");
  // Which match card is expanded ("why you match").
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const [activeNominatedId, setActiveNominatedId] = useState<string | null>(
    null,
  );
  const [isChatConsoleOpen, setIsChatConsoleOpen] = useState(false);
  // The chat holds another person's messages.
  useSecureScreen("buddy-chat", isChatConsoleOpen);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const { hasAccess, refresh: refreshSubscriptionAccess } = useSubscriptionAccess();
  const [typedMessage, setTypedMessage] = useState("");

  const [nominees, setNominees] = useState<PeriodBuddy[]>([]);
  const [loadingNominees, setLoadingNominees] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Private live dialogue log data array container
  // Starts empty: only real messages from the server are ever shown.
  const [chatLog, setChatLog] = useState<BuddyMessage[]>([]);

  const loadBuddySpace = useCallback(async () => {
    try {
      const [matchesResponse, activeBuddy, messages] = await Promise.all([
        // null (not an empty list) on failure, so a failed fetch keeps the
        // nominees already on screen instead of wiping them.
        buddyApi.getMatches().catch(() => null),
        // undefined = couldn't load (keep the pairing on screen), null = no pairing.
        buddyApi.getActive().catch(() => undefined),
        // null = couldn't load (keep what's on screen), [] = no messages yet.
        buddyApi.getMessages().catch(() => null),
      ]);

      const fetchedNominees: PeriodBuddy[] | null = matchesResponse
        ? (matchesResponse.matches ?? []).filter(isRealMatch).map(mapBuddy)
        : null;
      const mappedActive = activeBuddy ? mapBuddy(activeBuddy) : null;

      if (mappedActive) {
        setActiveNominatedId(mappedActive.id);
        setIsChatConsoleOpen(true);
      } else if (activeBuddy === null) {
        // The server has no pairing (the buddy left, or it ended elsewhere):
        // free Invite again instead of "Nomination Limit Reached".
        setActiveNominatedId(null);
        setIsChatConsoleOpen(false);
      }

      setNominees((prev) => {
        let finalNominees = fetchedNominees ?? prev;
        if (mappedActive) {
          // The active match is authoritative (it has roomKey; a same-id discovery-list
          // preview from getBuddyMatches never does), so overwrite any preview entry
          // instead of only adding one when it's missing.
          const exists = finalNominees.some((b) => b.id === mappedActive.id);
          finalNominees = exists
            ? finalNominees.map((b) => (b.id === mappedActive.id ? mappedActive : b))
            : [mappedActive, ...finalNominees];
        }
        return finalNominees;
      });

      if (activeBuddy === null) {
        setChatLog([]);
      } else if (activeBuddy && messages) {
        const chatMessages =
          messages.length > 0 ? messages : (activeBuddy.messages ?? []);
        setChatLog(chatMessages.map(mapBuddyMessage));
      }
    } catch (err) {
      // Keep what's on screen; pull to refresh tries again.
      console.warn("Failed to load buddy space:", err);
    } finally {
      setLoadingNominees(false);
    }
  }, []);

  // Every focus, the first included: a pairing can end, and messages arrive,
  // while this screen is in the background.
  useFocusEffect(
    useCallback(() => {
      loadBuddySpace();
    }, [loadBuddySpace]),
  );

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

  // Tell the app-wide ringer a call is on screen.
  useEffect(() => {
    setOpenVideoCall(buddyCall ? "buddy" : null);
    return () => setOpenVideoCall(null);
  }, [buddyCall]);

  // The caller went offline: their "started a video call" prompt is stale.
  useEffect(() => {
    if (!isBuddyOnline) setIncomingCallFrom(null);
  }, [isBuddyOnline]);

  // Pairing gone (left, ended, account switch): no call, no prompt.
  useEffect(() => {
    if (!activeBuddyData) {
      setIncomingCallFrom(null);
      setMenuOpen(false);
    }
  }, [activeBuddyData]);

  // WebSocket live synchronization
  useEffect(() => {
    // Tied to the pairing, not to the chat being open: closing it ("See all
    // matches") must not drop messages, call prompts or our presence.
    if (!activeNominatedId || !activeRoomKey) return;

    let socket: WebSocket | null = null;
    let isDisconnected = false;
    let presenceHeartbeat: ReturnType<typeof setInterval> | null = null;
    let presenceWatchdog: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    // Only ever write to an open socket (a closed one just logs "WebSocket is
    // already in CLOSING or CLOSED state" on every heartbeat).
    const send = (payload: Record<string, unknown>) => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify(payload));
      } catch {}
    };
    const stopTimers = () => {
      if (presenceHeartbeat) clearInterval(presenceHeartbeat);
      if (presenceWatchdog) clearInterval(presenceWatchdog);
      presenceHeartbeat = null;
      presenceWatchdog = null;
    };

    buddyLastSeenRef.current = 0;
    setIsBuddyOnline(false);

    const room = `buddy_${activeRoomKey}`;

    async function connectWS() {
      reconnectTimer = null;
      try {
        const wsUrl = await getWebSocketUrl();
        if (isDisconnected) return;
        socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          if (isDisconnected) return;
          if (__DEV__) console.log("WebSocket connected for buddy chat");
          attempts = 0;
          stopTimers();
          send({ type: "join", room });
          // Announce presence immediately, then keep pinging so the buddy's
          // client can tell "online" apart from "was online a while ago".
          send({ type: "presence_ping", room });

          presenceHeartbeat = setInterval(() => send({ type: "presence_ping", room }), PRESENCE_PING_INTERVAL_MS);

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
              if (data.event === "incoming_call" && data.kind === "buddy") {
                setIncomingCallFrom(typeof data.callerName === "string" ? data.callerName : "Your buddy");
              }
              return;
            }

            if (data.type === "buddy_ended") {
              setIncomingCallFrom(null);
              setBuddyCall((call) =>
                call ? { ...call, ended: "Your Period Buddy left this pairing, so the call has ended." } : call,
              );
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
              send({ type: "presence_pong", room });
            } else if (data.type === "presence_pong") {
              buddyLastSeenRef.current = Date.now();
              setIsBuddyOnline(true);
            } else if (data.type === "presence_leave") {
              buddyLastSeenRef.current = 0;
              setIsBuddyOnline(false);
            }
          } catch (err) {
            console.error("Error parsing WebSocket message:", err);
          }
        };

        socket.onerror = (err) => {
          console.warn("WebSocket error:", err);
        };

        socket.onclose = () => {
          if (__DEV__) console.log("WebSocket closed");
          stopTimers();
          if (socketRef.current === socket) socketRef.current = null;
          if (isDisconnected) return;
          // Server restart / network drop: come back (capped backoff with
          // jitter), or live chat, presence and call prompts silently stop.
          setIsBuddyOnline(false);
          scheduleReconnect();
        };
      } catch (err) {
        console.warn("Failed to setup WebSocket:", err);
        scheduleReconnect();
      }
    }

    function scheduleReconnect() {
      if (isDisconnected || reconnectTimer) return;
      const base = Math.min(30000, 1000 * 2 ** attempts);
      attempts += 1;
      reconnectTimer = setTimeout(connectWS, base / 2 + Math.random() * (base / 2));
    }

    connectWS();

    return () => {
      isDisconnected = true;
      stopTimers();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        send({ type: "presence_leave", room });
        send({ type: "leave", room });
        socket.close();
      }
      socketRef.current = null;
      setIsBuddyOnline(false);
    };
  }, [activeNominatedId, activeRoomKey]);


  const sortedNominees = React.useMemo(
    () =>
      visibleCandidates(nominees, { query: searchQuery, activeId: activeNominatedId }),
    [nominees, activeNominatedId, searchQuery],
  );
  // Your buddy has their own card above the list, so the list is everyone else.
  const otherMatches = React.useMemo(
    () => sortedNominees.filter((b) => b.id !== activeNominatedId),
    [sortedNominees, activeNominatedId],
  );
  const lastBuddyMessage = chatLog.length ? chatLog[chatLog.length - 1] : null;
  const isFiltering = Boolean(searchQuery.trim());

  /** Pairing is one buddy at a time, so ask before inviting. */
  function confirmInvite(buddy: PeriodBuddy) {
    alert(
      `Invite ${buddy.name}?`,
      "You'll get a private chat together, and video calls when you're both online. You can have one Period Buddy at a time.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Invite", onPress: () => handleNominateBuddy(buddy.id) },
      ],
    );
  }


  // --- BUSINESS OPERATION MECHANICS ---
  async function handleNominateBuddy(id: string) {
    if (activeNominatedId) {
      alert(
        "Nomination Limit Reached",
        "You can keep one active Period Buddy for each cycle window.",
      );
      return;
    }
    // Checked before any optimistic state change below — a locked user
    // should never see the chat console open only to be reverted a moment
    // later; browsing candidates and an already-active buddy stay free.
    if (!hasAccess("period_buddy")) {
      setPaywallVisible(true);
      return;
    }

    setActiveNominatedId(id);
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
      alert("Buddy nominated", "Your Period Buddy space is ready.");
    } catch (err) {
      console.warn("Failed to nominate buddy:", err);
      // Undo the optimistic pairing in every failure case — including offline/
      // timeout, where we can't know whether the server created it. Faking
      // success there left a local-only "buddy" that vanished on next load.
      setActiveNominatedId(null);
      setIsChatConsoleOpen(false);
      if (isFeatureLockedError(err)) {
        setPaywallVisible(true);
      } else {
        alert(
          "Couldn't connect buddy",
          isNetworkError(err)
            ? "We couldn't reach the server. Check your connection and try again."
            : getFriendlyErrorMessage(err),
        );
        // Re-sync with the server: a timed-out request may have actually
        // paired us, and a 409 "already have an active Period Buddy" means the
        // server has a pairing this screen didn't know about (e.g. the initial
        // getActive() failed and was swallowed) — reloading surfaces it instead
        // of letting every Invite tap fail the same way.
        // Plain network errors are skipped: offline, the reload would fail too.
        if (
          err instanceof ApiError &&
          (err.kind === "timeout" || err.status === 409)
        ) {
          loadBuddySpace();
        }
      }
    }
  }

  async function deliverBuddyMessage(localId: string, text: string) {
    try {
      const result = await buddyApi.sendMessage(text);
      setChatLog((prev) => {
        const merged = result.messages?.length ? mergeBuddyMessages(prev, result.messages) : prev;
        // Delivered: drop the "Sending…" even if the reply didn't echo it back.
        return merged.map((m) => (m.id === localId ? { ...m, status: undefined } : m));
      });
    } catch (err) {
      console.warn("Failed to send buddy message:", err);
      setChatLog((prev) => prev.map((m) => (m.id === localId ? { ...m, status: "failed" } : m)));
    }
  }

  // `rawText` lets the in-call chat panel send without touching the chat
  // console's own input state; the console keeps calling it with no argument.
  function handleSendBuddyMessage(rawText?: string) {
    const source = rawText != null ? rawText : typedMessage;
    const text = source.trim();
    if (!text) return;

    const myPayload: BuddyMessage = {
      id: `msg_u_${Date.now()}`,
      sender: "me",
      text,
      time: "Just now",
      sentAt: new Date().toISOString(),
      status: "sending",
    };

    setChatLog((prev) => [...prev, myPayload]);
    if (rawText == null) setTypedMessage("");
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 50);
    deliverBuddyMessage(myPayload.id, text);
  }

  function retryBuddyMessage(message: BuddyMessage) {
    setChatLog((prev) => prev.map((m) => (m.id === message.id ? { ...m, status: "sending" } : m)));
    deliverBuddyMessage(message.id, message.text);
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
              // 404 = the server already has no active pairing, so clearing
              // locally is correct. Anything else means the pairing still
              // exists server-side — clearing it here would make the screen
              // look free while every new Invite 409s "already have an
              // active Period Buddy".
              if (!(err instanceof ApiError && err.status === 404)) {
                alert("Couldn't leave pairing", getFriendlyErrorMessage(err));
                return;
              }
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
          behavior="padding"
          className="flex-1"
          keyboardVerticalOffset={8}
        >
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            // Room for the message box, which grows to a few lines.
            paddingBottom: isChatConsoleOpen
              ? Math.max(160, insets.bottom + 140)
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
          <ScreenHeader title="Period Buddy" />

          <View className="mx-6 mt-6">
            {!isChatConsoleOpen ? (
              <View>
                {/* Your current buddy (the way back into the chat) */}
                {activeBuddyData ? (
                  <Animated.View
                    entering={reduceMotion ? undefined : FadeIn.duration(250)}
                    // Plain styles: NativeWind's className doesn't reach Reanimated views.
                    style={{ marginBottom: 24 }}
                  >
                    <SectionHeader title="Your buddy" />
                    <PressableFeedback
                      onPress={() => setIsChatConsoleOpen(true)}
                      accessibilityRole="button"
                      accessibilityLabel={`Open chat with your Period Buddy ${activeBuddyData.name}`}
                      style={({ pressed }) => ({
                        borderRadius: 24,
                        padding: 16,
                        borderWidth: 1.5,
                        borderColor: colors.success,
                        backgroundColor: pressed ? colors.surfaceSoft : colors.surface,
                        ...getShadow(colors, isDark),
                      })}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                        <View
                          style={{
                            width: 52,
                            height: 52,
                            borderRadius: 26,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: colors.successLight,
                          }}
                        >
                          <Text style={{ fontSize: 17, fontWeight: "800", color: colors.success, fontFamily: fonts.heading }}>
                            {activeBuddyData.avatarSeed}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={1} style={{ fontSize: 16.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                            {activeBuddyData.name}
                          </Text>
                          <Text numberOfLines={1} style={{ fontSize: 13, marginTop: 2, color: colors.mutedText, fontFamily: fonts.body }}>
                            {activeBuddyData.cyclePhase} · {activeBuddyData.compatibility}% match
                          </Text>
                        </View>
                      </View>

                      {/* Last message, so the card says what's going on */}
                      <View
                        style={{
                          marginTop: 14,
                          borderRadius: 16,
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          backgroundColor: colors.surfaceSoft,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <Icon set="ion" name="chatbubble-ellipses-outline" size={16} color={colors.mutedText} />
                        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, color: colors.foreground, fontFamily: fonts.body }}>
                          {lastBuddyMessage
                            ? `${lastBuddyMessage.sender === "me" ? "You: " : ""}${lastBuddyMessage.text}`
                            : `No messages yet. Say hi to ${activeBuddyData.name.split(" ")[0]}!`}
                        </Text>
                        {lastBuddyMessage ? (
                          <Text style={{ fontSize: 12, color: colors.mutedText, fontFamily: fonts.body }}>{lastBuddyMessage.time}</Text>
                        ) : null}
                      </View>

                      <View
                        style={{
                          marginTop: 14,
                          height: 46,
                          borderRadius: 999,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          backgroundColor: colors.primary,
                        }}
                      >
                        <Icon set="ion" name="chatbubbles" size={17} color="#FFFFFF" />
                        <Text style={{ fontSize: 14.5, fontWeight: "800", color: "#FFFFFF", fontFamily: fonts.body }}>Open chat</Text>
                      </View>
                    </PressableFeedback>
                  </Animated.View>
                ) : null}

                {/* Search */}
                <View
                  className="flex-row items-center rounded-2xl border px-4 mb-3"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border, height: 50 }}
                >
                  <Icon set="feather" name="search" size={16} color={colors.mutedText} />
                  <TextInput
                    placeholder="Search by name, phase or interest"
                    placeholderTextColor={colors.mutedText}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    returnKeyType="search"
                    accessibilityLabel="Search matches"
                    className="ml-3 flex-1 text-sm"
                    style={{ color: colors.foreground, fontFamily: fonts.body, height: "100%", paddingVertical: 0 }}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery("")} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10}>
                      <Icon set="feather" name="x-circle" size={17} color={colors.mutedText} />
                    </TouchableOpacity>
                  )}
                </View>

                <SectionHeader
                  title={
                    loadingNominees && nominees.length === 0
                      ? "Finding your matches"
                      : activeNominatedId
                        ? "Other matches"
                        : "Matches for you"
                  }
                  style={{ marginTop: 4, marginBottom: activeNominatedId ? 4 : 12 }}
                />

                {activeNominatedId && otherMatches.length > 0 && (
                  <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedText, fontFamily: fonts.body, marginBottom: 12 }}>
                    You can invite someone new after leaving your current pairing.
                  </Text>
                )}

                {/* Matches */}
                {loadingNominees && nominees.length === 0 ? (
                  <SkeletonCardList count={3} />
                ) : otherMatches.length === 0 ? (
                  isFiltering ? (
                    <EmptyState
                      icon="filter-variant-remove"
                      title="No one matches that"
                      message="Try another name, phase or interest."
                      actionLabel="Clear search"
                      onAction={() => setSearchQuery("")}
                      compact
                    />
                  ) : (
                    <EmptyState
                      icon="account-search-outline"
                      title={activeNominatedId ? "No other matches right now" : "No matches yet"}
                      message={
                        activeNominatedId
                          ? "Your buddy is above. New matches show up here as more people join."
                          : "We haven't found anyone with an overlapping cycle yet. Pull down to check again."
                      }
                      compact
                    />
                  )
                ) : (
                  <View style={{ gap: 12 }}>
                    {otherMatches.map((buddy, index) => {
                      const isSelectedBuddy = activeNominatedId === buddy.id;
                      return (
                        <BuddyMatchCard
                          key={buddy.id}
                          buddy={buddy}
                          avatarSeed={buddy.avatarSeed}
                          index={index}
                          status={isSelectedBuddy ? "active" : activeNominatedId ? "locked" : "available"}
                          expanded={expandedId === buddy.id}
                          onToggle={() => setExpandedId((current) => (current === buddy.id ? null : buddy.id))}
                          onInvite={() => confirmInvite(buddy)}
                          onOpenChat={() => setIsChatConsoleOpen(true)}
                        />
                      );
                    })}
                  </View>
                )}
              </View>
            ) : (
              /* The private chat with your active buddy */
              activeBuddyData && (
                <View className="pt-1 pb-28">
                  {/* Buddy header: who, presence, call, more */}
                  <View
                    className="flex-row items-center rounded-3xl px-3.5 py-3 mb-5"
                    style={{ gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...getShadow(colors, isDark) }}
                  >
                    <View>
                      <View className="h-11 w-11 rounded-full items-center justify-center" style={{ backgroundColor: colors.primaryLight }}>
                        <Text style={{ fontSize: 15, fontWeight: "800", color: colors.primary, fontFamily: fonts.heading }}>
                          {activeBuddyData.avatarSeed}
                        </Text>
                      </View>
                      <View
                        className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full"
                        style={{
                          backgroundColor: isBuddyOnline ? colors.success : colors.mutedText,
                          borderWidth: 2.5,
                          borderColor: colors.surface,
                        }}
                      />
                    </View>
                    <View className="flex-1">
                      <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                        {activeBuddyData.name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        accessibilityLiveRegion="polite"
                        style={{ fontSize: 13, marginTop: 1, color: isBuddyOnline ? colors.success : colors.mutedText, fontFamily: fonts.body }}
                      >
                        {isBuddyOnline ? "Online now" : "Offline"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      // Calls need both buddies online in this chat (the server checks too).
                      onPress={() => {
                        if (!isBuddyOnline) {
                          alert(
                            `${activeBuddyData.name} is offline`,
                            "Video calls need both of you online in the chat at the same time. Try again once they're here.",
                          );
                          return;
                        }
                        setIncomingCallFrom(null);
                        setBuddyCall({ key: `buddy-${activeBuddyData.id}-${Date.now()}`, peerName: activeBuddyData.name });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={
                        isBuddyOnline ? `Video call ${activeBuddyData.name}` : `Video call unavailable, ${activeBuddyData.name} is offline`
                      }
                      activeOpacity={0.8}
                      className="h-11 w-11 rounded-full items-center justify-center"
                      style={{ backgroundColor: isBuddyOnline ? colors.primary : colors.surfaceSoft }}
                    >
                      <Icon set="ion" name="videocam" size={19} color={isBuddyOnline ? "#FFFFFF" : colors.mutedText} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setMenuOpen(true)}
                      accessibilityRole="button"
                      accessibilityLabel="More options"
                      activeOpacity={0.8}
                      className="h-11 w-11 rounded-full items-center justify-center"
                      style={{ backgroundColor: colors.surfaceSoft }}
                    >
                      <Icon set="feather" name="more-horizontal" size={19} color={colors.foreground} />
                    </TouchableOpacity>
                  </View>

                  {/* Your buddy started a call */}
                  {incomingCallFrom && !buddyCall && (
                    <Animated.View
                      entering={reduceMotion ? undefined : FadeIn.duration(200)}
                      // Plain styles: NativeWind's className doesn't reach Reanimated views.
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        borderRadius: 24,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        marginBottom: 20,
                        backgroundColor: colors.successLight,
                      }}
                      accessibilityLiveRegion="polite"
                    >
                      <View className="h-10 w-10 rounded-full items-center justify-center" style={{ backgroundColor: colors.success }}>
                        <Icon set="ion" name="videocam" size={18} color="#FFFFFF" />
                      </View>
                      <View className="flex-1">
                        <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                          {incomingCallFrom} is calling
                        </Text>
                        <Text style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>Video call</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setIncomingCallFrom(null)}
                        accessibilityRole="button"
                        accessibilityLabel="Not now"
                        className="h-10 px-3 rounded-full items-center justify-center"
                      >
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body }}>Not now</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setIncomingCallFrom(null);
                          setBuddyCall({ key: `buddy-${activeBuddyData.id}-${Date.now()}`, peerName: activeBuddyData.name });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Join video call with ${incomingCallFrom}`}
                        className="h-10 px-4 rounded-full items-center justify-center"
                        style={{ backgroundColor: colors.success }}
                      >
                        <Text style={{ fontSize: 13.5, fontWeight: "800", color: "#FFFFFF", fontFamily: fonts.body }}>Join</Text>
                      </TouchableOpacity>
                    </Animated.View>
                  )}

                  {/* Messages */}
                  {chatLog.length === 0 ? (
                    <View className="items-center px-4 pt-6">
                      <View className="h-16 w-16 rounded-full items-center justify-center" style={{ backgroundColor: colors.primaryLight }}>
                        <Icon set="ion" name="chatbubbles" size={28} color={colors.primary} />
                      </View>
                      <Text className="text-center mt-4" style={{ fontSize: 17, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                        Say hi to {activeBuddyData.name.split(" ")[0]}
                      </Text>
                      <Text className="text-center mt-1.5" style={{ fontSize: 13.5, lineHeight: 20, color: colors.mutedText, fontFamily: fonts.body }}>
                        This chat is just between the two of you.
                      </Text>
                      <View className="flex-row justify-center mt-5" style={{ gap: 8, flexWrap: "wrap" }}>
                        {ICEBREAKERS.map((line) => (
                          <TouchableOpacity
                            key={line}
                            onPress={() => setTypedMessage(line)}
                            accessibilityRole="button"
                            accessibilityHint="Puts this in your message box"
                            className="rounded-full px-3.5 py-2.5"
                            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, fontFamily: fonts.body }}>{line}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View>
                      {chatLog.map((message, i) => {
                        const isMe = message.sender === "me";
                        const next = chatLog[i + 1];
                        const prev = chatLog[i - 1];
                        const groupedWithPrev = prev?.sender === message.sender;
                        // A time under the last bubble of each run from the same person.
                        const showTime = !next || next.sender !== message.sender;
                        return (
                          <View key={message.id} style={{ marginTop: i === 0 ? 0 : groupedWithPrev ? 3 : 14, alignItems: isMe ? "flex-end" : "flex-start" }}>
                            <View
                              className="rounded-3xl px-4 py-2.5"
                              style={{
                                maxWidth: "82%",
                                backgroundColor: isMe ? colors.primary : colors.surface,
                                borderWidth: isMe ? 0 : 1,
                                borderColor: colors.border,
                                ...(showTime ? (isMe ? { borderBottomRightRadius: 8 } : { borderBottomLeftRadius: 8 }) : {}),
                              }}
                            >
                              <Text style={{ fontSize: 14.5, lineHeight: 21, color: isMe ? colors.buttonText : colors.foreground, fontFamily: fonts.body }}>
                                {message.text}
                              </Text>
                            </View>
                            {message.status ? (
                              <SendStatusLabel status={message.status} onRetry={() => retryBuddyMessage(message)} />
                            ) : showTime ? (
                              <Text style={{ fontSize: 11.5, marginTop: 4, marginHorizontal: 6, color: colors.mutedText, fontFamily: fonts.body }}>
                                {message.time}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )
            )}
          </View>
        </ScrollView>

        {/* Message box */}
        {isChatConsoleOpen && (
          <View
            className="absolute bottom-0 left-0 right-0 flex-row items-end px-4 pt-2.5"
            style={{
              gap: 10,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.surface,
              // The screen's SafeAreaView already pads the home-indicator inset.
              paddingBottom: 12,
            }}
          >
            <TextInput
              placeholder={activeBuddyData ? `Message ${activeBuddyData.name.split(" ")[0]}…` : "Write a message…"}
              placeholderTextColor={colors.mutedText}
              value={typedMessage}
              onChangeText={setTypedMessage}
              multiline
              maxLength={1000}
              accessibilityLabel="Message"
              className="flex-1 rounded-3xl px-4"
              style={{
                minHeight: 44,
                maxHeight: 120,
                paddingTop: 11,
                paddingBottom: 11,
                fontSize: 15,
                backgroundColor: colors.input,
                color: colors.foreground,
                fontFamily: fonts.body,
              }}
            />
            <TouchableOpacity
              disabled={!typedMessage.trim()}
              onPress={() => handleSendBuddyMessage()}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: !typedMessage.trim() }}
              className="h-11 w-11 rounded-full items-center justify-center"
              style={{ backgroundColor: typedMessage.trim() ? colors.primary : colors.surfaceSoft }}
            >
              <Icon set="feather" name="send" size={18} color={typedMessage.trim() ? colors.buttonText : colors.mutedText} />
            </TouchableOpacity>
          </View>
        )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      {buddyCall && (
        <JitsiCall
          visible
          callKey={buddyCall.key}
          peerName={buddyCall.peerName}
          fetchJoin={() => buddyApi.joinVideo()}
          endedMessage={buddyCall.ended ?? null}
          chat={{
            messages: chatLog.map((m, i) => ({
              id: String(m.id ?? `m${i}`),
              mine: m.sender === "me",
              text: m.text,
              sentAt: m.sentAt,
              failed: m.status === "failed",
            })),
            onSend: (text) => handleSendBuddyMessage(text),
            canSend: true,
          }}
          onClose={() => setBuddyCall(null)}
        />
      )}

      {activeBuddyData && (
        <ActionSheet
          visible={menuOpen}
          title={activeBuddyData.name}
          subtitle={isBuddyOnline ? "Online now" : "Offline"}
          onClose={() => setMenuOpen(false)}
          items={[
            {
              key: "matches",
              icon: "users",
              label: "See all matches",
              description: "Browse people on a similar cycle",
              onPress: () => setIsChatConsoleOpen(false),
            },
            {
              key: "leave",
              icon: "log-out",
              label: "Leave pairing",
              description: "Ends this chat and its history for good",
              destructive: true,
              onPress: handleLeavePairing,
            },
          ]}
        />
      )}

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        featureKey="period_buddy"
        onUnlocked={refreshSubscriptionAccess}
      />
    </>
  );
}

export default BuddyNomination;
