import React from "react";
import { TextInput, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "./theme";
import { getShadow, withAlpha } from "./ui-tokens";
import { Icon } from "./Icon";

/** 48px search field with a labelled clear button, shared by content screens. */
export function SearchBar({
  value,
  onChangeText,
  placeholder,
  onSubmit,
  style,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onSubmit?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, fonts, isDark } = useTheme();
  const [focused, setFocused] = React.useState(false);
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          height: 48,
          paddingLeft: 14,
          paddingRight: 6,
          borderRadius: 16,
          borderCurve: "continuous",
          backgroundColor: colors.surface,
          ...getShadow(colors, isDark),
          ...(focused ? { boxShadow: `0 0 0 1.5px ${colors.primary}, 0 0 0 5px ${withAlpha(colors.primary, 0.12)}` } : null),
        },
        style,
      ]}
    >
      <Icon set="ion" name="search" size={18} color={focused ? colors.primary : colors.mutedText} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedText}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCorrect={false}
        accessibilityLabel={placeholder}
        maxFontSizeMultiplier={1.4}
        style={{ flex: 1, fontSize: 15, color: colors.foreground, fontFamily: fonts.body, paddingVertical: 0 }}
      />
      {value ? (
        <TouchableOpacity
          onPress={() => onChangeText("")}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={6}
          style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
        >
          <Icon set="ion" name="close-circle" size={18} color={colors.mutedText} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
