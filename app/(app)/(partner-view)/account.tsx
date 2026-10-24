import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Avatar from "../../../components/Avatar";
import { useAuth } from "../../../components/auth-context";
import { usePartnerViewState } from "../../../components/partner-view-state";
import { ThemeToggle, useTheme } from "../../../components/theme";
import { getShadow, getSoftTints } from "../../../components/ui-tokens";
import { alert } from "../../../lib/alert";
import { authApi, partnerApi, type AuthUser, getFriendlyErrorMessage } from "../../../lib/api";
import {
  enablePushOnDeviceAsync,
  getCurrentPushTokenQuietlyAsync,
} from "../../../lib/notifications";
import { Icon } from "../../../components/Icon";

export default function PartnerViewAccount() {
  const { colors, isDark, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, signOut, updateUser } = useAuth();
  const router = useRouter();
  const { profile, refreshProfile } = usePartnerViewState();
  const softTints = getSoftTints(colors);

  const [notificationsEnabled, setNotificationsEnabled] = useState(
    user?.notificationsEnabled ?? true,
  );
  const [savingPreference, setSavingPreference] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
    } finally {
      setRefreshing(false);
    }
  }, [refreshProfile]);

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    "Nura partner";
  const displayEmail = user?.email || "Private account";
  const isConnected = profile?.isConnected ?? false;
  const partnerName =
    profile?.partnerId && typeof profile.partnerId === "object"
      ? `${profile.partnerId.firstName ?? ""} ${profile.partnerId.lastName ?? ""}`.trim()
      : "";

  async function handleToggleNotifications(next: boolean) {
    setNotificationsEnabled(next);
    setSavingPreference(true);
    try {
      const updatedUser = await authApi.updateProfile({
        notificationsEnabled: next,
      });
      updateUser(updatedUser);
      if (next) enablePushOnDeviceAsync();
    } catch (error) {
      setNotificationsEnabled(!next);
      alert(
        "Couldn't save preference",
        getFriendlyErrorMessage(error),
      );
    } finally {
      setSavingPreference(false);
    }
  }

  function handleDisconnect() {
    alert(
      "Disconnect from this account?",
      `You'll stop seeing what ${partnerName || "your partner"} shares with you. You can reconnect later with a new invite code.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setIsDisconnecting(true);
            try {
              await partnerApi.disconnect();
              updateUser({ ...(user ?? {}), partnerRole: null } as AuthUser);
              await refreshProfile();
              router.replace("/(app)/(dashboard)/tracker");
            } catch (err) {
              alert(
                "Error",
                getFriendlyErrorMessage(err),
              );
            } finally {
              setIsDisconnecting(false);
            }
          },
        },
      ],
    );
  }

  async function performLogout() {
    if (isLoggingOut) return;
    try {
      setIsLoggingOut(true);
      await authApi.logoutAlias(await getCurrentPushTokenQuietlyAsync());
    } catch (networkError) {
      console.warn("Server verification skipped during exit:", networkError);
    } finally {
      await signOut();
      router.replace("/login");
      setIsLoggingOut(false);
    }
  }

  function handleLogout() {
    alert("Log out?", "You can sign back in any time.", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: performLogout },
    ]);
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
        {/* Anchored to the real device safe-area inset, not a fixed
            className offset, so it clears the status bar/notch/rounded
            corner on curved-screen phones — same fix as the owner profile
            screen's identical toggle. */}
        <View
          className="absolute right-6 z-10"
          style={{ top: insets.top + 12 }}
        >
          <ThemeToggle />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 140 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {/* Identity */}
          <View className="items-center px-6 pt-8">
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
            <Text
              className="mt-4 text-2xl font-black tracking-tight text-center"
              numberOfLines={1}
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              {displayName}
            </Text>
            <Text
              className="mt-1 text-xs font-semibold text-center"
              numberOfLines={1}
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              {displayEmail}
            </Text>
            <View
              className="mt-3 flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border"
              style={{
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <Icon set="ion" name="eye-outline" size={12} color={colors.primary} />
              <Text
                className="text-[11.5px] font-black uppercase tracking-wider"
                style={{ color: colors.primary, fontFamily: fonts.body }}
              >
                Partner (read-only) account
              </Text>
            </View>
          </View>

          {/* Connection status card */}
          <View
            className="mx-6 mt-6 rounded-3xl border p-4 flex-row items-center gap-3"
            style={[
              {
                backgroundColor: isConnected
                  ? softTints.emerald
                  : colors.surface,
                borderColor: colors.border,
              },
              getShadow(colors, isDark),
            ]}
          >
            <View
              className="w-10 h-10 rounded-2xl items-center justify-center shrink-0"
              style={{
                backgroundColor: isConnected
                  ? colors.success
                  : colors.surfaceSoft,
              }}
            >
              <Icon set="ion"
                name={isConnected ? "link" : "unlink-outline"}
                size={18}
                color={isConnected ? "#fff" : colors.mutedText}
              />
            </View>
            <View className="flex-1 min-w-0">
              <Text
                className="text-xs font-black"
                numberOfLines={1}
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                {isConnected
                  ? `Linked to ${partnerName || "your partner"}`
                  : "No partner connected"}
              </Text>
              <Text
                className="text-xs mt-0.5 font-semibold"
                style={{ color: colors.mutedText, fontFamily: fonts.body }}
              >
                {isConnected
                  ? "You can see what they choose to share."
                  : "Ask them for an invite code to connect."}
              </Text>
            </View>
          </View>

          {/* Menu list */}
          <View
            className="mx-6 mt-6 rounded-3xl border overflow-hidden"
            style={[
              { backgroundColor: colors.surface, borderColor: colors.border },
              getShadow(colors, isDark),
            ]}
          >
            <View
              className="flex-row items-center justify-between px-4 py-4 border-b"
              style={{ borderColor: colors.border }}
            >
              <View className="flex-row items-center flex-1 min-w-0 mr-3">
                <View
                  className="p-2.5 rounded-xl mr-4"
                  style={{ backgroundColor: softTints.pink }}
                >
                  <Icon set="ion"
                    name="notifications-outline"
                    size={18}
                    color={colors.primary}
                  />
                </View>
                <View className="flex-1 min-w-0">
                  <Text
                    className="text-sm font-bold"
                    style={{ color: colors.foreground, fontFamily: fonts.body }}
                  >
                    Notifications
                  </Text>
                  <Text
                    className="text-xs mt-0.5"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    Alerts when they share an update
                  </Text>
                </View>
              </View>
              <Switch
                value={notificationsEnabled}
                disabled={savingPreference}
                onValueChange={handleToggleNotifications}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.surface}
                ios_backgroundColor={colors.border}
              />
            </View>

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
                <Icon set="ion"
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
              <Icon set="feather"
                name="chevron-right"
                size={16}
                color={colors.mutedText}
              />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push("/privacy")}
              accessibilityRole="button"
              className="flex-row items-center px-4 py-4 border-b"
              style={{ borderColor: colors.border }}
            >
              <View
                className="p-2.5 rounded-xl mr-4"
                style={{ backgroundColor: softTints.pink }}
              >
                <Icon set="ion"
                  name="shield-checkmark-outline"
                  size={18}
                  color={colors.primary}
                />
              </View>
              <Text
                className="flex-1 text-sm font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
              >
                Privacy & security
              </Text>
              <Icon set="feather"
                name="chevron-right"
                size={16}
                color={colors.mutedText}
              />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push("/support-tickets")}
              accessibilityRole="button"
              className="flex-row items-center px-4 py-4"
            >
              <View
                className="p-2.5 rounded-xl mr-4"
                style={{ backgroundColor: softTints.pink }}
              >
                <Icon set="ion"
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
              <Icon set="feather"
                name="chevron-right"
                size={16}
                color={colors.mutedText}
              />
            </TouchableOpacity>
          </View>

          {/* Disconnect */}
          {isConnected && (
            <TouchableOpacity
              onPress={handleDisconnect}
              activeOpacity={0.85}
              disabled={isDisconnecting}
              className="mx-6 mt-6 flex-row items-center justify-center py-3.5 rounded-2xl border"
              style={{
                borderColor: colors.danger,
                backgroundColor: colors.dangerLight,
              }}
            >
              <Icon set="ion" name="unlink-outline" size={15} color={colors.danger} />
              <Text
                className="ml-2 text-sm font-bold tracking-wide"
                style={{ color: colors.danger, fontFamily: fonts.body }}
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </Text>
            </TouchableOpacity>
          )}

          {/* Logout */}
          <TouchableOpacity
            onPress={handleLogout}
            activeOpacity={0.7}
            disabled={isLoggingOut}
            className="mx-6 mt-4 flex-row items-center justify-center py-3"
          >
            <Icon set="feather" name="log-out" size={15} color={colors.danger} />
            <Text
              className="ml-2 text-sm font-bold tracking-wide"
              style={{ color: colors.danger, fontFamily: fonts.body }}
            >
              {isLoggingOut ? "Logging Out..." : "Log out"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
