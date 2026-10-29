import { Ionicons } from "@expo/vector-icons";
import { invalidateQueries } from "../../../lib/queryCache";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
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
import { AppModalHost } from "../../../components/modals/AppModalHost";
import { ThemeToggle, useTheme } from "../../../components/theme";
import { getShadow, getSoftTints } from "../../../components/ui-tokens";
import { authApi, genzApi, getFriendlyErrorMessage, type BadgesSummary, type DashboardSummary } from "../../../lib/api";
import { EmptyState } from "../../../components/EmptyState";
import { Loader } from "../../../components/Loader";
import {
  enablePushOnDeviceAsync,
  getCurrentPushTokenQuietlyAsync,
} from "../../../lib/notifications";
import Avatar from "../../../components/Avatar";
import { CmsShortcuts } from "../../../components/CmsShortcuts";
import { useAppConfig } from "../../../components/app-config";
import { type ProfileSectionKey, sectionText, shownSections } from "../../../lib/appConfig";
import { useViewer } from "../../../hooks/useViewer";
import { PromoBanners } from "../../../components/PromoBanners";
import { useUserStats } from "../../../hooks/useUserStats";
import { useDataRefresh } from "../../../hooks/useDataRefresh";
import { SectionHeader, TabHeader } from "../../../components/ScreenHeader";
import { ColumnLabel } from "../../../components/ColumnLabel";
import { SupportTicketSheet } from "../../../components/SupportTicketSheet";
import { Icon } from "../../../components/Icon";
import { Button } from "../../../components/Button";

// Rotated across earned badge cards, like the hub tiles' per-feature colours.
const BADGE_TINTS = ["primary", "secondary", "accent", "warning", "sky", "success"] as const;

