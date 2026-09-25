import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "./theme";

/**
 * Shared "Show more" button for page-based lists (pair with
 * hooks/usePaginatedList.ts). Renders nothing when there's no further page.
 */
export function LoadMoreButton({
  hasMore,
  loading,
  onPress,
  label = "Show more",
}: {
  hasMore: boolean;
  loading: boolean;
  onPress: () => void;
  label?: string;
}) {
  const { colors, fonts } = useTheme();
  if (!hasMore) return null;

  return (
    <View className="w-full items-center mt-3">
      <TouchableOpacity
        onPress={onPress}
        disabled={loading}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="items-center justify-center px-6 py-3 rounded-2xl border"
        style={{ backgroundColor: colors.surface, borderColor: colors.border, minWidth: 140 }}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text className="text-xs font-bold" style={{ color: colors.primary, fontFamily: fonts.body }}>
            {label}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
