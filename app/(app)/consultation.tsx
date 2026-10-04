import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
import {
  ConsultationVideoCall,
  type ConsultationVideoCallHandle,
} from "../../components/ConsultationVideoCall";
import { DoctorPhoto } from "../../components/DoctorPhoto";
import { DoctorProfileSheet, ratingLabel } from "../../components/DoctorProfileSheet";
import { RateSessionSheet } from "../../components/RateSessionSheet";
import { EmptyState } from "../../components/EmptyState";
import { useAuth } from "../../components/auth-context";
import { alert } from "../../lib/alert";
import { CashfreeCheckoutModal, type CashfreeResult } from "../../components/CashfreeCheckoutModal";
import { CashfreeUpiCollectModal, type UpiCollectOutcome } from "../../components/CashfreeUpiCollectModal";
import { PaymentTrustFooter } from "../../components/subscription/PaymentTrustFooter";
import { useTheme } from "../../components/theme";
import { SkeletonRow } from "../../components/Skeleton";
import { useRealtimeSocket } from "../../hooks/useRealtimeSocket";
import {
  ApiError,
  consultationApi,
  getFriendlyErrorMessage,
  getWebSocketUrl,
  isNetworkError,
  type Consultation,
  type ConsultationMessage,
  type ConsultationOrder,
  type Doctor,
  type DoctorAvailability,
} from "../../lib/api";
import {
  dayChipLabel,
  formatINR,
  formatSessionWhen,
  formatTime,
  groupSlotsByLocalDay,
  shortZoneName,
} from "../../lib/consultationFormat";
import { setOpenConsultationChat } from "../../lib/consultationPresence";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useSecureScreen } from "../../lib/screenPrivacy";

// Finished sessions the user tapped "Not now" on, so the rating card moves on.
const SKIPPED_RATINGS_KEY = "period-buddy.consultation.skipped-ratings";
// Only ask about sessions that ended recently.
const RATE_WITHIN_MS = 30 * 24 * 60 * 60 * 1000;
// Search waits for a pause in typing before asking the server.
const SEARCH_DEBOUNCE_MS = 300;
// Waits between verify retries when the payment went through but the first
// confirmation call failed (verify is idempotent, so retrying is safe).
const VERIFY_RETRY_DELAYS_MS = [1500, 3000, 6000, 10000];
// Past sessions shown before "Show all".
const PAST_PREVIEW_COUNT = 3;

/** A chat bubble: a server message, or our own still sending / failed one. */
type ChatMessage = ConsultationMessage & { localId?: string; failed?: boolean };

function getDoctorDisplayName(doctor: Doctor) {
  const legacyName = (doctor as Doctor & { name?: string }).name;

  return (
    legacyName ||
    [doctor.firstName, doctor.lastName].filter(Boolean).join(" ") ||
    "Clinical specialist"
  );
}

function doctorOf(consultation: Consultation): Doctor | null {
  return typeof consultation.doctorId === "object" ? consultation.doctorId : null;
}

function doctorIdOf(consultation: Consultation): string {
  return typeof consultation.doctorId === "string" ? consultation.doctorId : consultation.doctorId._id;
}

/** Paid/active: chat and calls are open. */
function isLive(consultation: Consultation): boolean {
  return consultation.status === "paid" || consultation.status === "active";
}

function sortTime(consultation: Consultation): number {
  return new Date(consultation.completedAt ?? consultation.scheduledFor ?? consultation.createdAt ?? 0).getTime();
}

/** "Refund in progress" / "Refunded" for a cancelled paid booking, else null. */
function refundLabel(consultation: Consultation): string | null {
  if (consultation.status !== "cancelled") return null;
  if (consultation.refundStatus === "processed" || consultation.paymentStatus === "refunded") return "Refunded";
  if (consultation.refundStatus === "required") return "Refund in progress";
  return null;
}

/**
 * Collapses a message list so the same message never renders twice. The server
 * (sendMessage response) and the WebSocket broadcast both deliver the full log,
 * so without this an echoed message shows up multiple times. Messages with an
 * `_id` dedupe on it; our own unsent bubbles on their `localId`.
 */
