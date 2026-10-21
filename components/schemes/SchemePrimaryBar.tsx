import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme";
import type { IconName } from "./SchemeSection";
import { Button } from "../Button";

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
      <Button label={label} icon={icon as IconName} onPress={onPress} disabled={disabled && !busy} loading={busy} fullWidth />
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
