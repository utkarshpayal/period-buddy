import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View, type ViewStyle } from "react-native";
import { Icon } from "./Icon";

export type StatCardVariant = "tile" | "pill" | "pill-outline";

type StatCardProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor: string;
  /** Background of the icon badge (tile variant only). */
  iconBg?: string;
  value: React.ReactNode;
  label?: string;
  variant?: StatCardVariant;
  valueColor: string;
  labelColor?: string;
  /** Background of the whole card/pill. */
  backgroundColor?: string;
  borderColor?: string;
  valueFontFamily?: string;
  labelFontFamily?: string;
  containerStyle?: ViewStyle;
};

/**
 * Metric tile/pill used to display a stat (streak, points, days tracked...).
 * `variant="tile"` matches the 2-up icon+text row in home.tsx's header stats.
 * `variant="pill"` / `"pill-outline"` matches home.tsx's compact header chips.
 */
export default function StatCard({
  icon,
  iconColor,
  iconBg,
  value,
  label,
  variant = "tile",
  valueColor,
  labelColor,
  backgroundColor,
  borderColor,
  valueFontFamily,
  labelFontFamily,
  containerStyle,
}: StatCardProps) {
  if (variant === "tile") {
    return (
      <View
        className="flex-1 flex-row items-center"
        style={{ backgroundColor, gap: 12, padding: 14, borderRadius: 22, borderCurve: "continuous", ...containerStyle }}
      >
        <View
          className="items-center justify-center"
          style={{ width: 44, height: 44, borderRadius: 14, borderCurve: "continuous", backgroundColor: iconBg }}
        >
          <Icon set="ion" name={icon} size={20} color={iconColor} />
        </View>
        <View className="flex-1" style={{ minWidth: 0 }}>
          <Text
            style={{ fontSize: 20, lineHeight: 26, fontWeight: "800", letterSpacing: -0.4, fontVariant: ["tabular-nums"], color: valueColor, fontFamily: valueFontFamily }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            maxFontSizeMultiplier={1.4}
          >
            {value}
          </Text>
          {label ? (
            <Text
              style={{ fontSize: 13, lineHeight: 18, color: labelColor, fontFamily: labelFontFamily }}
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
            >
              {label}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View
      className={`flex-row items-center rounded-full${variant === "pill-outline" ? " border" : ""}`}
      style={{
        backgroundColor,
        borderColor: variant === "pill-outline" ? borderColor : undefined,
        paddingHorizontal: 10,
        paddingVertical: 6,
        ...containerStyle,
      }}
    >
      <Icon set="ion" name={icon} size={12} color={iconColor} style={{ marginRight: 5 }} />
      <Text
        style={{
          fontSize: 12.5,
          fontWeight: "800",
          color: valueColor,
          fontFamily: valueFontFamily,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
