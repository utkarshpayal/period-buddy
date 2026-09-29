import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import { Linking, Text, TouchableOpacity, View } from "react-native";
import { useAppConfig } from "./app-config";
import { useTheme } from "./theme";
import { useViewer } from "../hooks/useViewer";
import { gateState } from "../lib/appConfig";

const DISMISSED_UPDATE_KEY = "period-buddy.dismissed-update-version";

/**
 * App-wide switches from the App CMS's App settings page, drawn over every
 * screen (mounted in app/_layout.tsx's AppShell, above the Stack):
 *   maintenance on       → full-screen message, app unusable, "Try again" refetches
 *   below minVersion     → full-screen "Update required" with the store link
 *   below latestVersion  → dismissible "Update available" card (once per version)
 * Needs no auth; with no settings (older backend, offline, fresh install)
 * it renders nothing.
 */
export function AppGate() {
  const { config, refresh } = useAppConfig();
  const viewer = useViewer();
  const { colors, fonts } = useTheme();
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_UPDATE_KEY).then(setDismissedUpdate).catch(() => undefined);
  }, []);

  const gate = gateState(config.settings, viewer, dismissedUpdate);
  if (gate.kind === "none") return null;

  const openStore = (url: string | null) => {
    if (!url) return;
    Linking.openURL(url).catch(() => WebBrowser.openBrowserAsync(url).catch(() => undefined));
  };

  if (gate.kind === "update" && !gate.required) {
    const dismiss = () => {
      setDismissedUpdate(gate.version);
      AsyncStorage.setItem(DISMISSED_UPDATE_KEY, gate.version).catch(() => undefined);
    };
    return (
      <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, bottom: 104, zIndex: 50 }}>
        <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 16, flexDirection: "row", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
          <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
            <Ionicons name="arrow-up-circle-outline" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 13.5, fontFamily: fonts.body }}>{gate.title}</Text>
            <Text style={{ color: colors.mutedText, fontSize: 12.5, marginTop: 2, fontFamily: fonts.body }} numberOfLines={2}>{gate.message}</Text>
          </View>
          {gate.storeUrl ? (
            <TouchableOpacity onPress={() => openStore(gate.storeUrl)} style={{ backgroundColor: colors.button, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, marginLeft: 8 }} accessibilityRole="button">
              <Text style={{ color: colors.buttonText, fontWeight: "800", fontSize: 13, fontFamily: fonts.body }}>Update</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={dismiss} hitSlop={10} style={{ marginLeft: 8 }} accessibilityRole="button" accessibilityLabel="Not now">
            <Ionicons name="close" size={18} color={colors.mutedText} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Blocking: maintenance or a required update.
  const isMaintenance = gate.kind === "maintenance";
  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 32 }} accessibilityViewIsModal>
      <View style={{ width: 84, height: 84, borderRadius: 28, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: 22 }}>
        <Ionicons name={isMaintenance ? "construct-outline" : "cloud-download-outline"} size={38} color={colors.primary} />
      </View>
      <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "800", textAlign: "center", fontFamily: fonts.heading }}>
        {isMaintenance ? gate.title : gate.title || "Update required"}
      </Text>
      <Text style={{ color: colors.mutedText, fontSize: 14, textAlign: "center", marginTop: 10, lineHeight: 20, fontFamily: fonts.body, maxWidth: 340 }}>
        {gate.message}
      </Text>
      {isMaintenance ? (
        <TouchableOpacity
          disabled={checking}
          onPress={async () => {
            setChecking(true);
            await refresh();
            setChecking(false);
          }}
          style={{ marginTop: 28, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 28, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
          accessibilityRole="button"
        >
          <Text style={{ color: colors.foreground, fontWeight: "800", fontFamily: fonts.body }}>{checking ? "Checking…" : "Try again"}</Text>
        </TouchableOpacity>
      ) : gate.kind === "update" && gate.storeUrl ? (
        <TouchableOpacity onPress={() => openStore(gate.storeUrl)} style={{ marginTop: 28, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 32, backgroundColor: colors.button }} accessibilityRole="button">
          <Text style={{ color: colors.buttonText, fontWeight: "800", fontFamily: fonts.body }}>Update now</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
