import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { haptics } from "../lib/haptics";
import { motion } from "./motion";
import { useTheme } from "./theme";
import { getShadow } from "./ui-tokens";

export type Segment<K extends string> = { key: K; label: string; accessibilityLabel?: string };

const PAD = 4;

/**
 * iOS-style segmented control: equal segments on a soft track, with a raised
 * thumb that slides to the picked one. For 2–4 mutually exclusive views of the
 * same screen (New / Past, Month / Year); filters over a list use FilterChips.
 */
export function SegmentedControl<K extends string>({
  segments,
  value,
  onChange,
  height = 44,
  style,
}: {
  segments: Segment<K>[];
  value: K;
  onChange: (key: K) => void;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, fonts, isDark } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, segments.findIndex((s) => s.key === value));
  const segmentWidth = width > 0 ? (width - PAD * 2) / segments.length : 0;
  const x = useSharedValue(0);
  const ready = useSharedValue(false);

  useEffect(() => {
    if (!segmentWidth) return;
    // First layout jumps straight to the picked segment; later changes slide.
    if (ready.value) x.value = withSpring(index * segmentWidth, motion.spring);
    else {
      x.value = index * segmentWidth;
      ready.value = true;
    }
  }, [index, segmentWidth, ready, x]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const radius = height / 2;

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[
        {
          flexDirection: "row",
          height,
          padding: PAD,
          borderRadius: radius,
          backgroundColor: isDark ? colors.surface : colors.track,
        },
        style,
      ]}
    >
      {segmentWidth ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: PAD,
              left: PAD,
              width: segmentWidth,
              height: height - PAD * 2,
              borderRadius: radius - PAD,
              backgroundColor: isDark ? colors.surfaceStrong : colors.surface,
              ...getShadow(colors, isDark),
            },
            thumbStyle,
          ]}
        />
      ) : null}
      {segments.map((segment) => {
        const active = segment.key === value;
        return (
          <TouchableOpacity
            key={segment.key}
            activeOpacity={0.7}
            hitSlop={height < 48 ? { top: (48 - height) / 2, bottom: (48 - height) / 2 } : undefined}
            onPress={() => {
              if (!active) haptics.select();
              onChange(segment.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={segment.accessibilityLabel ?? segment.label}
            style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{
                fontSize: height < 40 ? 13 : 14,
                fontWeight: active ? "700" : "600",
                letterSpacing: -0.1,
                color: active ? colors.foreground : colors.mutedText,
                fontFamily: fonts.body,
              }}
            >
              {segment.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
