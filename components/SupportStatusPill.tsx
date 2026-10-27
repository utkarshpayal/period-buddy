import React from "react";
import { Text, View } from "react-native";
import type { SupportTicketStatus } from "../lib/api";
import { STATUS_LABELS, STATUS_TONES } from "../lib/support";
import { useTheme } from "./theme";

/** Open / In progress / Resolved / Closed pill for support tickets. */
export function SupportStatusPill({ status }: { status: SupportTicketStatus }) {
  const { colors, fonts } = useTheme();
  const tone = STATUS_TONES[status];
  const [bg, fg] =
    tone === "info"
      ? [colors.infoLight, colors.info]
      : tone === "warning"
        ? [colors.warningLight, colors.warning]
        : tone === "success"
          ? [colors.successLight, colors.success]
          : [colors.surfaceSoft, colors.mutedText];
  return (
    <View className="rounded-full px-2.5" style={{ backgroundColor: bg, paddingVertical: 3 }}>
      <Text maxFontSizeMultiplier={1.3} style={{ color: fg, fontSize: 13, fontWeight: "800", fontFamily: fonts.body }}>
        {STATUS_LABELS[status]}
      </Text>
    </View>
  );
}
