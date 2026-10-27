import React from "react";
import { Text, TouchableOpacity } from "react-native";
import type { SendStatus } from "../../lib/partnerChat";
import { Icon } from "../Icon";
import { useTheme } from "../theme";

/** Under a message the user sent: "Sending…", or a tappable "Not sent · Tap to retry". */
export function SendStatusLabel({ status, onRetry }: { status?: SendStatus; onRetry: () => void }) {
  const { colors, fonts } = useTheme();
  if (!status) return null;
  if (status === "sending") {
    return (
      <Text style={{ fontSize: 13, marginTop: 3, marginHorizontal: 6, color: colors.mutedText, fontFamily: fonts.body }}>
        Sending…
      </Text>
    );
  }
  return (
    <TouchableOpacity
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel="Message not sent. Tap to retry"
      // ~20px row + 14px above/below = 48dp tap target.
      hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
      className="flex-row items-center"
      style={{ marginTop: 3, marginHorizontal: 6, gap: 4, paddingVertical: 2 }}
    >
      <Icon set="ion" name="alert-circle" size={14} color={colors.danger} />
      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.danger, fontFamily: fonts.body }}>
        Not sent · Tap to retry
      </Text>
    </TouchableOpacity>
  );
}
