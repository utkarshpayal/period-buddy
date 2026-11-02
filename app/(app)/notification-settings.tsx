import React, { useCallback, useEffect, useState } from "react";
import { Platform, RefreshControl, ScrollView, StatusBar, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import { ListGroup } from "../../components/ListGroup";
import { Chip } from "../../components/Chip";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { useTheme } from "../../components/theme";
import { useAuth } from "../../components/auth-context";
import {
  getFriendlyErrorMessage,
  isNetworkError,
  notificationsApi,
  type AutoNotificationKey,
  type NotificationPreferences,
} from "../../lib/api";
import { enablePushOnDeviceAsync } from "../../lib/notifications";
import { needsHomeScreenForPush, webPushPermission, webPushSupported } from "../../lib/webPush";
import { haptics } from "../../lib/haptics";
import { showErrorToast } from "../../lib/toast";

/** Grouped the way people think about them, not by how they're built. */
const GROUPS: { title: string; keys: AutoNotificationKey[] }[] = [
  { title: "Your period", keys: ["period_upcoming", "period_start", "period_late"] },
  { title: "Your cycle and body", keys: ["phase_tips", "symptom_heads_up", "fertile_window"] },
  { title: "Health and habits", keys: ["health_alerts", "daily_log"] },
];

const ICONS: Record<AutoNotificationKey, { icon: string; tint: "rose" | "lavender" | "success" | "sky" | "gold" | "danger" }> = {
  period_upcoming: { icon: "calendar-outline", tint: "rose" },
  period_start: { icon: "water-outline", tint: "rose" },
  period_late: { icon: "hourglass-outline", tint: "gold" },
  phase_tips: { icon: "leaf-outline", tint: "success" },
  symptom_heads_up: { icon: "pulse-outline", tint: "sky" },
  fertile_window: { icon: "flower-outline", tint: "lavender" },
  health_alerts: { icon: "medkit-outline", tint: "danger" },
  daily_log: { icon: "create-outline", tint: "gold" },
};

const TIMES = [
  { value: "08:00", label: "8 AM" },
  { value: "09:00", label: "9 AM" },
  { value: "13:00", label: "1 PM" },
  { value: "18:00", label: "6 PM" },
  { value: "20:00", label: "8 PM" },
];
const DAYS_BEFORE = [1, 2, 3, 5];

function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/**
 * Profile → Notifications. One switch for notifications on this account,
 * when they arrive, and a switch per kind of automatic cycle notification
 * (sent by the backend's hourly tick, utils/autoNotifications.js). A kind an
 * admin has paused for everyone shows here, switched off and greyed out.
 * Every change saves at once and rolls back with a toast if it fails.
 */
export default function NotificationSettingsScreen() {
  const { colors, isDark, fonts } = useTheme();
  const { user, updateUser } = useAuth();
  const tints = {
    rose: { fg: colors.rose, bg: colors.roseLight },
    lavender: { fg: colors.secondary, bg: colors.secondaryLight },
    success: { fg: colors.success, bg: colors.successLight },
    sky: { fg: colors.sky, bg: colors.skyLight },
    gold: { fg: colors.gold, bg: colors.goldLight },
    danger: { fg: colors.danger, bg: colors.dangerLight },
  };
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Web: whether this browser may show notifications (web push).
  const [browserPush, setBrowserPush] = useState(() => webPushPermission());
  const turnOnBrowserPush = useCallback(async () => {
    await enablePushOnDeviceAsync();
    setBrowserPush(webPushPermission());
  }, []);

  const load = useCallback(async () => {
    try {
      setPrefs(await notificationsApi.getPreferences());
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Optimistic: show the change now, put it back if the save fails. */
  async function save(next: NotificationPreferences, changes: Parameters<typeof notificationsApi.savePreferences>[0]) {
    const before = prefs;
    setPrefs(next);
    haptics.select();
    try {
      setPrefs(await notificationsApi.savePreferences(changes));
      if (changes.push !== undefined && user) updateUser({ ...user, notificationsEnabled: changes.push });
    } catch (err) {
      setPrefs(before);
      haptics.error();
      showErrorToast(getFriendlyErrorMessage(err), "Couldn't save that");
    }
  }

  if (!prefs) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Notifications" />
        <LoadingErrorState
          loading={!error}
          error={error ? getFriendlyErrorMessage(error) : null}
          offline={!!error && isNetworkError(error)}
          onRetry={() => {
            setError(null);
            load();
          }}
        >
          {null}
        </LoadingErrorState>
      </SafeAreaView>
    );
  }

  const pushOn = prefs.push;
  const byKey = Object.fromEntries(prefs.categories.map((c) => [c.key, c]));
  const switchProps = {
    trackColor: { true: colors.primary, false: colors.border },
    thumbColor: colors.buttonText,
    ...({ activeThumbColor: colors.buttonText } as object),
  };
  const helper = { fontSize: 13, color: colors.mutedText, fontFamily: fonts.body, lineHeight: 18 };
  const note = (icon: string, text: string, action?: React.ReactNode) => (
    <View className="flex-row rounded-2xl px-4 py-3.5" style={{ backgroundColor: colors.surfaceSoft, gap: 10, marginTop: 16 }}>
      <Icon set="ion" name={icon} size={18} color={colors.mutedText} />
      <View className="flex-1" style={{ gap: 10 }}>
        <Text style={[helper, { color: colors.foreground }]}>{text}</Text>
        {action}
      </View>
    </View>
  );

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Notifications" />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 48 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.primary}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
        >
          {/* Master switch */}
          <ListGroup>
            <View className="flex-row items-center" style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 14 }}>
              <View style={{ width: 42, height: 42, borderRadius: 14, borderCurve: "continuous", backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" }}>
                <Icon set="ion" name="notifications-outline" size={20} color={colors.primaryDark} />
              </View>
              <View className="flex-1">
                <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>Allow notifications</Text>
                <Text style={helper}>
                  {pushOn
                    ? Platform.OS === "web"
                      ? "Reminders come to this device"
                      : "Reminders come to this phone"
                    : "You'll only see them in the app"}
                </Text>
              </View>
              <Switch
                accessibilityLabel="Allow notifications"
                value={pushOn}
                onValueChange={(v) => {
                  if (v) turnOnBrowserPush();
                  save({ ...prefs, push: v }, { push: v });
                }}
                {...switchProps}
              />
            </View>
          </ListGroup>

          {Platform.OS === "web" && pushOn
            ? needsHomeScreenForPush()
              ? note(
                  "phone-portrait-outline",
                  "On iPhone and iPad, notifications work once The Nura is on your Home Screen: Share, then Add to Home Screen.",
                )
              : webPushSupported() && browserPush === "default"
                ? note(
                    "notifications-outline",
                    "Turn on notifications in this browser to get reminders here too.",
                    <Button label="Turn on" size="sm" variant="tonal" onPress={turnOnBrowserPush} style={{ alignSelf: "flex-start" }} />,
                  )
                : webPushSupported() && browserPush === "denied"
                  ? note(
                      "notifications-off-outline",
                      "Notifications are blocked for this site. Allow them in your browser's settings to get reminders here.",
                    )
                  : null
            : null}

          {!prefs.cycleSetUp
            ? note(
                "calendar-outline",
                "Cycle reminders need your cycle first, so we know when your period is due.",
                <Button label="Set up my cycle" size="sm" variant="tonal" onPress={() => router.push("/(app)/(dashboard)/tracker")} style={{ alignSelf: "flex-start" }} />,
              )
            : prefs.pregnancyMode
              ? note("heart-outline", "Pregnancy mode is on, so period, fertility and cycle reminders are paused.")
              : null}

          {/* When */}
          <SectionHeader title="When they arrive" style={{ marginTop: 28 }} />
          <View className="flex-row flex-wrap" style={{ gap: 8, marginTop: 12 }}>
            {TIMES.map((t) => (
              <Chip
                key={t.value}
                label={t.label}
                selected={prefs.time === t.value}
                accessibilityRole="radio"
                accessibilityLabel={formatTime(t.value)}
                onPress={() => prefs.time !== t.value && save({ ...prefs, time: t.value }, { time: t.value })}
              />
            ))}
          </View>
          <Text style={[helper, { marginTop: 10 }]}>
            {TIMES.some((t) => t.value === prefs.time) ? "At most 2 a day, and never after 10 PM." : `Now ${formatTime(prefs.time)}. At most 2 a day, never after 10 PM.`}
          </Text>

          {/* Kinds */}
          {GROUPS.map((group) => (
            <View key={group.title}>
              <SectionHeader title={group.title} style={{ marginTop: 28, marginBottom: 12 }} />
              <ListGroup>
                {group.keys.map((key) => {
                  const c = byKey[key];
                  if (!c) return null;
                  const tint = tints[ICONS[key].tint];
                  const paused = !c.available || (prefs.pregnancyMode && c.pausedInPregnancy);
                  const locked = !c.available || !prefs.cycleSetUp;
                  const status = !c.available ? "Paused by Nura for now" : prefs.pregnancyMode && c.pausedInPregnancy ? "Paused in pregnancy mode" : c.description;
                  const value = c.enabled && c.available;
                  return (
                    <View key={key}>
                      <View className="flex-row items-center" style={{ paddingHorizontal: 16, paddingVertical: 13, gap: 14, opacity: pushOn ? 1 : 0.55 }}>
                        <View style={{ width: 42, height: 42, borderRadius: 14, borderCurve: "continuous", backgroundColor: tint.bg, alignItems: "center", justifyContent: "center", opacity: paused ? 0.5 : 1 }}>
                          <Icon set="ion" name={ICONS[key].icon} size={20} color={tint.fg} />
                        </View>
                        <View className="flex-1" style={{ opacity: paused ? 0.6 : 1 }}>
                          <Text numberOfLines={2} maxFontSizeMultiplier={1.4} style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                            {c.label}
                          </Text>
                          <Text maxFontSizeMultiplier={1.4} style={helper}>{status}</Text>
                        </View>
                        <Switch
                          accessibilityLabel={c.label}
                          value={value}
                          disabled={locked}
                          onValueChange={(v) =>
                            save(
                              { ...prefs, categories: prefs.categories.map((x) => (x.key === key ? { ...x, enabled: v } : x)) },
                              { categories: { [key]: v } },
                            )
                          }
                          {...switchProps}
                        />
                      </View>
                      {key === "period_upcoming" && value && !paused ? (
                        <View style={{ paddingLeft: 72, paddingRight: 16, paddingBottom: 14, gap: 8 }}>
                          <Text style={[helper, { fontWeight: "700" }]}>How many days before</Text>
                          <View className="flex-row" style={{ gap: 8 }}>
                            {DAYS_BEFORE.map((d) => (
                              <Chip
                                key={d}
                                label={String(d)}
                                accessibilityLabel={d === 1 ? "1 day before" : `${d} days before`}
                                selected={prefs.reminderDaysBefore === d}
                                accessibilityRole="radio"
                                onPress={() => prefs.reminderDaysBefore !== d && save({ ...prefs, reminderDaysBefore: d }, { reminderDaysBefore: d })}
                              />
                            ))}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </ListGroup>
            </View>
          ))}

          {note(
            "lock-closed-outline",
            "Your lock screen shows a neutral message unless you turn off “Hide notification details” in Data privacy & security.",
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
