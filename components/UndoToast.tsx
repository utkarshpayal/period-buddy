import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "./theme";
import { Icon } from "./Icon";

export type ToastAction = { label: string; onPress: () => void };
export type ToastContent = { id: number; title: string; detail?: string; icon?: keyof typeof Ionicons.glyphMap; actions?: ToastAction[] };

const SHOW_MS = 6000;

/**
 * A short confirmation bar floating over the tab bar ("Period logged ·
 * Undo"). It hides itself after a few seconds; any action also hides it.
 */
export function UndoToast({ toast, bottom, onHide }: { toast: ToastContent | null; bottom: number; onHide: () => void }) {
  const { colors, fonts, isDark } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  useEffect(() => {
    if (!toast) return;
    AccessibilityInfo.announceForAccessibility([toast.title, toast.detail].filter(Boolean).join(". "));
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => onHideRef.current());
    }, SHOW_MS);
    return () => clearTimeout(t);
  }, [toast, anim]);

  if (!toast) return null;
  const bg = isDark ? colors.surface : colors.foreground;
  const fg = isDark ? colors.foreground : colors.background;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
      }}
    >
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingLeft: 14,
          paddingRight: 6,
          paddingVertical: 8,
          minHeight: 56,
          borderRadius: 18,
          backgroundColor: bg,
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        {toast.icon ? <Icon set="ion" name={toast.icon} size={20} color={colors.primary} /> : null}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: fg, fontSize: 14, fontWeight: "800", fontFamily: fonts.body }}>
            {toast.title}
          </Text>
          {toast.detail ? (
            <Text numberOfLines={1} style={{ color: fg, opacity: 0.75, fontSize: 13, fontFamily: fonts.body, marginTop: 1 }}>
              {toast.detail}
            </Text>
          ) : null}
        </View>
        {toast.actions?.map((a) => (
          <TouchableOpacity
            key={a.label}
            onPress={() => {
              onHide();
              a.onPress();
            }}
            accessibilityRole="button"
            hitSlop={6}
            style={{ paddingHorizontal: 10, paddingVertical: 10 }}
          >
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "800", fontFamily: fonts.body }}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
}
