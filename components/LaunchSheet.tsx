import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { useAppConfig } from "./app-config";
import { genZLabel, useGenZMode } from "./genz-mode";
import type { LaunchSheetRequest } from "./modals/types";
import { ThemeColors, useTheme } from "./theme";
import { appConfigApi } from "../lib/api";
import type { TapAction } from "../lib/appConfig";
import { runTapAction } from "../lib/tapAction";
import { Icon } from "./Icon";

/**
 * Bottom sheet for a feature the App CMS has locked (The-Nura-CMS
 * docs/launch-states.md §4.2–4.3): "Coming soon" with an optional Notify me
 * button, or "Paused" with an optional way to get help meanwhile. Opened
 * via lib/modal-host.ts `showLaunchSheet` (tiles and the route guard) and
 * rendered by AppModalHost; never mount it directly.
 */

// Items joined this session, so reopening the sheet before the next config
// fetch (which carries `onList` from the server) still shows "on the list".
const joined = new Set<string>();

/** Button text for the paused sheet's alternative when the CMS didn't set one. */
const alternativeLabel = (action: TapAction) => (action.type === "route" ? "Go there instead" : "Get help another way");

export function LaunchSheet({ request, onClose }: { request: LaunchSheetRequest; onClose: () => void }) {
  const { colors, fonts } = useTheme();
  const { enabled: genZ } = useGenZMode();
  const { refresh } = useAppConfig();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { sheet, access } = request;
  const [onList, setOnList] = useState(sheet.onList || joined.has(request.itemKey));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const title = request.builtIn ? genZLabel(request.title, genZ) : request.title;
  const color = colors[request.colorKey];
  const bg = colors[`${request.colorKey}Light` as keyof ThemeColors];
  const message = sheet.message ?? (request.description || null);
  const paused = access === "paused";
  const hasAlternative = paused && sheet.alternative.type !== "none";

  const notify = async () => {
    if (onList || saving) return;
    // Optimistic: the button flips straight away and flips back on failure.
    setSaving(true);
    setFailed(false);
    setOnList(true);
    joined.add(request.itemKey);
    try {
      await appConfigApi.notifyLaunch(request.itemKey);
      refresh().catch(() => undefined);
    } catch {
      joined.delete(request.itemKey);
      setOnList(false);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const openAlternative = () => {
    onClose();
    runTapAction(sheet.alternative, router);
  };

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ backgroundColor: colors.overlay, bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
        />
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1,
            paddingHorizontal: 24,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 12) + 22,
            alignItems: "center",
          }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 22 }} />

          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
            <Icon set="ion" name={request.icon as keyof typeof Ionicons.glyphMap} size={28} color={color} />
            {paused ? (
              <View
                style={{
                  position: "absolute",
                  right: -4,
                  bottom: -4,
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: colors.warning,
                  borderWidth: 3,
                  borderColor: colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon set="ion" name="pause" size={10} color={colors.buttonText} />
              </View>
            ) : null}
          </View>

          <Text
            accessibilityRole="header"
            style={{ marginTop: 16, fontSize: 19, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading, textAlign: "center" }}
          >
            {title}
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontSize: 13,
              fontWeight: "800",
              color: paused ? colors.warning : colors.primary,
              fontFamily: fonts.body,
              textAlign: "center",
            }}
          >
            {sheet.headline}
          </Text>
          {message ? (
            <Text
              style={{ marginTop: 12, fontSize: 14, lineHeight: 21, color: colors.mutedText, fontFamily: fonts.body, textAlign: "center", maxWidth: 320 }}
            >
              {message}
            </Text>
          ) : null}

          <View style={{ alignSelf: "stretch", marginTop: 24, gap: 10 }}>
            {!paused && sheet.notifyMe ? (
              <SheetButton
                label={onList ? "✓  You're on the list" : "Notify me"}
                icon={onList ? undefined : "notifications-outline"}
                onPress={notify}
                muted={onList}
                busy={saving && !onList}
                accessibilityLabel={onList ? "You're on the list. We'll let you know when it's here." : "Notify me when it's here"}
              />
            ) : null}
            {hasAlternative ? <SheetButton label={sheet.alternativeLabel ?? alternativeLabel(sheet.alternative)} onPress={openAlternative} /> : null}
            {failed ? (
              <Text style={{ fontSize: 12, color: colors.danger, fontFamily: fonts.body, textAlign: "center" }}>
                Couldn&apos;t add you just now. Please try again.
              </Text>
            ) : null}
            {!paused && sheet.notifyMe ? (
              <TouchableOpacity accessibilityRole="button" onPress={onClose} style={{ alignItems: "center", paddingVertical: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body }}>
                  {onList ? "Close" : "Maybe later"}
                </Text>
              </TouchableOpacity>
            ) : (
              <SheetButton label="OK" onPress={onClose} secondary={hasAlternative} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SheetButton({
  label,
  icon,
  onPress,
  muted,
  secondary,
  busy,
  accessibilityLabel,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  muted?: boolean;
  secondary?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors, fonts } = useTheme();
  const plain = muted || secondary;
  const fg = muted ? colors.success : secondary ? colors.mutedText : colors.buttonText;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: muted, busy }}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={muted || busy}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderRadius: 16,
        borderWidth: 1,
        paddingVertical: 14,
        backgroundColor: muted ? colors.successLight : secondary ? colors.input : colors.primary,
        borderColor: muted ? colors.successLight : secondary ? colors.border : colors.primary,
      }}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon set="ion" name={icon} size={17} color={fg} /> : null}
      <Text style={{ fontSize: 15, fontWeight: plain ? "700" : "800", color: fg, fontFamily: fonts.body }}>{label}</Text>
    </TouchableOpacity>
  );
}
