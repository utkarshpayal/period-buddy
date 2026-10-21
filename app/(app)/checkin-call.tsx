import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonBlock } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { useAuth } from "../../components/auth-context";
import { alert } from "../../lib/alert";
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

const DAY_OFFSET_MIN = -5;
const DAY_OFFSET_MAX = 5;
const TIME_STEP_MINUTES = 15;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDayOffset(offset: number) {
  if (offset === 0) return "On period day";
  const n = Math.abs(offset);
  return offset < 0 ? `${n} day${n > 1 ? "s" : ""} before` : `${n} day${n > 1 ? "s" : ""} after`;
}

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

type OutcomeStyle = { icon: keyof typeof Ionicons.glyphMap; label: string; tone: "good" | "warn" | "muted" };

function describeCall(call: CheckinCallRecord): OutcomeStyle {
  if (!call.outcome) {
    return call.status === "failed"
      ? { icon: "alert-circle-outline", label: "Couldn't connect", tone: "warn" }
      : { icon: "call-outline", label: "Calling…", tone: "muted" };
  }
  switch (call.outcome) {
    case "completed":
      return call.loggedFields?.length
        ? { icon: "checkmark-circle", label: "Check-in saved", tone: "good" }
        : { icon: "chatbubble-ellipses-outline", label: "Talked with Buddy", tone: "good" };
    case "callback":
      return { icon: "time-outline", label: "Call back requested", tone: "muted" };
    case "no_answer":
      return { icon: "call-outline", label: "Missed call", tone: "warn" };
    case "failed":
      return { icon: "alert-circle-outline", label: "Couldn't connect", tone: "warn" };
    case "declined":
      return { icon: "remove-circle-outline", label: "Skipped today", tone: "muted" };
    case "opted_out":
      return { icon: "notifications-off-outline", label: "Calls turned off", tone: "muted" };
    case "wrong_person":
      return { icon: "person-outline", label: "Someone else answered", tone: "muted" };
    case "dropped":
    default:
      return { icon: "call-outline", label: "Call ended early", tone: "muted" };
  }
}

/**
 * Automatic cycle check-in calls — Buddy (Sarvam's Instant Outbound voice
 * agent) phones the user and logs the day hands-free. Hosts the phone number
 * those calls go to, the recurring schedule (every period day, or once a
 * cycle) and the recent call history. There's no on-demand "call me now"
 * button any more; the backend endpoint still exists for older builds. The automatic calls, retries
 * after a missed call and callbacks all run server-side
 * (period-buddy-be's utils/checkinCallScheduler.js); this screen only reads
 * and writes the preference.
 */
