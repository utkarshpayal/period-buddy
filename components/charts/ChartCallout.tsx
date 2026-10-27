import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme";

/**
 * The callout every chart opens on tap: just above the chart (over the
 * card's caption, never over the data), centred on the tapped point and
 * kept inside the chart's width. Value
 * first and biggest, then what it is, then one line of detail.
 */
export const CALLOUT_W = 184;

export function ChartCallout({ x, chartWidth, title, value, detail }: { x: number; chartWidth: number; title: string; value: string; detail?: string }) {
  const { colors, isDark, fonts } = useTheme();
  const left = Math.min(Math.max(x - CALLOUT_W / 2, 0), Math.max(0, chartWidth - CALLOUT_W));
  const ink = isDark ? colors.text : "#FFFFFF";
  const soft = isDark ? colors.mutedText : "rgba(255,255,255,0.72)";
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: "absolute",
        bottom: "100%",
        marginBottom: 6,
        left,
        width: CALLOUT_W,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: isDark ? colors.surfaceStrong : "#241A20",
        borderWidth: isDark ? 1 : 0,
        borderColor: colors.border,
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
        zIndex: 10,
      }}
    >
      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "700", color: soft, fontFamily: fonts.body }}>
        {title}
      </Text>
      <Text style={{ fontSize: 19, fontWeight: "800", color: ink, marginTop: 1, fontFamily: fonts.body }}>{value}</Text>
      {detail ? (
        <Text numberOfLines={2} style={{ fontSize: 12, color: soft, fontFamily: fonts.body }}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
