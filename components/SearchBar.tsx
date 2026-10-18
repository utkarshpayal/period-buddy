import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { TextInput, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "./theme";

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
  const { colors, fonts } = useTheme();
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
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        style,
      ]}
    >
      <Ionicons name="search" size={18} color={colors.mutedText} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedText}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
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
          <Ionicons name="close-circle" size={18} color={colors.mutedText} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
