import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptics } from "../lib/haptics";
import { registerToastListener, type ToastRequest } from "../lib/toast";
import { Icon } from "./Icon";
import { motion } from "./motion";
import { useTheme } from "./theme";
import { getShadow } from "./ui-tokens";

const SHOW_MS = 4000;
const ICONS = { error: "alert-circle", success: "checkmark-circle", info: "information-circle" } as const;

/**
 * Draws lib/toast.ts toasts: a pill that drops in under the status bar,
 * stays ~4 s (tap to dismiss), and is announced to screen
 * readers. Mount once at the root; inside a native Modal, mount another as
 * the Modal's last child (`inline`) so toasts raised there draw on top.
 */
export function ToastHost() {
  const { colors, fonts, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastRequest | null>(null);
  const y = useSharedValue(-120);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    y.value = withTiming(-120, { duration: motion.duration.base, easing: motion.easing.exit }, (done) => {
      if (done) runOnJS(setToast)(null);
    });
  };

  useEffect(
    () =>
      registerToastListener((next) => {
        setToast(next);
        if (next.variant === "error") haptics.error();
        AccessibilityInfo.announceForAccessibility([next.title, next.message].filter(Boolean).join(". "));
      }),
    [],
  );

  useEffect(() => {
    if (!toast) return;
    y.value = -120;
    y.value = withSpring(0, motion.spring);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(hide, SHOW_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart per toast
  }, [toast?.id]);

  const style = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 + y.value / 80),
    transform: [{ translateY: y.value }],
  }));

  if (!toast) return null;
  const tone =
    toast.variant === "error"
      ? { fg: colors.danger, bg: colors.dangerLight }
      : toast.variant === "success"
        ? { fg: colors.success, bg: colors.successLight }
        : { fg: colors.info, bg: colors.infoLight };

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 2000, elevation: 2000 }}>
        <Animated.View style={[{ marginTop: insets.top + 8, paddingHorizontal: 16, alignSelf: "center", width: "100%", maxWidth: 592 }, style]}>
          <Pressable
            onPress={hide}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            accessibilityHint="Tap to dismiss"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 12,
              paddingLeft: 12,
              paddingRight: 16,
              minHeight: 56,
              borderRadius: 20,
              borderCurve: "continuous",
              backgroundColor: colors.surface,
              ...getShadow(colors, isDark),
            }}
          >
            <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: tone.bg }}>
              <Icon set="ion" name={ICONS[toast.variant]} size={20} color={tone.fg} />
            </View>
            <View style={{ flex: 1 }}>
              {toast.title ? (
                <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontSize: 14.5, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                  {toast.title}
                </Text>
              ) : null}
              <Text
                numberOfLines={3}
                maxFontSizeMultiplier={1.3}
                style={{ fontSize: toast.title ? 13.5 : 14.5, lineHeight: 20, fontWeight: toast.title ? "500" : "600", color: toast.title ? colors.mutedText : colors.foreground, fontFamily: fonts.body }}
              >
                {toast.message}
              </Text>
            </View>
          </Pressable>
        </Animated.View>
    </View>
  );
}
