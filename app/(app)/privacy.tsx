import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StatusBar, Switch, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-context";
import { ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import { useTheme } from "../../components/theme";
import { alert } from "../../lib/alert";
import {
  authApi,
  getFriendlyErrorMessage,
  type PrivacyConsents,
  type PrivacySettings as PrivacySettingsData,
  type SignedInDevice,
} from "../../lib/api";
import { downloadMyData } from "../../lib/privacyExport";
import { cleanupTempFiles } from "../../lib/tempFiles";
import {
  appSwitcherBlurAvailable,
  screenPrivacyAvailable,
  setScreenPrivacySetting,
  useScreenPrivacySetting,
} from "../../lib/screenPrivacy";
import { Icon } from "../../components/Icon";

const PLATFORM_LABEL = { android: "Android phone", ios: "iPhone", web: "Web browser" } as const;

const retentionLabel = (days: number) => (days === 0 ? "Keep" : days === 365 ? "1 year" : `${days} days`);

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "active now";
  if (mins < 60) return `active ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `active ${hours} h ago`;
  return `active ${Math.round(hours / 24)} days ago`;
};

/**
 * Privacy & security: how data is protected, the AI consent switch,
 * Import from Clue or Flo, "Download my data", and the signed-in devices
 * (sign one out, or all).
 * Reached from Profile → Data privacy & security.
 */
export default function PrivacySettings() {
  const { colors, isDark, fonts } = useTheme();
  const { signOut } = useAuth();
  const router = useRouter();
  const [consents, setConsents] = useState<PrivacyConsents | null>(null);
  const [devices, setDevices] = useState<SignedInDevice[] | null>(null);
  const [savingAi, setSavingAi] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [settings, setSettings] = useState<PrivacySettingsData | null>(null);
  // A half that failed shows "Couldn't load · Retry" instead of a spinner
  // that never ends (offline, the AI switch could otherwise never be reached).
  const [failed, setFailed] = useState({ privacy: false, sessions: false });
  const blockScreenshots = useScreenPrivacySetting("screenshots");
  const blurSwitcher = useScreenPrivacySetting("appSwitcher");

  const load = useCallback(async () => {
    setFailed({ privacy: false, sessions: false });
    const [privacy, sessions] = await Promise.allSettled([authApi.getPrivacy(), authApi.getSessions()]);
    if (privacy.status === "fulfilled") {
      setConsents(privacy.value.consents);
      setSettings(privacy.value.settings ?? null);
    }
    if (sessions.status === "fulfilled") setDevices(sessions.value.sessions);
    setFailed({ privacy: privacy.status === "rejected", sessions: sessions.status === "rejected" });
  }, []);

  const loadFailed = (
    <TouchableOpacity accessibilityRole="button" onPress={load} activeOpacity={0.7} hitSlop={8}>
      <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13, fontFamily: fonts.body }}>Couldn&apos;t load · Retry</Text>
    </TouchableOpacity>
  );

  useEffect(() => {
    load();
    // Removes a data export shared on an earlier visit.
    cleanupTempFiles();
  }, [load]);

  const ai = consents?.aiProcessing;

  const setAi = async (granted: boolean) => {
    setSavingAi(true);
    try {
      setConsents((await authApi.setAiConsent(granted)).consents);
    } catch (err) {
      alert("Couldn't save that", getFriendlyErrorMessage(err));
    } finally {
      setSavingAi(false);
    }
  };

  const onToggleAi = (granted: boolean) => {
    if (granted) return setAi(true);
    alert(
      "Turn off AI features?",
      "Nura AI chat, reading your documents, report summaries, voice and check-in calls will stop working. Your existing chats stay in the app.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Turn off", style: "destructive", onPress: () => setAi(false) },
      ],
    );
  };

  // Optimistic: flip it now, put it back if the save fails.
  const saveSetting = async (
    patch: Partial<Pick<PrivacySettingsData, "hideNotificationDetails" | "aiChatRetentionDays" | "newSignInAlerts">>,
  ) => {
    const before = settings;
    setSettings((current) => (current ? { ...current, ...patch } : current));
    try {
      setSettings((await authApi.setPrivacySettings(patch)).settings);
    } catch (err) {
      setSettings(before);
      alert("Couldn't save that", getFriendlyErrorMessage(err));
    }
  };

  const onPickRetention = (days: number) => {
    if (!settings || days === settings.aiChatRetentionDays) return;
    if (days === 0) return saveSetting({ aiChatRetentionDays: 0 });
    alert(
      `Delete chats after ${retentionLabel(days).toLowerCase()}?`,
      `Nura AI and document chats older than ${retentionLabel(days).toLowerCase()} will be deleted for good, including ones you have now.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete old chats", style: "destructive", onPress: () => saveSetting({ aiChatRetentionDays: days }) },
      ],
    );
  };

  const onDownload = async () => {
    setExporting(true);
    try {
      await downloadMyData();
    } catch (err) {
      alert("Couldn't download your data", getFriendlyErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const endSession = (device: SignedInDevice) =>
    alert("Sign out this device?", "It will need to sign in again to use your account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          try {
            await authApi.endSession(device.id);
            setDevices((list) => list?.filter((d) => d.id !== device.id) ?? null);
          } catch (err) {
            alert("Couldn't sign it out", getFriendlyErrorMessage(err));
          }
        },
      },
    ]);

  const signOutEverywhere = () =>
    alert("Sign out everywhere?", "Every device, this one included, will need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out everywhere",
        style: "destructive",
        onPress: async () => {
          try {
            await authApi.logoutAll();
          } catch (err) {
            return alert("Couldn't sign out", getFriendlyErrorMessage(err));
          }
          await signOut();
          router.replace("/");
        },
      },
    ]);

  // Each can be switched on or off; all start on. The first two are saved on
  // the account, the last two on this phone only.
  const toggles = [
    settings && {
      key: "notifications",
      title: "Hide notification details",
      detail: "Notifications say “You have a new update” on the lock screen.",
      value: settings.hideNotificationDetails,
      onChange: (on: boolean) => saveSetting({ hideNotificationDetails: on }),
    },
    settings && {
      key: "sign-in",
      title: "New sign-in alerts",
      detail: "Get an email when your account is used on a new device.",
      value: settings.newSignInAlerts,
      onChange: (on: boolean) => saveSetting({ newSignInAlerts: on }),
    },
    screenPrivacyAvailable() && {
      key: "screenshots",
      title: "Block screenshots",
      detail: "Your cycle, chats and documents can't be screenshotted or recorded.",
      value: blockScreenshots,
      onChange: (on: boolean) => setScreenPrivacySetting("screenshots", on),
    },
    appSwitcherBlurAvailable() && {
      key: "switcher",
      title: "Blur in app switcher",
      detail: "Hides what's on screen when you switch apps.",
      value: blurSwitcher,
      onChange: (on: boolean) => setScreenPrivacySetting("appSwitcher", on),
    },
  ].filter((t): t is Exclude<typeof t, false | null | undefined | ""> => Boolean(t));

  const card = { marginHorizontal: 24, backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 12 };
  const body = { color: colors.foreground, fontSize: 14, lineHeight: 21, fontFamily: fonts.body };
  const muted = { color: colors.mutedText, fontSize: 13, lineHeight: 19, fontFamily: fonts.body };
  const section = (title: string) => <SectionHeader title={title} style={{ marginHorizontal: 24, marginTop: 24 }} />;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Privacy & security" />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          {section("How your data is protected")}
          <View style={card}>
            {[
              { icon: "lock-closed-outline" as const, text: "Your notes, chats, messages and the text of your documents are encrypted when stored." },
              { icon: "document-lock-outline" as const, text: "Uploaded documents are private files, opened only through links that expire within minutes." },
              { icon: "people-outline" as const, text: "Sharing (partner, circles, doctors) is always your choice, and you can stop it any time." },
              { icon: "finger-print-outline" as const, text: "Turn on App lock to keep the app private on a shared phone." },
            ].map((item) => (
              <View key={item.icon} className="flex-row" style={{ gap: 12 }}>
                <Icon set="ion" name={item.icon} size={18} color={colors.accent} style={{ marginTop: 1 }} />
                <Text style={[body, { flex: 1 }]}>{item.text}</Text>
              </View>
            ))}
          </View>

          {section("AI features")}
          <View style={card}>
            <View className="flex-row items-center" style={{ gap: 12 }}>
              <View className="flex-1">
                <Text style={[body, { fontWeight: "700" }]}>Use AI features</Text>
                <Text style={muted}>
                  Nura AI chat, reading your documents, report summaries, voice and check-in calls send what you share to{" "}
                  {ai?.providers.join(", ") ?? "our AI provider"} to answer you. Turning this off stops that.
                </Text>
              </View>
              {ai ? (
                <Switch
                  value={ai.allowedNow}
                  disabled={savingAi}
                  onValueChange={onToggleAi}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor="#FFFFFF"
                  accessibilityLabel="Use AI features"
                />
              ) : failed.privacy ? (
                loadFailed
              ) : (
                <ActivityIndicator color={colors.primary} />
              )}
            </View>
          </View>

          {settings && (
            <View style={[card, { marginTop: 12 }]}>
              <Text style={[body, { fontWeight: "700" }]}>Keep AI chats</Text>
              <Text style={muted}>Older Nura AI and document chats are deleted automatically.</Text>
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {settings.aiChatRetentionOptions.map((days) => {
                  const selected = settings.aiChatRetentionDays === days;
                  return (
                    <TouchableOpacity
                      key={days}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      activeOpacity={0.7}
                      onPress={() => onPickRetention(days)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary : "transparent",
                      }}
                    >
                      <Text style={{ color: selected ? "#FFFFFF" : colors.foreground, fontWeight: "700", fontSize: 13, fontFamily: fonts.body }}>
                        {retentionLabel(days)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {toggles.length > 0 && section("Privacy on this phone")}
          {toggles.length > 0 && (
            <View style={card}>
              {toggles.map((t) => (
                <View key={t.key} className="flex-row items-center" style={{ gap: 12 }}>
                  <View className="flex-1">
                    <Text style={[body, { fontWeight: "700" }]}>{t.title}</Text>
                    <Text style={muted}>{t.detail}</Text>
                  </View>
                  <Switch
                    value={t.value}
                    onValueChange={t.onChange}
                    trackColor={{ true: colors.primary, false: colors.border }}
                    thumbColor="#FFFFFF"
                    accessibilityLabel={t.title}
                  />
                </View>
              ))}
            </View>
          )}

          {section("Your data")}
          <View style={card}>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.7}
              onPress={() => router.push("/import-data")}
              className="flex-row items-center"
              style={{ gap: 12 }}
            >
              <Icon set="ion" name="cloud-upload-outline" size={20} color={colors.primary} />
              <View className="flex-1">
                <Text style={[body, { fontWeight: "700" }]}>Import from Clue or Flo</Text>
                <Text style={muted}>Bring your period history from another app.</Text>
              </View>
              <Icon set="feather" name="chevron-right" size={18} color={colors.mutedText} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.7}
              disabled={exporting}
              onPress={onDownload}
              className="flex-row items-center"
              style={{ gap: 12 }}
            >
              <Icon set="ion" name="download-outline" size={20} color={colors.primary} />
              <View className="flex-1">
                <Text style={[body, { fontWeight: "700" }]}>Download my data</Text>
                <Text style={muted}>A copy of everything The Nura stores about you, as a file.</Text>
              </View>
              {exporting ? <ActivityIndicator color={colors.primary} /> : <Icon set="feather" name="chevron-right" size={18} color={colors.mutedText} />}
            </TouchableOpacity>
            <Text style={muted}>
              To delete your account and data, use Delete account in Profile. Your data is erased for good 30 days after you delete it.
            </Text>
          </View>

          {section("Signed-in devices")}
          <View style={card}>
            {devices === null ? (
              failed.sessions ? loadFailed : <ActivityIndicator color={colors.primary} />
            ) : devices.length === 0 ? (
              <Text style={muted}>No other devices.</Text>
            ) : (
              devices.map((d) => (
                <View key={d.id} className="flex-row items-center" style={{ gap: 12 }}>
                  <Icon set="ion"
                    name={d.platform === "web" ? "desktop-outline" : "phone-portrait-outline"}
                    size={20}
                    color={colors.mutedText}
                  />
                  <View className="flex-1">
                    <Text style={[body, { fontWeight: "700" }]}>
                      {d.platform ? PLATFORM_LABEL[d.platform] : "Device"}
                      {d.current ? " · this device" : ""}
                    </Text>
                    <Text style={muted}>{ago(d.lastActiveAt)}</Text>
                  </View>
                  {!d.current && (
                    <TouchableOpacity accessibilityRole="button" onPress={() => endSession(d)} hitSlop={8}>
                      <Text style={{ color: colors.danger, fontWeight: "700", fontFamily: fonts.body }}>Sign out</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
            <TouchableOpacity accessibilityRole="button" activeOpacity={0.7} onPress={signOutEverywhere} style={{ paddingTop: 4 }}>
              <Text style={{ color: colors.danger, fontWeight: "700", fontFamily: fonts.body }}>Sign out everywhere</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
