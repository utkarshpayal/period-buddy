import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, type StyleProp, type ViewStyle } from "react-native";
import { Chip } from "./Chip";

export type FilterChipOption<K extends string> = {
  key: K;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

/**
 * One horizontally scrolling row of single-select filter chips, the shared
 * filter control for content screens (blogs, health issues, schemes).
 * Each chip is a components/Chip.tsx.
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
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      // Vertical room so the chips' shadow isn't clipped by the ScrollView.
      contentContainerStyle={{ paddingHorizontal: gutter, paddingVertical: 6, gap: 8 }}
      accessibilityRole="tablist"
    >
      {options.map((option) => (
        <Chip
          key={option.key}
          label={option.label}
          icon={option.icon}
          selected={option.key === value}
          onPress={() => onChange(option.key)}
        />
      ))}
    </ScrollView>
  );
}
