import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../../components/auth-context";
import { alert } from "../../../lib/alert";
import { ThemeToggle, useTheme } from "../../../components/theme";
import { getShadow, getSoftTints } from "../../../components/ui-tokens";
import { authApi, type DashboardSummary } from "../../../lib/api";
import Avatar from "../../../components/Avatar";
import StatCard from "../../../components/StatCard";
import { useUserStats } from "../../../hooks/useUserStats";

export default function Profile() {
  const { colors, isDark, fonts } = useTheme();
  const { signOut, user, updateUser } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { streakCount, walletBalance } = useUserStats();
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
      await authApi.logoutAlias();
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
        {/* Absolute Top Toggle Bar */}
        <View className="absolute right-6 top-6 z-10">
          <ThemeToggle />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 140 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {/* USER AVATAR BRAND IDENTITY SECTION */}
          <View className="items-center px-6 pt-8">
            <View className="relative">
              <Avatar
                uri={user?.profilePicture}
                name={displayName}
                size={112}
                backgroundColor={softTints.pink}
                borderColor={colors.primary}
                borderWidth={4}
                textColor={colors.primary}
                fontFamily={fonts.heading}
                style={{
                  shadowColor: "#000",
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 2 },
                }}
              />

              <View
                className="absolute bottom-1 right-1 w-6 h-6 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.background }}
              >
                <Feather name="edit-3" size={11} color={colors.buttonText} />
              </View>
            </View>

            <Text
              className="mt-4 text-2xl font-black tracking-tight"
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              {displayName}
            </Text>
            <Text
              className="mt-1 text-xs font-semibold"
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              {displayEmail}
            </Text>
          </View>

          {/* PREMIUM SPLIT METRICS ROW */}
          <View className="mx-6 mt-8 flex-row gap-3">
            {[
              {
                label: "Days Tracked",
                value: dashboard?.trackedDays ?? 0,
                icon: "calendar-outline" as const,
                color: colors.primary,
                bg: softTints.pink,
              },
              {
                label: "Care Points",
                value: walletBalance,
                icon: "star" as const,
                color: colors.accent,
                bg: softTints.purple,
              },
              {
                label: "Day Streak",
                value: streakCount,
                icon: "flame" as const,
                color: colors.warning,
                bg: softTints.amber,
              },
            ].map((metric, i) => (
              <StatCard
                key={i}
                variant="tile-stack"
                icon={metric.icon}
                iconColor={metric.color}
                iconBg={metric.bg}
                value={metric.value}
                label={metric.label}
                valueColor={colors.foreground}
                labelColor={colors.mutedText}
                valueFontFamily={fonts.mono}
                labelFontFamily={fonts.body}
                backgroundColor={colors.surface}
                containerStyle={getShadow(colors, isDark)}
              />
            ))}
          </View>

          {/* MENUS LIST — one cohesive rounded surface card, flush rows w/ dividers */}
          <View
            className="mx-6 mt-8 rounded-3xl border overflow-hidden"
            style={[
              { backgroundColor: colors.surface, borderColor: colors.border },
              getShadow(colors, isDark),
            ]}
          >
            {/* Row: Achievements (Modal Trigger) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setAchievementsModalVisible(true)}
              className="flex-row items-center px-4 py-4 border-b"
              style={{ borderColor: colors.border }}
            >
              <View
                className="p-2.5 rounded-xl mr-4"
                style={{ backgroundColor: softTints.pink }}
              >
                <Ionicons
                  name="trophy-outline"
                  size={18}
                  color={colors.primary}
                />
              </View>
              <Text
                className="flex-1 text-sm font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
              >
                Achievements
              </Text>
              <Feather
                name="chevron-right"
                size={16}
                color={colors.mutedText}
              />
            </TouchableOpacity>

            {/* Row: Embedded Dropdown Settings Area */}
            <View className="border-b" style={{ borderColor: colors.border }}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() =>
                  setActiveMenuId(
                    activeMenuId === "settings" ? null : "settings",
                  )
                }
                className="flex-row items-center px-4 py-4"
              >
                <View
                  className="p-2.5 rounded-xl mr-4"
                  style={{ backgroundColor: softTints.pink }}
                >
                  <Ionicons
                    name="settings-outline"
                    size={18}
                    color={colors.primary}
                  />
                </View>
                <Text
                  className="flex-1 text-sm font-bold"
                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                >
                  Preferences & Settings
                </Text>
                <Feather
                  name={
                    activeMenuId === "settings"
                      ? "chevron-down"
                      : "chevron-right"
                  }
                  size={16}
                  color={
                    activeMenuId === "settings"
                      ? colors.secondary
                      : colors.mutedText
                  }
                />
              </TouchableOpacity>

              {activeMenuId === "settings" && (
                <View
                  className="mx-4 mb-4 rounded-2xl p-4 gap-4"
                  style={{ backgroundColor: colors.background }}
                >
                  <View className="flex-row justify-between items-center">
                    <View>
                      <Text
                        className="text-xs font-bold"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        Cycle Notifications
                      </Text>
                      <Text
                        className="text-[10px] mt-0.5"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
                      >
                        Alert me before my next expected date
                      </Text>
                    </View>
                    <Switch
                      value={notificationsEnabled}
                      disabled={savingPreference === "notificationsEnabled"}
                      onValueChange={(next) => handleTogglePreference("notificationsEnabled", next)}
                      trackColor={{ true: colors.primary }}
                    />
                  </View>
                  <View className="h-[1px] w-full" style={{ backgroundColor: colors.border }} />
                  <View className="flex-row justify-between items-center">
                    <View>
                      <Text
                        className="text-xs font-bold"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        Anonymous Community Mode
                      </Text>
                      <Text
                        className="text-[10px] mt-0.5"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
                      >
                        Mask my initials on forum posts
                      </Text>
                    </View>
                    <Switch
                      value={anonymousMode}
                      disabled={savingPreference === "anonymousCommunityMode"}
                      onValueChange={(next) => handleTogglePreference("anonymousCommunityMode", next)}
                      trackColor={{ true: colors.primary }}
                    />
                  </View>
                </View>
              )}
            </View>

            {/* Row: Documents (Route) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push("/documents")}
              className="flex-row items-center px-4 py-4 border-b"
              style={{ borderColor: colors.border }}
            >
              <View
                className="p-2.5 rounded-xl mr-4"
                style={{ backgroundColor: softTints.pink }}
              >
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color={colors.primary}
                />
              </View>
              <Text
                className="flex-1 text-sm font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
              >
                Documents
              </Text>
              <Feather
                name="chevron-right"
                size={16}
                color={colors.mutedText}
              />
            </TouchableOpacity>

            {/* Row: Government Schemes & Benefits (Route) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push("/government-schemes")}
              className="flex-row items-center px-4 py-4 border-b"
              style={{ borderColor: colors.border }}
            >
              <View
                className="p-2.5 rounded-xl mr-4"
                style={{ backgroundColor: softTints.pink }}
              >
                <Ionicons name="ribbon-outline" size={18} color={colors.primary} />
              </View>
              <Text
                className="flex-1 text-sm font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
              >
                Government Schemes & Benefits
              </Text>
              <Feather name="chevron-right" size={16} color={colors.mutedText} />
            </TouchableOpacity>

            {/* Row: App Lock (Route) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push("/app-lock")}
              className="flex-row items-center px-4 py-4 border-b"
              style={{ borderColor: colors.border }}
            >
              <View
                className="p-2.5 rounded-xl mr-4"
                style={{ backgroundColor: softTints.pink }}
              >
                <Ionicons
                  name="finger-print-outline"
                  size={18}
                  color={colors.primary}
                />
              </View>
              <Text
                className="flex-1 text-sm font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
              >
                App Lock
              </Text>
              <Feather
                name="chevron-right"
                size={16}
                color={colors.mutedText}
              />
            </TouchableOpacity>

            {/* Row: Help & Support (Modal Trigger) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setSupportModalVisible(true)}
              className="flex-row items-center px-4 py-4 border-b"
              style={{ borderColor: colors.border }}
            >
              <View
                className="p-2.5 rounded-xl mr-4"
                style={{ backgroundColor: softTints.pink }}
              >
                <Ionicons
                  name="help-circle-outline"
                  size={18}
                  color={colors.primary}
                />
              </View>
              <Text
                className="flex-1 text-sm font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
              >
                Help & Support
              </Text>
              <Feather
                name="chevron-right"
                size={16}
                color={colors.mutedText}
              />
            </TouchableOpacity>

            {/* Row: Privacy Policy (Modal Trigger) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setPrivacyModalVisible(true)}
              className="flex-row items-center px-4 py-4"
            >
              <View
                className="p-2.5 rounded-xl mr-4"
                style={{ backgroundColor: softTints.pink }}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color={colors.primary}
                />
              </View>
              <Text
                className="flex-1 text-sm font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
              >
                Data Privacy & Security
              </Text>
              <Feather
                name="chevron-right"
                size={16}
                color={colors.mutedText}
              />
            </TouchableOpacity>
          </View>

          {/* EXIT ACTION */}
          <TouchableOpacity
            onPress={handleLogout}
            activeOpacity={0.7}
            disabled={isLoggingOut}
            className="mx-6 mt-8 flex-row items-center justify-center py-3"
          >
            <Feather name="log-out" size={15} color={colors.danger} />
            <Text
              className="ml-2 text-sm font-bold tracking-wide"
              style={{ color: colors.danger, fontFamily: fonts.body }}
            >
              {isLoggingOut ? "Logging Out..." : "Log out"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      {/* --- INTEGRATED MODALS SYSTEM --- */}

      {/* Modals 1: Achievements System */}
      <Modal
        visible={achievementsModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAchievementsModalVisible(false)}
      >
        <View
          className="flex-1 px-6 pt-6"
          style={{ backgroundColor: colors.background }}
        >
          <View className="flex-row justify-between items-center mb-8">
            <Text
              className="text-xl font-black"
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              Your Achievements
            </Text>
            <TouchableOpacity
              onPress={() => setAchievementsModalVisible(false)}
              className="p-1 rounded-full"
              style={{ backgroundColor: colors.border }}
            >
              <Feather name="x" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <View
            className="items-center p-6 rounded-3xl border"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <MaterialCommunityIcons
              name="medal-outline"
              size={56}
              color={colors.accent}
            />
            <Text
              className="text-base font-black mt-4"
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              Consistency Champion Badge
            </Text>
            <Text
              className="text-xs text-center mt-2 leading-4"
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              Unlocked for steady symptom logging and habit care across your
              recent cycle.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Modals 2: Support Ticket Desk */}
      <Modal
        visible={supportModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSupportModalVisible(false)}
      >
        <View
          className="flex-1 px-6 pt-6"
          style={{ backgroundColor: colors.background }}
        >
          <View className="flex-row justify-between items-center mb-6">
            <Text
              className="text-xl font-black"
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              Help & Support
            </Text>
            <TouchableOpacity onPress={() => setSupportModalVisible(false)}>
              <Text
                className="text-sm font-bold"
                style={{ color: colors.primary, fontFamily: fonts.body }}
              >
                Done
              </Text>
            </TouchableOpacity>
          </View>
          <Text
            className="text-sm leading-5 mb-4"
            style={{ color: colors.foreground, fontFamily: fonts.body }}
          >
            Need help with predictions, account access, cycle logs, or partner
            sharing? Send a support request and we will guide you through it.
          </Text>
          <TouchableOpacity
            onPress={() =>
              alert(
                "Ticket Logged",
                "Your support request has been logged.",
              )
            }
            className="w-full rounded-2xl py-4 items-center justify-center"
            style={{ backgroundColor: colors.primary }}
          >
            <Text
              className="text-sm font-bold"
              style={{ color: colors.buttonText, fontFamily: fonts.body }}
            >
              Create Support Ticket
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Modals 3: Local Privacy Framework */}
      <Modal
        visible={privacyModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPrivacyModalVisible(false)}
      >
        <View
          className="flex-1 px-6 pt-6"
          style={{ backgroundColor: colors.background }}
        >
          <View className="flex-row justify-between items-center mb-6">
            <Text
              className="text-xl font-black"
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              Privacy Safeguard
            </Text>
            <TouchableOpacity onPress={() => setPrivacyModalVisible(false)}>
              <Feather name="arrow-down" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <View
            className="p-5 rounded-2xl border"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <Text
              className="text-xs leading-5"
              style={{ color: colors.foreground, fontFamily: fonts.body }}
            >
              Your tracking notes, cycle logs, and identity details are treated
              as private health data. Sharing controls stay with you, and
              sensitive records should only be sent with clear permission.
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}
