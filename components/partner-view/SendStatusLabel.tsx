import React from "react";
import { Text, TouchableOpacity } from "react-native";
import type { SendStatus } from "../../lib/partnerChat";
import { useTheme } from "../theme";

/** Under a message the user sent: "Sending…", or a tappable "Not sent · Tap to retry". */
export function SendStatusLabel({ status, onRetry }: { status?: SendStatus; onRetry: () => void }) {
  const { colors, fonts } = useTheme();
  if (!status) return null;
  if (status === "sending") {
    return (
      <Text style={{ fontSize: 11, marginTop: 3, marginHorizontal: 6, color: colors.mutedText, fontFamily: fonts.body }}>
        Sending…
      </Text>
    );
  }
  return (
    <TouchableOpacity onPress={onRetry} accessibilityRole="button" accessibilityLabel="Message not sent. Tap to retry" hitSlop={8}>
      <Text style={{ fontSize: 11, fontWeight: "700", marginTop: 3, marginHorizontal: 6, color: colors.danger, fontFamily: fonts.body }}>
        Not sent · Tap to retry
      </Text>
    </TouchableOpacity>
  );
}
