import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../theme";
import type { IconName } from "./SchemeSection";
import { Icon } from "../Icon";

/** The detail screen's sticky main button, with an optional helper line. */
export function SchemePrimaryBar({
  label,
  icon,
  onPress,
  disabled,
  busy,
  helperText,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  disabled: boolean;
  /** Spinner in place of the label (saving to My applications). */
  busy: boolean;
  helperText?: string;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: 16,
        borderTopWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
      }}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, busy }}
        className="flex-row items-center justify-center"
        style={{ height: 48, borderRadius: 16, gap: 8, paddingHorizontal: 16, backgroundColor: colors.primary }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.buttonText} />
        ) : (
          <>
            <Icon set="ion" name={icon as IconName} size={18} color={colors.buttonText} />
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{ flexShrink: 1, fontSize: 15, fontWeight: "700", color: colors.buttonText, fontFamily: fonts.heading }}
            >
              {label}
            </Text>
          </>
        )}
      </TouchableOpacity>
      {helperText ? (
        <Text
          style={{ marginTop: 6, textAlign: "center", fontSize: 13, lineHeight: 18, fontWeight: "400", color: colors.mutedText, fontFamily: fonts.body }}
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}
