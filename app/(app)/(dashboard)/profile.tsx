import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
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

export default function Profile() {
  const { colors, isDark } = useTheme();
  const { signOut, user } = useAuth();
  const { trackedDays } = useAppState();
  const router = useRouter();

  // Navigation Panel Interactivity Controller States
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [achievementsModalVisible, setAchievementsModalVisible] =
    useState(false);
  const [supportModalVisible, setSupportModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);

  // Settings Functional Flags
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [anonymousMode, setAnonymousMode] = useState(false);

  const currentStreak = Math.min(trackedDays || 9, 12);

  const softTints = {
    pink: isDark ? "#3b1a2d" : "#fff0f6",
    purple: isDark ? "#231942" : "#f3e8ff",
    orange: isDark ? "#361e12" : "#fff7ed",
    emerald: isDark ? "#062e20" : "#ecfdf5",
  };
  const API_BASE_URL = "http://localhost:5000";

  // --- FULLY FIXED BACKEND-SYNCHRONIZED LOGOUT LIFECYCLE ---
  const handleLogout = () => {
    Alert.alert(
      "Logout Account",
      "Are you sure you want to exit your active secure session?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            try {
              // 📦 STEP 1: Extract token from auth state BEFORE it gets wiped out locally
              const activeSessionToken = user?.token;

              // 🚀 STEP 2: Fire network trigger request to clean server sessions cache arrays
              // Replace with your actual base domain configuration endpoint if different
              await fetch(`${API_BASE_URL}/api/logout`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${activeSessionToken}`, // Pass token safely to clear 'authenticate' middleware bounds
                },
              });
            } catch (networkError) {
              // Catch blocks safeguard application flows: if backend server is offline, user is still allowed out
              console.log(
                "Server verification skipped during exit:",
                networkError,
              );
            } finally {
              // 🧼 STEP 3: Wipe local disk key matrices and force push routing out
              if (signOut) {
                await signOut();
              }
              router.replace("/(tabs)/login");
            }
          },
        },
      ],
    );
  };

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
              className="h-28 w-28 items-center justify-center rounded-full border-4 shadow-sm relative"
              style={{
                backgroundColor: softTints.pink,
                borderColor: colors.border,
              }}
            >
              <Text className="text-5xl">👧</Text>
              {/* <Text className="text-5xl">{user?.profilePicture}</Text> */}

              <View className="absolute bottom-1 right-1 bg-emerald-500 w-5 h-5 rounded-full border-2 border-white dark:border-neutral-900" />
            </View>

            <Text
              className="mt-4 text-2xl font-black tracking-tight"
              style={{ color: colors.foreground }}
            >
              {user?.firstName || "Utkarsh"} {user?.lastName || "Payal"}
            </Text>
            <Text
              className="mt-1 text-xs font-semibold"
              style={{ color: colors.mutedText }}
            >
              {user?.email || "utkarsh12march2004@gmail.com"}
            </Text>
          </View>

          {/* PREMIUM SPLIT METRICS ROW */}
          <View className="mx-6 mt-8 flex-row gap-3">
            {[
              {
                label: "Days Tracked",
                value: trackedDays || 9,
                icon: "checkmark-done-circle-outline",
                color: colors.primary,
                bg: softTints.pink,
              },
              {
                label: "Tokens Earned",
                value: user?.tokenEarned || 0,
                icon: "star-outline",
                color: colors.accent,
                bg: softTints.orange,
              },
              {
                label: "Day Streak",
                value: user?.streakCount || 0,
                icon: "flame-outline",
                color: colors.secondary,
                bg: softTints.purple,
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
                My Progress & Forest
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
                style={{ backgroundColor: softTints.orange }}
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
                  style={{ backgroundColor: softTints.purple }}
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
                Help & Support Helpdesk
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
                  color="#10b981"
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
            className="mx-6 mt-10 flex-row items-center justify-center rounded-2xl border py-4"
            style={{
              backgroundColor: colors.surface,
              borderColor: "#ef4444",
            }}
          >
            <Feather name="log-out" size={16} color="#ef4444" />
            <Text
              className="ml-2 text-sm font-bold tracking-wide"
              style={{ color: "#ef4444" }}
            >
              Log Out Securely
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
              className="p-1 bg-neutral-100 dark:bg-neutral-800 rounded-full"
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
              Unlocked for completing a comprehensive 12-day symptom logging
              sequence without sequence drops.
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
            Have clinical questions regarding predictions, local cache cycles or
            tokens exchange metrics? Our operations desk handles issues 24/7.
          </Text>
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                "Ticket Logged",
                "Support query reference token generated successfully.",
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
            className="p-5 rounded-2xl border bg-neutral-50 dark:bg-neutral-900/40"
            style={{ borderColor: colors.border }}
          >
            <Text
              className="text-xs leading-5"
              style={{ color: colors.foreground }}
            >
              Your tracking notes, biological logging values, and identity
              references are completely encrypted using on-device sandboxed
              secure local stores. No diagnostic records are dispatched onto
              server clusters without user permissions.
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}
