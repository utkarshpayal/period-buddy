import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "./theme";

/**
 * Shared "Show more" link (underlined text) for page-based lists (pair with
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

  // Plain underlined text: a quiet link at the end of a list, not a box.
  return (
    <View className="w-full items-center mt-2">
      <TouchableOpacity
        onPress={onPress}
        disabled={loading}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={8}
        style={{ minHeight: 44, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primaryDark, textDecorationLine: "underline", fontFamily: fonts.body }}>
            {label}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
