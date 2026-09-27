import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../../components/auth-context";
import { useGenZMode } from "../../../components/genz-mode";
import { alert } from "../../../lib/alert";
import { ThemeToggle, useTheme } from "../../../components/theme";
import { getSoftTints } from "../../../components/ui-tokens";
import { authApi, type DashboardSummary } from "../../../lib/api";
import {
  enablePushOnDeviceAsync,
  getCurrentPushTokenQuietlyAsync,
} from "../../../lib/notifications";
import Avatar from "../../../components/Avatar";
import { CmsShortcuts } from "../../../components/CmsShortcuts";
import { PromoBanners } from "../../../components/PromoBanners";
import { useUserStats } from "../../../hooks/useUserStats";
import { useDataRefresh } from "../../../hooks/useDataRefresh";

export default function Profile() {
  const { colors, isDark, fonts } = useTheme();
  const { signOut, user, updateUser } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { streakCount, walletBalance } = useUserStats();
  const { enabled: genZModeEnabled, setEnabled: setGenZModeEnabled } = useGenZMode();
  const router = useRouter();
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Nura user";
  const displayEmail = user?.email || "Private account";

  // Navigation Panel Interactivity Controller States
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [achievementsModalVisible, setAchievementsModalVisible] =
    useState(false);
  const [supportModalVisible, setSupportModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Profile is a tab and stays mounted: close the Preferences dropdown when
  // leaving so it always starts collapsed.
  useFocusEffect(
    React.useCallback(() => () => setActiveMenuId(null), []),
  );

  // Settings Functional Flags — seeded from the backend, kept in sync with
  // `user` below, and persisted on every toggle (see handleTogglePreference).
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    user?.notificationsEnabled ?? true,
  );
  const [anonymousMode, setAnonymousMode] = useState(
    user?.anonymousCommunityMode ?? true,
  );
  const [savingPreference, setSavingPreference] = useState<
    "anonymousCommunityMode" | "notificationsEnabled" | null
  >(null);

  React.useEffect(() => {
    if (user?.notificationsEnabled !== undefined) {
      setNotificationsEnabled(user.notificationsEnabled);
    }
    if (user?.anonymousCommunityMode !== undefined) {
      setAnonymousMode(user.anonymousCommunityMode);
    }
  }, [user?.notificationsEnabled, user?.anonymousCommunityMode]);

  React.useEffect(() => {
    let isMounted = true;
    authApi.getProfile()
      .then((latestUser) => {
        if (isMounted) {
          updateUser(latestUser);
        }
      })
      .catch((err) => {
        console.log("Profile refresh skipped or failed:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [updateUser]);

  // Profile is a tab: pick up profile edits made on other screens (edit
  // profile, check-in call phone number, scheme eligibility details).
  // Skipped while focused: this screen's own toggles already apply the
  // server's response, and a late refetch could flip a switch mid-toggle.
  useDataRefresh(["profile"], async ({ whileFocused }) => {
    if (whileFocused) return;
    try {
      updateUser(await authApi.getProfile());
    } catch {
      // keep what's shown
    }
  });

  async function handleTogglePreference(
    key: "anonymousCommunityMode" | "notificationsEnabled",
    nextValue: boolean,
  ) {
    const setLocal = key === "notificationsEnabled" ? setNotificationsEnabled : setAnonymousMode;
    const previousValue = key === "notificationsEnabled" ? notificationsEnabled : anonymousMode;

    setLocal(nextValue);
    setSavingPreference(key);
    try {
      const updatedUser = await authApi.updateProfile({ [key]: nextValue });
      updateUser(updatedUser);
      if (key === "notificationsEnabled" && nextValue) enablePushOnDeviceAsync();
    } catch (error) {
      setLocal(previousValue);
      alert(
        "Couldn't save preference",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSavingPreference(null);
    }
  }

  // "Days Tracked" should reflect real cycle logs from the backend, not the
  // device-local AppState mock (which only tracks notes typed into this
  // session's local storage and resets on reinstall/new device).
  const loadDashboard = React.useCallback(async () => {
    try {
      const summary = await authApi.getDashboard();
      setDashboard(summary);
    } catch (err) {
      console.log("Dashboard summary refresh skipped or failed:", err);
    }
  }, []);

  React.useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await loadDashboard();
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard]);

  const softTints = getSoftTints(colors);

  async function performLogout() {
    if (isLoggingOut) return;

    try {
      setIsLoggingOut(true);
      await authApi.logoutAlias(await getCurrentPushTokenQuietlyAsync());
    } catch (networkError) {
      console.log("Server verification skipped during exit:", networkError);
    } finally {
      await signOut();
      router.replace("/login");
      setIsLoggingOut(false);
    }
  }

  function handleLogout() {
    alert(
      "Log out?",
      "You can sign back in any time. Your saved care history stays with your account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: performLogout,
        },
      ],
    );
  }

  type RowIcon = React.ComponentProps<typeof Ionicons>["name"];
  const accountRows: { icon: RowIcon; label: string; tint: string; color: string; onPress: () => void }[] = [
    { icon: "trophy-outline", label: "Achievements", tint: softTints.amber, color: colors.warning, onPress: () => setAchievementsModalVisible(true) },
    { icon: "star-outline", label: "My subscription", tint: softTints.gold, color: colors.gold, onPress: () => router.push("/subscription") },
    { icon: "ribbon-outline", label: "Government schemes & benefits", tint: softTints.pink, color: colors.primary, onPress: () => router.push("/government-schemes") },
  ];
  const privacyRows: typeof accountRows = [
    { icon: "finger-print-outline", label: "App lock", tint: softTints.lavender, color: colors.secondary, onPress: () => router.push("/app-lock") },
    { icon: "shield-checkmark-outline", label: "Data privacy & security", tint: softTints.mint, color: colors.accent, onPress: () => setPrivacyModalVisible(true) },
    { icon: "help-circle-outline", label: "Help & support", tint: softTints.blue, color: colors.info, onPress: () => setSupportModalVisible(true) },
  ];
  const settingsOpen = activeMenuId === "settings";
  const preferenceRows: { label: string; hint: string; value: boolean; disabled?: boolean; onChange: (v: boolean) => void }[] = [
    {
      label: "Cycle notifications",
      hint: "Remind me before my next expected period",
      value: notificationsEnabled,
      disabled: savingPreference === "notificationsEnabled",
      onChange: (next) => handleTogglePreference("notificationsEnabled", next),
    },
    {
      label: "Anonymous community mode",
      hint: "Hide my name on community posts",
      value: anonymousMode,
      disabled: savingPreference === "anonymousCommunityMode",
      onChange: (next) => handleTogglePreference("anonymousCommunityMode", next),
    },
    { label: "Gen Z mode", hint: "Swap a few labels for Gen Z slang, no cap", value: genZModeEnabled, onChange: setGenZModeEnabled },
  ];

  const sectionLabel = (text: string) => (
    <Text style={{ color: colors.mutedText, fontSize: 12.5, fontWeight: "700", fontFamily: fonts.body, marginTop: 24, marginBottom: 8, marginLeft: 24 }}>{text}</Text>
  );
  const card = { marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: 20, overflow: "hidden" as const };
  const divider = <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 16 + 36 + 14 }} />;
  const menuRow = (row: (typeof accountRows)[number], last: boolean, right?: React.ReactNode) => (
    <View key={row.label}>
      <TouchableOpacity activeOpacity={0.6} onPress={row.onPress} accessibilityRole="button" className="flex-row items-center" style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <View className="items-center justify-center rounded-full" style={{ width: 36, height: 36, backgroundColor: row.tint, marginRight: 14 }}>
          <Ionicons name={row.icon} size={18} color={row.color} />
        </View>
        <Text numberOfLines={1} className="flex-1" style={{ color: colors.foreground, fontSize: 15, fontWeight: "600", fontFamily: fonts.body, marginRight: 8 }}>
          {row.label}
        </Text>
        {right ?? <Feather name="chevron-right" size={18} color={colors.mutedText} />}
      </TouchableOpacity>
      {!last ? divider : null}
    </View>
  );

  const sheetHeader = (title: string, onClose: () => void) => (
    <View className="flex-row items-center justify-between mb-6">
      <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "800", fontFamily: fonts.heading }}>{title}</Text>
      <TouchableOpacity
        onPress={onClose}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Close"
        className="items-center justify-center rounded-full"
        style={{ width: 32, height: 32, backgroundColor: colors.surface }}
      >
        <Feather name="x" size={17} color={colors.foreground} />
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 20, paddingTop: 16 }}>
            <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "800", fontFamily: fonts.heading }}>Profile</Text>
            <ThemeToggle />
          </View>

          {/* Identity */}
          <View className="items-center" style={{ paddingHorizontal: 24, marginTop: 20 }}>
            <Avatar
              uri={user?.profilePicture}
              name={displayName}
              size={88}
              backgroundColor={softTints.pink}
              textColor={colors.primary}
              fontFamily={fonts.heading}
            />
            <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 21, fontWeight: "800", fontFamily: fonts.heading, marginTop: 12 }}>
              {displayName}
            </Text>
            <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, marginTop: 2 }}>
              {displayEmail}
            </Text>
          </View>

          {/* Stats — same flat style as the Tracker's */}
          <View className="flex-row" style={{ marginHorizontal: 20, marginTop: 20, gap: 10 }}>
            {[
              { label: "Days tracked", value: dashboard?.trackedDays ?? 0, icon: "calendar-outline" as const, color: colors.primary },
              { label: "Care points", value: walletBalance, icon: "star" as const, color: colors.accent },
              { label: "Day streak", value: streakCount, icon: "flame" as const, color: colors.warning },
            ].map((m) => (
              <View
                key={m.label}
                accessible
                accessibilityLabel={`${m.label}: ${m.value}`}
                className="flex-1 items-center rounded-2xl"
                style={{ backgroundColor: colors.surface, paddingVertical: 14, paddingHorizontal: 6 }}
              >
                <View className="flex-row items-center" style={{ gap: 5 }}>
                  <Ionicons name={m.icon} size={15} color={m.color} />
                  <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800", fontFamily: fonts.heading }}>{m.value}</Text>
                </View>
                <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 11.5, fontWeight: "600", fontFamily: fonts.body, marginTop: 3 }}>
                  {m.label}
                </Text>
              </View>
            ))}
          </View>

          {sectionLabel("Your account")}
          <View style={card}>{accountRows.map((row, i) => menuRow(row, i === accountRows.length - 1))}</View>

          {sectionLabel("Preferences")}
          <View style={card}>
            {menuRow(
              {
                icon: "options-outline",
                label: "Notifications & display",
                tint: softTints.pink,
                color: colors.primary,
                onPress: () => setActiveMenuId(settingsOpen ? null : "settings"),
              },
              !settingsOpen,
              <Feather name={settingsOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedText} />,
            )}
            {settingsOpen
              ? preferenceRows.map((p, i) => (
                  <View key={p.label}>
                    <View className="flex-row items-center" style={{ paddingLeft: 16 + 36 + 14, paddingRight: 16, paddingVertical: 12, gap: 12 }}>
                      <View className="flex-1">
                        <Text style={{ color: colors.foreground, fontSize: 14.5, fontWeight: "600", fontFamily: fonts.body }}>{p.label}</Text>
                        <Text style={{ color: colors.mutedText, fontSize: 12.5, fontFamily: fonts.body, marginTop: 1 }}>{p.hint}</Text>
                      </View>
                      <Switch
                        value={p.value}
                        disabled={p.disabled}
                        onValueChange={p.onChange}
                        trackColor={{ true: colors.primary, false: colors.border }}
                        thumbColor="#FFFFFF"
                        accessibilityLabel={p.label}
                      />
                    </View>
                    {i < preferenceRows.length - 1 ? divider : null}
                  </View>
                ))
              : null}
          </View>

          {sectionLabel("Privacy & help")}
          <View style={card}>{privacyRows.map((row, i) => menuRow(row, i === privacyRows.length - 1))}</View>

          {/* App CMS: banners and features/links an admin placed on Profile.
              Both render nothing by default. */}
          <PromoBanners placement="profile" style={{ marginTop: 24 }} />
          <CmsShortcuts placement="profile" style={{ marginTop: 24 }} />

          <TouchableOpacity
            onPress={handleLogout}
            activeOpacity={0.7}
            disabled={isLoggingOut}
            accessibilityRole="button"
            className="flex-row items-center justify-center"
            style={{ ...card, marginTop: 24, paddingVertical: 15, gap: 8 }}
          >
            <Feather name="log-out" size={16} color={colors.danger} />
            <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "700", fontFamily: fonts.body }}>
              {isLoggingOut ? "Logging out…" : "Log out"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      {/* Achievements */}
      <Modal visible={achievementsModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAchievementsModalVisible(false)}>
        {/* Android ignores pageSheet and renders fullscreen, so SafeAreaView keeps the header clear. */}
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 20 }}>
          {sheetHeader("Your achievements", () => setAchievementsModalVisible(false))}
          <View className="items-center rounded-3xl" style={{ backgroundColor: colors.surface, padding: 24 }}>
            <View className="items-center justify-center rounded-full" style={{ width: 72, height: 72, backgroundColor: softTints.amber }}>
              <MaterialCommunityIcons name="medal-outline" size={36} color={colors.warning} />
            </View>
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "800", fontFamily: fonts.heading, marginTop: 14 }}>Consistency Champion</Text>
            <Text style={{ color: colors.mutedText, fontSize: 13.5, lineHeight: 20, fontFamily: fonts.body, marginTop: 6, textAlign: "center" }}>
              Unlocked for steady symptom logging and habit care across your recent cycle.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setAchievementsModalVisible(false);
              router.push("/badges");
            }}
            activeOpacity={0.85}
            className="items-center justify-center rounded-full mt-5"
            style={{ height: 50, backgroundColor: colors.primaryLight }}
          >
            <Text style={{ color: colors.primary, fontSize: 14.5, fontWeight: "800", fontFamily: fonts.body }}>See all streaks & badges</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* Help & support */}
      <Modal visible={supportModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSupportModalVisible(false)}>
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 20 }}>
          {sheetHeader("Help & support", () => setSupportModalVisible(false))}
          <Text style={{ color: colors.foreground, fontSize: 14.5, lineHeight: 22, fontFamily: fonts.body, marginBottom: 20 }}>
            Need help with predictions, account access, cycle logs or partner sharing? Send a support request and we&apos;ll guide you through it.
          </Text>
          <TouchableOpacity
            onPress={() => alert("Request sent", "Your support request has been logged. We'll get back to you soon.")}
            activeOpacity={0.85}
            className="items-center justify-center rounded-full"
            style={{ height: 52, backgroundColor: colors.primary }}
          >
            <Text style={{ color: colors.buttonText, fontSize: 15, fontWeight: "800", fontFamily: fonts.body }}>Contact support</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* Data privacy */}
      <Modal visible={privacyModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPrivacyModalVisible(false)}>
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 20 }}>
          {sheetHeader("Data privacy & security", () => setPrivacyModalVisible(false))}
          <View className="rounded-3xl" style={{ backgroundColor: colors.surface, padding: 20, gap: 14 }}>
            {[
              { icon: "lock-closed-outline" as const, text: "Your cycle logs, notes and identity details are treated as private health data." },
              { icon: "people-outline" as const, text: "Sharing (partner, circles, doctors) is always your choice, and you can stop it any time." },
              { icon: "finger-print-outline" as const, text: "Turn on App lock to keep the app private on a shared phone." },
            ].map((item) => (
              <View key={item.icon} className="flex-row" style={{ gap: 12 }}>
                <Ionicons name={item.icon} size={18} color={colors.accent} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, color: colors.foreground, fontSize: 14, lineHeight: 21, fontFamily: fonts.body }}>{item.text}</Text>
              </View>
            ))}
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}
