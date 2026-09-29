import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "./theme";

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
            borderRadius: 16,
            overflow: "hidden",
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
          <Ionicons
            name={(focused ? iconFocused : iconUnfocused) as never}
            size={20}
            color={focused ? colors.primary : colors.mutedText}
          />
          {showBadge && (
            <View
              style={{
                position: "absolute",
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