export default function CheckinCallScreen() {
  useSecureScreen("checkin-call");
  const { colors, isDark, fonts } = useTheme();
  const { user, updateUser } = useAuth();

  const [phone, setPhone] = useState(user?.phone ?? "");
  const [isFocused, setIsFocused] = useState(false);
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const phoneSaveRef = useRef<{ value: string; promise: Promise<boolean> } | null>(null);

  const [scheduleLoading, setScheduleLoading] = useState(true);
  // false only when this user has no CycleSettings yet — scheduling needs a
  // predicted period date to anchor to, so it can't be configured until
  // they've set up cycle tracking.
  const [scheduleAvailable, setScheduleAvailable] = useState(true);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [mode, setMode] = useState<CheckinCallMode>("period_daily");
  const [dayOffset, setDayOffset] = useState(0);
  const [timeMinutes, setTimeMinutes] = useState(19 * 60); // default 7:00 PM
  const [schedule, setSchedule] = useState<CheckinCallSchedule | null>(null);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [history, setHistory] = useState<CheckinCallRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const { hasAccess, isLoading: subscriptionLoading, refresh: refreshSubscriptionAccess } =
    useSubscriptionAccess();

  // This whole screen is the premium feature — show the paywall as soon as
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
    } else if (
      scheduleResult.reason instanceof ApiError &&
      scheduleResult.reason.kind === "notFound"
    ) {
      setScheduleAvailable(false);
    }
    // Any other error: leave the defaults — the save button still works
    // and will surface its own error if something's actually wrong.
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
  // once: they share one save instead of sending two updates (and two alerts).
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
    if (next === normalizePhone(user?.phone ?? "")) return true;
    if (!next && scheduleEnabled) {
      setPhone(user?.phone ?? "");
      alert("Number needed", "Turn off auto check-in calls before removing your number.");
      return false;
    }
    if (!isPlausiblePhone(next)) {
      alert("Check your number", "Enter a 10-digit mobile number.");
      return false;
    }
    setIsSavingPhone(true);
    try {
      updateUser(await authApi.updateProfile({ phone: next }));
      return true;
    } catch (err) {
      alert("Couldn't save your number", getFriendlyErrorMessage(err));
      return false;
    } finally {
      setIsSavingPhone(false);
    }
  }

  async function saveSchedule(nextEnabled: boolean) {
    if (nextEnabled && !hasAccess("voice_checkin_calls")) {
      setScheduleEnabled(false);
      setPaywallVisible(true);
      return;
    }
    if (nextEnabled && !phone.trim()) {
      setScheduleEnabled(false);
      alert("Add your number first", "Buddy needs a number to call you on.");
      return;
    }
    if (nextEnabled && !(await savePhoneIfChanged())) {
      setScheduleEnabled(false);
      return;
    }
    setIsSavingSchedule(true);
    try {
      const result = await voiceAgentApi.saveCheckinCallSchedule({
        enabled: nextEnabled,
        mode,
        dayOffset,
        time: toTimeString(timeMinutes),
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      });
      applySchedule(result);
      if (result.enabled) {
        const when =
          mode === "period_daily"
            ? `on each day of your period at ${formatTimeOfDay(timeMinutes)}`
            : `${formatDayOffset(dayOffset).toLowerCase()} at ${formatTimeOfDay(timeMinutes)}, every cycle`;
        const next = result.nextCallAt ? `\n\nNext call: ${formatWhen(result.nextCallAt)}.` : "";
        alert("Auto check-in calls on", `Buddy will call you ${when}.${next}`);
      }
    } catch (err) {
      if (isFeatureLockedError(err)) {
        setScheduleEnabled(false);
        setPaywallVisible(true);
      } else {
        // The switch was already flipped optimistically before this call —
        // revert it so the UI doesn't show "on" when nothing was saved.
        setScheduleEnabled(!nextEnabled);
        alert("Couldn't save schedule", getFriendlyErrorMessage(err));
      }
    } finally {
      setIsSavingSchedule(false);
    }
  }

  const periodLength = schedule?.periodLength ?? 5;
  const toneColor = (tone: OutcomeStyle["tone"]) =>
    tone === "good" ? colors.success : tone === "warn" ? colors.warning : colors.mutedText;

  const cardStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    ...getShadow(colors, isDark),
  };
  const rowStyle = { backgroundColor: colors.input, borderColor: colors.border };
  const labelStyle = { fontSize: 12.5, color: colors.foreground, fontFamily: fonts.body, fontWeight: "700" as const };
  const valueStyle = {
    fontSize: 12.5,
    color: colors.foreground,
    fontFamily: fonts.body,
    minWidth: 96,
    textAlign: "center" as const,
  };

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Check-in Call" />

        <KeyboardAwareScrollView bottomOffset={24}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 48 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
        >
          {/* Number Buddy calls */}
          <View className="mx-6 mt-4 border" style={{ ...cardStyle, padding: 20 }}>
            <View className="flex-row items-center" style={{ gap: 12 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14, borderCurve: "continuous",
                  backgroundColor: colors.skyLight,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon set="ion" name="call-outline" size={20} color={colors.sky} />
              </View>
              <View className="flex-1">
                <Text style={{ fontSize: 14.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                  Your phone number
                </Text>
              </View>
            </View>

            <View
              className="mt-4 w-full flex-row items-center rounded-2xl border px-4 h-14"
              style={{
                backgroundColor: colors.input,
                borderColor: isFocused ? colors.primary : colors.border,
                borderWidth: isFocused ? 1.5 : 1,
              }}
            >
              <Icon set="ion" name="call-outline" size={18} color={isFocused ? colors.primary : colors.mutedText} />
              <TextInput
                accessibilityLabel="Phone number"
                autoComplete="tel"
                editable={!isSavingPhone}
                keyboardType="phone-pad"
                onChangeText={setPhone}
                onFocus={() => setIsFocused(true)}
                onBlur={() => {
                  setIsFocused(false);
                  savePhoneIfChanged();
                }}
                placeholder="98765 43210"
                placeholderTextColor={colors.mutedText}
                returnKeyType="done"
                className="ml-3 flex-1 text-base outline-none font-semibold"
                style={{ color: colors.foreground }}
                textContentType="telephoneNumber"
                value={phone}
              />
              {isSavingPhone ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            </View>
          </View>

          {/* Auto check-in calls */}
          <View className="mx-6 mt-4 border" style={{ ...cardStyle, padding: 20 }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text style={{ fontSize: 14.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                  Auto check-in calls
                </Text>
                <Text style={{ fontSize: 12.5, color: colors.mutedText, marginTop: 2, fontFamily: fonts.body, lineHeight: 16 }}>
                  Buddy calls you around your period
                </Text>
              </View>
              {scheduleLoading ? (
                <SkeletonBlock width={50} height={30} radius={15} />
              ) : (
                <Switch
                  value={scheduleEnabled}
                  onValueChange={(value) => {
                    setScheduleEnabled(value);
                    saveSchedule(value);
                  }}
                  disabled={isSavingSchedule || !scheduleAvailable}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor={colors.buttonText}
                />
              )}
            </View>

            {!scheduleLoading && !scheduleAvailable ? (
              <Text style={{ fontSize: 12.5, color: colors.mutedText, marginTop: 12, fontFamily: fonts.body, lineHeight: 16 }}>
                Set up cycle tracking first so we know which days to call.
              </Text>
            ) : null}

            {!scheduleLoading && scheduleAvailable && scheduleEnabled && schedule?.nextCallAt ? (
              <View
                className="mt-4 flex-row items-center rounded-2xl px-3 py-3"
                style={{ backgroundColor: colors.skyLight }}
              >
                <Icon set="ion" name="calendar-outline" size={18} color={colors.sky} />
                <Text style={{ marginLeft: 8, fontSize: 12.5, color: colors.foreground, fontFamily: fonts.body }}>
                  Next call: <Text style={{ fontWeight: "800" }}>{formatWhen(schedule.nextCallAt)}</Text>
                </Text>
              </View>
            ) : null}

            {!scheduleLoading && scheduleAvailable && scheduleEnabled ? (
              <View className="mt-4" style={{ gap: 12 }}>
                <SegmentedControl
                  segments={[
                    { key: "period_daily", label: "Every period day" },
                    { key: "once", label: "Once a cycle" },
                  ]}
                  value={mode}
                  onChange={(next) => {
                    if (!isSavingSchedule) setMode(next as CheckinCallMode);
                  }}
                />

                {mode === "period_daily" ? (
                  <Text style={{ fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body, lineHeight: 16 }}>
                    One call on each day of your period ({periodLength} days), so each day gets
                    logged while you rest.
                  </Text>
                ) : (
                  <View className="flex-row items-center justify-between rounded-2xl border px-3 py-3" style={rowStyle}>
                    <Text style={labelStyle}>When</Text>
                    <View className="flex-row items-center" style={{ gap: 10 }}>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Earlier day"
                        activeOpacity={0.7}
                        disabled={isSavingSchedule || dayOffset <= DAY_OFFSET_MIN}
                        onPress={() => setDayOffset((d) => Math.max(DAY_OFFSET_MIN, d - 1))}
                        style={{ opacity: dayOffset <= DAY_OFFSET_MIN ? 0.35 : 1 }}
                      >
                        <Icon set="ion" name="chevron-back-circle" size={26} color={colors.primary} />
                      </TouchableOpacity>
                      <Text style={valueStyle}>{formatDayOffset(dayOffset)}</Text>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Later day"
                        activeOpacity={0.7}
                        disabled={isSavingSchedule || dayOffset >= DAY_OFFSET_MAX}
                        onPress={() => setDayOffset((d) => Math.min(DAY_OFFSET_MAX, d + 1))}
                        style={{ opacity: dayOffset >= DAY_OFFSET_MAX ? 0.35 : 1 }}
                      >
                        <Icon set="ion" name="chevron-forward-circle" size={26} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <View className="flex-row items-center justify-between rounded-2xl border px-3 py-3" style={rowStyle}>
                  <Text style={labelStyle}>Time</Text>
                  <View className="flex-row items-center" style={{ gap: 10 }}>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Earlier time"
                      activeOpacity={0.7}
                      disabled={isSavingSchedule}
                      onPress={() => setTimeMinutes((t) => (t - TIME_STEP_MINUTES + 1440) % 1440)}
                    >
                      <Icon set="ion" name="chevron-back-circle" size={26} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={valueStyle}>{formatTimeOfDay(timeMinutes)}</Text>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Later time"
                      activeOpacity={0.7}
                      disabled={isSavingSchedule}
                      onPress={() => setTimeMinutes((t) => (t + TIME_STEP_MINUTES) % 1440)}
                    >
                      <Icon set="ion" name="chevron-forward-circle" size={26} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View className="flex-row" style={{ gap: 8 }}>
                  <Icon set="ion" name="information-circle-outline" size={16} color={colors.mutedText} />
                  <Text style={{ flex: 1, fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body, lineHeight: 16 }}>
                    Missed it? Buddy retries up to 2 times, never after 9:30 PM.
                  </Text>
                </View>

                <Button label="Save schedule" size="md" fullWidth loading={isSavingSchedule} onPress={() => saveSchedule(true)} />
              </View>
            ) : null}
          </View>

          {/* Recent calls */}
          {history.length > 0 ? (
            <View className="mx-6 mt-4 border" style={{ ...cardStyle, padding: 20 }}>
              <Text style={{ fontSize: 14.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                Recent calls
              </Text>
              <View className="mt-3" style={{ gap: 14 }}>
                {history.map((call) => {
                  const look = describeCall(call);
                  const duration = formatDuration(call.durationSeconds);
                  return (
                    <View key={call._id} className="flex-row">
                      <Icon set="ion" name={look.icon} size={20} color={toneColor(look.tone)} />
                      <View className="ml-3 flex-1">
                        <View className="flex-row items-center justify-between">
                          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                            {look.label}
                          </Text>
                          <Text style={{ fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body }}>
                            {formatWhen(call.createdAt)}
                          </Text>
                        </View>
                        {call.summary ? (
                          <Text
                            numberOfLines={2}
                            style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body, lineHeight: 17, marginTop: 2 }}
                          >
                            {call.summary}
                          </Text>
                        ) : null}
                        <Text style={{ fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body, marginTop: 2 }}>
                          {[
                            duration,
                            call.retryAt ? `Buddy will try again ${formatWhen(call.retryAt).toLowerCase()}` : null,
                            call.source === "manual" ? "You asked" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
              <Text style={{ fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body, marginTop: 14 }}>
                Saved entries appear in your tracker, where you can edit them.
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
