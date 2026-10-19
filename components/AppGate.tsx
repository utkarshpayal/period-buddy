import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useRef, useState } from "react";
import { Animated, BackHandler, Easing, Image, Linking, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppConfig } from "./app-config";
import { useTheme } from "./theme";
import { getShadow } from "./ui-tokens";
import { useViewer } from "../hooks/useViewer";
import { gateState, type UpdatePrompt } from "../lib/appConfig";
import { openStoreLink } from "../lib/notifications";
import { hideUpdatePreview, useUpdatePreview } from "../lib/updatePreview";
import { Icon } from "./Icon";

// Holds the last closed prompt's key: its `promptId`, else the
// `latestVersion` (the only thing builds before promptId stored here).
const DISMISSED_UPDATE_KEY = "period-buddy.dismissed-update-version";

const APP_ICON = require("../assets/images/brand/app-icon.png");

/** Play Store via market:// first on Android, then the https page, then the browser. */
function openStore(url: string | null) {
  if (!url) return;
  openStoreLink(url)
    .then((opened) => {
      if (opened) return;
      return Linking.openURL(url).catch(() => WebBrowser.openBrowserAsync(url));
    })
    .catch(() => undefined);
}

/**
 * App-wide switches from the App CMS's App settings page, drawn over every
 * screen (mounted in app/_layout.tsx's AppShell, above the Stack):
 *   maintenance on       → full-screen message, app unusable, "Try again" refetches
 *   below minVersion     → full-screen "Update required" with the store link
 *   below latestVersion,
 *   or forceShowAll      → the update sheet (What's new, Update now / Later),
 *                          once per promptId (else per latestVersion)
 * Needs no auth; with no settings (older backend, offline, fresh install)
 * it renders nothing. The sheet is a plain overlay, not a <Modal>, so it
 * never fights PromoPopup or a paywall for the native modal slot.
 */
export function AppGate() {
  const { config, refresh } = useAppConfig();
  const viewer = useViewer();
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null);
  // The soft prompt waits for the stored dismissal, so it never flashes up
  // on launch for someone who already closed it.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_UPDATE_KEY)
      .then(setDismissedUpdate)
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  const previewing = useUpdatePreview();
  const gate = gateState(config.settings, viewer, dismissedUpdate);

  // Dev preview (lib/updatePreview.ts): the soft sheet with the CMS's text, nothing saved on close.
  if (previewing && (gate.kind === "none" || (gate.kind === "update" && !gate.required))) {
    const forced = gateState(
      { ...config.settings, update: { ...config.settings.update, minVersion: null, forceShowAll: true, promptId: "dev-preview" } },
      // gateState never prompts on web; the preview should still open there.
      viewer.platform === "web" ? { ...viewer, platform: "android" } : viewer,
      null,
    );
    if (forced.kind === "update") {
      return <UpdateSheet key="dev-preview" prompt={{ ...forced, dismissible: true }} onDismiss={hideUpdatePreview} />;
    }
  }

  if (gate.kind === "none") return null;

  if (gate.kind === "update" && !gate.required) {
    if (!loaded) return null;
    const dismiss = () => {
      setDismissedUpdate(gate.promptKey);
      AsyncStorage.setItem(DISMISSED_UPDATE_KEY, gate.promptKey).catch(() => undefined);
    };
    return <UpdateSheet key={gate.promptKey} prompt={gate} onDismiss={dismiss} />;
  }

  return <BlockingScreen gate={gate} onRetry={refresh} />;
}

/** The app icon with a small badge, shared by the sheet and the blocking screens. */
function AppIconBadge({ icon, tint }: { icon: keyof typeof Ionicons.glyphMap; tint: string }) {
  const { colors, isDark } = useTheme();
  return (
    <View style={{ width: 88, height: 88 }}>
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 24,
          overflow: "hidden",
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          ...getShadow(colors, isDark),
        }}
      >
        <Image source={APP_ICON} style={{ width: "100%", height: "100%" }} resizeMode="cover" accessibilityIgnoresInvertColors />
      </View>
      <View
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: tint,
          borderWidth: 3,
          borderColor: colors.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon set="ion" name={icon} size={15} color={colors.buttonText} />
      </View>
    </View>
  );
}

function WhatsNew({ highlights }: { highlights: string[] }) {
  const { colors, fonts } = useTheme();
  if (highlights.length === 0) return null;
  return (
    <View
      style={{
        alignSelf: "stretch",
        marginTop: 18,
        borderRadius: 18,
        backgroundColor: colors.surfaceSoft,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 10,
      }}
    >
      <Text style={{ fontSize: 11.5, fontWeight: "800", letterSpacing: 0.8, color: colors.primary, fontFamily: fonts.body }}>
        WHAT&apos;S NEW
      </Text>
      {highlights.map((h, i) => (
        <View key={`${i}-${h}`} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: colors.primaryLight,
              alignItems: "center",
              justifyContent: "center",
              marginTop: 1,
            }}
          >
            <Icon set="ion" name="checkmark" size={13} color={colors.primary} />
          </View>
          <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.foreground, fontFamily: fonts.body }}>{h}</Text>
        </View>
      ))}
    </View>
  );
}

function PrimaryButton({ label, icon, onPress, disabled }: { label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean }) {
  const { colors, fonts } = useTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        alignSelf: "stretch",
        minHeight: 52,
        borderRadius: 999,
        backgroundColor: colors.button,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 24,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon ? <Icon set="ion" name={icon} size={18} color={colors.buttonText} /> : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ color: colors.buttonText, fontSize: 15.5, fontWeight: "800", fontFamily: fonts.body }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** "A new version is available" bottom sheet over the current screen. */
