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

/**
 * A skeleton shaped like a community/social post card — avatar + author,
 * a few content lines, and an action row. Use it as the loading placeholder
 * for a feed of posts (Instagram-style) instead of a spinner in an empty box.
 */
export function SkeletonPostCard({ style }: { style?: ViewStyle }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      className="rounded-3xl p-5"
      style={{
        backgroundColor: colors.surface,
        borderWidth: isDark ? 0 : 1,
        borderColor: colors.border,
        ...style,
      }}
    >
      {/* Header: avatar + author/time */}
      <View className="flex-row items-center gap-3">
        <SkeletonBlock width={40} height={40} radius={20} />
        <View className="gap-2">
          <SkeletonBlock width={120} height={12} />
          <SkeletonBlock width={72} height={10} />
        </View>
      </View>
      {/* Body lines */}
      <View className="gap-2.5 mt-4">
        <SkeletonBlock width="100%" height={12} />
        <SkeletonBlock width="92%" height={12} />
        <SkeletonBlock width="60%" height={12} />
      </View>
      {/* Action row */}
      <View className="flex-row gap-3 mt-5">
        <SkeletonBlock width={52} height={22} radius={11} />
        <SkeletonBlock width={52} height={22} radius={11} />
        <SkeletonBlock width={40} height={22} radius={11} />
      </View>
    </View>
  );
}

/** A vertical stack of `count` post-card skeletons for a loading feed. */
export function SkeletonPostList({ count = 4, style }: { count?: number; style?: ViewStyle }) {
  return (
    <View className="gap-4 px-6" style={style}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonPostCard key={i} />
      ))}
    </View>
  );
}

/** A media card skeleton: cover image block + title/subtitle, for blog/reel grids. */
export function SkeletonMediaCard({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View
      className="overflow-hidden"
      style={{
        backgroundColor: colors.surface,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: colors.border,
        ...style,
      }}
    >
      {/* Same 16:10 cover as MediaTile, so content doesn't jump when it loads. */}
      <View style={{ aspectRatio: 16 / 10 }}>
        <SkeletonBlock width="100%" height="100%" radius={0} />
      </View>
      <View className="p-3 gap-2">
        <SkeletonBlock width="90%" height={12} />
        <SkeletonBlock width="55%" height={10} />
      </View>
    </View>
  );
}

/** A 2-column grid of media-card skeletons for a loading blog/reel feed. */
export function SkeletonMediaGrid({ count = 6, style }: { count?: number; style?: ViewStyle }) {
  return (
    <View className="flex-row flex-wrap justify-between px-6" style={{ rowGap: 14, ...style }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ width: "48%" }}>
          <SkeletonMediaCard />
        </View>
      ))}
    </View>
  );
}

/** A vertical stack of `count` card skeletons, for lists of cards (schemes, applications, plans). */
export function SkeletonCardList({ count = 3, style }: { count?: number; style?: ViewStyle }) {
  return (
    <View className="gap-4 px-6" style={style}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}