function dedupeMessages(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (const msg of messages) {
    const key = msg._id ? `id:${msg._id}` : msg.localId ? `local:${msg.localId}` : `tmp:${msg.sender}:${msg.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(msg);
  }
  return out;
}

/** The server's full log replaces ours, but our unsent/failed bubbles stay at the end. */
function mergeServerLog(prev: ChatMessage[], latest: ConsultationMessage[]): ChatMessage[] {
  return dedupeMessages([...latest, ...prev.filter((m) => m.localId)]);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ConsultationScreen() {
  useSecureScreen("consultation");
  const { colors, isDark, fonts } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  // `?id=` opens that consultation's chat (push / ringing deep link);
  // `&call=1` also joins its call.
  const params = useLocalSearchParams<{ id?: string; call?: string }>();
  const chatScrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Lists
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [myConsultations, setMyConsultations] = useState<Consultation[]>([]);
  const [consultationsLoaded, setConsultationsLoaded] = useState(false);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<{ message: string; offline: boolean } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showAllPast, setShowAllPast] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Booking
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  // Doctor whose full profile sheet is open (tapping a doctor in the list).
  const [profileDoctor, setProfileDoctor] = useState<Doctor | null>(null);
  // Finished session being rated, and the star tapped to open the sheet.
  const [rateTarget, setRateTarget] = useState<{ consultation: Consultation; stars: number } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const slotsY = useRef(0);
  const [booking, setBooking] = useState(false);
  // Shown in the booking panel while a finished payment is being confirmed.
  const [paymentNote, setPaymentNote] = useState<string | null>(null);
  const [checkoutOrder, setCheckoutOrder] = useState<ConsultationOrder | null>(null);
  const [useHostedCheckout, setUseHostedCheckout] = useState(false);

  // Slot selection — the doctor's bookable slots from the server (UTC
  // instants, already without past/taken times), grouped by the day they fall
  // on in the device's time zone. The user picks a day, then a time.
  const [availability, setAvailability] = useState<DoctorAvailability | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  // Bumped to refetch availability (e.g. after a 409 "slot taken").
  const [availabilityReload, setAvailabilityReload] = useState(0);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  // The picked slot's `start` (sent as-is as `scheduledFor`); null until picked.
  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(null);

  const slotDays = useMemo(() => groupSlotsByLocalDay(availability?.slots ?? []), [availability]);
  const daySlots = slotDays.find((d) => d.key === selectedDayKey)?.slots ?? [];
  const zoneName = useMemo(() => shortZoneName(), []);

  // Video call: WebRTC "meeting" over the shared consultation WebSocket room, so
  // patient and doctor connect peer-to-peer instead of via a third-party room.
  const socketRef = useRef<WebSocket | null>(null);
  const callRef = useRef<ConsultationVideoCallHandle | null>(null);
  // Consultation whose call to join as soon as its room is joined (Accept on
  // the ringing screen / a call push), and whose room the chat socket is in.
  const pendingCallIdRef = useRef<string | null>(null);
  const joinedRoomIdRef = useRef<string | null>(null);

  // Chat
  const [activeConsultation, setActiveConsultation] = useState<Consultation | null>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeConsultation?._id ?? null;
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatModalVisible, setChatModalVisible] = useState(false);
  // Set when the room tells us the session ended/was cancelled (or a send
  // got 403), so the input closes even before the refetch lands.
  const [chatEnded, setChatEnded] = useState(false);
  const [socketState, setSocketState] = useState<"connecting" | "connected" | "reconnecting">("connecting");
  const [skippedRatings, setSkippedRatings] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(SKIPPED_RATINGS_KEY)
      .then((raw) => setSkippedRatings(raw ? (JSON.parse(raw) as string[]) : []))
      .catch(() => undefined);
  }, []);
  const skipRating = (consultationId: string) => {
    setSkippedRatings((prev) => {
      const next = [...prev.filter((id) => id !== consultationId), consultationId].slice(-50);
      AsyncStorage.setItem(SKIPPED_RATINGS_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  };
  const [typedMessage, setTypedMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const chatLive = Boolean(activeConsultation && isLive(activeConsultation) && !chatEnded);
  const activeId = activeConsultation?._id ?? null;

  /* ------------------------------ Loading ------------------------------ */

  // Only the latest doctor request may update the list, so a slow response
  // for an old search can't overwrite a newer one.
  const doctorRequestId = useRef(0);
  const loadDoctors = useCallback(async (query: string, mode: "initial" | "search" | "silent") => {
    const requestId = ++doctorRequestId.current;
    if (mode === "initial") setLoadingDoctors(true);
    if (mode === "search") setSearching(true);
    try {
      const list = await consultationApi.getDoctors(query || undefined);
      if (requestId !== doctorRequestId.current) return;
      setDoctors(list);
      setLoadError(null);
    } catch (err) {
      if (requestId !== doctorRequestId.current) return;
      // A background refresh keeps what's on screen.
      if (mode !== "silent") setLoadError({ message: getFriendlyErrorMessage(err), offline: isNetworkError(err) });
    } finally {
      if (requestId === doctorRequestId.current) {
        setLoadingDoctors(false);
        setSearching(false);
      }
    }
  }, []);

  const loadConsultations = useCallback(async (): Promise<Consultation[] | null> => {
    try {
      const list = await consultationApi.getMyConsultations();
      setMyConsultations(list);
      return list;
    } catch {
      return null;
    } finally {
      setConsultationsLoaded(true);
    }
  }, []);

  const debouncedQueryRef = useRef(debouncedQuery);
  debouncedQueryRef.current = debouncedQuery;

  // Full reload (Retry, pull-to-refresh, after closing the chat or rating).
  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      await Promise.all([
        loadDoctors(debouncedQueryRef.current, isRefresh ? "silent" : "initial"),
        loadConsultations(),
      ]);
      if (isRefresh) setAvailabilityReload((n) => n + 1);
      setRefreshing(false);
    },
    [loadDoctors, loadConsultations],
  );

  useEffect(() => {
    loadConsultations();
  }, [loadConsultations]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Doctors only — the search never refetches the consultations.
  const firstDoctorsLoad = useRef(true);
  useEffect(() => {
    loadDoctors(debouncedQuery, firstDoctorsLoad.current ? "initial" : "search");
    firstDoctorsLoad.current = false;
  }, [debouncedQuery, loadDoctors]);

  // Keep the user's pick across reloads; default to the first doctor only
  // when none is picked or the picked one is no longer listed.
  useEffect(() => {
    setSelectedDoctor((current) => {
      const fresh = current ? doctors.find((d) => d._id === current._id) : undefined;
      return fresh ?? doctors[0] ?? null;
    });
  }, [doctors]);

  const upsertConsultation = useCallback((consultation: Consultation) => {
    setMyConsultations((prev) => [consultation, ...prev.filter((c) => c._id !== consultation._id)]);
  }, []);

  // The doctor may complete the session while the chat is open: refetch on
  // close so the rating card (and the session's new status) shows up.
  const chatWasOpen = useRef(false);
  useEffect(() => {
    if (chatModalVisible) chatWasOpen.current = true;
    else if (chatWasOpen.current) {
      chatWasOpen.current = false;
      load(true);
    }
  }, [chatModalVisible, load]);

  // Tell the app-wide ringing screen which chat is open (its call UI is here).
  useEffect(() => {
    setOpenConsultationChat(chatModalVisible ? activeId : null);
    return () => setOpenConsultationChat(null);
  }, [chatModalVisible, activeId]);

  /* -------------------------------- Chat -------------------------------- */

  /** Refetch /my and swap in the open consultation's fresh copy (status, prescription). */
  const refreshActiveConsultation = useCallback(async () => {
    const list = await loadConsultations();
    const fresh = list?.find((c) => c._id === activeIdRef.current);
    if (fresh) {
      setActiveConsultation(fresh);
      if (isLive(fresh)) setChatEnded(false);
    }
  }, [loadConsultations]);

  const refetchMessages = useCallback(async () => {
    const id = activeIdRef.current;
    if (!id) return;
    try {
      const latest = await consultationApi.getMessages(id);
      if (activeIdRef.current === id) {
        setChatMessages((prev) => mergeServerLog(prev, latest));
        setMessagesError(null);
      }
    } catch {
      // Keep what's on screen; the next reconnect/foreground tries again.
    }
  }, []);

  const openChat = useCallback(async (consultation: Consultation) => {
    activeIdRef.current = consultation._id;
    setActiveConsultation(consultation);
    setChatEnded(false);
    setChatMessages([]);
    setMessagesError(null);
    setChatModalVisible(true);
    setLoadingMessages(true);
    try {
      const messages = await consultationApi.getMessages(consultation._id);
      if (activeIdRef.current === consultation._id) setChatMessages(dedupeMessages(messages));
    } catch (err) {
      if (activeIdRef.current === consultation._id) setMessagesError(getFriendlyErrorMessage(err));
    } finally {
      setLoadingMessages(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, []);

  // Live chat over the consultation room, only while the session is
  // paid/active (the server refuses the room otherwise). Reconnects with
  // backoff, re-joins the room and refetches the log after a drop or when
  // the app comes back to the foreground.
  useEffect(() => {
    if (!chatModalVisible || !activeId || !chatLive) return;
    const room = `consultation_${activeId}`;
    let closed = false;
    let denied = false;
    let attempts = 0;
    let joinedOnce = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;
    setSocketState("connecting");

    const scheduleReconnect = () => {
      if (closed || denied) return;
      setSocketState("reconnecting");
      // Capped exponential backoff with jitter (same shape as useRealtimeSocket).
      const base = Math.min(30000, 1000 * 2 ** attempts);
      attempts += 1;
      timer = setTimeout(connect, base / 2 + Math.random() * (base / 2));
    };

    const handleRoomEvent = (event: string) => {
      if (event === "consultation_cancelled" || event === "consultation_completed") {
        setChatEnded(true);
        refreshActiveConsultation();
      } else if (event === "prescription_updated" || event === "call_started") {
        refreshActiveConsultation();
      }
    };

    async function connect() {
      timer = null;
      let wsUrl: string;
      try {
        wsUrl = await getWebSocketUrl();
      } catch {
        scheduleReconnect();
        return;
      }
      if (closed) return;
      const ws = new WebSocket(wsUrl);
      socket = ws;
      socketRef.current = ws;

      ws.onopen = () => {
        if (closed) return;
        ws.send(JSON.stringify({ type: "join", room }));
      };

      ws.onmessage = (event) => {
        if (closed) return;
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
          return;
        }
        if (!data || data.room !== room) return;
        if (data.type === "joined") {
          attempts = 0;
          joinedRoomIdRef.current = activeId;
          setSocketState("connected");
          // Anything sent while we were away arrives in the refetched log.
          if (joinedOnce) refetchMessages();
          joinedOnce = true;
          if (pendingCallIdRef.current === activeId) {
            pendingCallIdRef.current = null;
            callRef.current?.startCall();
          }
        } else if (data.type === "error") {
          // Room refused: the session isn't paid/active any more.
          denied = true;
          pendingCallIdRef.current = null;
          setChatEnded(true);
          refreshActiveConsultation();
        } else if (data.type === "left") {
          // Our own leave acknowledgement.
        } else if (data.type === "message") {
          if (Array.isArray(data.messages)) {
            setChatMessages((prev) => mergeServerLog(prev, data.messages));
            setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
          }
          if (typeof data.event === "string") handleRoomEvent(data.event);
        } else if (data.type) {
          // Everything else on this room is WebRTC call signaling — the
          // doctor ringing us shows up here as an incoming call.
          callRef.current?.handleSignal(data);
        }
      };

      ws.onerror = (err) => {
        console.warn("WebSocket error:", err);
      };

      ws.onclose = () => {
        if (socketRef.current === ws) socketRef.current = null;
        if (joinedRoomIdRef.current === activeId) joinedRoomIdRef.current = null;
        if (socket === ws) socket = null;
        scheduleReconnect();
      };
    }

    connect();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || closed) return;
      refetchMessages();
      refreshActiveConsultation();
      if (!socket && !denied) {
        if (timer) clearTimeout(timer);
        attempts = 0;
        connect();
      }
    });

    return () => {
      closed = true;
      appStateSub.remove();
      if (timer) clearTimeout(timer);
      joinedRoomIdRef.current = null;
      if (socket) {
        try {
          socket.send(JSON.stringify({ type: "leave", room }));
        } catch {}
        socket.close();
      }
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [chatModalVisible, activeId, chatLive, refetchMessages, refreshActiveConsultation]);

  // Personal-room events (the doctor cancels/completes while the chat is
  // closed) keep the lists current. Shares the app-wide socket.
  const personalRoom = user?._id ? `user_${user._id}` : "";
  useRealtimeSocket({
    enabled: Boolean(personalRoom),
    rooms: personalRoom ? [personalRoom] : [],
    onMessage: (data) => {
      if (data?.type !== "message" || data.room !== personalRoom) return;
      if (data.event !== "consultation_cancelled" && data.event !== "consultation_completed") return;
      if (data.consultationId === activeIdRef.current) {
        setChatEnded(true);
        refreshActiveConsultation();
      } else {
        loadConsultations();
      }
    },
  });

  // Deep link: open `?id=`'s chat once the consultations are loaded, and
  // with `call=1` join its call as soon as the room is joined.
  const handledLinkRef = useRef<string | null>(null);
  const refetchedForLinkRef = useRef<string | null>(null);
  useEffect(() => {
    const id = typeof params.id === "string" ? params.id : "";
    if (!id) {
      handledLinkRef.current = null;
      return;
    }
    const key = `${id}:${params.call ?? ""}`;
    if (handledLinkRef.current === key || !consultationsLoaded) return;
    const target = myConsultations.find((c) => c._id === id);
    if (!target && refetchedForLinkRef.current !== key) {
      // Booked on another device / just now: look once more.
      refetchedForLinkRef.current = key;
      loadConsultations();
      return;
    }
    handledLinkRef.current = key;
    // Cleared so the same link (e.g. the doctor calling again) works next time.
    router.setParams({ id: undefined, call: undefined });
    if (!target) return;

    const joinCall = params.call === "1" && isLive(target);
    if (chatModalVisible && activeIdRef.current === target._id) {
      if (!joinCall) return;
      if (joinedRoomIdRef.current === target._id) callRef.current?.startCall();
      else pendingCallIdRef.current = target._id;
      return;
    }
    pendingCallIdRef.current = joinCall ? target._id : null;
    // iOS won't present the chat while another sheet is still open.
    const sheetOpen = Boolean(profileDoctor || rateTarget);
    setProfileDoctor(null);
    setRateTarget(null);
    if (sheetOpen) setTimeout(() => openChat(target), 400);
    else openChat(target);
  }, [
    params.id,
    params.call,
    consultationsLoaded,
    myConsultations,
    chatModalVisible,
    profileDoctor,
    rateTarget,
    loadConsultations,
    openChat,
    router,
  ]);

  /* ---------------------------- Availability ---------------------------- */

  // A different doctor: start the pick over.
  useEffect(() => {
    setAvailability(null);
    setSelectedDayKey(null);
    setSelectedSlotStart(null);
  }, [selectedDoctor?._id]);

  useEffect(() => {
    const doctorId = selectedDoctor?._id;
    if (!doctorId) return;
    let cancelled = false;
    setLoadingAvailability(true);
    setAvailabilityError(null);
    consultationApi
      .getDoctorAvailability(doctorId)
      .then((data) => {
        if (!cancelled) setAvailability(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setAvailability(null);
        setAvailabilityError(getFriendlyErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingAvailability(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDoctor?._id, availabilityReload]);

  // Default to the first day that has slots; drop a picked slot that is gone.
  useEffect(() => {
    if (slotDays.length && !slotDays.some((d) => d.key === selectedDayKey)) {
      setSelectedDayKey(slotDays[0].key);
    }
  }, [slotDays, selectedDayKey]);
  useEffect(() => {
    if (selectedSlotStart && !availability?.slots?.some((s) => s.start === selectedSlotStart)) {
      setSelectedSlotStart(null);
    }
  }, [availability, selectedSlotStart]);

  /* ------------------------------ Booking ------------------------------ */

  const getConsultationForDoctor = (doctorId: string) =>
    myConsultations.find((c) => doctorIdOf(c) === doctorId && isLive(c));

  const scrollToSlots = () =>
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, slotsY.current - 16), animated: true }), 350);

  const handleBookAndPay = async (doctor: Doctor) => {
    const existing = getConsultationForDoctor(doctor._id);
    if (existing) {
      openChat(existing);
      return;
    }
    const slot = selectedSlotStart;
    if (!slot || !formatINR(doctor.pricePerSession) || selectedDoctor?._id !== doctor._id) return;
    setBooking(true);
    try {
      const order = await consultationApi.createOrder(doctor._id, slot);
      if (order.consultation) {
        // Backend found an already-paid/active session for this doctor
        // (e.g. a race with another device) — open it instead of charging.
        upsertConsultation(order.consultation);
        setBooking(false);
        setTimeout(() => openChat(order.consultation!), 400);
        return;
      }
      // Hosted checkout (cards/UPI apps/netbanking/wallets) is the
      // prominent, default entry — see PaywallModal.tsx's identically
      // motivated default (docs/fixes.md 6.1). CashfreeUpiCollectModal's own
      // "Pay another way" link still offers the reverse switch.
      setUseHostedCheckout(true);
      setCheckoutOrder(order);
      // setBooking(false) happens once the checkout modal resolves.
    } catch (err) {
      setBooking(false);
      if (err instanceof ApiError && err.status === 409) {
        // Someone else just took this time: show the fresh open times.
        setSelectedSlotStart(null);
        setAvailabilityReload((n) => n + 1);
        alert("Time no longer available", `${getFriendlyErrorMessage(err)}\nWe've refreshed the open times — please pick another.`);
        return;
      }
      alert("Couldn't start checkout", getFriendlyErrorMessage(err));
    }
  };

  /**
   * Confirms a checkout with the server and opens the booked chat.
   * `reportedPaid`: the checkout said the payment went through, so a failed
   * verify call is retried with backoff (it's idempotent) and, if it still
   * can't be confirmed, the user is told not to pay again — the server also
   * re-checks the order with Cashfree on the next /my, so the booking shows up.
   */
  const confirmBooking = async (order: ConsultationOrder, reportedPaid: boolean) => {
    const consultationId = order.consultationId!;
    const orderId = order.orderId!;
    setBooking(true);
    if (reportedPaid) setPaymentNote("Payment received — confirming your booking…");
    try {
      for (let attempt = 0; mountedRef.current; attempt++) {
        try {
          const result = await consultationApi.verifyPayment({ consultationId, orderId });
          if (!("pending" in result)) {
            upsertConsultation(result);
            setTimeout(() => openChat(result), 400);
            return;
          }
          // Still open at Cashfree. After a closed checkout that means the
          // user left without paying; after a reported success (UPI still
          // settling) keep checking.
          if (!reportedPaid) {
            alert("Payment not completed", "You closed the payment before it finished, so nothing was booked. You can try again.");
            return;
          }
        } catch (err) {
          const status = err instanceof ApiError ? err.status : undefined;
          if (status === 400) {
            alert(
              reportedPaid ? "Payment failed" : "Payment not completed",
              "Your payment didn't go through, so nothing was booked. Please try again.",
            );
            setAvailabilityReload((n) => n + 1);
            return;
          }
          if (status === 409) {
            // Paid, but the booking was cancelled / the slot was taken meanwhile.
            alert("Booking couldn't be completed", getFriendlyErrorMessage(err));
            setAvailabilityReload((n) => n + 1);
            loadConsultations();
            return;
          }
          // Network / server trouble: retry below.
        }
        if (attempt >= VERIFY_RETRY_DELAYS_MS.length) break;
        await sleep(VERIFY_RETRY_DELAYS_MS[attempt]);
      }
      if (reportedPaid && mountedRef.current) {
        alert(
          "Confirming your payment",
          "Please don't pay again. Your booking will appear here shortly — we're still checking with the payment provider.",
        );
      }
      loadConsultations();
    } finally {
      setPaymentNote(null);
      setBooking(false);
    }
  };

  const handleCheckoutResult = async (result: CashfreeResult) => {
    const order = checkoutOrder;
    setCheckoutOrder(null);

    if (!order?.consultationId || !order.orderId) {
      setBooking(false);
      return;
    }
    if (result.type === "failed") {
      setBooking(false);
      alert(
        "Payment failed",
        "Your payment didn't go through, so nothing was booked. Please try again or use another payment method.",
      );
      return;
    }

    // A dismiss is usually a genuine cancel, but it's also what happens if
    // the checkout is closed the instant after a redirect-based method
    // (netbanking/wallet/other UPI app) finishes — before
    // CashfreeCheckoutModal's own return_url interception fires. Verifying
    // with the order's own id catches that case.
    await confirmBooking(order, result.type === "success");
  };

  // See PaywallModal's identically-shaped verifyUpiOnce/handleUpiOutcome.
  const verifyUpiOnce = async (orderId: string): Promise<"paid" | "pending" | "failed"> => {
    if (!checkoutOrder) return "failed";
    try {
      const result = await consultationApi.verifyPayment({
        consultationId: checkoutOrder.consultationId!,
        orderId,
      });
      return "pending" in result ? "pending" : "paid";
    } catch {
      return "failed";
    }
  };

  const handleUpiOutcome = async (result: UpiCollectOutcome) => {
    const order = checkoutOrder;
    setCheckoutOrder(null);
    if (!order || result.type === "dismiss") {
      setBooking(false);
      return;
    }
    if (result.type === "failed") {
      setBooking(false);
      alert("Payment failed", result.message || "Your UPI payment didn't go through, so nothing was booked. Please try again.");
      return;
    }
    // The polling in CashfreeUpiCollectModal already confirmed the order is
    // PAID — verifying again both re-confirms and fetches the booked session.
    await confirmBooking(order, true);
  };

  const cancelBooking = async (consultation: Consultation) => {
    setCancellingId(consultation._id);
    try {
      const updated = await consultationApi.cancelConsultation(consultation._id);
      upsertConsultation(updated);
      setAvailabilityReload((n) => n + 1);
      alert(
        "Booking cancelled",
        updated.refundStatus === "required"
          ? "Your refund is in progress — our team will return your payment."
          : "Your booking has been cancelled.",
      );
    } catch (err) {
      alert("Couldn't cancel", getFriendlyErrorMessage(err));
      loadConsultations();
    } finally {
      setCancellingId(null);
    }
  };

  const confirmCancel = (consultation: Consultation) => {
    const doc = doctorOf(consultation);
    const when = consultation.scheduledFor ? formatSessionWhen(consultation.scheduledFor, { withZone: true }) : null;
    const paid = consultation.paymentStatus === "paid";
    alert(
      "Cancel this booking?",
      `Your session${doc ? ` with ${getDoctorDisplayName(doc)}` : ""}${when ? ` on ${when}` : ""} will be cancelled.${
        paid ? " Your payment will be refunded by our team." : ""
      }`,
      [
        { text: "Keep booking", style: "cancel" },
        { text: "Cancel booking", style: "destructive", onPress: () => cancelBooking(consultation) },
      ],
    );
  };

  /* ------------------------------ Messages ------------------------------ */

  // `rawText` lets the in-call chat panel send without touching the chat sheet's
  // own input state; the chat sheet keeps calling it with no argument.
  const handleSendMessage = async (rawText?: string) => {
    const source = rawText != null ? rawText : typedMessage;
    const text = source.trim();
    if (!text || !activeConsultation || sendingMessage || !chatLive) return;
    if (rawText == null) setTypedMessage("");
    setSendingMessage(true);

    // Optimistic UI
    const localId = `${Date.now()}-${Math.random()}`;
    const optimistic: ChatMessage = { sender: "user", text, sentAt: new Date().toISOString(), localId };
    setChatMessages((prev) => [...prev, optimistic]);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      // sendMessage returns the full authoritative log — replace (deduped)
      // rather than append, so the optimistic message isn't shown twice.
      const latest = await consultationApi.sendMessage(activeConsultation._id, text);
      setChatMessages((prev) => mergeServerLog(prev.filter((m) => m.localId !== localId), latest));
    } catch (err) {
      // Keep the bubble, marked failed with a retry.
      setChatMessages((prev) => prev.map((m) => (m.localId === localId ? { ...m, failed: true } : m)));
      if (err instanceof ApiError && err.status === 403) {
        // The session ended (or was cancelled) meanwhile.
        setChatEnded(true);
        refreshActiveConsultation();
      }
    } finally {
      setSendingMessage(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const retryMessage = (msg: ChatMessage) => {
    if (sendingMessage || !chatLive) return;
    setChatMessages((prev) => prev.filter((m) => m.localId !== msg.localId));
    handleSendMessage(msg.text);
  };

  /* ------------------------------- Derived ------------------------------- */

  // The doctor of the open chat/call: the consultation's own doctor (populated
  // by the API), not whichever doctor happens to be selected in the list.
  const chatDoctor: Doctor | null =
    activeConsultation && typeof activeConsultation.doctorId === "object"
      ? activeConsultation.doctorId
      : selectedDoctor;

  const upcomingSessions = myConsultations
    .filter(isLive)
    .sort((a, b) => new Date(a.scheduledFor ?? 0).getTime() - new Date(b.scheduledFor ?? 0).getTime());
  // Finished sessions; cancelled ones only if they were paid (an abandoned
  // checkout isn't a session).
  const pastSessions = myConsultations
    .filter(
      (c) =>
        c.status === "completed" ||
        (c.status === "cancelled" &&
          (c.paymentStatus === "paid" || c.paymentStatus === "refunded" || Boolean(c.refundStatus))),
    )
    .sort((a, b) => sortTime(b) - sortTime(a));
  const visiblePast = showAllPast ? pastSessions : pastSessions.slice(0, PAST_PREVIEW_COUNT);

  const selectedFee = selectedDoctor ? formatINR(selectedDoctor.pricePerSession) : null;
  const selectedExisting = selectedDoctor ? getConsultationForDoctor(selectedDoctor._id) : undefined;
  const canBook = Boolean(selectedExisting || (selectedFee && selectedSlotStart && !availabilityError));
  const bookLabel = selectedExisting
    ? "Open Consultation Chat"
    : !selectedFee
      ? "Booking isn't open for this specialist yet"
      : selectedSlotStart
        ? `Book ${formatSessionWhen(selectedSlotStart)} · ${selectedFee}`
        : `Pick a time to book · ${selectedFee}`;

  // Chat header line: the session's state instead of a presence guess.
  const chatStatus = (() => {
    if (!activeConsultation) return { text: "", color: colors.mutedText };
    if (chatEnded && isLive(activeConsultation)) return { text: "Session ended", color: colors.mutedText };
    switch (activeConsultation.status) {
      case "active":
        return { text: "Session active", color: colors.success };
      case "paid":
        return {
          text: activeConsultation.scheduledFor
            ? `Scheduled ${formatSessionWhen(activeConsultation.scheduledFor)}`
            : "Booked",
          color: colors.primary,
        };
      case "completed":
        return { text: "Session ended", color: colors.mutedText };
      case "cancelled":
        return { text: "Cancelled", color: colors.mutedText };
      default:
        return { text: "Awaiting payment", color: colors.mutedText };
    }
  })();

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Consultation" />

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
          }
        >
          <View className="mx-6 mt-6">
            {/* Search bar */}
            <View
              className="flex-row items-center rounded-2xl border px-4 shadow-xs"
              style={{ backgroundColor: colors.surface, borderColor: colors.border, height: 48 }}
            >
              <Feather name="search" size={16} color={colors.mutedText} />
              <TextInput
                placeholder="Search by name or specialty"
                placeholderTextColor={colors.mutedText}
                value={searchQuery}
                onChangeText={setSearchQuery}
                accessibilityLabel="Search specialists"
                className="ml-3 flex-1 text-sm outline-none"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
              />
              {searching ? <ActivityIndicator size="small" color={colors.mutedText} style={{ marginRight: 8 }} /> : null}
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery("")}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  hitSlop={8}
                >
                  <Feather name="x" size={16} color={colors.mutedText} />
                </TouchableOpacity>
              )}
            </View>

            {/* Upcoming / active sessions */}
            {upcomingSessions.length > 0 && (
              <View className="mt-6 gap-3">
                {upcomingSessions.map((session) => {
                  const doc = doctorOf(session);
                  const name = doc ? getDoctorDisplayName(doc) : "Your Doctor";
                  const startsAt = session.scheduledFor ? new Date(session.scheduledFor) : null;
                  const canCancel = session.status === "paid" && (!startsAt || startsAt.getTime() > Date.now());
                  const label =
                    session.status === "active"
                      ? "Session active · tap to chat"
                      : session.scheduledFor
                        ? `Upcoming · ${formatSessionWhen(session.scheduledFor, { withZone: true })}`
                        : "Booked · tap to chat";
                  return (
                    <View key={session._id}>
                      <TouchableOpacity
                        onPress={() => openChat(session)}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityLabel={`${label}. ${name}. Open chat`}
                        className="rounded-3xl overflow-hidden"
                      >
                        <LinearGradient
                          colors={[colors.primary, colors.primaryLight]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          className="flex-row items-center justify-between p-[18px]"
                        >
                          <View className="mr-3">
                            <DoctorPhoto
                              name={name}
                              uri={doc?.avatarUrl}
                              size={48}
                              backgroundColor="rgba(255,255,255,0.22)"
                              textColor="#FFFFFF"
                              fontFamily={fonts.heading}
                            />
                          </View>
                          <View className="flex-1 pr-3">
                            <Text
                              className="text-[12px] font-black uppercase tracking-widest"
                              style={{ color: "rgba(255,255,255,0.85)", fontFamily: fonts.heading }}
                            >
                              {label}
                            </Text>
                            <Text
                              className="text-base font-bold mt-1"
                              style={{ color: "#FFFFFF", fontFamily: fonts.heading }}
                            >
                              {name}
                            </Text>
                            <Text
                              className="text-xs mt-0.5"
                              style={{ color: "rgba(255,255,255,0.9)", fontFamily: fonts.body }}
                            >
                              {doc?.specialty ?? "Gynecologist"} · Chat & video call
                            </Text>
                          </View>
                          <View className="rounded-xl px-3.5 py-2.5" style={{ backgroundColor: "#FFFFFF" }}>
                            <Text
                              className="text-xs font-extrabold"
                              style={{ color: colors.primary, fontFamily: fonts.heading }}
                            >
                              Join
                            </Text>
                          </View>
                        </LinearGradient>
                      </TouchableOpacity>
                      {canCancel && (
                        <TouchableOpacity
                          onPress={() => confirmCancel(session)}
                          disabled={cancellingId === session._id}
                          accessibilityRole="button"
                          accessibilityLabel={`Cancel booking with ${name}`}
                          className="self-end mt-1.5 px-2 py-1"
                          hitSlop={6}
                        >
                          {cancellingId === session._id ? (
                            <ActivityIndicator size="small" color={colors.mutedText} />
                          ) : (
                            <Text className="text-xs font-bold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                              Cancel booking
                            </Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Rate the latest finished session that hasn't been rated yet */}
            {(() => {
              const toRate = myConsultations.find(
                (c) =>
                  c.status === "completed" &&
                  !c.rating &&
                  !skippedRatings.includes(c._id) &&
                  Date.now() - new Date(c.completedAt ?? c.createdAt ?? 0).getTime() < RATE_WITHIN_MS,
              );
              if (!toRate) return null;
              const doc = typeof toRate.doctorId === "object" ? toRate.doctorId : null;
              const name = doc ? getDoctorDisplayName(doc) : "your doctor";
              return (
                <View className="mt-6 rounded-3xl p-[18px]" style={{ backgroundColor: colors.surface }}>
                  <View className="flex-row items-start justify-between gap-3">
                    <Text className="flex-1 text-sm font-extrabold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                      How was your session with {name}?
                    </Text>
                    <TouchableOpacity onPress={() => skipRating(toRate._id)} hitSlop={8} accessibilityLabel="Not now">
                      <Text className="text-xs font-bold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                        Not now
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text className="text-xs mt-1" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                    Your rating helps others choose the right specialist.
                  </Text>
                  <View className="flex-row gap-2 mt-3">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => setRateTarget({ consultation: toRate, stars: n })}
                        accessibilityLabel={`Rate ${n} star${n > 1 ? "s" : ""}`}
                        hitSlop={4}
                      >
                        <MaterialCommunityIcons name="star-outline" size={32} color={colors.primary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })()}

            {/* Recommended experts */}
            <View className="mt-6 gap-3">
              <Text className="text-[15px] font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                {loadingDoctors ? "Loading specialists…" : "Recommended experts"}
              </Text>

              {loadingDoctors ? (
                <View className="gap-3">
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </View>
              ) : loadError ? (
                <EmptyState
                  compact
                  icon={loadError.offline ? "wifi-off" : "alert-circle-outline"}
                  title={loadError.offline ? "You're offline" : "Couldn't load specialists"}
                  message={loadError.message}
                  actionLabel="Retry"
                  onAction={() => load()}
                />
              ) : doctors.length === 0 ? (
                <EmptyState
                  compact
                  icon="doctor"
                  title={debouncedQuery ? "No matches found" : "No specialists available"}
                  message={
                    debouncedQuery
                      ? "Try a different name or specialty."
                      : "Please check back soon — our specialists will appear here."
                  }
                />
              ) : (
                doctors.map((doctor, i) => {
                  const isSelected = selectedDoctor?._id === doctor._id;
                  const avatarBgOptions = [colors.primaryLight, colors.accentLight, colors.warningLight];
                  const avatarTextOptions = [colors.primary, colors.foreground, colors.foreground];
                  const avatarBg = avatarBgOptions[i % avatarBgOptions.length];
                  const avatarText = avatarTextOptions[i % avatarTextOptions.length];
                  const fee = formatINR(doctor.pricePerSession);
                  const existing = getConsultationForDoctor(doctor._id);
                  const name = getDoctorDisplayName(doctor);

                  // Row and Book button are siblings (not nested) so screen
                  // readers can reach both.
                  return (
                    <View
                      key={doctor._id}
                      className="rounded-2xl flex-row items-center"
                      style={{
                        backgroundColor: colors.surface,
                        borderWidth: isSelected ? 1.5 : 0,
                        borderColor: isSelected ? colors.primary : "transparent",
                        shadowColor: colors.shadow,
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: isDark ? 0.25 : 0.08,
                        shadowRadius: 14,
                        elevation: 2,
                      }}
                    >
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => {
                          setSelectedDoctor(doctor);
                          setProfileDoctor(doctor);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${name}, ${doctor.specialty}`}
                        accessibilityHint="Opens this doctor's full profile"
                        accessibilityState={{ selected: isSelected }}
                        className="flex-1 flex-row items-center gap-3 p-3.5 pr-2"
                      >
                        {/* Avatar */}
                        <DoctorPhoto
                          name={name}
                          uri={doctor.avatarUrl}
                          size={44}
                          backgroundColor={avatarBg}
                          textColor={avatarText}
                          fontFamily={fonts.heading}
                        />

                        {/* Middle info */}
                        <View className="flex-1">
                          <Text className="text-[13.5px] font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                            {name}
                          </Text>
                          <Text className="text-xs font-semibold mt-0.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                            {doctor.specialty} · ★ {ratingLabel(doctor, true)}
                            {fee ? ` · ${fee}` : ""}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* Book button: picks this doctor and jumps to the times */}
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={booking || (!existing && !fee)}
                        onPress={() => {
                          if (existing) {
                            openChat(existing);
                            return;
                          }
                          setSelectedDoctor(doctor);
                          scrollToSlots();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={existing ? `Chat with ${name}` : fee ? `Book ${name}` : `${name} isn't bookable yet`}
                        className="rounded-xl px-3.5 py-2 mr-3.5"
                        style={{ backgroundColor: colors.primary, opacity: booking || (!existing && !fee) ? 0.5 : 1 }}
                      >
                        <Text className="text-xs font-bold" style={{ color: colors.buttonText, fontFamily: fonts.heading }}>
                          {existing ? "Chat" : "Book"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>

            {/* SELECT A DATE + SLOT — the doctor's open slots, in local time */}
            {selectedDoctor && !loadingDoctors && !selectedExisting && (
              <View
                className="mt-8"
                onLayout={(e) => {
                  slotsY.current = e.nativeEvent.layout.y;
                }}
              >
                <Text
                  className="text-[11.5px] font-black uppercase tracking-widest mb-3"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  Select a date
                </Text>

                {loadingAvailability && !availability ? (
                  <SkeletonRow />
                ) : availabilityError ? (
                  <EmptyState
                    compact
                    icon="calendar-alert"
                    title="Couldn't load open times"
                    message={availabilityError}
                    actionLabel="Retry"
                    onAction={() => setAvailabilityReload((n) => n + 1)}
                  />
                ) : slotDays.length === 0 ? (
                  <View
                    className="rounded-2xl border px-4 py-5 items-center"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    <Feather name="calendar" size={18} color={colors.mutedText} />
                    <Text
                      className="text-xs font-semibold mt-2 text-center"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      {availability && !availability.isAvailable
                        ? "This specialist isn't taking bookings right now. Please check back soon."
                        : `No open times in the next ${availability?.windowDays ?? 14} days. Please check back soon or try another specialist.`}
                    </Text>
                  </View>
                ) : (
                  <>
                    {/* Horizontal date strip — only days with open slots */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingRight: 8 }}
                    >
                      {slotDays.map((day) => {
                        const isDateSelected = day.key === selectedDayKey;
                        const chip = dayChipLabel(day.slots[0].start);
                        return (
                          <TouchableOpacity
                            key={day.key}
                            activeOpacity={0.82}
                            onPress={() => {
                              setSelectedDayKey(day.key);
                              setSelectedSlotStart(null);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`${chip.top === "Today" ? "Today" : chip.top} ${chip.day} ${chip.month}`}
                            accessibilityState={{ selected: isDateSelected }}
                            className="rounded-2xl px-4 py-3 items-center justify-center border"
                            style={{
                              backgroundColor: isDateSelected ? colors.primary : colors.surface,
                              borderColor: isDateSelected ? colors.primary : colors.border,
                              minWidth: 62,
                            }}
                          >
                            <Text
                              className="text-[11.5px] font-bold uppercase tracking-wide"
                              style={{
                                color: isDateSelected ? colors.buttonText : colors.mutedText,
                                fontFamily: fonts.body,
                              }}
                            >
                              {chip.top}
                            </Text>
                            <Text
                              className="text-base font-extrabold mt-0.5"
                              style={{
                                color: isDateSelected ? colors.buttonText : colors.foreground,
                                fontFamily: fonts.heading,
                              }}
                            >
                              {chip.day}
                            </Text>
                            <Text
                              className="text-[11.5px] font-bold uppercase"
                              style={{
                                color: isDateSelected ? colors.buttonText : colors.mutedText,
                                fontFamily: fonts.body,
                              }}
                            >
                              {chip.month}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    {/* Time slots for the chosen date */}
                    <Text
                      className="text-[11.5px] font-black uppercase tracking-widest mt-6 mb-3"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      Select a time
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      {daySlots.map((slot) => {
                        const isSlotSelected = selectedSlotStart === slot.start;
                        const time = formatTime(slot.start);
                        return (
                          <TouchableOpacity
                            key={slot.start}
                            activeOpacity={0.82}
                            onPress={() => setSelectedSlotStart(slot.start)}
                            accessibilityRole="button"
                            accessibilityLabel={time}
                            accessibilityState={{ selected: isSlotSelected }}
                            className="rounded-xl py-3 px-4 items-center justify-center border"
                            style={{
                              backgroundColor: isSlotSelected ? colors.primaryLight : colors.surface,
                              borderColor: isSlotSelected ? colors.foreground : colors.border,
                              borderWidth: isSlotSelected ? 1.5 : 1,
                              minWidth: "30%",
                              flexGrow: 1,
                            }}
                          >
                            <Text
                              className="text-xs font-bold"
                              style={{ color: colors.foreground, fontFamily: fonts.body }}
                            >
                              {time}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text
                      className="text-[11.5px] font-semibold mt-3"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      Times shown in your time zone{zoneName ? ` (${zoneName})` : ""}.
                    </Text>
                  </>
                )}
              </View>
            )}

            {/* Past consultations — read-only chat + prescription */}
            {pastSessions.length > 0 && (
              <View className="mt-8 gap-3">
                <Text className="text-[15px] font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                  Past consultations
                </Text>
                {visiblePast.map((session) => {
                  const doc = doctorOf(session);
                  const name = doc ? getDoctorDisplayName(doc) : "Your doctor";
                  const when = session.scheduledFor ?? session.completedAt ?? session.createdAt;
                  const refund = refundLabel(session);
                  const listedDoctor = doctors.find((d) => d._id === doctorIdOf(session));
                  const statusText =
                    session.status === "completed"
                      ? "Completed"
                      : session.cancelledBy === "doctor"
                        ? "Cancelled by doctor"
                        : "Cancelled";
                  return (
                    <View key={session._id} className="rounded-2xl" style={{ backgroundColor: colors.surface }}>
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => openChat(session)}
                        accessibilityRole="button"
                        accessibilityLabel={`${name}, ${statusText}${when ? `, ${formatSessionWhen(when)}` : ""}`}
                        accessibilityHint="Opens the chat history"
                        className="flex-row items-start gap-3 p-3.5"
                      >
                        <DoctorPhoto
                          name={name}
                          uri={doc?.avatarUrl}
                          size={40}
                          backgroundColor={colors.primaryLight}
                          textColor={colors.primary}
                          fontFamily={fonts.heading}
                        />
                        <View className="flex-1">
                          <Text className="text-[13.5px] font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                            {name}
                          </Text>
                          {when ? (
                            <Text className="text-xs mt-0.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                              {formatSessionWhen(when, { withZone: true })}
                            </Text>
                          ) : null}
                          <View className="flex-row flex-wrap items-center gap-1.5 mt-1.5">
                            <View
                              className="rounded-full px-2 py-0.5"
                              style={{ backgroundColor: session.status === "completed" ? colors.successLight : colors.surfaceSoft }}
                            >
                              <Text
                                className="text-[11px] font-bold"
                                style={{
                                  color: session.status === "completed" ? colors.success : colors.mutedText,
                                  fontFamily: fonts.body,
                                }}
                              >
                                {statusText}
                              </Text>
                            </View>
                            {refund ? (
                              <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: colors.surfaceSoft }}>
                                <Text className="text-[11px] font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                                  {refund}
                                </Text>
                              </View>
                            ) : null}
                            {session.prescription ? (
                              <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: colors.primaryLight }}>
                                <Feather name="file-text" size={11} color={colors.primary} />
                                <Text className="text-[11px] font-bold" style={{ color: colors.primary, fontFamily: fonts.body }}>
                                  Prescription
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          {session.cancelReason ? (
                            <Text className="text-xs mt-1.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                              {session.cancelReason}
                            </Text>
                          ) : null}
                        </View>
                        <Feather name="chevron-right" size={16} color={colors.mutedText} />
                      </TouchableOpacity>
                      {listedDoctor && formatINR(listedDoctor.pricePerSession) && (
                        <TouchableOpacity
                          onPress={() => {
                            setSelectedDoctor(listedDoctor);
                            scrollToSlots();
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Book again with ${name}`}
                          className="self-end mr-3.5 mb-3 rounded-xl px-3 py-1.5 border"
                          style={{ borderColor: colors.primary }}
                        >
                          <Text className="text-xs font-bold" style={{ color: colors.primary, fontFamily: fonts.heading }}>
                            Book again
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
                {pastSessions.length > PAST_PREVIEW_COUNT && (
                  <TouchableOpacity
                    onPress={() => setShowAllPast((v) => !v)}
                    accessibilityRole="button"
                    className="self-center px-3 py-1.5"
                  >
                    <Text className="text-xs font-bold" style={{ color: colors.primary, fontFamily: fonts.body }}>
                      {showAllPast ? "Show less" : `Show all (${pastSessions.length})`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Privacy footer */}
            <View className="flex-row items-center justify-center gap-2 mt-8 opacity-75">
              <MaterialCommunityIcons name="shield-check-outline" size={14} color={colors.mutedText} />
              <Text className="text-xs font-semibold tracking-wide text-center" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                Private consultation chat for sensitive health questions.
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Sticky Bottom booking panel */}
        {selectedDoctor && (
          <View
            className="border-t px-6 py-4"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              // The screen's SafeAreaView already pads the home-indicator inset.
              paddingBottom: 16,
            }}
          >
            {paymentNote ? (
              <View className="flex-row items-center justify-center gap-2 mb-3">
                <ActivityIndicator size="small" color={colors.primary} />
                <Text className="text-xs font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                  {paymentNote}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={booking || !canBook}
              onPress={() => handleBookAndPay(selectedDoctor)}
              accessibilityRole="button"
              accessibilityState={{ disabled: booking || !canBook }}
              className="rounded-2xl py-4 items-center justify-center"
              style={{
                backgroundColor: colors.primary,
                opacity: booking ? 0.75 : canBook ? 1 : 0.5,
              }}
            >
              {booking ? (
                <ActivityIndicator color={colors.buttonText} />
              ) : (
                <Text
                  className="text-sm font-extrabold tracking-wide text-center"
                  style={{ color: colors.buttonText, fontFamily: fonts.body }}
                >
                  {bookLabel}
                </Text>
              )}
            </TouchableOpacity>
            {!selectedExisting && selectedFee ? <PaymentTrustFooter compact /> : null}
          </View>
        )}

        {/* Full doctor profile — the main button books via the slot picker below */}
        <DoctorProfileSheet
          doctor={profileDoctor}
          availability={profileDoctor && selectedDoctor?._id === profileDoctor._id ? availability : null}
          loadingAvailability={loadingAvailability}
          hasActiveSession={Boolean(profileDoctor && getConsultationForDoctor(profileDoctor._id))}
          onClose={() => setProfileDoctor(null)}
          onPrimary={() => {
            const doctor = profileDoctor;
            setProfileDoctor(null);
            if (!doctor) return;
            const existing = getConsultationForDoctor(doctor._id);
            if (existing) {
              // Let the sheet finish closing first: iOS won't present a
              // second modal while one is still dismissing.
              setTimeout(() => openChat(existing), 400);
              return;
            }
            setSelectedDoctor(doctor);
            scrollToSlots();
          }}
        />

        <RateSessionSheet
          consultation={rateTarget?.consultation ?? null}
          initialRating={rateTarget?.stars ?? 0}
          doctorName={
            rateTarget && typeof rateTarget.consultation.doctorId === "object"
              ? getDoctorDisplayName(rateTarget.consultation.doctorId)
              : "your doctor"
          }
          onClose={() => setRateTarget(null)}
          onRated={(updated) => {
            setRateTarget(null);
            setMyConsultations((list) => list.map((c) => (c._id === updated._id ? { ...c, ...updated } : c)));
            alert("Thank you!", "Your rating has been shared.");
            load(true); // the doctor's average changed
          }}
        />

        {/* Chat Modal */}
        <Modal
          visible={chatModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setChatModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <View className="flex-1" style={{ backgroundColor: colors.background }}>
              {/* Chat header */}
              <View
                className="px-6 pb-4 border-b flex-row justify-between items-center"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  paddingTop: Math.max(16, insets.top + 8),
                }}
              >
                <View className="flex-row items-center gap-3 flex-1">
                  <TouchableOpacity
                    onPress={() => setChatModalVisible(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Close chat"
                    className="p-1 -ml-1"
                  >
                    <Feather name="chevron-down" size={20} color={colors.foreground} />
                  </TouchableOpacity>
                  <DoctorPhoto
                    name={chatDoctor ? getDoctorDisplayName(chatDoctor) : "Doctor"}
                    uri={chatDoctor?.avatarUrl}
                    size={32}
                    backgroundColor={colors.primaryLight}
                    textColor={colors.primary}
                    fontFamily={fonts.heading}
                  />
                  <View className="flex-1">
                    <Text className="text-sm font-extrabold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                      {chatDoctor ? getDoctorDisplayName(chatDoctor) : "Clinical Specialist"}
                    </Text>
                    <View className="flex-row items-center gap-1.5 mt-0.5">
                      <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: chatStatus.color }} />
                      <Text
                        className="text-[11.5px] font-bold uppercase tracking-widest"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
                        numberOfLines={1}
                      >
                        {chatStatus.text}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Video camera trigger — rings the doctor over WebRTC */}
                {chatLive && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => callRef.current?.startCall()}
                    accessibilityRole="button"
                    accessibilityLabel={`Start video call with ${chatDoctor ? getDoctorDisplayName(chatDoctor) : "your doctor"}`}
                    className="p-2 rounded-full"
                    style={{ backgroundColor: colors.surfaceSoft }}
                  >
                    <Feather name="video" size={18} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>

              {chatLive && socketState === "reconnecting" && (
                <View
                  className="flex-row items-center justify-center gap-2 py-1.5"
                  style={{ backgroundColor: colors.warningLight }}
                  accessibilityLiveRegion="polite"
                >
                  <ActivityIndicator size="small" color={colors.foreground} />
                  <Text className="text-xs font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    Reconnecting…
                  </Text>
                </View>
              )}

              {/* Messages */}
              <ScrollView
                ref={chatScrollRef}
                showsVerticalScrollIndicator={false}
                className="flex-1 px-6 pt-4"
                contentContainerStyle={{ paddingBottom: 32 }}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
              >
                {activeConsultation?.prescription ? (
                  <View
                    className="rounded-2xl p-4 mb-4 border"
                    style={{ backgroundColor: colors.primaryLight, borderColor: colors.primary }}
                  >
                    <View className="flex-row items-center gap-2 mb-2">
                      <Feather name="file-text" size={16} color={colors.primary} />
                      <Text className="text-sm font-extrabold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                        Prescription
                      </Text>
                    </View>
                    <Text className="text-sm leading-5" style={{ color: colors.foreground, fontFamily: fonts.body }} selectable>
                      {activeConsultation.prescription}
                    </Text>
                  </View>
                ) : null}

                {loadingMessages ? (
                  <View className="gap-5 pt-2">
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </View>
                ) : messagesError && chatMessages.length === 0 ? (
                  <EmptyState
                    compact
                    icon="message-alert-outline"
                    title="Couldn't load messages"
                    message={messagesError}
                    actionLabel="Retry"
                    onAction={() => {
                      setLoadingMessages(true);
                      refetchMessages().finally(() => setLoadingMessages(false));
                    }}
                  />
                ) : chatMessages.length === 0 ? (
                  <View className="items-center pt-16 px-8">
                    <Text
                      className="text-xs font-semibold text-center leading-5"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      {chatLive ? "No messages yet. Say hello to your specialist." : "No messages in this session."}
                    </Text>
                  </View>
                ) : (
                  <View className="gap-4">
                    {/* Dynamic chat message log */}
                    {chatMessages.map((msg, i) => {
                      const isDoctor = msg.sender === "doctor";
                      const attachment =
                        msg.attachmentUrl && /^https:\/\//i.test(msg.attachmentUrl) ? msg.attachmentUrl : null;
                      return (
                        <View key={msg._id ?? msg.localId ?? i} className={isDoctor ? "self-start max-w-[80%]" : "self-end max-w-[80%]"}>
                          <View
                            className={`p-4 rounded-2xl ${isDoctor ? "rounded-tl-none border" : "rounded-tr-none"}`}
                            style={{
                              backgroundColor: isDoctor ? colors.surface : (isDark ? colors.surfaceStrong : "#17212E"),
                              borderColor: isDoctor ? colors.border : undefined,
                              opacity: msg.failed ? 0.6 : 1,
                            }}
                          >
                            <Text
                              className="text-xs font-semibold leading-5"
                              style={{ color: isDoctor ? colors.foreground : "#FFFFFF", fontFamily: fonts.body }}
                            >
                              {msg.text}
                            </Text>
                            {attachment ? (
                              <TouchableOpacity
                                onPress={() => Linking.openURL(attachment).catch(() => alert("Couldn't open the attachment"))}
                                accessibilityRole="link"
                                accessibilityLabel="Open attachment"
                                className="flex-row items-center gap-1.5 mt-2"
                              >
                                <Feather name="paperclip" size={13} color={isDoctor ? colors.primary : "#FFFFFF"} />
                                <Text
                                  className="text-xs font-bold underline"
                                  style={{ color: isDoctor ? colors.primary : "#FFFFFF", fontFamily: fonts.body }}
                                >
                                  Open attachment
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                          {msg.failed ? (
                            <TouchableOpacity
                              onPress={() => retryMessage(msg)}
                              disabled={!chatLive}
                              accessibilityRole="button"
                              accessibilityLabel="Message not sent. Retry"
                              className="flex-row items-center gap-1 self-end mt-1"
                            >
                              <Feather name="alert-circle" size={12} color={colors.danger} />
                              <Text className="text-[11px] font-bold" style={{ color: colors.danger, fontFamily: fonts.body }}>
                                {chatLive ? "Not sent · Tap to retry" : "Not sent"}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                )}
              </ScrollView>

              {/* Input row — or, once the session is over, a note */}
              {chatLive ? (
                <View
                  className="px-4 py-3 border-t flex-row items-center gap-3"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    paddingBottom: Math.max(14, insets.bottom + 8),
                  }}
                >
                  <TextInput
                    placeholder="Type a message..."
                    placeholderTextColor={colors.mutedText}
                    value={typedMessage}
                    onChangeText={setTypedMessage}
                    accessibilityLabel="Message"
                    className="flex-1 px-4 py-3 rounded-xl text-sm"
                    style={{ backgroundColor: colors.input, color: colors.foreground, fontFamily: fonts.body }}
                    onSubmitEditing={() => handleSendMessage()}
                    submitBehavior="submit"
                    returnKeyType="send"
                  />
                  <TouchableOpacity
                    disabled={!typedMessage.trim() || sendingMessage}
                    onPress={() => handleSendMessage()}
                    accessibilityRole="button"
                    accessibilityLabel="Send message"
                    className="h-10 w-10 rounded-full items-center justify-center"
                    style={{ backgroundColor: typedMessage.trim() ? colors.primary : colors.surfaceSoft }}
                  >
                    {sendingMessage ? (
                      <ActivityIndicator size="small" color={colors.buttonText} />
                    ) : (
                      <Feather name="arrow-right" size={16} color={typedMessage.trim() ? colors.buttonText : colors.mutedText} />
                    )}
                  </TouchableOpacity>
                </View>
              ) : activeConsultation ? (
                <View
                  className="px-6 py-4 border-t items-center"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    paddingBottom: Math.max(16, insets.bottom + 8),
                  }}
                  accessibilityLiveRegion="polite"
                >
                  <Text className="text-sm font-extrabold text-center" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                    {activeConsultation.status === "cancelled" ? "This booking was cancelled" : "This session has ended"}
                  </Text>
                  <Text className="text-xs mt-1 text-center" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                    {refundLabel(activeConsultation)
                      ? `${refundLabel(activeConsultation)}. You can still read your messages here.`
                      : "You can still read your messages here."}
                  </Text>
                </View>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* WebRTC video meeting — renders its own full-screen Modal (so it floats
            above the chat sheet) while joining/active. Shares the
            consultation_<id> WebSocket room with the doctor's clinician portal. */}
        {activeConsultation && (
          <ConsultationVideoCall
            key={activeConsultation._id}
            ref={callRef}
            peerName={chatDoctor ? getDoctorDisplayName(chatDoctor) : "Doctor"}
            peerAvatarUrl={chatDoctor?.avatarUrl}
            roomId={`consultation_${activeConsultation._id}`}
            socketRef={socketRef}
            chatMessages={chatMessages}
            onSendMessage={(text) => handleSendMessage(text)}
          />
        )}

        {/* Cashfree Checkout — hosted checkout (cards/UPI apps/netbanking/
            wallets) is the default; CashfreeUpiCollectModal's own "Pay
            another way" link switches back to it if native UPI-ID collect
            was ever made reachable from this screen (it currently isn't —
            see the fixed `useHostedCheckout(true)` above). */}
        {checkoutOrder && !useHostedCheckout && (
          <CashfreeUpiCollectModal
            visible
            mode={checkoutOrder.cashfreeMode ?? "production"}
            paymentSessionId={checkoutOrder.paymentSessionId!}
            onVerify={() => verifyUpiOnce(checkoutOrder.orderId!)}
            onOutcome={handleUpiOutcome}
            onUseOtherMethod={() => setUseHostedCheckout(true)}
          />
        )}
        {checkoutOrder && useHostedCheckout && (
          <CashfreeCheckoutModal
            visible
            mode={checkoutOrder.cashfreeMode ?? "production"}
            orderId={checkoutOrder.orderId!}
            paymentSessionId={checkoutOrder.paymentSessionId!}
            onResult={handleCheckoutResult}
          />
        )}
      </SafeAreaView>
    </>
  );
}
