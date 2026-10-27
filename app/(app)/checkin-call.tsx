import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonBlock } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getHeroGradient, getShadow } from "../../components/ui-tokens";
import { useAuth } from "../../components/auth-context";
import { haptics } from "../../lib/haptics";
import { showErrorToast, showToast } from "../../lib/toast";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import {
  ApiError,
  authApi,
  getFriendlyErrorMessage,
  isFeatureLockedError,
  voiceAgentApi,
  type CheckinCallMode,
  type CheckinCallRecord,
  type CheckinCallSchedule,
} from "../../lib/api";
import { isPlausiblePhone, normalizePhone } from "../../lib/onboarding";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Button";
import { SegmentedControl } from "../../components/SegmentedControl";
import { GradientCard } from "../../components/GradientCard";
import { Chip } from "../../components/Chip";
import { PressableScale } from "../../components/PressableScale";

const DAY_OFFSET_MIN = -5;
const DAY_OFFSET_MAX = 5;
const TIME_STEP_MINUTES = 15;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatTimeOfDay(minutes: number) {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function toTimeString(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseTimeString(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** "Today, 8:00 PM" / "Tomorrow, 8:00 PM" / "Tue 30 Sep, 8:00 PM" in local time. */
function formatWhen(iso: string) {
  const date = new Date(iso);
  const time = formatTimeOfDay(date.getHours() * 60 + date.getMinutes());
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days === -1) return `Yesterday, ${time}`;
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}, ${time}`;
}

function formatDuration(seconds?: number) {
  if (!seconds || seconds < 1) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

type Tone = "good" | "warn" | "muted" | "info";
type CallLook = { icon: string; label: string; tone: Tone; detail?: string };

/** Why a call failed, in plain words. */
function failureLook(call: CheckinCallRecord): CallLook {
  if (call.failureKind === "no_phone") {
    return { icon: "call-outline", label: "No phone number", tone: "warn", detail: "Add your number so Buddy can call you." };
  }
  if (call.failureKind === "not_configured") {
    return { icon: "settings-outline", label: "Calls are paused", tone: "warn", detail: "Calling is down on our side. We'll try again next time." };
  }
  return { icon: "alert-circle-outline", label: "Call didn't go through", tone: "warn", detail: "Our phone line had a problem. Buddy will call at the next time." };
}

function describeCall(call: CheckinCallRecord): CallLook {
  if (!call.outcome) {
    return call.status === "failed" ? failureLook(call) : { icon: "call-outline", label: "Calling you…", tone: "info" };
  }
  if (call.outcome === "failed") return failureLook(call);
  switch (call.outcome) {
    case "completed":
      return call.loggedFields?.length
        ? { icon: "checkmark-circle", label: "Check-in saved", tone: "good" }
        : { icon: "chatbubble-ellipses-outline", label: "Talked with Buddy", tone: "good" };
    case "callback":
      return { icon: "time-outline", label: "Call back requested", tone: "muted" };
    case "no_answer":
      return { icon: "call-outline", label: "Missed call", tone: "warn" };
    case "declined":
      return { icon: "remove-circle-outline", label: "Skipped that day", tone: "muted" };
    case "opted_out":
      return { icon: "notifications-off-outline", label: "You asked to stop calls", tone: "muted" };
    case "wrong_person":
      return { icon: "person-outline", label: "Someone else answered", tone: "muted" };
    case "dropped":
    default:
      return { icon: "call-outline", label: "Call ended early", tone: "muted" };
  }
}

/** Quick picks for the call time; the stepper fine-tunes in 15-minute steps. */
const TIME_PRESETS = [
  { label: "Morning", minutes: 9 * 60, icon: "sunny-outline" },
  { label: "Afternoon", minutes: 13 * 60, icon: "sunny-outline" },
  { label: "Evening", minutes: 19 * 60, icon: "moon-outline" },
] as const;

function dayChipLabel(offset: number) {
  if (offset === 0) return "First day";
  if (offset === -1) return "Day before";
  if (offset < 0) return `${-offset} days before`;
  return `Day ${offset + 1}`;
}

type ScheduleValues = { mode: CheckinCallMode; dayOffset: number; timeMinutes: number };

/**
 * Check-in calls: Buddy (Sarvam's Instant Outbound voice agent) phones the
 * user around their period and logs the day hands-free. The screen is the
 * on/off switch, the number calls go to, when they come (every period day or
 * once a cycle, and the time), and the recent calls. Changes to an active
 * schedule save themselves. The calls, retries after a missed call and
 * callbacks all run server-side (period-buddy-be's
 * utils/checkinCallScheduler.js); this screen only reads and writes the
 * preference.
 */
export default function CheckinCallScreen() {
  useSecureScreen("checkin-call");
  const { colors, isDark, fonts } = useTheme();
  const { user, updateUser } = useAuth();

  const [phone, setPhone] = useState(user?.phone ?? "");
  const [phoneInvalid, setPhoneInvalid] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const phoneSaveRef = useRef<{ value: string; promise: Promise<boolean> } | null>(null);

  const [scheduleLoading, setScheduleLoading] = useState(true);
  // false only when this user has no CycleSettings yet: calls are anchored
  // to the predicted period, so they need cycle tracking first.
  const [scheduleAvailable, setScheduleAvailable] = useState(true);
  // Couldn't load the saved schedule: say so instead of showing defaults
  // (an "on" schedule would otherwise look off and could be saved over).
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [mode, setMode] = useState<CheckinCallMode>("period_daily");
  const [dayOffset, setDayOffset] = useState(0);
  const [timeMinutes, setTimeMinutes] = useState(19 * 60); // default 7:00 PM
  const [schedule, setSchedule] = useState<CheckinCallSchedule | null>(null);
  const [isTogglingSchedule, setIsTogglingSchedule] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [history, setHistory] = useState<CheckinCallRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const { hasAccess, isLoading: subscriptionLoading, refresh: refreshSubscriptionAccess } =
    useSubscriptionAccess();

  // This whole screen is the premium feature: show the paywall as soon as
  // it's clear the user can't use it, not after they've set everything up.
  useEffect(() => {
    if (!subscriptionLoading && !hasAccess("voice_checkin_calls")) {
      setPaywallVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionLoading]);

  const applySchedule = useCallback((next: CheckinCallSchedule) => {
    setSchedule(next);
    setScheduleEnabled(next.enabled);
    setDayOffset(next.dayOffset ?? 0);
    if (next.time) setTimeMinutes(parseTimeString(next.time));
    // A schedule that was never switched on starts on "every period day";
    // an existing one keeps what the user picked.
    setMode(next.enabled || next.time ? next.mode ?? "once" : "period_daily");
  }, []);

  const loadAll = useCallback(async () => {
    const [scheduleResult, historyResult] = await Promise.allSettled([
      voiceAgentApi.getCheckinCallSchedule(),
      voiceAgentApi.getCheckinCallHistory(5),
    ]);
    if (scheduleResult.status === "fulfilled") {
      applySchedule(scheduleResult.value);
      setScheduleError(null);
    } else if (
      scheduleResult.reason instanceof ApiError &&
      scheduleResult.reason.kind === "notFound"
    ) {
      setScheduleAvailable(false);
      setScheduleError(null);
    } else {
      setScheduleError(getFriendlyErrorMessage(scheduleResult.reason));
    }
    if (historyResult.status === "fulfilled") setHistory(historyResult.value.calls);
  }, [applySchedule]);

  useEffect(() => {
    let cancelled = false;
    loadAll().finally(() => {
      if (!cancelled) setScheduleLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }

  // The backend always calls the number on the user's profile, so the field
  // saves itself when the user leaves it (or before turning calls on).
  // Tapping the switch also blurs the field, so both callers can arrive at
  // once: they share one save instead of sending two updates (and two toasts).
  function savePhoneIfChanged(): Promise<boolean> {
    const next = normalizePhone(phone);
    const pending = phoneSaveRef.current;
    if (pending && pending.value === next) return pending.promise;
    const promise = persistPhone(next).finally(() => {
      if (phoneSaveRef.current?.promise === promise) phoneSaveRef.current = null;
    });
    phoneSaveRef.current = { value: next, promise };
    return promise;
  }

  async function persistPhone(next: string): Promise<boolean> {
    if (next === normalizePhone(user?.phone ?? "")) {
      setPhoneInvalid(false);
      return true;
    }
    if (!next && scheduleEnabled) {
      setPhone(user?.phone ?? "");
      showErrorToast("Turn off check-in calls before removing your number.", "Number needed");
      return false;
    }
    if (!isPlausiblePhone(next)) {
      setPhoneInvalid(true);
      showErrorToast("Enter a 10-digit mobile number.", "Check your number");
      return false;
    }
    setPhoneInvalid(false);
    setIsSavingPhone(true);
    try {
      updateUser(await authApi.updateProfile({ phone: next }));
      return true;
    } catch (err) {
      showErrorToast(getFriendlyErrorMessage(err), "Couldn't save your number");
      return false;
    } finally {
      setIsSavingPhone(false);
    }
  }

  // Edits to an active schedule save themselves, a moment after the last
  // tap. Only the newest save may write its answer back into the controls.
  const saveSeq = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValues = useRef<ScheduleValues | null>(null);
  const savedFlash = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendSchedule = useCallback(
    (enabled: boolean, values: ScheduleValues) =>
      voiceAgentApi.saveCheckinCallSchedule({
        enabled,
        mode: values.mode,
        dayOffset: values.dayOffset,
        time: toTimeString(values.timeMinutes),
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      }),
    [],
  );

  const flushScheduleEdit = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const values = pendingValues.current;
    if (!values) return;
    pendingValues.current = null;
    const seq = ++saveSeq.current;
    setSaveState("saving");
    try {
      const result = await sendSchedule(true, values);
      if (seq !== saveSeq.current) return;
      setSchedule(result);
      setSaveState("saved");
      if (savedFlash.current) clearTimeout(savedFlash.current);
      savedFlash.current = setTimeout(() => setSaveState("idle"), 2000);
    } catch (err) {
      if (seq !== saveSeq.current) return;
      setSaveState("idle");
      if (isFeatureLockedError(err)) setPaywallVisible(true);
      else showErrorToast(getFriendlyErrorMessage(err), "Couldn't save your call time");
      loadAll();
    }
  }, [sendSchedule, loadAll]);

  // Leaving the screen right after a change still saves it.
  useEffect(
    () => () => {
      if (savedFlash.current) clearTimeout(savedFlash.current);
      if (pendingValues.current) flushScheduleEdit();
    },
    [flushScheduleEdit],
  );

  function editSchedule(patch: Partial<ScheduleValues>) {
    const values = { mode, dayOffset, timeMinutes, ...patch };
    setMode(values.mode);
    setDayOffset(values.dayOffset);
    setTimeMinutes(values.timeMinutes);
    haptics.select();
    pendingValues.current = values;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushScheduleEdit, 700);
  }

  async function toggleSchedule(nextEnabled: boolean) {
    if (nextEnabled && !hasAccess("voice_checkin_calls")) {
      setPaywallVisible(true);
      return;
    }
    if (nextEnabled && !phone.trim()) {
      setPhoneInvalid(true);
      showErrorToast("Add the number Buddy should call first.", "Number needed");
      return;
    }
    if (nextEnabled && !(await savePhoneIfChanged())) return;
    // Any queued edit is folded into this save.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pendingValues.current = null;
    const seq = ++saveSeq.current;
    setScheduleEnabled(nextEnabled);
    setIsTogglingSchedule(true);
    try {
      const result = await sendSchedule(nextEnabled, { mode, dayOffset, timeMinutes });
      if (seq !== saveSeq.current) return;
      applySchedule(result);
      if (result.enabled) {
        haptics.success();
        showToast(result.nextCallAt ? `Your first call: ${formatWhen(result.nextCallAt)}.` : "Buddy will call when your period is near.", {
          variant: "success",
        });
      } else {
        showToast("Check-in calls are off.");
      }
    } catch (err) {
      if (seq !== saveSeq.current) return;
      setScheduleEnabled(!nextEnabled);
      if (isFeatureLockedError(err)) setPaywallVisible(true);
      else {
        haptics.error();
        showErrorToast(getFriendlyErrorMessage(err), nextEnabled ? "Couldn't turn on calls" : "Couldn't turn off calls");
      }
    } finally {
      if (seq === saveSeq.current) setIsTogglingSchedule(false);
    }
  }

  const dayListRef = useRef<ScrollView>(null);
  const dayListPlaced = useRef(false);

  const periodLength = schedule?.periodLength ?? 5;
  const ready = !scheduleLoading && !scheduleError && scheduleAvailable;
  const toneColor = (tone: Tone) =>
    tone === "good" ? colors.success : tone === "warn" ? colors.warning : tone === "info" ? colors.sky : colors.mutedText;
  const toneBg = (tone: Tone) =>
    tone === "good" ? colors.successLight : tone === "warn" ? colors.warningLight : tone === "info" ? colors.skyLight : colors.surfaceSoft;

  const cardStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
    borderCurve: "continuous" as const,
    ...getShadow(colors, isDark),
  };
  const heading = { fontSize: 16, fontWeight: "800" as const, color: colors.foreground, fontFamily: fonts.heading };
  const label = { fontSize: 13, fontWeight: "700" as const, color: colors.mutedText, fontFamily: fonts.body };
  const helper = { fontSize: 13, color: colors.mutedText, fontFamily: fonts.body, lineHeight: 18 };

  // One line on the hero: what happens next, or what went wrong last.
  const last = schedule?.lastCall ?? history[0] ?? null;
  const lastAge = last ? Date.now() - new Date(last.createdAt).getTime() : Infinity;
  const ringing = !!last && !last.outcome && (last.status === "dialing" || last.status === "requested") && lastAge < 10 * 60_000;
  const lastFailed = !!last && (last.status === "failed" || last.outcome === "failed") && lastAge < 24 * 3600_000;
  const heroLine = ringing
    ? { icon: "call-outline", text: "Buddy is calling you now" }
    : scheduleEnabled && lastFailed
      ? { icon: "alert-circle-outline", text: describeCall(last!).label }
      : scheduleEnabled && schedule?.nextCallAt
        ? { icon: "calendar-outline", text: `Next call · ${formatWhen(schedule.nextCallAt)}` }
        : scheduleEnabled
          ? { icon: "calendar-outline", text: "Buddy will call when your period is near" }
          : null;

  const steps = [
    { icon: "call-outline", text: "Buddy rings at the time you pick" },
    { icon: "chatbubble-ellipses-outline", text: "Tell it how you feel, in your words" },
    { icon: "checkmark-circle", text: "Your day is saved to the tracker" },
  ];

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Check-in calls" />

        <KeyboardAwareScrollView
          bottomOffset={24}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 48, gap: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {/* Hero: what this is, and where it stands */}
          <GradientCard colors={getHeroGradient(colors, isDark)}>
            <View style={{ padding: 22, gap: 14 }}>
              <View className="flex-row items-center justify-between">
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
                  <Icon set="ion" name="call-outline" size={24} color="#FFFFFF" />
                </View>
                {ready ? (
                  <View
                    className="flex-row items-center rounded-full px-3 py-1.5"
                    style={{ backgroundColor: scheduleEnabled ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.18)", gap: 6 }}
                  >
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: scheduleEnabled ? colors.success : "rgba(255,255,255,0.7)" }} />
                    <Text style={{ fontSize: 12.5, fontWeight: "800", color: scheduleEnabled ? colors.success : "#FFFFFF", fontFamily: fonts.body }}>
                      {scheduleEnabled ? "On" : "Off"}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View>
                <Text style={{ fontSize: 22, fontWeight: "800", color: "#FFFFFF", fontFamily: fonts.heading, letterSpacing: -0.4 }}>
                  Let Buddy check in on you
                </Text>
                <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.88)", fontFamily: fonts.body, lineHeight: 20, marginTop: 4 }}>
                  {`A call of up to ${schedule?.limits?.maxCallMinutes ?? 5} minutes on your period days. Just talk, Buddy logs it.`}
                </Text>
              </View>
              {heroLine ? (
                <View accessibilityLiveRegion="polite" className="flex-row items-center rounded-2xl px-3.5 py-3" style={{ backgroundColor: "rgba(255,255,255,0.16)", gap: 10 }}>
                  <Icon set="ion" name={heroLine.icon} size={18} color="#FFFFFF" />
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: "#FFFFFF", fontFamily: fonts.body }}>{heroLine.text}</Text>
                </View>
              ) : null}
            </View>
          </GradientCard>

          {/* Loading / can't load / not set up */}
          {scheduleLoading ? (
            <View style={{ ...cardStyle, padding: 20, gap: 14 }}>
              <SkeletonBlock width="55%" height={18} />
              <SkeletonBlock height={52} radius={16} />
              <SkeletonBlock height={44} radius={22} />
            </View>
          ) : scheduleError ? (
            <View style={{ ...cardStyle, padding: 20, gap: 12, alignItems: "flex-start" }}>
              <Text style={heading}>{"Couldn't load your calls"}</Text>
              <Text style={helper}>{scheduleError}</Text>
              <Button
                label="Try again"
                icon="refresh"
                size="sm"
                variant="secondary"
                onPress={() => {
                  setScheduleLoading(true);
                  loadAll().finally(() => setScheduleLoading(false));
                }}
              />
            </View>
          ) : !scheduleAvailable ? (
            <View style={{ ...cardStyle, padding: 20, gap: 12, alignItems: "flex-start" }}>
              <Text style={heading}>Set up your cycle first</Text>
              <Text style={helper}>Buddy calls around your period, so it needs to know when that is.</Text>
              <Button label="Open tracker" size="sm" variant="tonal" onPress={() => router.push("/(app)/(dashboard)/tracker")} />
            </View>
          ) : (
            <>
              {/* How it works, until calls are on */}
              {!scheduleEnabled ? (
                <View style={{ ...cardStyle, padding: 20, gap: 14 }}>
                  <Text style={heading}>How it works</Text>
                  {steps.map((step, i) => (
                    <View key={step.text} className="flex-row items-center" style={{ gap: 12 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 12, borderCurve: "continuous", backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 14, fontWeight: "800", color: colors.primaryDark, fontFamily: fonts.body }}>{i + 1}</Text>
                      </View>
                      <Text style={{ flex: 1, fontSize: 14.5, color: colors.foreground, fontFamily: fonts.body, fontWeight: "600" }}>{step.text}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Settings */}
              <View style={{ ...cardStyle, padding: 20, gap: 18 }}>
                <View className="flex-row items-center" style={{ gap: 12 }}>
                  <View className="flex-1">
                    <Text style={heading}>Check-in calls</Text>
                    <Text style={[helper, { marginTop: 2 }]}>{scheduleEnabled ? "Buddy will call you" : "Turn on to get your first call"}</Text>
                  </View>
                  {isTogglingSchedule ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                  <Switch
                    accessibilityLabel="Check-in calls"
                    value={scheduleEnabled}
                    onValueChange={toggleSchedule}
                    disabled={isTogglingSchedule}
                    trackColor={{ true: colors.primary, false: colors.border }}
                    thumbColor={colors.buttonText}
                    {...({ activeThumbColor: colors.buttonText } as object)}
                  />
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={label}>Calls go to</Text>
                  <View
                    className="flex-row items-center rounded-2xl px-4 h-14"
                    style={{
                      backgroundColor: colors.input,
                      borderColor: phoneInvalid ? colors.danger : isFocused ? colors.primary : colors.border,
                      borderWidth: isFocused || phoneInvalid ? 1.5 : 1,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body }}>+91</Text>
                    <View style={{ width: 1, height: 22, backgroundColor: colors.border, marginHorizontal: 12 }} />
                    <TextInput
                      accessibilityLabel="Phone number Buddy calls"
                      autoComplete="tel"
                      editable={!isSavingPhone}
                      keyboardType="phone-pad"
                      maxLength={14}
                      onChangeText={(t) => {
                        setPhone(t);
                        if (phoneInvalid) setPhoneInvalid(false);
                      }}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => {
                        setIsFocused(false);
                        savePhoneIfChanged();
                      }}
                      placeholder="98765 43210"
                      placeholderTextColor={colors.mutedText}
                      returnKeyType="done"
                      className="flex-1 outline-none"
                      style={{ color: colors.foreground, fontSize: 16, fontWeight: "600", fontFamily: fonts.body }}
                      textContentType="telephoneNumber"
                      value={phone}
                    />
                    {isSavingPhone ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                  </View>
                </View>

                {scheduleEnabled ? (
                  <>
                    <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: -20 }} />
                    <View className="flex-row items-center justify-between">
                      <Text style={heading}>When Buddy calls</Text>
                      {saveState !== "idle" ? (
                        <View className="flex-row items-center" style={{ gap: 4 }}>
                          {saveState === "saving" ? (
                            <ActivityIndicator size="small" color={colors.mutedText} />
                          ) : (
                            <Icon set="ion" name="checkmark" size={15} color={colors.success} />
                          )}
                          <Text style={{ fontSize: 13, fontWeight: "700", color: saveState === "saved" ? colors.success : colors.mutedText, fontFamily: fonts.body }}>
                            {saveState === "saving" ? "Saving" : "Saved"}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={{ gap: 8 }}>
                      <Text style={label}>How often</Text>
                      <SegmentedControl
                        segments={[
                          { key: "period_daily", label: "Every period day" },
                          { key: "once", label: "Once a cycle" },
                        ]}
                        value={mode}
                        onChange={(next) => editSchedule({ mode: next as CheckinCallMode })}
                      />
                      <Text style={helper}>
                        {mode === "period_daily"
                          ? `One call on each of your ${periodLength} period days.`
                          : "One call each cycle, on the day you pick."}
                      </Text>
                    </View>

                    {mode === "once" ? (
                      <View style={{ gap: 8 }}>
                        <Text style={label}>Which day</Text>
                        <ScrollView
                          ref={dayListRef}
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 8, paddingVertical: 8, paddingRight: 8 }}
                          style={{ marginHorizontal: -20, marginVertical: -8 }}
                        >
                          <View style={{ width: 12 }} />
                          {Array.from({ length: DAY_OFFSET_MAX - DAY_OFFSET_MIN + 1 }, (_, i) => DAY_OFFSET_MIN + i).map((offset) => (
                            <View
                              key={offset}
                              onLayout={(e) => {
                                // Open with the picked day in view.
                                if (offset === dayOffset && !dayListPlaced.current) {
                                  dayListPlaced.current = true;
                                  dayListRef.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - 80), animated: false });
                                }
                              }}
                            >
                              <Chip
                                label={dayChipLabel(offset)}
                                selected={dayOffset === offset}
                                accessibilityRole="radio"
                                onPress={() => editSchedule({ dayOffset: offset })}
                              />
                            </View>
                          ))}
                          <View style={{ width: 12 }} />
                        </ScrollView>
                      </View>
                    ) : null}

                    <View style={{ gap: 10 }}>
                      <Text style={label}>Time</Text>
                      <View className="flex-row" style={{ gap: 8 }}>
                        {TIME_PRESETS.map((p) => {
                          const on = timeMinutes === p.minutes;
                          return (
                            <PressableScale
                              key={p.label}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: on }}
                              accessibilityLabel={`${p.label}, ${formatTimeOfDay(p.minutes)}`}
                              onPress={() => editSchedule({ timeMinutes: p.minutes })}
                              style={{
                                flex: 1,
                                borderRadius: 16,
                                borderCurve: "continuous",
                                paddingVertical: 10,
                                alignItems: "center",
                                gap: 2,
                                backgroundColor: on ? colors.primaryLight : colors.input,
                                borderWidth: on ? 1.5 : 1,
                                borderColor: on ? colors.primary : colors.border,
                              }}
                            >
                              <Icon set="ion" name={p.icon} size={18} color={on ? colors.primaryDark : colors.mutedText} />
                              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontSize: 13, fontWeight: "800", color: on ? colors.primaryDark : colors.foreground, fontFamily: fonts.body }}>
                                {p.label}
                              </Text>
                              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontSize: 12, color: on ? colors.primaryDark : colors.mutedText, fontFamily: fonts.body }}>
                                {formatTimeOfDay(p.minutes)}
                              </Text>
                            </PressableScale>
                          );
                        })}
                      </View>
                      <View className="flex-row items-center justify-between rounded-2xl px-2 py-2" style={{ backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border }}>
                        <StepButton icon="remove" label="15 minutes earlier" onPress={() => editSchedule({ timeMinutes: (timeMinutes - TIME_STEP_MINUTES + 1440) % 1440 })} />
                        <Text accessibilityLiveRegion="polite" style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading, fontVariant: ["tabular-nums"], letterSpacing: -0.3 }}>
                          {formatTimeOfDay(timeMinutes)}
                        </Text>
                        <StepButton icon="add" label="15 minutes later" onPress={() => editSchedule({ timeMinutes: (timeMinutes + TIME_STEP_MINUTES) % 1440 })} />
                      </View>
                    </View>

                    <View className="flex-row rounded-2xl px-3.5 py-3" style={{ backgroundColor: colors.surfaceSoft, gap: 10 }}>
                      <Icon set="ion" name="repeat-outline" size={18} color={colors.mutedText} />
                      <Text style={[helper, { flex: 1 }]}>Missed a call? Buddy tries twice more, never after 9:30 PM.</Text>
                    </View>
                  </>
                ) : null}
              </View>
            </>
          )}

          {/* Recent calls */}
          {history.length > 0 ? (
            <View style={{ ...cardStyle, paddingVertical: 8 }}>
              <Text style={[heading, { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 }]}>Recent calls</Text>
              {history.map((call, i) => {
                const look = describeCall(call);
                const duration = formatDuration(call.durationSeconds);
                const meta = [formatWhen(call.createdAt), duration].filter(Boolean).join(" · ");
                return (
                  <View key={call._id}>
                    {i > 0 ? <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 76 }} /> : null}
                    <View className="flex-row" style={{ paddingHorizontal: 20, paddingVertical: 12, gap: 14 }}>
                      <View style={{ width: 42, height: 42, borderRadius: 14, borderCurve: "continuous", backgroundColor: toneBg(look.tone), alignItems: "center", justifyContent: "center" }}>
                        <Icon set="ion" name={look.icon} size={20} color={toneColor(look.tone)} />
                      </View>
                      <View className="flex-1" style={{ gap: 2 }}>
                        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                          {look.label}
                        </Text>
                        <Text style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>{meta}</Text>
                        {call.summary ? (
                          <Text numberOfLines={3} style={{ fontSize: 13.5, color: colors.foreground, fontFamily: fonts.body, lineHeight: 19, marginTop: 4 }}>
                            {call.summary}
                          </Text>
                        ) : look.detail ? (
                          <Text style={[helper, { marginTop: 2 }]}>{look.detail}</Text>
                        ) : null}
                        {call.retryAt ? (
                          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.sky, fontFamily: fonts.body, marginTop: 2 }}>
                            {`Trying again ${formatWhen(call.retryAt).replace(/^(Today|Tomorrow|Yesterday)/, (w) => w.toLowerCase())}`}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })}
              <Text style={[helper, { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }]}>
                What you share is saved in your tracker, where you can change it.
              </Text>
            </View>
          ) : null}
        </KeyboardAwareScrollView>
      </SafeAreaView>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        featureKey="voice_checkin_calls"
        onUnlocked={refreshSubscriptionAccess}
      />
    </>
  );
}

/** Round − / + for the call time. */
function StepButton({ icon, label, onPress }: { icon: "add" | "remove"; label: string; onPress: () => void }) {
  const { colors, isDark } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", ...getShadow(colors, isDark) }}
    >
      <Icon set="ion" name={icon} size={20} color={colors.primary} />
    </PressableScale>
  );
}
