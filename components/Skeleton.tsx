import React, { useEffect } from "react";
import { DimensionValue, View, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "./theme";

/**
 * A single pulsing placeholder block. Compose several of these (or use one
 * of the pre-built layouts below) to build a loading skeleton that mirrors
 * the shape of the content it stands in for, instead of a bare spinner.
 */
export function SkeletonBlock({
  width = "100%",
  height = 16,
  radius = 8,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700 }),
        withTiming(0.4, { duration: 700 }),
      ),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.border,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** A row skeleton: circular avatar + two stacked text lines, e.g. list items. */
export function SkeletonRow({ style }: { style?: ViewStyle }) {
  return (
    <View className="flex-row items-center gap-3" style={style}>
      <SkeletonBlock width={44} height={44} radius={22} />
      <View className="flex-1 gap-2">
        <SkeletonBlock width="70%" height={14} />
        <SkeletonBlock width="45%" height={12} />
      </View>
    </View>
  );
}

/** A card skeleton: title bar + a couple of body lines, for dashboard/card content. */
export function SkeletonCard({ style }: { style?: ViewStyle }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      className="rounded-3xl p-5 gap-3"
      style={{ backgroundColor: colors.surface, borderWidth: isDark ? 0 : 1, borderColor: colors.border, ...style }}
    >
      <SkeletonBlock width="55%" height={16} />
      <SkeletonBlock width="100%" height={12} />
      <SkeletonBlock width="80%" height={12} />
    </View>
  );
}

/** A vertical stack of `count` skeleton list rows, spaced like a typical list. */
export function SkeletonList({ count = 4, style }: { count?: number; style?: ViewStyle }) {
  return (
    <View className="gap-4 px-6" style={style}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}
