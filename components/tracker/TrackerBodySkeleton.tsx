import React from "react";
import { View } from "react-native";
import { SkeletonBlock } from "../Skeleton";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";

/** Placeholder with the tracker body's shape, shown until the dashboard and
 *  predictions load, so the ring and stats never flash default values. */
export function TrackerBodySkeleton() {
  const { colors, isDark } = useTheme();
  const card = { backgroundColor: colors.surface, borderRadius: 24, ...getShadow(colors, isDark) };
  return (
    <View accessibilityLabel="Loading your cycle" accessible>
      <View className="mx-6 mt-4 items-center px-5 pb-6 pt-5" style={card}>
        <SkeletonBlock width={150} height={14} />
        <SkeletonBlock width={200} height={200} radius={100} style={{ marginTop: 16 }} />
        <View className="mt-5 w-full flex-row" style={{ gap: 12 }}>
          <SkeletonBlock width="48%" height={48} radius={16} style={{ flex: 1 }} />
          <SkeletonBlock width="48%" height={48} radius={16} style={{ flex: 1 }} />
        </View>
      </View>
      <View className="mx-6 mt-4 p-5" style={card}>
        <SkeletonBlock width={140} height={16} />
        <SkeletonBlock height={260} radius={16} style={{ marginTop: 16 }} />
      </View>
    </View>
  );
}