function UpdateSheet({ prompt, onDismiss }: { prompt: UpdatePrompt; onDismiss: () => void }) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const closing = useRef(false);

  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(progress, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [progress, reduceMotion]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (reduceMotion) return onDismiss();
    Animated.timing(progress, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => onDismiss());
  };

  // Android back closes a dismissible sheet and is swallowed otherwise.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (prompt.dismissible) close();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt.dismissible]);

  const update = () => {
    openStore(prompt.storeUrl);
    // Someone who went to the store isn't asked again for this prompt
    // (the store may just say "Open" if they're already current).
    if (prompt.dismissible) close();
  };

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [480, 0] });

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, justifyContent: "flex-end" }}>
      <Animated.View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: progress }}>
        <Pressable
          accessibilityLabel={prompt.dismissible ? "Close" : undefined}
          disabled={!prompt.dismissible}
          onPress={close}
          style={{ flex: 1, backgroundColor: colors.overlay }}
        />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={{
          transform: [{ translateY }],
          maxHeight: "88%",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          width: "100%",
          maxWidth: 640,
          alignSelf: "center",
        }}
      >
        <ScrollView
          bounces={false}
          contentContainerStyle={{
            alignItems: "center",
            paddingHorizontal: 24,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 12) + 18,
          }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 22 }} />
          <AppIconBadge icon="arrow-up" tint={colors.primary} />
          {prompt.version ? (
            <View style={{ marginTop: 14, borderRadius: 999, backgroundColor: colors.primaryLight, paddingHorizontal: 12, paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary, fontFamily: fonts.mono }}>Version {prompt.version}</Text>
            </View>
          ) : null}
          <Text
            accessibilityRole="header"
            style={{ marginTop: 12, fontSize: 21, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading, textAlign: "center" }}
          >
            {prompt.title}
          </Text>
          <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 21, color: colors.mutedText, fontFamily: fonts.body, textAlign: "center", maxWidth: 340 }}>
            {prompt.message}
          </Text>
          <WhatsNew highlights={prompt.highlights} />
          <View style={{ alignSelf: "stretch", marginTop: 22, gap: 6 }}>
            {prompt.storeUrl ? <PrimaryButton label={prompt.ctaLabel} icon="arrow-up-circle-outline" onPress={update} /> : null}
            {prompt.dismissible ? (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Later" onPress={close} style={{ alignItems: "center", paddingVertical: 12 }}>
                <Text style={{ fontSize: 14.5, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body }}>Later</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/** Maintenance or a required update (below minVersion): the app can't be used. */
function BlockingScreen({
  gate,
  onRetry,
}: {
  gate: { kind: "maintenance"; title: string; message: string } | UpdatePrompt;
  onRetry: () => Promise<unknown>;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(false);
  const isMaintenance = gate.kind === "maintenance";

  // Back would only reveal the blocked app underneath.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  const retry = async () => {
    setChecking(true);
    try {
      await onRetry();
    } finally {
      setChecking(false);
    }
  };

  return (
    <View
      accessibilityViewIsModal
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: colors.background }}
    >
      <ScrollView
        bounces={false}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
          paddingTop: insets.top + 32,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
        }}
      >
        <AppIconBadge icon={isMaintenance ? "construct" : "arrow-up"} tint={isMaintenance ? colors.warning : colors.primary} />
        {!isMaintenance ? (
          <View style={{ marginTop: 16, borderRadius: 999, backgroundColor: colors.primaryLight, paddingHorizontal: 12, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary, fontFamily: fonts.body }}>Update required</Text>
          </View>
        ) : null}
        <Text
          accessibilityRole="header"
          style={{ marginTop: 12, color: colors.foreground, fontSize: 22, fontWeight: "800", textAlign: "center", fontFamily: fonts.heading, maxWidth: 360 }}
        >
          {gate.title || (isMaintenance ? "We’ll be right back" : "Update required")}
        </Text>
        <Text style={{ color: colors.mutedText, fontSize: 14, textAlign: "center", marginTop: 10, lineHeight: 21, fontFamily: fonts.body, maxWidth: 340 }}>
          {isMaintenance
            ? gate.message
            : `${gate.message}${gate.version ? `\n\nThis version is no longer supported. Please update to ${gate.version} or later to continue.` : ""}`}
        </Text>
        {gate.kind === "update" ? (
          <View style={{ alignSelf: "stretch", maxWidth: 420, width: "100%" }}>
            <WhatsNew highlights={gate.highlights} />
          </View>
        ) : null}
        <View style={{ alignSelf: "stretch", maxWidth: 420, width: "100%", marginTop: 28, alignItems: "center" }}>
          {isMaintenance ? (
            <TouchableOpacity
              disabled={checking}
              onPress={retry}
              style={{
                alignSelf: "stretch",
                minHeight: 52,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
              }}
              accessibilityRole="button"
            >
              <Icon set="ion" name="refresh" size={17} color={colors.foreground} />
              <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 15, fontFamily: fonts.body }}>{checking ? "Checking…" : "Try again"}</Text>
            </TouchableOpacity>
          ) : gate.storeUrl ? (
            <PrimaryButton label={gate.ctaLabel} icon="arrow-up-circle-outline" onPress={() => openStore(gate.storeUrl)} />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
