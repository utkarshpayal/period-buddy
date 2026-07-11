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
import { useAppState } from "../../../components/AppState";
import { useAuth } from "../../../components/auth-context";
import { ThemeToggle, useTheme } from "../../../components/theme";
import { getSoftTints } from "../../../components/ui-tokens";
import { authApi } from "../../../lib/api";

export default function Profile() {
  const { colors, isDark } = useTheme();
  const { signOut, user } = useAuth();
  const { trackedDays } = useAppState();
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

  // Settings Functional Flags
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [anonymousMode, setAnonymousMode] = useState(false);

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
                borderColor: colors.border,
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
                  style={{ color: colors.primary }}
                >
                  {initials}
                </Text>
              )}

              <View className="absolute bottom-1 right-1 bg-emerald-500 w-5 h-5 rounded-full border-2 border-white dark:border-neutral-900" />
            </View>

            <Text
              className="mt-4 text-2xl font-black tracking-tight"
              style={{ color: colors.foreground }}
            >
              {displayName}
            </Text>
            <Text
              className="mt-1 text-xs font-semibold"
              style={{ color: colors.mutedText }}
            >
              {displayEmail}
            </Text>
          </View>

          {/* PREMIUM SPLIT METRICS ROW */}
          <View className="mx-6 mt-8 flex-row gap-3">
            {[
              {
                label: "Days Tracked",
                value: trackedDays,
                icon: "checkmark-done-circle-outline",
                color: colors.primary,
                bg: softTints.pink,
              },
              {
                label: "Tokens Earned",
                value: user?.tokenEarned || 0,
                icon: "star-outline",
                color: colors.accent,
                bg: softTints.amber,
              },
              {
                label: "Day Streak",
                value: user?.streakCount ?? trackedDays,
                icon: "flame-outline",
                color: colors.secondary,
                bg: softTints.mint,
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
                  style={{ color: colors.foreground }}
                >
                  {metric.value}
                </Text>
                <Text
                  className="text-[10px] font-bold text-center mt-0.5"
                  style={{ color: colors.mutedText }}
                >
                  {metric.label}
                </Text>
              </View>
            ))}
          </View>

          {/* MENUS ACCORDION LIST ACTIONS INTEGRATION */}
          <View className="mx-6 mt-8 gap-3.5">
            {/* Action 1: My Progress (Route Hook) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push("/(app)/(dashboard)/home")}
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
                  name="stats-chart-outline"
                  size={18}
                  color={colors.primary}
                />
              </View>
              <Text
                className="flex-1 text-sm font-bold"
                style={{ color: colors.foreground }}
              >
                My Progress & Wellness Forest
              </Text>
              <Feather
                name="chevron-right"
                size={16}
                color={colors.mutedText}
              />
            </TouchableOpacity>

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
                style={{ backgroundColor: softTints.amber }}
              >
                <Ionicons
                  name="trophy-outline"
                  size={18}
                  color={colors.accent}
                />
              </View>
              <Text
                className="flex-1 text-sm font-bold"
                style={{ color: colors.foreground }}
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
                  style={{ backgroundColor: softTints.lavender }}
                >
                  <Ionicons
                    name="settings-outline"
                    size={18}
                    color={colors.secondary}
                  />
                </View>
                <Text
                  className="flex-1 text-sm font-bold"
                  style={{ color: colors.foreground }}
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
                        style={{ color: colors.foreground }}
                      >
                        Cycle Notifications
                      </Text>
                      <Text
                        className="text-[10px] mt-0.5"
                        style={{ color: colors.mutedText }}
                      >
                        Alert me before my next expected date
                      </Text>
                    </View>
                    <Switch
                      value={notificationsEnabled}
                      onValueChange={setNotificationsEnabled}
                      trackColor={{ true: colors.primary }}
                    />
                  </View>
                  <View className="h-[1px] w-full bg-neutral-100 dark:bg-neutral-800" />
                  <View className="flex-row justify-between items-center">
                    <View>
                      <Text
                        className="text-xs font-bold"
                        style={{ color: colors.foreground }}
                      >
                        Anonymous Community Mode
                      </Text>
                      <Text
                        className="text-[10px] mt-0.5"
                        style={{ color: colors.mutedText }}
                      >
                        Mask my initials on forum posts
                      </Text>
                    </View>
                    <Switch
                      value={anonymousMode}
                      onValueChange={setAnonymousMode}
                      trackColor={{ true: colors.primary }}
                    />
                  </View>
                </View>
              )}
            </View>

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
                style={{ color: colors.foreground }}
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
                style={{ backgroundColor: softTints.emerald }}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color={colors.secondary}
                />
              </View>
              <Text
                className="flex-1 text-sm font-bold"
                style={{ color: colors.foreground }}
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
              style={{ color: colors.primary }}
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
              style={{ color: colors.foreground }}
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
              style={{ color: colors.foreground }}
            >
              Consistency Champion Badge
            </Text>
            <Text
              className="text-xs text-center mt-2 leading-4"
              style={{ color: colors.mutedText }}
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
              style={{ color: colors.foreground }}
            >
              Help & Support
            </Text>
            <TouchableOpacity onPress={() => setSupportModalVisible(false)}>
              <Text
                className="text-sm font-bold"
                style={{ color: colors.primary }}
              >
                Done
              </Text>
            </TouchableOpacity>
          </View>
          <Text
            className="text-sm leading-5 mb-4"
            style={{ color: colors.foreground }}
          >
            Need help with predictions, account access, cycle logs, or partner
            sharing? Send a support request and we will guide you through it.
          </Text>
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                "Ticket Logged",
                "Your support request has been logged.",
              )
            }
            className="w-full rounded-2xl py-4 items-center justify-center"
            style={{ backgroundColor: colors.primary }}
          >
            <Text
              className="text-sm font-bold"
              style={{ color: colors.buttonText }}
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
              style={{ color: colors.foreground }}
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
              style={{ color: colors.foreground }}
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
