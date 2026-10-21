import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BookingBar } from "../../components/consultation/BookingBar";
import { BookingCard } from "../../components/consultation/BookingCard";
import { ConsultationChatSheet } from "../../components/consultation/ConsultationChatSheet";
import { ConsultationCheckout } from "../../components/consultation/ConsultationCheckout";
import { DoctorCard } from "../../components/consultation/DoctorCard";
import { PastSessionCard } from "../../components/consultation/PastSessionCard";
import { RatePrompt } from "../../components/consultation/RatePrompt";
import { SlotPicker } from "../../components/consultation/SlotPicker";
import { DoctorProfileSheet } from "../../components/DoctorProfileSheet";
import { EmptyState } from "../../components/EmptyState";
import { JitsiCall } from "../../components/JitsiCall";
import { RateSessionSheet } from "../../components/RateSessionSheet";
import { ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import { SkeletonRow } from "../../components/Skeleton";
import { useAuth } from "../../components/auth-context";
import { useTheme } from "../../components/theme";
import { SHEET_DISMISS_MS, useConsultationBooking, useSafeTimeout } from "../../hooks/useConsultationBooking";
import { useConsultationChat } from "../../hooks/useConsultationChat";
import { useDoctorAvailability } from "../../hooks/useDoctorAvailability";
import { useRealtimeSocket } from "../../hooks/useRealtimeSocket";
import { alert } from "../../lib/alert";
import { consultationApi, getFriendlyErrorMessage, isNetworkError, type Consultation, type Doctor } from "../../lib/api";
import { formatINR } from "../../lib/consultationFormat";
import {
  chatStatusOf,
  doctorIdOf,
  doctorNameOf,
  isLive,
  liveConsultationFor,
  pastSessionsOf,
  sessionToRate,
  upcomingSessionsOf,
} from "../../lib/consultationModel";
import { setOpenVideoCall } from "../../lib/consultationPresence";
import { fetchQuery, peekQuery } from "../../lib/queryCache";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { cleanupTempFiles } from "../../lib/tempFiles";
import { Icon } from "../../components/Icon";
import { SegmentedControl } from "../../components/SegmentedControl";

// Finished sessions the user tapped "Not now" on, so the rating card moves on.
const SKIPPED_RATINGS_KEY = "period-buddy.consultation.skipped-ratings";
// Search waits for a pause in typing before asking the server.
const SEARCH_DEBOUNCE_MS = 300;
// The unfiltered doctor list paints from memory on a second visit (lib/queryCache.ts).
const DOCTORS_CACHE_KEY = "consultation:doctors";
const DOCTORS_CACHE = { staleMs: 2 * 60_000, topics: ["consultations" as const] };

export default function ConsultationScreen() {
  useSecureScreen("consultation");
  const { colors, isDark, fonts } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  // `?id=` opens that consultation's chat (push / ringing deep link);
  // `&call=1` also joins its call.
  const params = useLocalSearchParams<{ id?: string; call?: string }>();
  const schedule = useSafeTimeout();
  useEffect(() => {
    // Prescription PDFs saved on an earlier visit (lib/tempFiles.ts).
    cleanupTempFiles();
  }, []);

  /* ------------------------------- Lists ------------------------------- */

  const [doctors, setDoctors] = useState<Doctor[]>(() => peekQuery<Doctor[]>(DOCTORS_CACHE_KEY) ?? []);
  const [myConsultations, setMyConsultations] = useState<Consultation[]>([]);
  const [consultationsLoaded, setConsultationsLoaded] = useState(false);
  const [loadingDoctors, setLoadingDoctors] = useState(() => peekQuery(DOCTORS_CACHE_KEY) === undefined);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<{ message: string; offline: boolean } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // The list screen's two tabs: doctors to book (with live bookings), or past sessions.
  const [listTab, setListTab] = useState<"new" | "past">("new");

  // Only the latest doctor request may update the list, so a slow response
  // for an old search can't overwrite a newer one.
  const doctorRequestId = useRef(0);
  const loadDoctors = useCallback(async (query: string, mode: "initial" | "search" | "silent") => {
    const requestId = ++doctorRequestId.current;
    // A cached unfiltered list stays on screen (no skeleton) while it revalidates.
    if (mode === "initial" && (query || peekQuery(DOCTORS_CACHE_KEY) === undefined)) setLoadingDoctors(true);
    if (mode === "search") setSearching(true);
    try {
      const list = query
        ? await consultationApi.getDoctors(query)
        : await fetchQuery(DOCTORS_CACHE_KEY, () => consultationApi.getDoctors(), {
            ...DOCTORS_CACHE,
            // Pull-to-refresh / after rating: always ask the server.
            force: mode === "silent",
          });
      if (requestId !== doctorRequestId.current) return;
      setDoctors(list);
      setLoadError(null);
    } catch (err) {
      if (requestId !== doctorRequestId.current) return;
      const cached = query ? undefined : peekQuery<Doctor[]>(DOCTORS_CACHE_KEY);
      if (cached) {
        // A failed revalidation of the unfiltered list keeps the cached copy.
        setDoctors(cached);
        setLoadError(null);
      } else if (mode !== "silent") {
        // A background refresh keeps what's on screen.
        setLoadError({ message: getFriendlyErrorMessage(err), offline: isNetworkError(err) });
      }
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

  const upsertConsultation = useCallback((consultation: Consultation) => {
    setMyConsultations((prev) => [consultation, ...prev.filter((c) => c._id !== consultation._id)]);
  }, []);

  /* --------------------------- Doctor & times --------------------------- */

  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  // The page opens as a list of doctors; days and times show only after
  // "Available slots" (or Book again / the profile's Book), for that doctor.
  const [slotsOpen, setSlotsOpen] = useState(false);
  // Doctor whose full profile sheet is open (tapping a doctor in the list).
  const [profileDoctor, setProfileDoctor] = useState<Doctor | null>(null);
  // Finished session being rated, and the star tapped to open the sheet.
  const [rateTarget, setRateTarget] = useState<{ consultation: Consultation; stars: number } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const times = useDoctorAvailability(selectedDoctor?._id ?? null);

  // Keep the user's pick across reloads; a pick that's no longer listed is dropped.
  useEffect(() => {
    setSelectedDoctor((current) => (current ? (doctors.find((d) => d._id === current._id) ?? null) : null));
  }, [doctors]);
  useEffect(() => {
    if (!selectedDoctor) setSlotsOpen(false);
  }, [selectedDoctor]);

  const findLiveFor = useCallback((doctorId: string) => liveConsultationFor(myConsultations, doctorId), [myConsultations]);

  const showTimesFor = useCallback(
    (doctor: Doctor) => {
      setSelectedDoctor(doctor);
      // Book again lives on the Past tab; the time picker is on New.
      setListTab("new");
      setSlotsOpen(true);
    },
    [],
  );

  /* ------------------------------ Video call ------------------------------ */

  // Video call (self-hosted Jitsi, components/JitsiCall): the consultation it's
  // for, and why it ended if the session closed mid-call. Independent of the chat sheet.
  const [jitsiCall, setJitsiCall] = useState<{ id: string; peerName: string; ended?: string } | null>(null);
  useEffect(() => {
    setOpenVideoCall(jitsiCall?.id ?? null);
    return () => setOpenVideoCall(null);
  }, [jitsiCall?.id]);
  const openJitsiCall = useCallback((consultation: Consultation) => {
    setJitsiCall({ id: consultation._id, peerName: doctorNameOf(consultation) });
  }, []);
  // Re-checks the join windows every 30 s so "Join video call" turns on by itself.
  const [clock, setClock] = useState(() => Date.now());
  const hasJitsiSession = myConsultations.some((c) => isLive(c) && Boolean(c.videoCall));
  useEffect(() => {
    if (!hasJitsiSession) return;
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [hasJitsiSession]);

  /* -------------------------------- Chat -------------------------------- */

  const chat = useConsultationChat({ consultations: myConsultations, loadConsultations, callId: jitsiCall?.id ?? null });
  const { activeConsultation, activeIdRef, chatOpen, openChat, setChatEnded, refreshActiveConsultation } = chat;

  // Full reload (Retry, pull-to-refresh, after closing the chat or rating).
  const debouncedQueryRef = useRef(debouncedQuery);
  debouncedQueryRef.current = debouncedQuery;
  const reloadTimes = times.reload;
  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      await Promise.all([loadDoctors(debouncedQueryRef.current, isRefresh ? "silent" : "initial"), loadConsultations()]);
      if (isRefresh) reloadTimes();
      setRefreshing(false);
    },
    [loadDoctors, loadConsultations, reloadTimes],
  );

  // The doctor may complete the session while the chat is open: refetch on
  // close so the rating card (and the session's new status) shows up.
  const chatWasOpen = useRef(false);
  useEffect(() => {
    if (chatOpen) chatWasOpen.current = true;
    else if (chatWasOpen.current) {
      chatWasOpen.current = false;
      load(true);
    }
  }, [chatOpen, load]);

  // Personal-room events (the doctor cancels/completes while the chat is
  // closed) keep the lists current. Shares the app-wide socket.
  const personalRoom = user?._id ? `user_${user._id}` : "";
  useRealtimeSocket({
    enabled: Boolean(personalRoom),
    rooms: personalRoom ? [personalRoom] : [],
    onMessage: (data) => {
      if (data?.type !== "message" || data.room !== personalRoom) return;
      if (data.event !== "consultation_cancelled" && data.event !== "consultation_completed") return;
      // A call for this session ends with it.
      const ended =
        data.event === "consultation_cancelled"
          ? "This consultation was cancelled, so the call has ended."
          : "Your doctor has completed this consultation, so the call has ended.";
      setJitsiCall((call) => (call && call.id === data.consultationId ? { ...call, ended } : call));
      if (data.consultationId === activeIdRef.current) {
        setChatEnded(true);
        refreshActiveConsultation();
      } else {
        loadConsultations();
      }
    },
  });

  /* ------------------------------- Booking ------------------------------- */

  const reloadAfterSlotGone = useCallback(() => {
    times.setSelectedSlotStart(null);
    reloadTimes();
  }, [times, reloadTimes]);
  const bookingFlow = useConsultationBooking({
    findLiveFor,
    upsertConsultation,
    loadConsultations,
    openChat,
    onSlotGone: reloadAfterSlotGone,
    schedule,
  });

  // Deep link: open `?id=`'s chat once the consultations are loaded; with
  // `call=1` (the ringing screen / a call push) open its video call instead.
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
    if (params.call === "1" && isLive(target)) {
      // The server checks the booking and the window when the call screen asks for its token.
      setSlotsOpen(false);
      if (slotsOpen) schedule(() => openJitsiCall(target), SHEET_DISMISS_MS);
      else openJitsiCall(target);
      return;
    }
    if (chatOpen && activeIdRef.current === target._id) return;
    // iOS won't present the chat while another sheet is still open.
    const sheetOpen = Boolean(profileDoctor || rateTarget || slotsOpen);
    setProfileDoctor(null);
    setRateTarget(null);
    setSlotsOpen(false);
    if (sheetOpen) schedule(() => openChat(target), SHEET_DISMISS_MS);
    else openChat(target);
  }, [params.id, params.call, consultationsLoaded, myConsultations, chatOpen, activeIdRef, profileDoctor, rateTarget, slotsOpen, loadConsultations, openChat, openJitsiCall, router, schedule]);

  /* ------------------------------- Ratings ------------------------------- */

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

  /* ------------------------------- Derived ------------------------------- */

  const upcomingSessions = useMemo(() => upcomingSessionsOf(myConsultations), [myConsultations]);
  const pastSessions = useMemo(() => pastSessionsOf(myConsultations), [myConsultations]);
  const toRate = sessionToRate(myConsultations, skippedRatings);
  const selectedFee = selectedDoctor ? formatINR(selectedDoctor.pricePerSession) : null;
  const selectedExisting = selectedDoctor ? findLiveFor(selectedDoctor._id) : undefined;
  // The doctor of the open chat/call: the consultation's own doctor (populated
  // by the API), not whichever doctor happens to be selected in the list.
  const chatDoctor: Doctor | null =
    activeConsultation && typeof activeConsultation.doctorId === "object" ? activeConsultation.doctorId : selectedDoctor;
  const { booking } = bookingFlow;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Gynecologist" subtitle="Private video call & chat" />

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        >
          <View className="mx-6 mt-4">
            {/* New: doctors to book and live bookings. Past: finished sessions. */}
            <SegmentedControl
              segments={[
                { key: "new", label: "New" },
                { key: "past", label: pastSessions.length ? `Past (${pastSessions.length})` : "Past" },
              ]}
              value={listTab}
              onChange={setListTab}
              style={{ marginBottom: 16 }}
            />

            {listTab === "new" ? (
              <>
                <View
                  className="flex-row items-center rounded-2xl border px-4 shadow-xs"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border, height: 48 }}
                >
                  <Icon set="feather" name="search" size={16} color={colors.mutedText} />
                  <TextInput
                    placeholder="Search doctors"
                    placeholderTextColor={colors.mutedText}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    accessibilityLabel="Search specialists"
                    className="ml-3 flex-1 text-sm outline-none"
                    style={{ color: colors.foreground, fontFamily: fonts.body }}
                  />
                  {searching ? <ActivityIndicator size="small" color={colors.mutedText} style={{ marginRight: 8 }} /> : null}
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery("")} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
                      <Icon set="feather" name="x" size={16} color={colors.mutedText} />
                    </TouchableOpacity>
                  )}
                </View>

                {upcomingSessions.length > 0 && (
                  <View className="mt-6">
                    <SectionHeader title={upcomingSessions.length > 1 ? "Your bookings" : "Your booking"} />
                    <View style={{ gap: 12 }}>
                      {upcomingSessions.map((session) => (
                        <BookingCard
                          key={session._id}
                          session={session}
                          clock={clock}
                          cancelling={bookingFlow.cancellingId === session._id}
                          onOpenChat={openChat}
                          onJoinVideo={openJitsiCall}
                          onCancel={bookingFlow.confirmCancel}
                        />
                      ))}
                    </View>
                  </View>
                )}

                {toRate ? (
                  <RatePrompt
                    consultation={toRate}
                    onRate={(stars) => setRateTarget({ consultation: toRate, stars })}
                    onSkip={() => skipRating(toRate._id)}
                  />
                ) : null}

                <View className="mt-7 gap-3">
                  <SectionHeader
                    title={loadingDoctors ? "Loading specialists…" : debouncedQuery ? "Results" : "Our gynecologists"}
                    style={{ marginBottom: 0 }}
                  />
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
                      message={debouncedQuery ? "Try a different name or specialty." : "Please check back soon — our specialists will appear here."}
                    />
                  ) : (
                    doctors.map((doctor, i) => (
                      <DoctorCard
                        key={doctor._id}
                        doctor={doctor}
                        index={i}
                        selected={slotsOpen && selectedDoctor?._id === doctor._id}
                        existing={findLiveFor(doctor._id)}
                        disabled={booking}
                        onOpenProfile={setProfileDoctor}
                        onSeeTimes={showTimesFor}
                        onOpenChat={openChat}
                      />
                    ))
                  )}
                </View>

              </>
            ) : pastSessions.length === 0 ? (
              <EmptyState
                compact
                icon="calendar-blank-outline"
                title="No past bookings yet"
                message="Finished consultations show up here with their chat and prescription."
                actionLabel="Find a doctor"
                onAction={() => setListTab("new")}
              />
            ) : (
              <View className="gap-3">
                {pastSessions.map((session) => (
                  <PastSessionCard
                    key={session._id}
                    session={session}
                    listedDoctor={doctors.find((d) => d._id === doctorIdOf(session))}
                    onOpenChat={openChat}
                    onBookAgain={showTimesFor}
                  />
                ))}
              </View>
            )}

            <View className="flex-row items-center justify-center gap-2 mt-8 opacity-75">
              <Icon set="mci" name="shield-check-outline" size={14} color={colors.mutedText} />
              <Text className="text-xs font-semibold tracking-wide text-center" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                Private consultation chat for sensitive health questions.
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Day and time sheet; Continue closes it, then opens payment once it
            has dismissed (iOS won't present a second modal while one closes). */}
        <SlotPicker
          doctor={selectedDoctor && slotsOpen && !booking && !selectedExisting ? selectedDoctor : null}
          fee={selectedFee}
          availability={times.availability}
          loading={times.loading}
          error={times.error}
          slotDays={times.slotDays}
          daySlots={times.daySlots}
          selectedDayKey={times.selectedDayKey}
          selectedSlotStart={times.selectedSlotStart}
          onSelectDay={times.selectDay}
          onSelectSlot={times.setSelectedSlotStart}
          onRetry={reloadTimes}
          onClose={() => {
            setSlotsOpen(false);
            times.setSelectedSlotStart(null);
          }}
          onContinue={() => {
            const doctor = selectedDoctor;
            const slot = times.selectedSlotStart;
            setSlotsOpen(false);
            if (doctor) schedule(() => bookingFlow.bookAndPay(doctor, slot), SHEET_DISMISS_MS);
          }}
        />

        {/* Payment status bar while a booking is being paid for and confirmed. */}
        {booking && selectedDoctor && !selectedExisting && (
          <BookingBar
            fee={selectedFee}
            slotStart={times.selectedSlotStart}
            booking={booking}
            paymentNote={bookingFlow.paymentNote}
            disabled={!selectedFee || !times.selectedSlotStart || Boolean(times.error)}
            onBook={() => bookingFlow.bookAndPay(selectedDoctor, times.selectedSlotStart)}
          />
        )}

        {/* Full doctor profile — the main button books via the slot picker */}
        <DoctorProfileSheet
          doctor={profileDoctor}
          availability={profileDoctor && selectedDoctor?._id === profileDoctor._id ? times.availability : null}
          loadingAvailability={times.loading}
          hasActiveSession={Boolean(profileDoctor && findLiveFor(profileDoctor._id))}
          onClose={() => setProfileDoctor(null)}
          onPrimary={() => {
            const doctor = profileDoctor;
            setProfileDoctor(null);
            if (!doctor) return;
            const existing = findLiveFor(doctor._id);
            // Let the sheet finish closing first: iOS won't present a
            // second modal while one is still dismissing.
            schedule(() => (existing ? openChat(existing) : showTimesFor(doctor)), SHEET_DISMISS_MS);
          }}
        />

        <RateSessionSheet
          consultation={rateTarget?.consultation ?? null}
          initialRating={rateTarget?.stars ?? 0}
          doctorName={rateTarget ? doctorNameOf(rateTarget.consultation) : "your doctor"}
          onClose={() => setRateTarget(null)}
          onRated={(updated) => {
            setRateTarget(null);
            setMyConsultations((list) => list.map((c) => (c._id === updated._id ? { ...c, ...updated } : c)));
            alert("Thank you!", "Your rating has been shared.");
            load(true); // the doctor's average changed
          }}
        />

        <ConsultationChatSheet
          visible={chatOpen}
          consultation={activeConsultation}
          doctor={chatDoctor}
          status={chatStatusOf(activeConsultation, chat.chatEnded)}
          live={chat.chatLive}
          socketState={chat.socketState}
          messages={chat.messages}
          loading={chat.loadingMessages}
          error={chat.messagesError}
          sending={chat.sending}
          onClose={chat.closeChat}
          onSend={chat.sendMessage}
          onRetryMessage={chat.retryMessage}
          onRetryLoad={chat.retryLoadMessages}
          onStartVideo={() => activeConsultation && openJitsiCall(activeConsultation)}
        />

        {/* Video consultation on the self-hosted Jitsi server (full-screen Modal, floats above the chat). */}
        {jitsiCall && (
          <JitsiCall
            visible
            callKey={jitsiCall.id}
            peerName={jitsiCall.peerName}
            fetchJoin={() => consultationApi.joinVideo(jitsiCall.id)}
            onAttendance={(event) => consultationApi.reportVideoAttendance(jitsiCall.id, event).catch(() => undefined)}
            endedMessage={jitsiCall.ended ?? null}
            chat={
              activeConsultation?._id === jitsiCall.id
                ? {
                    messages: chat.messages.map((m, i) => ({
                      id: m._id ?? m.localId ?? `m${i}`,
                      mine: m.sender === "user",
                      text: m.text || (m.attachmentUrl ? "Shared a file. Open it in the chat after the call." : ""),
                      sentAt: m.sentAt,
                      failed: m.failed,
                    })),
                    onSend: (text) => {
                      chat.sendMessage(text);
                    },
                    canSend: chat.chatLive,
                    sending: chat.sending,
                    loading: chat.loadingMessages,
                  }
                : undefined
            }
            onClose={() => {
              setJitsiCall(null);
              // Joining moves a paid booking to active on the server.
              loadConsultations();
            }}
          />
        )}

        <ConsultationCheckout
          order={bookingFlow.checkoutOrder}
          hosted={bookingFlow.useHostedCheckout}
          title={selectedDoctor ? `Consultation with ${selectedDoctor.name}` : "Doctor consultation"}
          onVerify={bookingFlow.verifyUpiOnce}
          onUpiOutcome={bookingFlow.handleUpiOutcome}
          onUseOtherMethod={() => bookingFlow.setUseHostedCheckout(true)}
          onHostedResult={bookingFlow.handleCheckoutResult}
        />
      </SafeAreaView>
    </>
  );
}
