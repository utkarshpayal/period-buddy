import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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
import { useTheme } from "../../components/theme";
import { getSoftTints } from "../../components/ui-tokens";
import {
  consultationApi,
  type Consultation,
  type ConsultationMessage,
  type Doctor,
} from "../../lib/api";

const AVATAR_EMOJIS = ["👩‍⚕️", "🧑‍⚕️", "👨‍⚕️"];

function getDoctorDisplayName(doctor: Doctor) {
  const legacyName = (doctor as Doctor & { name?: string }).name;

  return (
    legacyName ||
    [doctor.firstName, doctor.lastName].filter(Boolean).join(" ") ||
    "Clinical specialist"
  );
}

export default function ConsultationScreen() {
  const { colors, isDark } = useTheme();
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
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [booking, setBooking] = useState(false);

  // Chat
  const [activeConsultation, setActiveConsultation] = useState<Consultation | null>(null);
  const [chatMessages, setChatMessages] = useState<ConsultationMessage[]>([]);
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [typedMessage, setTypedMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const softTints = getSoftTints(colors);

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

  const getConsultationForDoctor = (doctorId: string) =>
    myConsultations.find((c) => {
      const id = typeof c.doctorId === "string" ? c.doctorId : c.doctorId._id;
      return id === doctorId && (c.status === "paid" || c.status === "active");
    });

  const handleInitiateBooking = (doctor: Doctor) => {
    const existing = getConsultationForDoctor(doctor._id);
    if (existing) {
      openChat(existing);
      return;
    }
    setSelectedDoctor(doctor);
    setPaymentModalVisible(true);
  };

  const handleProcessPayment = async () => {
    if (!selectedDoctor) return;
    setBooking(true);
    try {
      const consultation = await consultationApi.bookConsultation(selectedDoctor._id);
      setMyConsultations((prev) => [consultation, ...prev]);
      setPaymentModalVisible(false);
      setSelectedDoctor(null);
      setTimeout(() => openChat(consultation), 400);
    } catch {
      // Keep modal open with error handling
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
            Consultation
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
          }
        >
          <View className="mx-6 mt-6">
            {/* Search bar */}
            <View
              className="flex-row items-center rounded-2xl border px-4 shadow-sm"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <Feather name="search" size={16} color={colors.mutedText} />
              <TextInput
                placeholder="Find gynecologists, OBGYNs, or specialists..."
                placeholderTextColor={colors.mutedText}
                value={searchQuery}
                onChangeText={setSearchQuery}
                className="ml-3 flex-1 py-4 text-sm"
                style={{ color: colors.foreground }}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Feather name="x" size={16} color={colors.mutedText} />
                </TouchableOpacity>
              )}
            </View>

            {/* Active consultations */}
            {myConsultations.filter((c) => c.status === "paid" || c.status === "active").length > 0 && (
              <View className="mt-6">
                <Text className="text-xs font-black tracking-widest uppercase mb-3" style={{ color: colors.primary }}>
                  Your Active Sessions
                </Text>
                {myConsultations
                  .filter((c) => c.status === "paid" || c.status === "active")
                  .map((c) => {
                    const doc = typeof c?.doctorId === "object" ? c.doctorId : null;
                    return (
                      <TouchableOpacity
                        key={c._id}
                        onPress={() => openChat(c)}
                        activeOpacity={0.8}
                        className="mb-3 rounded-2xl border overflow-hidden"
                        style={{ backgroundColor: colors.surface, borderColor: `${colors.primary}40` }}
                      >
                        <LinearGradient
                          colors={[colors.surface, colors.primaryLight]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          className="flex-row items-center p-4 gap-3"
                        >
                          <View className="h-10 w-10 rounded-full items-center justify-center" style={{ backgroundColor: softTints.pink }}>
                            <Text className="text-lg">👩‍⚕️</Text>
                          </View>
                          <View className="flex-1">
                            <Text className="text-sm font-bold" style={{ color: colors.foreground }}>
                              {doc ? `${doc?.firstName ?? ""} ${doc?.lastName ?? ""}`.trim() || "Your Doctor" : "Your Doctor"}
                            </Text>
                            <Text className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mt-0.5">
                              Session active - tap to chat
                            </Text>
                          </View>
                          <Feather name="message-circle" size={18} color={colors.primary} />
                        </LinearGradient>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            )}

            {/* Doctors list */}
            <View className="mt-6 gap-4">
              <Text className="text-xs font-black tracking-widest uppercase" style={{ color: colors.primary }}>
                {loadingDoctors ? "Loading specialists…" : `${filteredDoctors.length} Available Specialists`}
              </Text>

              {loadingDoctors ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                filteredDoctors.map((doctor, i) => {
                  const hasSession = Boolean(getConsultationForDoctor(doctor._id));
                  return (
                    <View
                      key={doctor._id}
                      className="rounded-3xl border p-5 shadow-sm relative overflow-hidden"
                      style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                    >
                      <View className="flex-row items-start">
                        {/* Avatar */}
                        <View className="h-14 w-14 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200/50">
                          <Text className="text-2xl">{AVATAR_EMOJIS[i % AVATAR_EMOJIS.length]}</Text>
                        </View>

                        <View className="ml-4 flex-1">
                          <Text className="text-base font-extrabold tracking-tight" style={{ color: colors.foreground }}>
                            {getDoctorDisplayName(doctor)}
                          </Text>
                          <Text className="text-xs font-semibold mt-0.5" style={{ color: colors.mutedText }}>
                            {doctor.specialty}
                          </Text>
                          <View className="mt-2.5 flex-row items-center gap-2">
                            <View className="flex-row items-center gap-1 bg-amber-100 dark:bg-amber-950/40 px-2 py-0.5 rounded-md" style={{backgroundColor: isDark ? "#525151ff" : "#e7dde6ff"}}>
                              <Ionicons name="star" size={11} color={colors.warning} />
                              <Text className="text-[10px] font-black" style={{ color: colors.foreground }}>
                                {doctor.rating}
                              </Text>
                            </View>
                            {doctor.isAvailable && (
                              <Text className="text-[11px] font-semibold text-emerald-500">
                                Available now
                              </Text>
                            )}
                          </View>
                        </View>

                        <View className="items-end">
                          <Text className="text-base font-black" style={{ color: colors.primary }}>
                            ${doctor.pricePerSession}
                          </Text>
                          <Text className="text-[9px] font-bold tracking-wide uppercase mt-0.5" style={{ color: colors.mutedText }}>
                            / session
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        className="mt-5 w-full rounded-xl py-3.5 items-center justify-center shadow-sm"
                        onPress={() => handleInitiateBooking(doctor)}
                        style={{ backgroundColor: hasSession ? colors.success : colors.primary }}
                      >
                        <Text className="text-sm font-bold tracking-wide" style={{ color: colors.buttonText }}>
                          {hasSession ? "Open Consultation Chat" : "Book Consultation Session"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>

            {/* Privacy footer */}
            <View className="flex-row items-center justify-center gap-2 mt-8 opacity-70">
              <MaterialCommunityIcons name="shield-check-outline" size={14} color={colors.mutedText} />
              <Text className="text-[11px] font-semibold tracking-wide text-center" style={{ color: colors.mutedText }}>
                Private consultation chat for sensitive health questions.
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Payment Modal */}
        <Modal
          visible={paymentModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setPaymentModalVisible(false)}
        >
          <View className="flex-1 px-6 pt-6 justify-between pb-10" style={{ backgroundColor: colors.background }}>
            <View>
              <View className="flex-row justify-between items-center mb-8">
                <Text className="text-xl font-black" style={{ color: colors.foreground }}>
                  Secure Checkout
                </Text>
                <TouchableOpacity
                  onPress={() => setPaymentModalVisible(false)}
                  className="p-1.5 bg-neutral-100 dark:bg-neutral-200 rounded-full"
                >
                  <Feather name="x" size={16} color={colors.background} />
                </TouchableOpacity>
              </View>

              <Text className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: colors.primary }}>
                Consultation Summary
              </Text>
              {selectedDoctor && (
                <View
                  className="p-5 rounded-2xl border flex-row items-center justify-between mb-6"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                >
                  <View>
                    <Text className="text-base font-extrabold" style={{ color: colors.foreground }}>
                      {getDoctorDisplayName(selectedDoctor)}
                    </Text>
                    <Text className="text-xs font-semibold mt-0.5" style={{ color: colors.mutedText }}>
                      {selectedDoctor.specialty}
                    </Text>
                  </View>
                  <Text className="text-lg font-black" style={{ color: colors.foreground }}>
                    ${selectedDoctor.pricePerSession}
                  </Text>
                </View>
              )}

              <View className="p-4 rounded-xl flex-row items-start gap-3" style={{ backgroundColor: softTints.emerald }}>
                <MaterialCommunityIcons name="lock-check-outline" size={18} color={colors.success} />
                <Text className="text-xs leading-4 flex-1 font-medium" style={{ color: colors.mutedText }}>
                  Booking opens a private chat with your specialist. Payment is
                  handled before the session starts.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              disabled={booking}
              onPress={handleProcessPayment}
              className="w-full rounded-2xl py-4 items-center justify-center shadow-md"
              style={{ backgroundColor: colors.primary, opacity: booking ? 0.7 : 1 }}
            >
              {booking ? (
                <ActivityIndicator color={colors.buttonText} />
              ) : (
                <Text className="text-sm font-extrabold tracking-wide" style={{ color: colors.buttonText }}>
                  Pay & Start Consultation
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Modal>

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
                <View>
                  <Text className="text-sm font-black" style={{ color: colors.foreground }}>
                    Clinical Specialist
                  </Text>
                  <Text className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mt-0.5">
                    Secure session active
                  </Text>
                </View>
              </View>
              <MaterialCommunityIcons name="shield-account-outline" size={20} color={colors.primary} />
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
                  {chatMessages.map((msg, i) => {
                    const isDoctor = msg.sender === "doctor";
                    return (
                      <View
                        key={msg._id ?? i}
                        className={`max-w-[80%] p-4 rounded-2xl ${isDoctor ? "self-start rounded-tl-none border" : "self-end rounded-tr-none"}`}
                        style={{
                          backgroundColor: isDoctor ? colors.surface : colors.primary,
                          borderColor: isDoctor ? colors.border : undefined,
                        }}
                      >
                        <Text
                          className="text-xs font-medium leading-5"
                          style={{ color: isDoctor ? colors.foreground : colors.buttonText }}
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
              className="px-4 py-3.5 border-t flex-row items-center gap-3"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                paddingBottom: Math.max(14, insets.bottom + 8),
              }}
            >
              <TextInput
                placeholder="Type your message…"
                placeholderTextColor={colors.mutedText}
                value={typedMessage}
                onChangeText={setTypedMessage}
                className="flex-1 px-4 py-3 rounded-xl text-sm"
                style={{ backgroundColor: colors.input, color: colors.foreground }}
                onSubmitEditing={handleSendMessage}
                blurOnSubmit={false}
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
                  <Feather name="send" size={15} color={typedMessage.trim() ? colors.buttonText : colors.mutedText} />
                )}
              </TouchableOpacity>
            </View>
          </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </>
  );
}
