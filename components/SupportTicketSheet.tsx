import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Device from "expo-device";
import React, { useEffect, useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getFriendlyErrorMessage, supportApi, type SupportCategoryId, type SupportTicketMeta } from "../lib/api";
import { MESSAGE_MAX, SUBJECT_MAX, SUPPORT_CATEGORIES, validateTicketForm } from "../lib/support";
import { useTheme } from "./theme";
import { BottomSheet } from "./BottomSheet";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { showErrorToast } from "../lib/toast";

/** What "Attach app info" sends: no identifiers, just enough to reproduce a bug. */
function collectAppInfo(): SupportTicketMeta {
  const appVersion =
    Constants.expoConfig?.version ?? (Constants as unknown as { nativeAppVersion?: string }).nativeAppVersion ?? undefined;
  const buildNumber = (Constants as unknown as { nativeBuildVersion?: string }).nativeBuildVersion ?? undefined;
  let locale: string | undefined;
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    locale = undefined;
  }
  return {
    platform: Platform.OS,
    osVersion: String(Platform.Version ?? ""),
    appVersion,
    buildNumber: buildNumber ?? undefined,
    deviceModel: Device.modelName ?? undefined,
    locale,
    // Same sign as the X-Timezone-Offset header (minutes east of UTC).
    timezoneOffset: -new Date().getTimezoneOffset(),
  };
}

/**
 * Profile → Help & support: a bottom sheet that raises a support ticket
 * (`supportApi.createTicket`), then shows its ticket number. The team gets
 * an email; replies arrive as notifications and in My tickets.
 */