export default function Profile() {
  const { colors, isDark, fonts } = useTheme();
  const { signOut, user, updateUser } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { streakCount, walletBalance } = useUserStats();
  const { config: appConfig } = useAppConfig();
  const viewer = useViewer();
  const sections = shownSections(appConfig, "profile", viewer);
  const { enabled: genZModeEnabled, setEnabled: setGenZModeEnabled } = useGenZMode();
  const router = useRouter();
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Nura user";
  const displayEmail = user?.email || "Private account";

  // Navigation Panel Interactivity Controller States
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [achievementsModalVisible, setAchievementsModalVisible] =
    useState(false);
  const [badges, setBadges] = useState<BadgesSummary | null>(null);
  const [badgesError, setBadgesError] = useState(false);
  // "See all" waits for the sheet to finish closing: pushing a screen while a
  // pageSheet is still sliding away can drop the navigation on iOS.
  const openBadgesAfterClose = useRef(false);
  const onAchievementsDismissed = () => {
    if (!openBadgesAfterClose.current) return;
    openBadgesAfterClose.current = false;
    router.push("/badges");
  };
  useEffect(() => {
    if (!achievementsModalVisible && Platform.OS !== "ios") onAchievementsDismissed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [achievementsModalVisible]);
  const [supportModalVisible, setSupportModalVisible] = useState(false);
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
        console.warn("Profile refresh skipped or failed:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [updateUser]);

  // Earned badges for the Achievements sheet, fetched each time it opens so a
  // badge earned since the last look shows up. Keeps the last result on failure.
  React.useEffect(() => {
    if (!achievementsModalVisible) return;
    let isMounted = true;
    setBadgesError(false);
    genzApi.getBadges()
      .then((summary) => {
        if (isMounted) setBadges(summary);
      })
      .catch(() => {
        if (isMounted) setBadgesError(true);
      });
    return () => {
      isMounted = false;
    };
  }, [achievementsModalVisible]);

  const earnedBadges = badges?.badges.filter((b) => b.earned) ?? [];

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
        getFriendlyErrorMessage(error),
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
      console.warn("Dashboard summary refresh skipped or failed:", err);
    }
  }, []);

  React.useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // A tab stays mounted: catch up on logs saved elsewhere (tracker, Home).
  useDataRefresh(["dashboard", "cycle"], loadDashboard);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    invalidateQueries("auth:dashboard");
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
      console.warn("Server verification skipped during exit:", networkError);
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
    { icon: "shield-checkmark-outline", label: "Data privacy & security", tint: softTints.mint, color: colors.accent, onPress: () => router.push("/privacy") },
    { icon: "cloud-upload-outline", label: "Import from Clue or Flo", tint: softTints.pink, color: colors.primary, onPress: () => router.push("/import-data") },
    { icon: "help-circle-outline", label: "Help & support", tint: softTints.blue, color: colors.info, onPress: () => setSupportModalVisible(true) },
  ];
  const settingsOpen = activeMenuId === "settings";
  const preferenceRows: { label: string; hint: string; value: boolean; disabled?: boolean; onChange: (v: boolean) => void }[] = [
    {
      label: "Anonymous community mode",
      hint: "Hide my name on posts",
      value: anonymousMode,
      disabled: savingPreference === "anonymousCommunityMode",
      onChange: (next) => handleTogglePreference("anonymousCommunityMode", next),
    },
    { label: "Gen Z mode", hint: "Fun slang labels", value: genZModeEnabled, onChange: setGenZModeEnabled },
  ];

  const sectionLabel = (text: string) => <SectionHeader title={text} style={{ marginHorizontal: 24, marginTop: 24 }} />;
  // No overflow clipping: the rows have no fill of their own, and clipping would cut the card's shadow.
  const card = { marginHorizontal: 24, backgroundColor: colors.surface, borderRadius: 24, borderCurve: "continuous" as const, paddingVertical: 4, ...getShadow(colors, isDark) };
  const divider = <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 16 + 36 + 14 }} />;
  const menuRow = (row: (typeof accountRows)[number], last: boolean, right?: React.ReactNode) => (
    <View key={row.label}>
      <TouchableOpacity activeOpacity={0.6} onPress={row.onPress} accessibilityRole="button" className="flex-row items-center" style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <View className="items-center justify-center" style={{ width: 36, height: 36, borderRadius: 12, borderCurve: "continuous", backgroundColor: row.tint, marginRight: 14 }}>
          <Icon set="ion" name={row.icon} size={18} color={row.color} />
        </View>
        <Text numberOfLines={1} className="flex-1" style={{ color: colors.foreground, fontSize: 15, fontWeight: "600", fontFamily: fonts.body, marginRight: 8 }}>
          {row.label}
        </Text>
        {right ?? <Icon set="feather" name="chevron-right" size={18} color={colors.mutedText} />}
      </TouchableOpacity>
      {!last ? divider : null}
    </View>
  );

  const sheetHeader = (title: string, onClose: () => void) => (
    <View className="flex-row items-center justify-between mb-6">
      <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "800", letterSpacing: -0.5, fontFamily: fonts.heading }}>{title}</Text>
      <TouchableOpacity
        onPress={onClose}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Close"
        className="items-center justify-center rounded-full"
        style={{ width: 36, height: 36, backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
      >
        <Icon set="feather" name="x" size={17} color={colors.foreground} />
      </TouchableOpacity>
    </View>
  );

  // Blocks below the header, in the order the App CMS sets and with the
  // ones hidden, targeted elsewhere or out of their dates left out
  // (lib/appConfig.ts `screenSections.profile`). Headings can be renamed there.
  const blocks: Record<ProfileSectionKey, React.ReactNode> = {
    identity: (
      <View className="items-center" style={{ paddingHorizontal: 24, marginTop: 20 }}>
        <Avatar
          uri={user?.profilePicture}
          name={displayName}
          size={92}
          borderWidth={4}
          borderColor={colors.surface}
          backgroundColor={softTints.pink}
          textColor={colors.primary}
          fontFamily={fonts.heading}
        />
        <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 24, fontWeight: "800", letterSpacing: -0.6, fontFamily: fonts.heading, marginTop: 14 }}>
          {displayName}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, marginTop: 2 }}>
          {displayEmail}
        </Text>
        <Button label="Edit profile" icon="create-outline" variant="secondary" size="sm" onPress={() => router.push("/edit-profile")} style={{ marginTop: 14 }} />
      </View>
    ),
    // Optional details that used to be onboarding steps.
    completeProfile:
      !user?.profilePicture || !user?.phone ? (
      <TouchableOpacity
        accessibilityRole="button"
        activeOpacity={0.85}
        onPress={() => router.push("/edit-profile")}
        className="flex-row items-center"
        style={{ marginHorizontal: 24, marginTop: 20, padding: 14, gap: 12, borderRadius: 20, borderCurve: "continuous", backgroundColor: colors.primaryLight }}
      >
        <View className="items-center justify-center rounded-xl" style={{ width: 38, height: 38, backgroundColor: colors.surface }}>
          <Icon set="ion" name={!user?.profilePicture ? "camera-outline" : "call-outline"} size={18} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800", fontFamily: fonts.body }}>Complete your profile</Text>
          <Text style={{ color: colors.mutedText, fontSize: 13, marginTop: 2, fontFamily: fonts.body }}>
            {!user?.profilePicture && !user?.phone
              ? "Add a photo and phone number. Both optional."
              : !user?.profilePicture
                ? "Add a photo so your circles recognise you."
                : "Add a phone number for check-in calls."}
          </Text>
        </View>
        <Icon set="feather" name="chevron-right" size={18} color={colors.mutedText} />
      </TouchableOpacity>
      ) : null,
    // Stats — same flat style as the Tracker's
    stats: (
      <View className="flex-row" style={{ marginHorizontal: 24, marginTop: 20, gap: 10 }}>
        {[
          { label: "Days tracked", value: dashboard?.trackedDays ?? 0, icon: "calendar-outline" as const, color: colors.primary },
          { label: "Care points", value: walletBalance, icon: "trophy-outline" as const, color: colors.success },
          { label: "Day streak", value: streakCount, icon: "flame" as const, color: colors.warning },
        ].map((m) => (
          <View
            key={m.label}
            accessible
            accessibilityLabel={`${m.label}: ${m.value}`}
            className="flex-1 items-center"
            style={{ backgroundColor: colors.surface, borderRadius: 20, borderCurve: "continuous", paddingVertical: 14, paddingHorizontal: 6, ...getShadow(colors, isDark) }}
          >
            <View className="flex-row items-center" style={{ gap: 5, maxWidth: "100%" }}>
              <Icon set="ion" name={m.icon} size={15} color={m.color} />
              {/* Big numbers shrink to fit instead of pushing the column wider. */}
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                maxFontSizeMultiplier={1.3}
                style={{ flexShrink: 1, color: colors.foreground, fontSize: 18, fontWeight: "800", letterSpacing: -0.3, fontVariant: ["tabular-nums"], fontFamily: fonts.heading }}
              >
                {m.value.toLocaleString("en-US")}
              </Text>
            </View>
            <ColumnLabel style={{ color: colors.mutedText, fontSize: 13.5, fontWeight: "600", fontFamily: fonts.body, marginTop: 3 }}>
              {m.label}
            </ColumnLabel>
          </View>
        ))}
      </View>
    ),
    account: (
      <>
        {sectionLabel(sectionText(sections, "account", "Your account"))}
        <View style={card}>{accountRows.map((row, i) => menuRow(row, i === accountRows.length - 1))}</View>
      </>
    ),
    preferences: (
      <>
        {sectionLabel(sectionText(sections, "preferences", "Preferences"))}
        <View style={card}>
          {menuRow(
            {
              icon: "grid-outline",
              label: "Customize Home",
              tint: softTints.lavender,
              color: colors.secondary,
              onPress: () => router.push("/customize-home"),
            },
            false,
          )}
          {menuRow(
            {
              icon: "notifications-outline",
              label: "Notifications",
              tint: softTints.pink,
              color: colors.primary,
              onPress: () => router.push("/notification-settings"),
            },
            false,
          )}
          {menuRow(
            {
              icon: "options-outline",
              label: "Display & community",
              tint: softTints.mint,
              color: colors.accent,
              onPress: () => setActiveMenuId(settingsOpen ? null : "settings"),
            },
            !settingsOpen,
            <Icon set="feather" name={settingsOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedText} />,
          )}
          {settingsOpen
            ? preferenceRows.map((p, i) => (
                <View key={p.label}>
                  <View className="flex-row items-center" style={{ paddingLeft: 16 + 36 + 14, paddingRight: 16, paddingVertical: 12, gap: 12 }}>
                    <View className="flex-1">
                      <Text style={{ color: colors.foreground, fontSize: 14.5, fontWeight: "600", fontFamily: fonts.body }}>{p.label}</Text>
                      {p.hint ? <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, marginTop: 1 }}>{p.hint}</Text> : null}
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
      </>
    ),
    privacyHelp: (
      <>
        {sectionLabel(sectionText(sections, "privacyHelp", "Privacy & help"))}
        <View style={card}>{privacyRows.map((row, i) => menuRow(row, i === privacyRows.length - 1))}</View>
      </>
    ),
    // App CMS: banners and features/links an admin placed on Profile.
    // Both render nothing by default.
    promo: <PromoBanners placement="profile" style={{ marginTop: 24 }} />,
    shortcuts: <CmsShortcuts placement="profile" style={{ marginTop: 24 }} />,
    logout: (
      <TouchableOpacity
        onPress={handleLogout}
        activeOpacity={0.7}
        disabled={isLoggingOut}
        accessibilityRole="button"
        className="flex-row items-center justify-center"
        style={{ ...card, marginTop: 24, paddingVertical: 15, gap: 8 }}
      >
        <Icon set="feather" name="log-out" size={16} color={colors.danger} />
        <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "700", fontFamily: fonts.body }}>
          {isLoggingOut ? "Logging out…" : "Log out"}
        </Text>
      </TouchableOpacity>
    ),
  };

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
          <TabHeader title="Profile" right={<ThemeToggle />} />

          {sections.map((s) => (
            <React.Fragment key={s.key}>{blocks[s.key]}</React.Fragment>
          ))}
        </ScrollView>
      </SafeAreaView>

      {/* Achievements */}
      <Modal
        visible={achievementsModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAchievementsModalVisible(false)}
        onDismiss={onAchievementsDismissed}
      >
        {/* Android ignores pageSheet and renders fullscreen, so SafeAreaView keeps the header clear. */}
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background, paddingHorizontal: 24, paddingTop: 20 }}>
          {sheetHeader("Your achievements", () => setAchievementsModalVisible(false))}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }} style={{ flexGrow: 0, flexShrink: 1 }}>
            {!badges && !badgesError ? (
              <Loader style={{ paddingVertical: 40 }} />
            ) : !badges ? (
              <EmptyState compact icon="wifi-off" title="Couldn't load your badges" message="Check your connection and try again." />
            ) : earnedBadges.length === 0 ? (
              <EmptyState compact icon="medal-outline" title="No badges yet" message="Log your cycle to start earning them." />
            ) : (
              <>
                <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.mono, marginBottom: 12 }}>
                  {`${badges.earnedCount} of ${badges.badges.length} earned`}
                </Text>
                {/* White card with a tinted icon square, like the app's list rows. */}
                <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                  {earnedBadges.map((b, i) => {
                    const tintKey = BADGE_TINTS[i % BADGE_TINTS.length];
                    return (
                      <View
                        key={b.key}
                        style={{ width: "48%", backgroundColor: colors.surface, borderRadius: 20, borderCurve: "continuous", padding: 16, ...getShadow(colors, isDark) }}
                        accessibilityLabel={`${b.title}, earned`}
                      >
                        <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors[`${tintKey}Light`], alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                          <Text style={{ fontSize: 20 }}>{b.emoji}</Text>
                        </View>
                        <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }} numberOfLines={1}>
                          {b.title}
                        </Text>
                        <Text style={{ fontSize: 13.5, color: colors.mutedText, marginTop: 3, fontFamily: fonts.body }} numberOfLines={2}>
                          {b.description}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>
          <TouchableOpacity
            onPress={() => {
              openBadgesAfterClose.current = true;
              setAchievementsModalVisible(false);
            }}
            activeOpacity={0.85}
            className="items-center justify-center rounded-full mt-5"
            style={{ height: 50, backgroundColor: colors.primaryLight }}
          >
            <Text style={{ color: colors.primary, fontSize: 14.5, fontWeight: "800", fontFamily: fonts.body }}>See all streaks & badges</Text>
          </TouchableOpacity>
        </SafeAreaView>
        {achievementsModalVisible ? <AppModalHost inline /> : null}
      </Modal>

      {/* Help & support: raises a ticket (components/SupportTicketSheet.tsx) */}
      <SupportTicketSheet
        visible={supportModalVisible}
        onClose={() => setSupportModalVisible(false)}
        onOpenTickets={() => router.push("/support-tickets")}
      />

    </>
  );
}
