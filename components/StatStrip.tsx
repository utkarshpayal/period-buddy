import React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ColumnLabel } from "./ColumnLabel";
import { Icon } from "./Icon";
import { useTheme } from "./theme";
import { getShadow } from "./ui-tokens";

export type StripStat = {
  key: string;
  icon: string;
  color: string;
  bg: string;
  value: React.ReactNode;
  label: string;
};

/**
 * Several stats in one card, split into equal columns by hairlines: a small
 * tinted icon, the value, its label. For three across (or two on a narrow
 * phone), where separate tiles get cramped; one or two stats keep StatCard.
 */
export function StatStrip({ stats, style }: { stats: StripStat[]; style?: StyleProp<ViewStyle> }) {
  const { colors, fonts, isDark } = useTheme();
  return (
    <View
      style={[
        { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 22, borderCurve: "continuous", paddingVertical: 14, ...getShadow(colors, isDark) },
        style,
      ]}
    >
      {stats.map((stat, i) => (
        <View
          key={stat.key}
          style={{ flex: 1, alignItems: "center", paddingHorizontal: 6, gap: 6, borderLeftWidth: i ? 1 : 0, borderColor: colors.track }}
        >
          <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: stat.bg }}>
            <Icon set="ion" name={stat.icon as never} size={15} color={stat.color} />
          </View>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            maxFontSizeMultiplier={1.3}
            style={{ fontSize: 20, lineHeight: 25, fontWeight: "800", letterSpacing: -0.4, fontVariant: ["tabular-nums"], color: colors.foreground, fontFamily: fonts.heading }}
          >
            {stat.value}
          </Text>
          <ColumnLabel style={{ fontSize: 12.5, fontWeight: "600", color: colors.mutedText, fontFamily: fonts.body }}>{stat.label}</ColumnLabel>
        </View>
      ))}
    </View>
  );
}
