import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";

/**
 * The frame every chart sits in: title (with the series' colour as a short
 * line key), the headline number, one caption line, the chart, and a
 * "Show as list" twin so no value is only reachable through a tooltip.
 */
export function ChartCard({
  title,
  color,
  value,
  unit,
  caption,
  list,
  empty,
  children,
}: {
  title: string;
  color: string;
  /** The headline; null when there's nothing logged yet. */
  value: string | null;
  unit?: string;
  caption: string;
  /** The same values as rows, newest first. */
  list?: { label: string; value: string }[];
  /** What to log to fill this chart. */
  empty: string;
  children?: React.ReactNode;
}) {
  const { colors, isDark, fonts } = useTheme();
  const [asList, setAsList] = useState(false);
  return (
    <View
      style={{
        borderRadius: 24,
        borderCurve: "continuous",
        padding: 16,
        marginBottom: 14,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        ...getShadow(colors, isDark),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: color }} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body }}>{title}</Text>
        {value != null && list?.length ? (
          <Pressable onPress={() => setAsList((v) => !v)} accessibilityRole="button" hitSlop={10}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primaryDark, fontFamily: fonts.body }}>{asList ? "Show chart" : "Show as list"}</Text>
          </Pressable>
        ) : null}
      </View>

      {value != null ? (
        <>
          <Text style={{ marginTop: 6, color: colors.text, fontFamily: fonts.heading }} accessibilityLabel={`${title}: ${value}${unit ? ` ${unit}` : ""}. ${caption}`}>
            <Text style={{ fontSize: 30, fontWeight: "800", letterSpacing: -0.6 }}>{value}</Text>
            {unit ? <Text style={{ fontSize: 15, fontWeight: "700", color: colors.mutedText }}>{` ${unit}`}</Text> : null}
          </Text>
          <Text style={{ fontSize: 13, color: colors.mutedText, marginTop: 2, fontFamily: fonts.body }}>{caption}</Text>
          <View style={{ marginTop: 14 }}>
            {asList && list ? (
              <View>
                {list.map((row, i) => (
                  <View
                    key={`${row.label}-${i}`}
                    style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}
                  >
                    <Text style={{ fontSize: 14, color: colors.mutedText, fontFamily: fonts.body }}>{row.label}</Text>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"], fontFamily: fonts.body }}>{row.value}</Text>
                  </View>
                ))}
              </View>
            ) : (
              children
            )}
          </View>
        </>
      ) : (
        <Text style={{ marginTop: 8, fontSize: 14, color: colors.mutedText, lineHeight: 20, fontFamily: fonts.body }}>{empty}</Text>
      )}
    </View>
  );
}
