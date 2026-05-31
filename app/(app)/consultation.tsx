import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Modal,
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

// --- CLINICAL ENDPOINT SCHEMAS ---
interface Doctor {
  id: string;
  name: string;
  specialty: string;
  rating: number;
  availability: string;
  price: string;
  rawPrice: number;
  avatarEmoji: string;
}

interface Message {
  id: string;
  sender: "user" | "doctor";
  text: string;
  time: string;
}

export default function Consultation() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { earnTokens } = useAppState();

  // Functional States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [activeChatDoctor, setActiveChatDoctor] = useState<Doctor | null>(null);

  // Modals Visibility Controllers
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [chatModalVisible, setChatModalVisible] = useState(false);

  // States handling transactional records
  const [paidDoctorIds, setPaidDoctorIds] = useState<Set<string>>(new Set());
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [typedMessage, setTypedMessage] = useState("");

  const doctors: Doctor[] = [
    {
      id: "d1",
      name: "Dr. Sarah Johnson",
      specialty: "Gynecologist",
      rating: 4.8,
      availability: "Available today",
      price: "$45",
      rawPrice: 45,
      avatarEmoji: "👩‍⚕️",
    },
    {
      id: "d2",
      name: "Dr. Priya Sharma",
      specialty: "OBGYN Expert",
      rating: 4.9,
      availability: "Tomorrow 2 PM",
      price: "$60",
      rawPrice: 60,
      avatarEmoji: "👩‍⚕️",
    },
    {
      id: "d3",
      name: "Dr. Maria Lopez",
      specialty: "Reproductive Health",
      rating: 4.7,
      availability: "Available today",
      price: "$50",
      rawPrice: 50,
      avatarEmoji: "👩‍⚕️",
    },
  ];

  const softTints = {
    pink: isDark ? "#3b1a2d" : "#fff0f6",
    purple: isDark ? "#231942" : "#f3e8ff",
    emerald: isDark ? "#062e20" : "#ecfdf5",
    orange: isDark ? "#361e12" : "#fff7ed",
  };

  const filteredDoctors = doctors.filter((doctor) =>
    [doctor.name, doctor.specialty]
      .join(" ")
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase()),
  );

  // --- WORKFLOW CONTROLLER ACTIONS ---
  function handleInitiateBooking(doctor: Doctor) {
    if (paidDoctorIds.has(doctor.id)) {
      // If consultation session already unlocked, direct pass onto conversation thread
      handleOpenChatWindow(doctor);
      return;
    }
    setSelectedDoctor(doctor);
    setPaymentModalVisible(true);
  }

  function handleProcessPayment() {
    if (!selectedDoctor) return;

    // Persisting the verified authorization transaction locally
    setPaidDoctorIds((prev) => new Set([...prev, selectedDoctor.id]));
    earnTokens(10); // Incentivize health actions

    const configuredDoctor = selectedDoctor;
    setPaymentModalVisible(false);
    setSelectedDoctor(null);

    // Deep routing switch into live telehealth environment instantly
    setTimeout(() => {
      handleOpenChatWindow(configuredDoctor);
    }, 400);
  }

  function handleOpenChatWindow(doctor: Doctor) {
    setActiveChatDoctor(doctor);
    // Setting up clear initial onboarding context greetings from the clinical specialist
    setChatMessages([
      {
        id: "m1",
        sender: "doctor",
        text: `Hello! I am ${doctor.name}. Your confidential dashboard log has been successfully shared. How can I guide your wellness milestones today?`,
        time: "Just now",
      },
    ]);
    setChatModalVisible(true);
  }

  function handleSendMessage() {
    if (!typedMessage.trim() || !activeChatDoctor) return;

    const freshMessage: Message = {
      id: `msg_${Date.now()}`,
      sender: "user",
      text: typedMessage.trim(),
      time: "Just now",
    };

    setChatMessages((prev) => [...prev, freshMessage]);
    setTypedMessage("");

    // Simulation response generation logic modeling asynchronous cloud callback actions
    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg_reply_${Date.now()}`,
          sender: "doctor",
          text: "Understood. Our logging engine is checking your cycle history trend structures to fine-tune diagnostic assessments. Please provide any related physical updates.",
          time: "Just now",
        },
      ]);
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
        {/* Navigation Action Bar */}
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
            Consultation
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
        >
          <View className="mx-6 mt-6">
            {/* Modern Clean Search Wrapper */}
            <View
              className="flex-row items-center rounded-2xl border px-4 shadow-3xs"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Feather name="search" size={16} color={colors.mutedText} />
              <TextInput
                placeholder="Find clinical specialists, OBGYNs..."
                placeholderTextColor={colors.mutedText}
                value={searchQuery}
                onChangeText={setSearchQuery}
                className="ml-3 flex-1 py-4 text-sm"
                style={{ color: colors.foreground }}
              />
            </View>

            {/* CLINICAL TELEHEALTH SPECIALISTS LIST */}
            <View className="mt-6 gap-4">
              {filteredDoctors.map((doctor) => {
                const hasSessionUnlocked = paidDoctorIds.has(doctor.id);

                return (
                  <View
                    key={doctor.id}
                    className="rounded-3xl border p-5 shadow-2xs relative overflow-hidden"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    }}
                  >
                    <View className="flex-row items-start">
                      {/* Avatar Wrapper Panel */}
                      <View className="h-14 w-14 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200/50">
                        <Text className="text-2xl">{doctor.avatarEmoji}</Text>
                      </View>

                      {/* Doctor Credentials Details column */}
                      <View className="ml-4 flex-1">
                        <Text
                          className="text-base font-extrabold tracking-tight"
                          style={{ color: colors.foreground }}
                        >
                          {doctor.name}
                        </Text>
                        <Text
                          className="text-xs font-semibold mt-0.5"
                          style={{ color: colors.mutedText }}
                        >
                          {doctor.specialty}
                        </Text>

                        {/* Badges Info Horizontal Segment */}
                        <View className="mt-2.5 flex-row items-center gap-2">
                          <View className="flex-row items-center gap-1 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md">
                            <Ionicons name="star" size={11} color="#eab308" />
                            <Text
                              className="text-[10px] font-black"
                              style={{ color: colors.foreground }}
                            >
                              {doctor.rating}
                            </Text>
                          </View>
                          <Text
                            className="text-[11px] font-semibold"
                            style={{ color: colors.mutedText }}
                          >
                            • {doctor.availability}
                          </Text>
                        </View>
                      </View>

                      {/* Price Element */}
                      <View className="items-end">
                        <Text
                          className="text-base font-black"
                          style={{ color: colors.primary }}
                        >
                          {doctor.price}
                        </Text>
                        <Text
                          className="text-[9px] font-bold tracking-wide uppercase mt-0.5"
                          style={{ color: colors.mutedText }}
                        >
                          / session
                        </Text>
                      </View>
                    </View>

                    {/* Integrated CTA Workflow Trigger */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      className="mt-5 w-full rounded-xl py-3.5 items-center justify-center shadow-3xs"
                      onPress={() => handleInitiateBooking(doctor)}
                      style={{
                        backgroundColor: hasSessionUnlocked
                          ? "#10b981"
                          : colors.primary,
                      }}
                    >
                      <Text
                        className="text-sm font-bold tracking-wide"
                        style={{ color: colors.buttonText }}
                      >
                        {hasSessionUnlocked
                          ? "Open Consultation Chat"
                          : "Book Consultation Session"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            {/* Privacy Compliance Footer Notification Footer Tag */}
            <View className="flex-row items-center justify-center gap-2 mt-8 opacity-70">
              <MaterialCommunityIcons
                name="shield-check-outline"
                size={14}
                color={colors.mutedText}
              />
              <Text
                className="text-[11px] font-semibold tracking-wide text-center"
                style={{ color: colors.mutedText }}
              >
                All consultations are fully encrypted, private & secure.
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* --- CHECKOUT MODULE LAYER 1: PAYMENT SHEET MODAL --- */}
        <Modal
          visible={paymentModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setPaymentModalVisible(false)}
        >
          <View
            className="flex-1 px-6 pt-6 justify-between pb-10"
            style={{ backgroundColor: colors.background }}
          >
            <View>
              {/* Sheet Navigation Header row */}
              <View className="flex-row justify-between items-center mb-8">
                <Text
                  className="text-xl font-black"
                  style={{ color: colors.foreground }}
                >
                  Secure Checkout
                </Text>
                <TouchableOpacity
                  onPress={() => setPaymentModalVisible(false)}
                  className="p-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full"
                >
                  <Feather name="x" size={16} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              {/* Order Transaction Context details */}
              <Text
                className="text-xs font-bold tracking-widest uppercase mb-3"
                style={{ color: colors.primary }}
              >
                Consultation Summary
              </Text>
              {selectedDoctor && (
                <View
                  className="p-5 rounded-2xl border flex-row items-center justify-between mb-6"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <View>
                    <Text
                      className="text-base font-extrabold"
                      style={{ color: colors.foreground }}
                    >
                      {selectedDoctor.name}
                    </Text>
                    <Text
                      className="text-xs font-semibold mt-0.5"
                      style={{ color: colors.mutedText }}
                    >
                      {selectedDoctor.specialty}
                    </Text>
                  </View>
                  <Text
                    className="text-lg font-black"
                    style={{ color: colors.foreground }}
                  >
                    {selectedDoctor.price}.00
                  </Text>
                </View>
              )}

              {/* Secure transactional compliance statement notification block */}
              <View
                className="p-4 rounded-xl flex-row items-start gap-3"
                style={{ backgroundColor: softTints.emerald }}
              >
                <MaterialCommunityIcons
                  name="lock-check-outline"
                  size={18}
                  color="#10b981"
                />
                <Text
                  className="text-xs leading-4 flex-1 font-medium"
                  style={{ color: colors.mutedText }}
                >
                  Telemetry channels are sandbox tokens encrypted. Completing
                  verification releases live private messaging tunnels
                  instantly.
                </Text>
              </View>
            </View>

            {/* Execute Payment Process Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleProcessPayment}
              className="w-full rounded-2xl py-4 items-center justify-center shadow-md"
              style={{ backgroundColor: colors.primary }}
            >
              <Text
                className="text-sm font-extrabold tracking-wide"
                style={{ color: colors.buttonText }}
              >
                Pay & Start Consultation
              </Text>
            </TouchableOpacity>
          </View>
        </Modal>

        {/* --- SYSTEM TELEHEALTH MODULE LAYER 2: CHAT INTERFACE OVERLAY MODAL --- */}
        <Modal
          visible={chatModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={(closeCommentsSheet) => setChatModalVisible(false)}
        >
          <View
            className="flex-1"
            style={{ backgroundColor: colors.background }}
          >
            {/* Telehealth Chat Room Navbar Header section */}
            <View
              className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-900/60 flex-row justify-between items-center"
              style={{ backgroundColor: colors.surface }}
            >
              <View className="flex-row items-center gap-3">
                <TouchableOpacity
                  onPress={() => setChatModalVisible(false)}
                  className="p-1 -ml-1"
                >
                  <Feather
                    name="chevron-down"
                    size={20}
                    color={colors.foreground}
                  />
                </TouchableOpacity>
                <View>
                  <Text
                    className="text-sm font-black"
                    style={{ color: colors.foreground }}
                  >
                    {activeChatDoctor?.name || "Clinical Support Desk"}
                  </Text>
                  <Text className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mt-0.5">
                    Secure Session Active
                  </Text>
                </View>
              </View>
              <MaterialCommunityIcons
                name="shield-account-outline"
                size={20}
                color={colors.primary}
              />
            </View>

            {/* Scrollable Conversation Stream Thread area */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              className="flex-1 px-6 pt-4"
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              <View className="gap-4">
                {chatMessages.map((msg) => {
                  const isDoctor = msg.sender === "doctor";
                  return (
                    <View
                      key={msg.id}
                      className={`max-w-[80%] p-4 rounded-2xl ${
                        isDoctor
                          ? "self-start rounded-tl-none border border-neutral-100 dark:border-neutral-800"
                          : "self-end rounded-tr-none"
                      }`}
                      style={{
                        backgroundColor: isDoctor
                          ? colors.surface
                          : colors.primary,
                      }}
                    >
                      <Text
                        className="text-xs font-medium leading-5"
                        style={{
                          color: isDoctor
                            ? colors.foreground
                            : colors.buttonText,
                        }}
                      >
                        {msg.text}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            {/* Persistent Input Row Bar */}
            <View
              className="px-4 py-3.5 border-t border-neutral-100 dark:border-neutral-900/60 flex-row items-center gap-3"
              style={{ backgroundColor: colors.surface }}
            >
              <TextInput
                placeholder="Type your encrypted response message..."
                placeholderTextColor={colors.mutedText}
                value={typedMessage}
                onChangeText={setTypedMessage}
                className="flex-1 bg-neutral-100 dark:bg-neutral-800/80 px-4 py-3 rounded-xl text-sm"
                style={{ color: colors.foreground }}
              />
              <TouchableOpacity
                disabled={!typedMessage.trim()}
                onPress={handleSendMessage}
                className="p-2.5 rounded-full items-center justify-center"
                style={{
                  backgroundColor: typedMessage.trim()
                    ? colors.primary
                    : colors.border,
                }}
              >
                <Feather
                  name="send"
                  size={15}
                  color={
                    typedMessage.trim() ? colors.buttonText : colors.mutedText
                  }
                />
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}
