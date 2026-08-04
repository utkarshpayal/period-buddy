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
import { RazorpayCheckoutModal, type RazorpayResult } from "../../components/RazorpayCheckoutModal";
import { useTheme } from "../../components/theme";
import {
  consultationApi,
  getWebSocketUrl,
  type Consultation,
  type ConsultationMessage,
  type ConsultationOrder,
  type Doctor,
} from "../../lib/api";

function getDoctorDisplayName(doctor: Doctor) {
  const legacyName = (doctor as Doctor & { name?: string }).name;

  return (
    legacyName ||
    [doctor.firstName, doctor.lastName].filter(Boolean).join(" ") ||
    "Clinical specialist"
  );
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
  const [searchQuery, setSearchQuery] = useState("");

  // Booking
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [booking, setBooking] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<ConsultationOrder | null>(null);

  // Slot Selection
  const [selectedSlot, setSelectedSlot] = useState("4:00 PM");

  // Video Call WebSocket signaling states
  const [videoCallModalVisible, setVideoCallModalVisible] = useState(false);
  const [videoCallLogs, setVideoCallLogs] = useState<string[]>([]);
  const [videoCallStatus, setVideoCallStatus] = useState("Connecting...");
  const [isMuted, setIsMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

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
      const [doctorList, consultList] = await Promise.all([
        consultationApi.getDoctors(searchQuery || undefined),
        consultationApi.getMyConsultations(),
      ]);
      setDoctors(doctorList);
      setMyConsultations(consultList);
      if (doctorList.length > 0) {
        setSelectedDoctor(doctorList[0]);
      }
    } catch {
      // fail silently — show empty states
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
            if (data.type === "message" && data.room === `consultation_${consultation!._id}`) {
              if (data.messages && Array.isArray(data.messages)) {
                setChatMessages(data.messages);
                setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
              }
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
    };
  }, [chatModalVisible, activeConsultation]);

  // Video Call WebSocket signaling setup
  useEffect(() => {
    if (!videoCallModalVisible || !activeConsultation) return;

    let socket: WebSocket | null = null;
    let isDisconnected = false;
    setVideoCallStatus("Connecting to signaling server...");
    setVideoCallLogs(["[WS] Connecting to WebSocket..."]);

    async function setupSignaling() {
      try {
        const wsUrl = await getWebSocketUrl();
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          if (isDisconnected) return;
          setVideoCallLogs((prev) => [...prev, "[WS] Connected to signaling channel."]);
          setVideoCallStatus("Calling doctor...");

          // Join call signaling room
          socket?.send(
            JSON.stringify({
              type: "join_video_call",
              room: `videocall_${activeConsultation!._id}`,
            })
          );

          // Send call invitation
          socket?.send(
            JSON.stringify({
              type: "video_offer",
              room: `videocall_${activeConsultation!._id}`,
              offer: { sdp: "mock_webrtc_sdp", type: "offer" },
            })
          );
          setVideoCallLogs((prev) => [...prev, "[WS] Sent WebRTC SDP Offer to doctor."]);
        };

        socket.onmessage = (event) => {
          if (isDisconnected) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === "video_answer") {
              setVideoCallLogs((prev) => [...prev, "[WS] Received SDP Answer from doctor."]);
              setVideoCallStatus("Connecting stream...");
              setTimeout(() => {
                if (!isDisconnected) {
                  setVideoCallStatus("Call Active");
                  setVideoCallLogs((prev) => [
                    ...prev,
                    "[WebRTC] P2P ICE Connection established.",
                    "[WebRTC] Media streams active.",
                  ]);
                }
              }, 1200);
            } else if (data.type === "ice_candidate") {
              setVideoCallLogs((prev) => [...prev, `[WS] Received ICE candidate from doctor.`]);
            }
          } catch (err) {
            console.error(err);
          }
        };

        socket.onerror = () => {
          setVideoCallLogs((prev) => [...prev, "[WS] WebSocket signaling error."]);
        };

        socket.onclose = () => {
          setVideoCallLogs((prev) => [...prev, "[WS] Disconnected from signaling channel."]);
        };

        // Simulate incoming doctor answer if backend doesn't automatically loop it back
        setTimeout(() => {
          if (socket && socket.readyState === WebSocket.OPEN && !isDisconnected) {
            socket.send(
              JSON.stringify({
                type: "video_answer",
                room: `videocall_${activeConsultation!._id}`,
                answer: { sdp: "mock_webrtc_sdp_answer", type: "answer" },
              })
            );
          }
        }, 2000);
      } catch (err) {
        setVideoCallLogs((prev) => [...prev, "[WS] Failed to start signaling: " + String(err)]);
      }
    }

    setupSignaling();

    return () => {
      isDisconnected = true;
      if (socket) {
        try {
          socket.send(
            JSON.stringify({
              type: "video_disconnect",
              room: `videocall_${activeConsultation!._id}`,
            })
          );
        } catch {}
        socket.close();
      }
    };
  }, [videoCallModalVisible, activeConsultation]);


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
      const order = await consultationApi.createOrder(doctor._id);
      if (order.consultation) {
        // Backend found an already-paid/active session for this doctor
        // (e.g. a race with another device) — open it instead of charging.
        setMyConsultations((prev) => [order.consultation!, ...prev]);
        setBooking(false);
        setTimeout(() => openChat(order.consultation!), 400);
        return;
      }
      setCheckoutOrder(order);
      // setBooking(false) happens once the checkout modal resolves.
    } catch {
      setBooking(false);
    }
  };

  const handleCheckoutResult = async (result: RazorpayResult) => {
    const order = checkoutOrder;
    setCheckoutOrder(null);

    if (!order || result.type !== "success") {
      setBooking(false);
      return;
    }

    try {
      const consultation = await consultationApi.verifyPayment({
        consultationId: order.consultationId!,
        razorpay_order_id: result.razorpay_order_id,
        razorpay_payment_id: result.razorpay_payment_id,
        razorpay_signature: result.razorpay_signature,
      });
      setMyConsultations((prev) => [consultation, ...prev]);
      setTimeout(() => openChat(consultation), 400);
    } catch {
      // Payment succeeded on Razorpay's side but our verification failed —
      // don't silently grant a session; the user can retry booking.
    } finally {
      setBooking(false);
    }
  };

  const openChat = async (consultation: Consultation) => {
    setActiveConsultation(consultation);
    setChatModalVisible(true);
    setLoadingMessages(true);
    try {
      const messages = await consultationApi.getMessages(consultation._id);
      setChatMessages(messages);
    } catch {
      setChatMessages(consultation.messages ?? []);
    } finally {
      setLoadingMessages(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 100);
    }
  };

  const handleSendMessage = async () => {
    if (!typedMessage.trim() || !activeConsultation || sendingMessage) return;
    const text = typedMessage.trim();
    setTypedMessage("");
    setSendingMessage(true);

    // Optimistic UI
    const optimistic: ConsultationMessage = { sender: "user", text, sentAt: new Date().toISOString() };
    setChatMessages((prev) => [...prev, optimistic]);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const latest = await consultationApi.sendMessage(activeConsultation._id, text);
      setChatMessages((prev) => [...prev.slice(0, -1), ...latest]);
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
                <ActivityIndicator color={colors.primary} />
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

            {/* SELECT A SLOT - TODAY */}
            {selectedDoctor && !loadingDoctors && (
              <View className="mt-8">
                <Text
                  className="text-[10px] font-black uppercase tracking-widest mb-3"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  SELECT A SLOT - TODAY
                </Text>
                <View className="flex-row gap-2">
                  {["4:00 PM", "5:30 PM", "7:00 PM"].map((slot) => {
                    const isSlotSelected = selectedSlot === slot;
                    return (
                      <TouchableOpacity
                        key={slot}
                        activeOpacity={0.82}
                        onPress={() => setSelectedSlot(slot)}
                        className="flex-1 rounded-xl py-3 items-center justify-center border"
                        style={{
                          backgroundColor: colors.surface,
                          borderColor: isSlotSelected ? colors.foreground : colors.border,
                          borderWidth: isSlotSelected ? 1.5 : 1,
                        }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{
                            color: colors.foreground,
                            fontFamily: fonts.body,
                          }}
                        >
                          {slot}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
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
            className="border-t px-6 py-4 flex-row items-center justify-between"
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
              className="flex-1 rounded-2xl py-4 items-center justify-center"
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
                    : `Confirm booking - ₹${selectedDoctor.pricePerSession * 10 || 499}`}
                </Text>
              )}
            </TouchableOpacity>
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
                className="px-6 py-4 border-b flex-row justify-between items-center"
                style={{ backgroundColor: colors.surface, borderColor: colors.border }}
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

                {/* Video camera trigger for video calling */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setVideoCallModalVisible(true)}
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
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : (
                  <View className="gap-4">
                    {/* Hardcoded introductory messages to match mockup precisely */}
                    <View
                      className="max-w-[80%] p-4 rounded-2xl self-start rounded-tl-none border"
                      style={{
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      }}
                    >
                      <Text
                        className="text-xs font-semibold leading-5"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        Hi Utkarsh, I&apos;ve reviewed your cycle history. How have symptoms been this week?
                      </Text>
                    </View>

                    <View
                      className="max-w-[80%] p-4 rounded-2xl self-end rounded-tr-none"
                      style={{
                        backgroundColor: isDark ? colors.surfaceStrong : "#17212E",
                      }}
                    >
                      <Text
                        className="text-xs font-semibold leading-5"
                        style={{ color: "#FFFFFF", fontFamily: fonts.body }}
                      >
                        Cramps have been stronger than usual, mostly day 1-2.
                      </Text>
                    </View>

                    <View
                      className="max-w-[80%] p-4 rounded-2xl self-start rounded-tl-none border"
                      style={{
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      }}
                    >
                      <Text
                        className="text-xs font-semibold leading-5"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        Understood. Let&apos;s go over a few options during our call at {selectedSlot} today.
                      </Text>
                    </View>

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
                  onSubmitEditing={handleSendMessage}
                  blurOnSubmit={false}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  disabled={!typedMessage.trim() || sendingMessage}
                  onPress={handleSendMessage}
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

        {/* Video Call Modal */}
        <Modal
          visible={videoCallModalVisible}
          animationType="fade"
          presentationStyle="fullScreen"
          onRequestClose={() => setVideoCallModalVisible(false)}
        >
          <SafeAreaView className="flex-1 px-6 pt-6 justify-between pb-8" style={{ backgroundColor: "#130F1A" }}>
            {/* Header */}
            <View className="flex-row justify-between items-center">
              <View>
                <Text className="text-base font-extrabold text-white" style={{ fontFamily: fonts.heading }}>
                  Consultation Call
                </Text>
                <View className="flex-row items-center gap-1.5 mt-1">
                  <View className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <Text className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    {videoCallStatus}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setVideoCallModalVisible(false)}
                className="p-2 rounded-full bg-white/10"
              >
                <Feather name="x" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Video Streams Display */}
            <View className="flex-1 my-6 rounded-3xl overflow-hidden relative bg-black/40 border border-white/5 justify-center items-center">
              {videoCallStatus === "Call Active" ? (
                /* Simulated Doctor Stream */
                <View className="items-center justify-center">
                  <View className="h-24 w-24 rounded-full bg-primary/20 border border-primary/40 items-center justify-center mb-3">
                    <Text className="text-4xl">👩‍⚕️</Text>
                  </View>
                  <Text className="text-white font-extrabold text-lg">
                    {selectedDoctor ? getDoctorDisplayName(selectedDoctor) : "Doctor"}
                  </Text>
                  <Text className="text-gray-400 text-xs mt-1">
                    Streaming active • 1080p
                  </Text>
                </View>
              ) : (
                /* Connecting screen */
                <View className="items-center justify-center">
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text className="text-white font-semibold text-sm mt-4">
                    Setting up peer connection...
                  </Text>
                </View>
              )}

              {/* Local Video Inset Box (Bottom Right) */}
              <View
                className="absolute bottom-4 right-4 w-28 h-36 rounded-2xl border border-white/15 overflow-hidden items-center justify-center"
                style={{ backgroundColor: "#2A2438" }}
              >
                {videoOff ? (
                  <Feather name="video-off" size={20} color="#FFFFFF" />
                ) : (
                  <View className="items-center">
                    <Text className="text-2xl mb-1">👩</Text>
                    <Text className="text-[10px] font-black text-gray-300 uppercase tracking-widest">
                      You
                    </Text>
                  </View>
                )}
              </View>

              {/* Live WebRTC / WebSocket Signaling Console Logs */}
              <View
                className="absolute top-4 left-4 right-4 bg-black/70 rounded-xl p-3 border border-white/10"
                style={{ maxHeight: 90 }}
              >
                <ScrollView showsVerticalScrollIndicator={false}>
                  {videoCallLogs.map((log, i) => (
                    <Text
                      key={i}
                      className="text-[9px] leading-4 text-emerald-400"
                      style={{ fontFamily: fonts.mono }}
                    >
                      {log}
                    </Text>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Controls Row */}
            <View className="flex-row items-center justify-center gap-6">
              {/* Mute button */}
              <TouchableOpacity
                onPress={() => {
                  setIsMuted(!isMuted);
                  setVideoCallLogs((prev) => [
                    ...prev,
                    isMuted ? "[Media] Microphone unmuted." : "[Media] Microphone muted.",
                  ]);
                }}
                className={`p-4 rounded-full ${isMuted ? "bg-red-500" : "bg-white/10"}`}
              >
                <Feather name={isMuted ? "mic-off" : "mic"} size={20} color="#FFFFFF" />
              </TouchableOpacity>

              {/* End call button */}
              <TouchableOpacity
                onPress={() => {
                  setVideoCallModalVisible(false);
                }}
                className="p-5 rounded-full bg-red-600 shadow-md"
              >
                <Feather name="phone-off" size={24} color="#FFFFFF" />
              </TouchableOpacity>

              {/* Video toggle button */}
              <TouchableOpacity
                onPress={() => {
                  setVideoOff(!videoOff);
                  setVideoCallLogs((prev) => [
                    ...prev,
                    videoOff ? "[Media] Camera stream active." : "[Media] Camera stream paused.",
                  ]);
                }}
                className={`p-4 rounded-full ${videoOff ? "bg-red-500" : "bg-white/10"}`}
              >
                <Feather name={videoOff ? "video-off" : "video"} size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>

        {/* Razorpay Checkout */}
        {checkoutOrder && (
          <RazorpayCheckoutModal
            visible
            keyId={checkoutOrder.keyId!}
            orderId={checkoutOrder.orderId!}
            amount={checkoutOrder.amount!}
            currency={checkoutOrder.currency!}
            name="Period Buddy"
            description={selectedDoctor ? `Consultation with ${getDoctorDisplayName(selectedDoctor)}` : "Consultation"}
            onResult={handleCheckoutResult}
          />
        )}
      </SafeAreaView>
    </>
  );
}
