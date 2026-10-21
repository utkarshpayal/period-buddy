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
      <View className="mx-6 items-center pb-2" style={{ paddingTop: 14 }}>
        <SkeletonBlock width={150} height={14} />
        <SkeletonBlock width={200} height={200} radius={100} style={{ marginVertical: 40 }} />
        <View className="w-full flex-row justify-center">
          {[0, 1, 2].map((i) => (
            <View key={i} className="items-center" style={{ flex: 1, maxWidth: 110, gap: 10 }}>
              <SkeletonBlock width={60} height={60} radius={30} />
              <SkeletonBlock width={56} height={12} />
            </View>
          ))}
        </View>
      </View>
      <View className="mx-6 mt-4 p-5" style={card}>
        <SkeletonBlock width={140} height={16} />
        <SkeletonBlock height={260} radius={16} style={{ marginTop: 16 }} />
      </View>
    </View>
  );
}
