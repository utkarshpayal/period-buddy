import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { EmptyState } from "../../components/EmptyState";
import { alert } from "../../lib/alert";
import { CashfreeCheckoutModal, type CashfreeResult } from "../../components/CashfreeCheckoutModal";
import { CashfreeUpiCollectModal, type UpiCollectOutcome } from "../../components/CashfreeUpiCollectModal";
import { PaymentTrustFooter } from "../../components/subscription/PaymentTrustFooter";
import { useTheme } from "../../components/theme";
import { SkeletonRow } from "../../components/Skeleton";
import {
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

function getDoctorDisplayName(doctor: Doctor) {
  const legacyName = (doctor as Doctor & { name?: string }).name;

  return (
    legacyName ||
    [doctor.firstName, doctor.lastName].filter(Boolean).join(" ") ||
    "Clinical specialist"
  );
}

/** "14:30" -> "2:30 PM" */
function to12Hour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, "0")} ${period}`;
}

/** Expands availability ranges into hourly bookable slots (minutes-from-midnight). */
function slotMinutesFromRanges(ranges: { startTime: string; endTime: string }[]): number[] {
  const out: number[] = [];
  for (const r of ranges) {
    const [sh, sm] = r.startTime.split(":").map(Number);
    const [eh, em] = r.endTime.split(":").map(Number);
    let cur = sh * 60 + (sm || 0);
    const end = eh * 60 + (em || 0);
    while (cur < end) {
      out.push(cur);
      cur += 60;
    }
  }
  return out.sort((a, b) => a - b);
}

/** 570 (minutes) -> "9:30 AM" */
function minutesToLabel(mins: number): string {
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return to12Hour(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
}

/** Builds the next `count` calendar dates that have doctor availability. */
function upcomingBookableDates(
  availability: DoctorAvailability | null,
  count = 14,
): Date[] {
  if (!availability) return [];
  const daysWithSlots = new Set(
    availability.days.filter((d) => d.slots?.length).map((d) => d.dayOfWeek),
  );
  const out: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < count && out.length < 10; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (daysWithSlots.has(d.getDay())) out.push(d);
  }
  return out;
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Collapses a message list so the same message never renders twice. The server
 * (sendMessage response) and the WebSocket broadcast both deliver the full log,
 * so without this an echoed message shows up multiple times. Messages with an
 * `_id` dedupe on it; optimistic messages (no `_id` yet) dedupe on sender+text.
 */
function dedupeMessages(messages: ConsultationMessage[]): ConsultationMessage[] {
  const seen = new Set<string>();
  const out: ConsultationMessage[] = [];
  for (const msg of messages) {
    const key = msg._id ? `id:${msg._id}` : `tmp:${msg.sender}:${msg.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(msg);
  }
  return out;
}

