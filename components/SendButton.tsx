import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator } from "react-native";
import { Icon } from "./Icon";
import { PressableScale } from "./PressableScale";
import { useTheme } from "./theme";
import { getGlow } from "./ui-tokens";

/**
 * The round send button at the end of every message composer (Nura AI,
 * partner and buddy chats, consultation chat, comments, support replies).
 * Pale while there's nothing to send; filled and glowing once there is.
 */
export function SendButton({
  onPress,
  disabled,
  loading,
  size = 44,
  icon = "arrow-up",
  accessibilityLabel = "Send",
}: {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  size?: number;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
}) {
  const { colors, isDark } = useTheme();
  const ready = !disabled && !loading;
  const slop = Math.max(0, (48 - size) / 2);
  return (
    <PressableScale
      onPress={onPress}
      disabled={!ready}
      scaleTo={0.9}
      hitSlop={slop ? { top: slop, bottom: slop, left: 4, right: 4 } : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !ready, busy: Boolean(loading) }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: ready || loading ? colors.primary : colors.primaryLight,
        ...(ready ? getGlow(colors.primary, isDark) : null),
      }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.buttonText} />
      ) : (
        <Icon set="ion" name={icon} size={Math.round(size * 0.45)} color={ready ? colors.buttonText : colors.primary} />
      )}
    </PressableScale>
  );
}