export function SupportTicketSheet({
  visible,
  onClose,
  onOpenTickets,
}: {
  visible: boolean;
  onClose: () => void;
  /** "My tickets": the sheet closes first, then this runs. */
  onOpenTickets: () => void;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<SupportCategoryId | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachInfo, setAttachInfo] = useState(true);
  const [sending, setSending] = useState(false);
  const [createdNumber, setCreatedNumber] = useState<string | null>(null);
  const appInfo = useMemo(collectAppInfo, []);

  // Fresh form every time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setCategory(null);
    setSubject("");
    setMessage("");
    setAttachInfo(true);
    setCreatedNumber(null);
  }, [visible]);

  const problem = validateTicketForm({ category, subject, message });

  const submit = async () => {
    if (sending) return;
    if (problem) {
      showErrorToast(problem);
      return;
    }
    setSending(true);
    try {
      const { ticket } = await supportApi.createTicket({
        category: category as SupportCategoryId,
        subject: subject.trim(),
        message: message.trim(),
        attachAppInfo: attachInfo,
        meta: attachInfo ? appInfo : undefined,
      });
      setCreatedNumber(ticket.ticketNumber);
    } catch (err) {
      showErrorToast(getFriendlyErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const openTickets = () => {
    onClose();
    // Let the sheet dismiss before pushing (iOS can't present over a closing modal).
    setTimeout(onOpenTickets, 250);
  };

  const inputStyle = {
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.foreground,
    fontFamily: fonts.body,
  };
  const label = (text: string) => (
    <Text
      style={{ color: colors.mutedText, fontSize: 13, fontWeight: "700", letterSpacing: 0.4, fontFamily: fonts.body, marginBottom: 8 }}
    >
      {text.toUpperCase()}
    </Text>
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      avoidKeyboard
      style={{ maxHeight: "92%", paddingTop: 6, paddingBottom: Math.max(20, insets.bottom + 12) }}
    >
      <View className="flex-row items-center px-6 mb-3">
        <Text
          className="flex-1"
          numberOfLines={1}
          style={{ color: colors.foreground, fontSize: 20, fontWeight: "700", fontFamily: fonts.heading }}
        >
          Help & support
        </Text>
        <TouchableOpacity
          hitSlop={6}
          onPress={onClose}
          accessibilityLabel="Close"
          className="h-9 w-9 rounded-full items-center justify-center"
          style={{ backgroundColor: colors.surfaceSoft }}
        >
          <Icon set="ion" name="close" size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {createdNumber ? (
        <View className="px-6 pt-4 items-center">
          <View
            className="items-center justify-center"
            style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.successLight }}
          >
            <Icon set="ion" name="checkmark-circle" size={40} color={colors.success} />
          </View>
          <Text
            className="mt-4 text-center"
            style={{ color: colors.foreground, fontSize: 18, fontWeight: "800", fontFamily: fonts.heading }}
          >
            We got your message
          </Text>
          <Text className="mt-2 text-center" style={{ color: colors.mutedText, fontSize: 14, lineHeight: 21, fontFamily: fonts.body }}>
            Your ticket number is
          </Text>
          <Text
            selectable
            className="mt-1"
            style={{ color: colors.primary, fontSize: 22, fontWeight: "700", fontFamily: fonts.monoSemiBold ?? fonts.mono }}
          >
            {createdNumber}
          </Text>
          <Text className="mt-3 text-center" style={{ color: colors.mutedText, fontSize: 13.5, lineHeight: 20, fontFamily: fonts.body }}>
            We&apos;ve emailed you a copy. You&apos;ll get a notification when we reply.
          </Text>
          <Button label="View my tickets" onPress={openTickets} fullWidth style={{ marginTop: 24 }} />
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} className="items-center justify-center mt-3 w-full" style={{ height: 44 }}>
            <Text style={{ color: colors.foreground, fontSize: 14.5, fontWeight: "700", fontFamily: fonts.body }}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 8 }}
        >
          <Text style={{ color: colors.mutedText, fontSize: 14, lineHeight: 21, fontFamily: fonts.body, marginBottom: 12 }}>
            Tell us what&apos;s going on and our team will get back to you.
          </Text>
          <TouchableOpacity
            onPress={openTickets}
            activeOpacity={0.7}
            accessibilityRole="button"
            className="flex-row items-center self-start mb-5"
            style={{ gap: 6 }}
          >
            <Icon set="ion" name="file-tray-full-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "700", fontFamily: fonts.body }}>My tickets</Text>
          </TouchableOpacity>

          {label("What's it about?")}
          <View className="flex-row flex-wrap mb-5" style={{ gap: 8 }}>
            {SUPPORT_CATEGORIES.map((c) => {
              const selected = category === c.id;
              return (
                <TouchableOpacity
                  hitSlop={{ top: 5, bottom: 5 }}
                  key={c.id}
                  onPress={() => setCategory(c.id)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className="flex-row items-center rounded-full px-3.5"
                  style={{
                    height: 38,
                    gap: 6,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primaryLight : colors.surface,
                  }}
                >
                  <Icon set="ion"
                    name={c.icon as React.ComponentProps<typeof Ionicons>["name"]}
                    size={16}
                    color={selected ? colors.primary : colors.mutedText}
                  />
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={{
                      color: selected ? colors.primary : colors.foreground,
                      fontSize: 13.5,
                      fontWeight: "700",
                      fontFamily: fonts.body,
                    }}
                  >
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {label("Subject")}
          <TextInput
            value={subject}
            onChangeText={(t) => setSubject(t.slice(0, SUBJECT_MAX))}
            accessibilityLabel="Subject"
            placeholder="e.g. Can't log my period"
            placeholderTextColor={colors.mutedText}
            returnKeyType="next"
            className="rounded-2xl border px-4 mb-5"
            style={{ ...inputStyle, height: 50, fontSize: 15 }}
          />

          {label("Message")}
          <TextInput
            value={message}
            onChangeText={(t) => setMessage(t.slice(0, MESSAGE_MAX))}
            accessibilityLabel="Describe the issue"
            placeholder="Describe the issue. What did you expect, and what happened?"
            placeholderTextColor={colors.mutedText}
            multiline
            className="rounded-2xl border px-4 py-3"
            style={{ ...inputStyle, minHeight: 120, fontSize: 15, textAlignVertical: "top" }}
          />
          <Text className="text-right mt-1" style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }}>
            {message.length}/{MESSAGE_MAX}
          </Text>

          <View
            className="flex-row items-center rounded-2xl px-4 py-3 mt-3"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 12 }}
          >
            <View className="flex-1">
              <Text style={{ color: colors.foreground, fontSize: 14.5, fontWeight: "700", fontFamily: fonts.body }}>Attach app info</Text>
              <Text numberOfLines={2} style={{ color: colors.mutedText, fontSize: 13, marginTop: 2, fontFamily: fonts.body }}>
                {[appInfo.deviceModel, `${appInfo.platform} ${appInfo.osVersion}`, appInfo.appVersion && `v${appInfo.appVersion}`]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
            <Switch
              value={attachInfo}
              onValueChange={setAttachInfo}
              trackColor={{ true: colors.primary, false: colors.border }}
              accessibilityLabel="Attach app info"
            />
          </View>


          <Button label="Send to support" onPress={submit} loading={sending} fullWidth style={{ marginTop: 16 }} />
        </ScrollView>
      )}
    </BottomSheet>
  );
}
