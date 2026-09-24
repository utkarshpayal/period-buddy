import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
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
import { formatShortDate } from "../../lib/format";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import {
  ApiError,
  authApi,
  getFriendlyErrorMessage,
  isFeatureLockedError,
  voiceAgentApi,
} from "../../lib/api";

const DAY_OFFSET_MIN = -5;
const DAY_OFFSET_MAX = 5;
const TIME_STEP_MINUTES = 15;

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

/**
 * "Call me now" cycle check-in — the user asks Buddy (via Sarvam's Instant
 * Outbound voice agent) to phone them and walk through logging today's
 * entry hands-free. Also hosts the recurring schedule preference (see
 * voiceAgentApi.get/saveCheckinCallSchedule) — the actual auto-firing runs
 * server-side on a cron (period-buddy-be's utils/checkinCallScheduler.js),
 * not from this screen; this just reads/writes the saved preference.
 */
export default function CheckinCallScreen() {
  const { colors, isDark, fonts } = useTheme();
  const { user, updateUser } = useAuth();

  const [phone, setPhone] = useState(user?.phone ?? "");
  const [isFocused, setIsFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [scheduleLoading, setScheduleLoading] = useState(true);
  // false only when this user has no CycleSettings yet — scheduling needs a
  // predicted period date to anchor to, so it can't be configured until
  // they've set up cycle tracking.
  const [scheduleAvailable, setScheduleAvailable] = useState(true);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [timeMinutes, setTimeMinutes] = useState(9 * 60); // default 9:00 AM
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const { hasAccess, isLoading: subscriptionLoading, refresh: refreshSubscriptionAccess } =
    useSubscriptionAccess();

  // This whole screen is the premium feature (both "call me now" and the
  // auto-schedule toggle) — show the paywall as soon as it's clear the user
  // can't use it, not after they've typed a phone number and tapped Call.
  useEffect(() => {
    if (!subscriptionLoading && !hasAccess("voice_checkin_calls")) {
      setPaywallVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionLoading]);

  useEffect(() => {
    let cancelled = false;
    voiceAgentApi
      .getCheckinCallSchedule()
      .then((schedule) => {
        if (cancelled) return;
        setScheduleEnabled(schedule.enabled);
        setDayOffset(schedule.dayOffset ?? 0);
        if (schedule.time) setTimeMinutes(parseTimeString(schedule.time));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.kind === "notFound") {
          setScheduleAvailable(false);
        }
        // Any other error: leave the defaults — the save button still works
        // and will surface its own error if something's actually wrong.
      })
      .finally(() => {
        if (!cancelled) setScheduleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCallMeNow() {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      alert("Add a phone number", "We need a number to reach you on before Buddy can call.");
      return;
    }
    if (!hasAccess("voice_checkin_calls")) {
      setPaywallVisible(true);
      return;
    }

    setIsSubmitting(true);
    try {
      // The backend always calls the number on the user's own profile, not
      // an ad hoc one — persist an edited number first so the call actually
      // reaches it.
      if (trimmedPhone !== (user?.phone ?? "")) {
        const updatedUser = await authApi.updateProfile({ phone: trimmedPhone });
        updateUser(updatedUser);
      }

      const result = await voiceAgentApi.checkinCall();
      alert(
        "Calling you now 📞",
        `Buddy is calling ${trimmedPhone} — pick up to log today's check-in. Your next expected period is around ${formatShortDate(result.expectedPeriodDate)}.`,
      );
    } catch (err) {
      if (isFeatureLockedError(err)) {
        setPaywallVisible(true);
      } else {
        alert("Couldn't start the call", getFriendlyErrorMessage(err));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveSchedule(nextEnabled: boolean) {
    if (nextEnabled && !hasAccess("voice_checkin_calls")) {
      setScheduleEnabled(false);
      setPaywallVisible(true);
      return;
    }
    setIsSavingSchedule(true);
    try {
      const result = await voiceAgentApi.saveCheckinCallSchedule({
        enabled: nextEnabled,
        dayOffset,
        time: toTimeString(timeMinutes),
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      });
      setScheduleEnabled(result.enabled);
      if (result.enabled) {
        alert(
          "Auto check-in calls on",
          `Buddy will call you ${formatDayOffset(dayOffset).toLowerCase()}, at ${formatTimeOfDay(timeMinutes)} — every cycle.`,
        );
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

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Check-in Call" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
          <View
            className="mx-6 mt-4 items-center border"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: 24,
              padding: 24,
              ...getShadow(colors, isDark),
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                backgroundColor: colors.skyLight,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Ionicons name="call-outline" size={26} color={colors.sky} />
            </View>

            <Text
              className="text-center"
              style={{ fontSize: 17, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}
            >
              Get a call from Buddy
            </Text>
            <Text
              className="mt-2 text-center"
              style={{ fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body, lineHeight: 18 }}
            >
              Buddy will phone you and walk through today&apos;s flow, mood, symptoms, and more —
              hands-free, no typing needed.
            </Text>

            <View
              className="mt-6 w-full flex-row items-center rounded-2xl border px-4 h-14"
              style={{
                backgroundColor: colors.input,
                borderColor: isFocused ? colors.primary : colors.border,
                borderWidth: isFocused ? 1.5 : 1,
              }}
            >
              <Ionicons
                name="call-outline"
                size={20}
                color={isFocused ? colors.primary : colors.mutedText}
              />
              <TextInput
                autoComplete="tel"
                editable={!isSubmitting}
                keyboardType="phone-pad"
                onChangeText={setPhone}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="98765 43210"
                placeholderTextColor={colors.mutedText}
                returnKeyType="done"
                className="ml-3 flex-1 text-base outline-none font-semibold"
                style={{ color: colors.foreground }}
                textContentType="telephoneNumber"
                value={phone}
              />
            </View>
            <Text
              className="mt-2 w-full text-left"
              style={{ fontSize: 11, color: colors.mutedText, fontFamily: fonts.body }}
            >
              Indian numbers only — enter 10 digits, no country code needed.
            </Text>

            <TouchableOpacity
              activeOpacity={0.9}
              disabled={isSubmitting}
              onPress={handleCallMeNow}
              className="mt-5 w-full flex-row items-center justify-center rounded-full py-4"
              style={{ backgroundColor: colors.primary, opacity: isSubmitting ? 0.65 : 1 }}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.buttonText} />
              ) : (
                <>
                  <Ionicons name="call" size={16} color={colors.buttonText} />
                  <Text
                    className="ml-2 text-center text-sm font-bold"
                    style={{ color: colors.buttonText, fontFamily: fonts.body }}
                  >
                    Call me now
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View
            className="mx-6 mt-4 border"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: 24,
              padding: 20,
              ...getShadow(colors, isDark),
            }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text style={{ fontSize: 14.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                  Auto check-in calls
                </Text>
                <Text style={{ fontSize: 11.5, color: colors.mutedText, marginTop: 2, fontFamily: fonts.body, lineHeight: 16 }}>
                  Buddy calls you automatically, every cycle
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
              <Text style={{ fontSize: 11.5, color: colors.mutedText, marginTop: 12, fontFamily: fonts.body, lineHeight: 16 }}>
                Set up your cycle tracking first (last period date, cycle length) — auto check-in
                calls need that to know which day to call you on.
              </Text>
            ) : null}

            {!scheduleLoading && scheduleAvailable && scheduleEnabled ? (
              <View className="mt-4" style={{ gap: 12 }}>
                <View
                  className="flex-row items-center justify-between rounded-2xl border px-3 py-3"
                  style={{ backgroundColor: colors.input, borderColor: colors.border }}
                >
                  <Text style={{ fontSize: 12.5, color: colors.foreground, fontFamily: fonts.body, fontWeight: "700" }}>
                    When
                  </Text>
                  <View className="flex-row items-center" style={{ gap: 10 }}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      disabled={isSavingSchedule || dayOffset <= DAY_OFFSET_MIN}
                      onPress={() => setDayOffset((d) => Math.max(DAY_OFFSET_MIN, d - 1))}
                      style={{ opacity: dayOffset <= DAY_OFFSET_MIN ? 0.35 : 1 }}
                    >
                      <Ionicons name="chevron-back-circle" size={26} color={colors.primary} />
                    </TouchableOpacity>
                    <Text
                      style={{ fontSize: 12.5, color: colors.foreground, fontFamily: fonts.body, minWidth: 96, textAlign: "center" }}
                    >
                      {formatDayOffset(dayOffset)}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      disabled={isSavingSchedule || dayOffset >= DAY_OFFSET_MAX}
                      onPress={() => setDayOffset((d) => Math.min(DAY_OFFSET_MAX, d + 1))}
                      style={{ opacity: dayOffset >= DAY_OFFSET_MAX ? 0.35 : 1 }}
                    >
                      <Ionicons name="chevron-forward-circle" size={26} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View
                  className="flex-row items-center justify-between rounded-2xl border px-3 py-3"
                  style={{ backgroundColor: colors.input, borderColor: colors.border }}
                >
                  <Text style={{ fontSize: 12.5, color: colors.foreground, fontFamily: fonts.body, fontWeight: "700" }}>
                    Time
                  </Text>
                  <View className="flex-row items-center" style={{ gap: 10 }}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      disabled={isSavingSchedule}
                      onPress={() =>
                        setTimeMinutes((t) => (t - TIME_STEP_MINUTES + 1440) % 1440)
                      }
                    >
                      <Ionicons name="chevron-back-circle" size={26} color={colors.primary} />
                    </TouchableOpacity>
                    <Text
                      style={{ fontSize: 12.5, color: colors.foreground, fontFamily: fonts.body, minWidth: 96, textAlign: "center" }}
                    >
                      {formatTimeOfDay(timeMinutes)}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      disabled={isSavingSchedule}
                      onPress={() => setTimeMinutes((t) => (t + TIME_STEP_MINUTES) % 1440)}
                    >
                      <Ionicons name="chevron-forward-circle" size={26} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.9}
                  disabled={isSavingSchedule}
                  onPress={() => saveSchedule(true)}
                  className="flex-row items-center justify-center rounded-full py-3"
                  style={{ backgroundColor: colors.primary, opacity: isSavingSchedule ? 0.65 : 1 }}
                >
                  {isSavingSchedule ? (
                    <ActivityIndicator color={colors.buttonText} />
                  ) : (
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.buttonText, fontFamily: fonts.body }}>
                      Save schedule
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </ScrollView>
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
