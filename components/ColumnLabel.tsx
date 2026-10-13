import React from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";

/**
 * The label under a value in a row of equal columns (stats, quick actions,
 * phase names). Every column takes the same number of lines, so one long
 * label can't wrap while its neighbours don't:
 * - `lines={1}` (default): one line, shrinking a little to fit on a phone
 *   (adjustsFontSizeToFit; web truncates instead).
 * - `lines={2}`: up to two lines, and every column reserves both, so the
 *   values above stay level.
 * Keep the copy short enough for one line at 360px wide.
 */
export function ColumnLabel({
  children,
  lines = 1,
  lineHeight = 16,
  style,
}: {
  children: React.ReactNode;
  lines?: 1 | 2;
  lineHeight?: number;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      numberOfLines={lines}
      adjustsFontSizeToFit={lines === 1}
      minimumFontScale={0.8}
      maxFontSizeMultiplier={1.3}
      style={[{ textAlign: "center", lineHeight }, style, lines === 2 ? { minHeight: lineHeight * 2 } : null]}
    >
      {children}
    </Text>
  );
}
