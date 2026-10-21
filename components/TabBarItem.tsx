import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { NuraAvatar } from "./NuraAvatar";
import { useTheme } from "./theme";
import { Icon } from "./Icon";

/**
 * Shared bottom-tab item for both the dashboard and partner-view tab bars
 * (which must look identical). The active highlight is a soft pill that hugs
 * ONLY the icon — the label sits beneath it in the accent color — so the pill
 * can never be narrower than the text (which used to make the label spill
 * outside its background). On focus the icon pill fades in and springs up.
 * Non-avatar tabs only; the center avatar tab renders its own floating icon.
 */
export function TabBarItem({
  focused,
  iconFocused,
  iconUnfocused,
  label,
  showBadge = false,
}: {
  focused: boolean;
  iconFocused: string;
  iconUnfocused: string;
  label: string;
  showBadge?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(focused ? 1 : 0, {
      damping: 16,
      stiffness: 180,
      mass: 0.6,
    });
  }, [focused, progress]);

  const iconWrapStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -progress.value * 1.5 }],
  }));

  const pillStyle = useAnimatedStyle(() => ({
    opacity: withTiming(focused ? 1 : 0, { duration: 160 }),
    transform: [{ scale: 0.8 + progress.value * 0.2 }],
  }));

  return (
    <View style={{ alignItems: "center", justifyContent: "center", width: 62 }}>
      <Animated.View style={iconWrapStyle}>
        <View
          style={{
            borderRadius: 16, borderCurve: "continuous",
            paddingHorizontal: 18,
            paddingVertical: 6,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Soft highlight that hugs the icon only. */}
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: colors.primaryLight, borderRadius: 16 },
              pillStyle,
            ]}
          />
          {/* Its own layer above the highlight: on Android an animated
              (opacity/scale) sibling can otherwise draw over the SVG icon. */}
          <View style={{ zIndex: 1, elevation: 1 }} pointerEvents="none">
            <Icon
              set="ion"
              name={focused ? iconFocused : iconUnfocused}
              size={21}
              strokeWidth={focused ? 2.4 : 2}
              color={focused ? colors.primary : colors.mutedText}
            />
          </View>
          {showBadge && (
            <View
              style={{
                position: "absolute",
                zIndex: 2,
                elevation: 2,
                top: 3,
                right: 12,
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.danger,
              }}
            />
          )}
        </View>
      </Animated.View>

      <Text
        numberOfLines={1}
        style={{
          marginTop: 2,
          fontFamily: fonts.body,
          fontSize: 11,
          fontWeight: focused ? "700" : "600",
          color: focused ? colors.primary : colors.mutedText,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const AVATAR_CIRCLE = 64;
const AVATAR_RING = 4;

/**
 * The raised center tab (voice assistant) shared by both tab bars: Nura's
 * avatar (components/NuraAvatar.tsx) with a surface-coloured ring, so it sits on the bar's top edge like a button.
 */
export function CenterAvatarTabIcon() {
  const { colors, isDark } = useTheme();
  const inner = AVATAR_CIRCLE - AVATAR_RING * 2;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -38,
        width: AVATAR_CIRCLE,
        height: AVATAR_CIRCLE,
        borderRadius: AVATAR_CIRCLE / 2,
        borderWidth: AVATAR_RING,
        borderColor: colors.surface,
        backgroundColor: colors.surface,
        zIndex: 10,
        elevation: 10,
        shadowColor: isDark ? "#000000" : colors.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isDark ? 0.4 : 0.14,
        shadowRadius: 20,
      }}
    >
      <NuraAvatar size={inner} />
    </View>
  );
}
