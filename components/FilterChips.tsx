import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, Text, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "./theme";
import { Icon } from "./Icon";

export type FilterChipOption<K extends string> = {
  key: K;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

/**
 * One horizontally scrolling row of single-select filter chips, the shared
 * filter control for content screens (blogs, health issues, schemes).
 * Selected = primary fill with buttonText; 36px tall with a 44px tap target.
 * Bleeds to the screen edge: pass `gutter` = the screen's side padding.
 */
export function FilterChips<K extends string>({
  options,
  value,
  onChange,
  gutter = 24,
  style,
}: {
  options: FilterChipOption<K>[];
  value: K;
  onChange: (key: K) => void;
  gutter?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, fonts } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={{ paddingHorizontal: gutter, gap: 8 }}
      accessibilityRole="tablist"
    >
      {options.map((option) => {
        const on = option.key === value;
        return (
          <TouchableOpacity
            key={option.key}
            onPress={() => onChange(option.key)}
            activeOpacity={0.8}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={option.label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              height: 36,
              paddingHorizontal: 14,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: on ? colors.primary : colors.border,
              backgroundColor: on ? colors.primary : colors.surface,
            }}
          >
            {option.icon ? <Icon set="ion" name={option.icon} size={15} color={on ? colors.buttonText : colors.mutedText} /> : null}
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{ fontSize: 13, fontWeight: "700", color: on ? colors.buttonText : colors.foreground, fontFamily: fonts.body }}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
