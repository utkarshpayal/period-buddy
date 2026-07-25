import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Platform,
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
import { getSoftTints } from "../../../components/ui-tokens";
import { authApi, type DashboardSummary } from "../../../lib/api";

export default function Profile() {
  const { colors, isDark, fonts } = useTheme();
  const { signOut, user, updateUser } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const router = useRouter();
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Nura user";
  const displayEmail = user?.email || "Private account";
  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "N";

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
  React.useEffect(() => {
    let isMounted = true;
    authApi.getDashboard()
      .then((summary) => {
        if (isMounted) setDashboard(summary);
      })
      .catch((err) => {
        console.log("Dashboard summary refresh skipped or failed:", err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

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
    if (Platform.OS === "web") {
      const confirmed =
        typeof globalThis.confirm === "function"
          ? globalThis.confirm(
              "Log out? You can sign back in any time. Your saved care history stays with your account.",
            )
          : true;

      if (confirmed) {
        performLogout();
      }
      return;
    }

    Alert.alert(
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
        >
          {/* USER AVATAR BRAND IDENTITY SECTION */}
          <View className="items-center px-6 pt-8">
            <View
              className="h-28 w-28 items-center justify-center rounded-full border-4 shadow-sm relative overflow-hidden"
              style={{
                backgroundColor: softTints.pink,
                borderColor: colors.primary,
              }}
            >
              {user?.profilePicture ? (
                <Image
                  source={{ uri: user.profilePicture }}
                  className="h-full w-full"
                  resizeMode="cover"
                />
              ) : (
                <Text
                  className="text-3xl font-black"
                  style={{ color: colors.primary, fontFamily: fonts.heading }}
                >
                  {initials}
                </Text>
              )}

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
                icon: "calendar-outline",
                color: colors.primary,
                bg: softTints.pink,
              },
              {
                label: "Care Points",
                value: typeof user?.walletBalance === "number" ? user.walletBalance : (user?.tokenEarned || 0),
                icon: "star",
                color: colors.primary,
                bg: softTints.pink,
              },
              {
                label: "Day Streak",
                value: user?.streakCount ?? 1,
                icon: "flame",
                color: colors.primary,
                bg: softTints.pink,
              },
            ].map((metric, i) => (
              <View
                key={i}
                className="flex-1 items-center rounded-2xl border p-4 shadow-2xs"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <View
                  className="p-2.5 rounded-xl"
                  style={{ backgroundColor: metric.bg }}
                >
                  <Ionicons
                    name={metric.icon as any}
                    size={18}
                    color={metric.color}
                  />
                </View>
                <Text
                  className="mt-3 text-base font-black tracking-tight"
                  style={{ color: colors.foreground, fontFamily: fonts.mono }}
                >
                  {metric.value}
                </Text>
                <Text
                  className="text-[10px] font-bold text-center mt-0.5"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  {metric.label}
                </Text>
              </View>
            ))}
          </View>

          {/* MENUS ACCORDION LIST ACTIONS INTEGRATION */}
          <View className="mx-6 mt-8 gap-3.5">

            {/* Action 2: Achievements (Modal Trigger) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setAchievementsModalVisible(true)}
              className="flex-row items-center p-4 rounded-2xl border shadow-3xs"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
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

            {/* Action 3: Embedded Dropdown Settings Area */}
            <View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() =>
                  setActiveMenuId(
                    activeMenuId === "settings" ? null : "settings",
                  )
                }
                className="flex-row items-center p-4 rounded-2xl border shadow-3xs"
                style={{
                  backgroundColor: colors.surface,
                  borderColor:
                    activeMenuId === "settings"
                      ? colors.secondary
                      : colors.border,
                }}
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
                  color={colors.mutedText}
                />
              </TouchableOpacity>

              {activeMenuId === "settings" && (
                <View
                  className="mt-2 rounded-2xl border p-4 gap-4"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
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
                  <View className="h-[1px] w-full bg-neutral-100 dark:bg-neutral-800" />
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

            {/* Action 3a: Documents (Route) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push("/documents")}
              className="flex-row items-center p-4 rounded-2xl border shadow-3xs"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
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

            {/* Action 3b: App Lock (Route) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push("/app-lock")}
              className="flex-row items-center p-4 rounded-2xl border shadow-3xs"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
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

            {/* Action 4: Help & Support (Modal Trigger) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setSupportModalVisible(true)}
              className="flex-row items-center p-4 rounded-2xl border shadow-3xs"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
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

            {/* Action 5: Privacy Policy (Modal Trigger) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setPrivacyModalVisible(true)}
              className="flex-row items-center p-4 rounded-2xl border shadow-3xs"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
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

          {/* EXIT ACTION PANEL BUTTON */}
          <TouchableOpacity
            onPress={handleLogout}
            activeOpacity={0.85}
            className="mx-6 mt-10 flex-row items-center justify-center rounded-full border py-4"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.primary,
            }}
          >
            <Feather name="log-out" size={16} color={colors.primary} />
            <Text
              className="ml-2 text-sm font-bold tracking-wide"
              style={{ color: colors.primary, fontFamily: fonts.body }}
            >
              {isLoggingOut ? "Logging Out..." : "Log Out Securely"}
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
