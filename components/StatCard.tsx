import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View, type ViewStyle } from "react-native";

export type StatCardVariant = "tile" | "tile-stack" | "pill" | "pill-outline";

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
 * `variant="tile-stack"` matches profile.tsx's 3-up centered stat row.
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
        className="flex-1 flex-row items-center rounded-2xl px-4 py-3.5"
        style={{ backgroundColor, gap: 10, ...containerStyle }}
      >
        <View
          className="w-9 h-9 rounded-full items-center justify-center"
          style={{ backgroundColor: iconBg }}
        >
          <Ionicons name={icon} size={17} color={iconColor} />
        </View>
        <View className="flex-1">
          <Text
            className="text-[17px] font-black tracking-tight"
            style={{ color: valueColor, fontFamily: valueFontFamily }}
          >
            {value}
          </Text>
          {label ? (
            <Text
              className="text-xs font-bold mt-0.5"
              style={{ color: labelColor, fontFamily: labelFontFamily }}
            >
              {label}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  if (variant === "tile-stack") {
    // Icon-on-top, centered layout — for 3-up (or narrower) rows where the
    // side-by-side "tile" variant leaves too little width for the label and
    // wraps it across multiple lines.
    return (
      <View
        className="flex-1 items-center rounded-2xl px-2 py-3.5"
        style={{ backgroundColor, ...containerStyle }}
      >
        <View
          className="w-9 h-9 rounded-full items-center justify-center mb-2"
          style={{ backgroundColor: iconBg }}
        >
          <Ionicons name={icon} size={17} color={iconColor} />
        </View>
        <Text
          className="text-[17px] font-black tracking-tight"
          style={{ color: valueColor, fontFamily: valueFontFamily }}
        >
          {value}
        </Text>
        {label ? (
          <Text
            className="text-xs font-bold mt-0.5 text-center"
            style={{ color: labelColor, fontFamily: labelFontFamily }}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {label}
          </Text>
        ) : null}
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
      <Ionicons name={icon} size={12} color={iconColor} style={{ marginRight: 5 }} />
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