export default function ConsultationScreen() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const chatScrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  // Lists
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [myConsultations, setMyConsultations] = useState<Consultation[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<{ message: string; offline: boolean } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Booking
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [booking, setBooking] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<ConsultationOrder | null>(null);
  const [useHostedCheckout, setUseHostedCheckout] = useState(false);

  // Slot Selection — driven by the doctor's real published availability. The
  // user first picks a bookable date (today or any future day the gynac is
  // available), then a time slot within that day.
  const [availability, setAvailability] = useState<DoctorAvailability | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  // Slot stored as minutes-from-midnight; null when no slot picked yet.
  const [selectedSlotMins, setSelectedSlotMins] = useState<number | null>(null);

  const bookableDates = React.useMemo(
    () => upcomingBookableDates(availability),
    [availability],
  );

  // Slots for the currently selected date, hiding times already past for today.
  const daySlots = React.useMemo(() => {
    if (!selectedDate || !availability) return [];
    const entry = availability.days.find((d) => d.dayOfWeek === selectedDate.getDay());
    if (!entry?.slots?.length) return [];
    let mins = slotMinutesFromRanges(entry.slots);
    const now = new Date();
    if (isSameDay(selectedDate, now)) {
      const nowMins = now.getHours() * 60 + now.getMinutes();
      mins = mins.filter((m) => m > nowMins);
    }
    return mins;
  }, [selectedDate, availability]);

  const selectedSlotLabel = selectedSlotMins != null ? minutesToLabel(selectedSlotMins) : null;

  // Video call: WebRTC "meeting" over the shared consultation WebSocket room, so
  // patient and doctor connect peer-to-peer instead of via a third-party room.
  const socketRef = useRef<WebSocket | null>(null);
  const callRef = useRef<ConsultationVideoCallHandle | null>(null);

  // Chat
  const [activeConsultation, setActiveConsultation] = useState<Consultation | null>(null);
  const [chatMessages, setChatMessages] = useState<ConsultationMessage[]>([]);
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [typedMessage, setTypedMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoadingDoctors(true);
      setLoadError(null);
      const [doctorList, consultList] = await Promise.all([
        consultationApi.getDoctors(searchQuery || undefined),
        consultationApi.getMyConsultations(),
      ]);
      setDoctors(doctorList);
      setMyConsultations(consultList);
      if (doctorList.length > 0) {
        setSelectedDoctor(doctorList[0]);
      }
    } catch (err) {
      setLoadError({ message: getFriendlyErrorMessage(err), offline: isNetworkError(err) });
    } finally {
      setLoadingDoctors(false);
      setRefreshing(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    load();
  }, [load]);

  // WebSocket live synchronization
  useEffect(() => {
    const consultation = activeConsultation;
    if (!chatModalVisible || !consultation) return;

    let socket: WebSocket | null = null;
    let isDisconnected = false;

    async function connectWS() {
      try {
        const wsUrl = await getWebSocketUrl();
        socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          if (isDisconnected) return;
          console.log("WebSocket connected for consultation chat");
          socket?.send(JSON.stringify({
            type: "join",
            room: `consultation_${consultation!._id}`,
          }));
        };

        socket.onmessage = (event) => {
          if (isDisconnected) return;
          try {
            const data = JSON.parse(event.data);
            const room = `consultation_${consultation!._id}`;
            if (data.type === "message" && data.room === room) {
              if (data.messages && Array.isArray(data.messages)) {
                setChatMessages(dedupeMessages(data.messages));
                setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
              }
            } else if (data.type && data.room === room) {
              // Non-chat traffic on this room is WebRTC call signaling — the
              // doctor ringing us shows up here as an incoming call.
              callRef.current?.handleSignal(data);
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
            room: `consultation_${consultation!._id}`,
          }));
        } catch {}
        socket.close();
      }
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [chatModalVisible, activeConsultation]);

  // Load the selected doctor's real weekly availability so the user can pick a
  // date (today or any future day the gynac is available) and a time slot.
  useEffect(() => {
    if (!selectedDoctor?._id) return;
    let cancelled = false;

    setLoadingAvailability(true);
    setAvailability(null);
    setSelectedDate(null);
    setSelectedSlotMins(null);

    (async () => {
      try {
        const data = await consultationApi.getDoctorAvailability(selectedDoctor._id);
        if (cancelled) return;
        setAvailability(data);
      } catch {
        if (!cancelled) setAvailability(null);
      } finally {
        if (!cancelled) setLoadingAvailability(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedDoctor?._id]);

  // Default to the first bookable date (and its first slot) once availability loads.
  useEffect(() => {
    if (bookableDates.length && !selectedDate) {
      setSelectedDate(bookableDates[0]);
    }
  }, [bookableDates, selectedDate]);

  // Keep the selected slot valid whenever the chosen date's slots change.
  useEffect(() => {
    if (daySlots.length && (selectedSlotMins == null || !daySlots.includes(selectedSlotMins))) {
      setSelectedSlotMins(daySlots[0]);
    } else if (!daySlots.length) {
      setSelectedSlotMins(null);
    }
  }, [daySlots, selectedSlotMins]);

  const getConsultationForDoctor = (doctorId: string) =>
    myConsultations.find((c) => {
      const id = typeof c.doctorId === "string" ? c.doctorId : c.doctorId._id;
      return id === doctorId && (c.status === "paid" || c.status === "active");
    });

  const handleBookAndPay = async (doctor: Doctor) => {
    const existing = getConsultationForDoctor(doctor._id);
    if (existing) {
      openChat(existing);
      return;
    }
    setBooking(true);
    try {
      // Combine the picked date + slot into an ISO timestamp so the booking is
      // scheduled for the chosen (possibly future) day/time.
      let scheduledFor: string | undefined;
      if (selectedDate && selectedSlotMins != null) {
        const when = new Date(selectedDate);
        when.setHours(Math.floor(selectedSlotMins / 60), selectedSlotMins % 60, 0, 0);
        scheduledFor = when.toISOString();
      }
      const order = await consultationApi.createOrder(doctor._id, scheduledFor);
      if (order.consultation) {
        // Backend found an already-paid/active session for this doctor
        // (e.g. a race with another device) — open it instead of charging.
        setMyConsultations((prev) => [order.consultation!, ...prev]);
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
      // Previously swallowed silently, which on a failed/timed-out
      // createOrder call (e.g. no network reaching the backend) made
      // tapping "Book & Pay" look like it did nothing at all.
      alert("Couldn't start checkout", getFriendlyErrorMessage(err));
      setBooking(false);
    }
  };

  const handleCheckoutResult = async (result: CashfreeResult) => {
    const order = checkoutOrder;
    setCheckoutOrder(null);

    if (!order) {
      setBooking(false);
      return;
    }
    if (result.type !== "success" && result.type !== "dismiss") {
      setBooking(false);
      return;
    }

    // A dismiss is usually a genuine cancel, but it's also what happens if
    // the checkout is closed the instant after a redirect-based method
    // (netbanking/wallet/other UPI app) finishes — before
    // CashfreeCheckoutModal's own return_url interception fires. Verifying
    // with the order's own id (rather than trusting result.orderId, which a
    // dismiss doesn't carry) catches that case; a real cancel just resolves
    // to "pending"/an error below and stays quiet.
    const orderId = result.type === "success" ? result.orderId : order.orderId!;

    try {
      const verified = await consultationApi.verifyPayment({
        consultationId: order.consultationId!,
        orderId,
      });
      // The hosted checkout only calls verify after the sheet reports a
      // completed payment, so a "pending" Cashfree order here would be
      // unexpected — treat it the same as a failed verification rather
      // than granting a session.
      if (!("pending" in verified)) {
        setMyConsultations((prev) => [verified, ...prev]);
        setTimeout(() => openChat(verified), 400);
      }
    } catch {
      // Payment succeeded on Cashfree's side but our verification failed —
      // don't silently grant a session; the user can retry booking.
    } finally {
      setBooking(false);
    }
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
    setBooking(false);
    if (result.type === "dismiss" || !order) return;
    if (result.type === "failed") return;

    // The polling in CashfreeUpiCollectModal already confirmed the order is
    // PAID — one more verify call both re-confirms and fetches the now-
    // active Consultation to open.
    try {
      const consultation = await consultationApi.verifyPayment({
        consultationId: order.consultationId!,
        orderId: order.orderId!,
      });
      if (!("pending" in consultation)) {
        setMyConsultations((prev) => [consultation, ...prev]);
        setTimeout(() => openChat(consultation), 400);
      }
    } catch {
      // Already paid per the poll above; a transient failure here just
      // means the chat doesn't open immediately — the session still shows
      // up next time "My Consultations" loads.
    }
  };

  const openChat = async (consultation: Consultation) => {
    setActiveConsultation(consultation);
    setChatModalVisible(true);
    setLoadingMessages(true);
    try {
      const messages = await consultationApi.getMessages(consultation._id);
      setChatMessages(dedupeMessages(messages));
    } catch {
      setChatMessages(dedupeMessages(consultation.messages ?? []));
    } finally {
      setLoadingMessages(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 100);
    }
  };

  // `rawText` lets the in-call chat panel send without touching the chat sheet's
  // own input state; the chat sheet keeps calling it with no argument.
  const handleSendMessage = async (rawText?: string) => {
    const source = rawText != null ? rawText : typedMessage;
    const text = source.trim();
    if (!text || !activeConsultation || sendingMessage) return;
    if (rawText == null) setTypedMessage("");
    setSendingMessage(true);

    // Optimistic UI
    const optimistic: ConsultationMessage = { sender: "user", text, sentAt: new Date().toISOString() };
    setChatMessages((prev) => [...prev, optimistic]);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      // sendMessage returns the full authoritative log — replace (deduped)
      // rather than append, so the optimistic message isn't shown twice.
      const latest = await consultationApi.sendMessage(activeConsultation._id, text);
      setChatMessages(dedupeMessages(latest));
    } catch {
      // message stays optimistically
    } finally {
      setSendingMessage(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const filteredDoctors = doctors.filter((d) =>
    [getDoctorDisplayName(d), d.specialty]
      .join(" ")
      .toLowerCase()
      .includes(searchQuery.toLowerCase()),
  );

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        {/* Nav Header */}
        <View className="flex-row items-center gap-3 px-6 pt-6">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="h-9 w-9 items-center justify-center rounded-full"
            style={{
              backgroundColor: colors.surface,
              shadowColor: colors.shadow,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <Feather name="chevron-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text className="text-xl font-extrabold tracking-tight" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
            Consultation
          </Text>
        </View>

        <ScrollView
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
                className="ml-3 flex-1 text-sm outline-none"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Feather name="x" size={16} color={colors.mutedText} />
                </TouchableOpacity>
              )}
            </View>

            {/* Upcoming / active session hero card */}
            {(() => {
              const activeSessions = myConsultations.filter(
                (c) => c.status === "paid" || c.status === "active",
              );
              const heroSession = activeSessions[0];
              if (!heroSession) return null;
              const doc = typeof heroSession?.doctorId === "object" ? heroSession.doctorId : null;
              return (
                <View className="mt-6">
                  <TouchableOpacity
                    onPress={() => openChat(heroSession)}
                    activeOpacity={0.9}
                    className="rounded-3xl overflow-hidden"
                  >
                    <LinearGradient
                      colors={[colors.primary, colors.primaryLight]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      className="flex-row items-center justify-between p-[18px]"
                    >
                      <View className="flex-1 pr-3">
                        <Text
                          className="text-[11px] font-black uppercase tracking-widest"
                          style={{ color: "rgba(255,255,255,0.85)", fontFamily: fonts.heading }}
                        >
                          Active session · tap to chat
                        </Text>
                        <Text
                          className="text-base font-bold mt-1"
                          style={{ color: "#FFFFFF", fontFamily: fonts.heading }}
                        >
                          {doc ? getDoctorDisplayName(doc) : "Your Doctor"}
                        </Text>
                        <Text
                          className="text-xs mt-0.5"
                          style={{ color: "rgba(255,255,255,0.9)", fontFamily: fonts.body }}
                        >
                          {doc?.specialty ?? "Gynecologist"} · Chat & video call
                        </Text>
                      </View>
                      <View
                        className="rounded-xl px-3.5 py-2.5"
                        style={{ backgroundColor: "#FFFFFF" }}
                      >
                        <Text
                          className="text-xs font-extrabold"
                          style={{ color: colors.primary, fontFamily: fonts.heading }}
                        >
                          Join
                        </Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
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
              ) : filteredDoctors.length === 0 ? (
                <EmptyState
                  compact
                  icon="doctor"
                  title={searchQuery ? "No matches found" : "No specialists available"}
                  message={
                    searchQuery
                      ? "Try a different name or specialty."
                      : "Please check back soon — our specialists will appear here."
                  }
                />
              ) : (
                filteredDoctors.map((doctor, i) => {
                  const isSelected = selectedDoctor?._id === doctor._id;
                  const avatarBgOptions = [colors.primaryLight, colors.accentLight, colors.warningLight];
                  const avatarTextOptions = [colors.primary, colors.foreground, colors.foreground];
                  const avatarBg = avatarBgOptions[i % avatarBgOptions.length];
                  const avatarText = avatarTextOptions[i % avatarTextOptions.length];
                  const initials = getDoctorDisplayName(doctor)
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join("");

                  return (
                    <TouchableOpacity
                      key={doctor._id}
                      activeOpacity={0.9}
                      onPress={() => setSelectedDoctor(doctor)}
                      className="rounded-2xl p-3.5 flex-row items-center gap-3"
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
                      {/* Avatar */}
                      <View
                        className="h-11 w-11 items-center justify-center rounded-full"
                        style={{ backgroundColor: avatarBg }}
                      >
                        <Text className="text-[15px] font-bold" style={{ color: avatarText, fontFamily: fonts.heading }}>
                          {initials || "DR"}
                        </Text>
                      </View>

                      {/* Middle info */}
                      <View className="flex-1">
                        <Text className="text-[13.5px] font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                          {getDoctorDisplayName(doctor)}
                        </Text>
                        <Text className="text-[11px] font-semibold mt-0.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                          {doctor.specialty} · ★ {doctor.rating}
                        </Text>
                      </View>

                      {/* Book button */}
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={booking}
                        onPress={() => {
                          setSelectedDoctor(doctor);
                          handleBookAndPay(doctor);
                        }}
                        className="rounded-xl px-3.5 py-2"
                        style={{ backgroundColor: colors.primary, opacity: booking ? 0.7 : 1 }}
                      >
                        <Text className="text-[11.5px] font-bold" style={{ color: colors.buttonText, fontFamily: fonts.heading }}>
                          {getConsultationForDoctor(doctor._id) ? "Chat" : "Book"}
                        </Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            {/* SELECT A DATE + SLOT — from the gynac's published availability */}
            {selectedDoctor && !loadingDoctors && (
              <View className="mt-8">
                <Text
                  className="text-[10px] font-black uppercase tracking-widest mb-3"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  Select a date
                </Text>

                {loadingAvailability ? (
                  <SkeletonRow />
                ) : bookableDates.length === 0 ? (
                  <View
                    className="rounded-2xl border px-4 py-5 items-center"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    <Feather name="calendar" size={18} color={colors.mutedText} />
                    <Text
                      className="text-xs font-semibold mt-2 text-center"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      This specialist hasn&apos;t published their schedule yet. Book now and
                      they&apos;ll confirm a time with you in chat.
                    </Text>
                  </View>
                ) : (
                  <>
                    {/* Horizontal date strip */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingRight: 8 }}
                    >
                      {bookableDates.map((date) => {
                        const isDateSelected = selectedDate ? isSameDay(date, selectedDate) : false;
                        const isToday = isSameDay(date, new Date());
                        return (
                          <TouchableOpacity
                            key={date.toISOString()}
                            activeOpacity={0.82}
                            onPress={() => {
                              setSelectedDate(date);
                              setSelectedSlotMins(null);
                            }}
                            className="rounded-2xl px-4 py-3 items-center justify-center border"
                            style={{
                              backgroundColor: isDateSelected ? colors.primary : colors.surface,
                              borderColor: isDateSelected ? colors.primary : colors.border,
                              minWidth: 62,
                            }}
                          >
                            <Text
                              className="text-[10px] font-bold uppercase tracking-wide"
                              style={{
                                color: isDateSelected ? colors.buttonText : colors.mutedText,
                                fontFamily: fonts.body,
                              }}
                            >
                              {isToday ? "Today" : DOW_SHORT[date.getDay()]}
                            </Text>
                            <Text
                              className="text-base font-extrabold mt-0.5"
                              style={{
                                color: isDateSelected ? colors.buttonText : colors.foreground,
                                fontFamily: fonts.heading,
                              }}
                            >
                              {date.getDate()}
                            </Text>
                            <Text
                              className="text-[9px] font-bold uppercase"
                              style={{
                                color: isDateSelected ? colors.buttonText : colors.mutedText,
                                fontFamily: fonts.body,
                              }}
                            >
                              {MONTH_SHORT[date.getMonth()]}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    {/* Time slots for the chosen date */}
                    <Text
                      className="text-[10px] font-black uppercase tracking-widest mt-6 mb-3"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      Select a time
                    </Text>
                    {daySlots.length === 0 ? (
                      <Text
                        className="text-xs font-semibold"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
                      >
                        No time slots left for this day — try another date.
                      </Text>
                    ) : (
                      <View className="flex-row flex-wrap gap-2">
                        {daySlots.map((mins) => {
                          const isSlotSelected = selectedSlotMins === mins;
                          return (
                            <TouchableOpacity
                              key={mins}
                              activeOpacity={0.82}
                              onPress={() => setSelectedSlotMins(mins)}
                              className="rounded-xl py-3 px-4 items-center justify-center border"
                              style={{
                                backgroundColor: colors.surface,
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
                                {minutesToLabel(mins)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            {/* Privacy footer */}
            <View className="flex-row items-center justify-center gap-2 mt-8 opacity-75">
              <MaterialCommunityIcons name="shield-check-outline" size={14} color={colors.mutedText} />
              <Text className="text-[11px] font-semibold tracking-wide text-center" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
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
              paddingBottom: Math.max(16, insets.bottom + 8),
            }}
          >
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={booking}
              onPress={() => handleBookAndPay(selectedDoctor)}
              className="rounded-2xl py-4 items-center justify-center"
              style={{
                backgroundColor: colors.primary,
                opacity: booking ? 0.75 : 1,
              }}
            >
              {booking ? (
                <ActivityIndicator color={colors.buttonText} />
              ) : (
                <Text
                  className="text-sm font-extrabold tracking-wide"
                  style={{ color: colors.buttonText, fontFamily: fonts.body }}
                >
                  {getConsultationForDoctor(selectedDoctor._id)
                    ? "Open Consultation Chat"
                    : `Book${
                        selectedDate && selectedSlotLabel
                          ? ` ${isSameDay(selectedDate, new Date()) ? "Today" : `${DOW_SHORT[selectedDate.getDay()]} ${selectedDate.getDate()} ${MONTH_SHORT[selectedDate.getMonth()]}`}, ${selectedSlotLabel}`
                          : ""
                      } - ₹${selectedDoctor.pricePerSession || 499}`}
                </Text>
              )}
            </TouchableOpacity>
            {!getConsultationForDoctor(selectedDoctor._id) ? <PaymentTrustFooter compact /> : null}
          </View>
        )}

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
                <View className="flex-row items-center gap-3">
                  <TouchableOpacity onPress={() => setChatModalVisible(false)} className="p-1 -ml-1">
                    <Feather name="chevron-down" size={20} color={colors.foreground} />
                  </TouchableOpacity>
                  <View
                    className="h-8 w-8 rounded-full items-center justify-center"
                    style={{ backgroundColor: colors.primaryLight }}
                  >
                    <Text className="text-sm">👩‍⚕️</Text>
                  </View>
                  <View>
                    <Text className="text-sm font-extrabold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                      {selectedDoctor ? getDoctorDisplayName(selectedDoctor) : "Clinical Specialist"}
                    </Text>
                    <View className="flex-row items-center gap-1.5 mt-0.5">
                      <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.success }} />
                      <Text className="text-[10px] font-bold uppercase tracking-widest" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                        Online now
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Video camera trigger — rings the doctor over WebRTC */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => callRef.current?.startCall()}
                  className="p-2 rounded-full"
                  style={{ backgroundColor: colors.surfaceSoft }}
                >
                  <Feather name="video" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>

              {/* Messages */}
              <ScrollView
                ref={chatScrollRef}
                showsVerticalScrollIndicator={false}
                className="flex-1 px-6 pt-4"
                contentContainerStyle={{ paddingBottom: 32 }}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
              >
                {loadingMessages ? (
                  <View className="gap-5 pt-2">
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </View>
                ) : chatMessages.length === 0 ? (
                  <View className="items-center pt-16 px-8">
                    <Text
                      className="text-xs font-semibold text-center leading-5"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      No messages yet. Send a message to start the conversation with your specialist.
                    </Text>
                  </View>
                ) : (
                  <View className="gap-4">
                    {/* Dynamic chat message log */}
                    {chatMessages.map((msg, i) => {
                      const isDoctor = msg.sender === "doctor";
                      return (
                        <View
                          key={msg._id ?? i}
                          className={`max-w-[80%] p-4 rounded-2xl ${
                            isDoctor ? "self-start rounded-tl-none border" : "self-end rounded-tr-none"
                          }`}
                          style={{
                            backgroundColor: isDoctor ? colors.surface : (isDark ? colors.surfaceStrong : "#17212E"),
                            borderColor: isDoctor ? colors.border : undefined,
                          }}
                        >
                          <Text
                            className="text-xs font-semibold leading-5"
                            style={{ color: isDoctor ? colors.foreground : "#FFFFFF", fontFamily: fonts.body }}
                          >
                            {msg.text}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </ScrollView>

              {/* Input row */}
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
            peerName={selectedDoctor ? getDoctorDisplayName(selectedDoctor) : "Doctor"}
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
