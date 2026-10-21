import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";
import { haptics } from "../lib/haptics";
import { Icon } from "./Icon";
import { useTheme } from "./theme";
import { getGlow, getShadow } from "./ui-tokens";

/**
 * One selectable pill: unselected sits on the card hairline + shadow,
 * selected fills with the brand colour and glows. 36px tall with a 44px tap
 * target. Rows of single-select filters use FilterChips, which draws these.
 */
export function Chip({
  label,
  selected,
  onPress,
  icon,
  trailingIcon,
  accessibilityLabel,
  accessibilityRole = "button",
  style,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  /** E.g. "close" on an active filter that clears when tapped. */
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "radio" | "checkbox" | "tab";
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, fonts, isDark } = useTheme();
  const fg = selected ? colors.buttonText : colors.foreground;
  return (
    <TouchableOpacity
      onPress={() => {
        if (!selected) haptics.select();
        onPress();
      }}
      activeOpacity={0.8}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityRole === "checkbox" ? { checked: selected } : { selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          height: 36,
          paddingHorizontal: 15,
          borderRadius: 18,
          backgroundColor: selected ? colors.primary : colors.surface,
          ...(selected ? getGlow(colors.primary, isDark) : getShadow(colors, isDark)),
        },
        style,
      ]}
    >
      {icon ? <Icon set="ion" name={icon} size={15} color={selected ? colors.buttonText : colors.mutedText} /> : null}
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 13.5, fontWeight: selected ? "700" : "600", letterSpacing: -0.1, color: fg, fontFamily: fonts.body }}
      >
        {label}
      </Text>
      {trailingIcon ? <Icon set="ion" name={trailingIcon} size={14} color={fg} /> : null}
    </TouchableOpacity>
  );
}
