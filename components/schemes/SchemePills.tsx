import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme";
import { getSoftTints } from "../ui-tokens";

/**
 * The government-level pill (lavender) and the short-name pill (amber), on
 * the scheme list cards (`small`) and the detail screen's title block.
 */
export function SchemePills({
  level,
  shortName,
  small,
  style,
}: {
  level: string;
  shortName?: string;
  small?: boolean;
  style?: object;
}) {
  const { colors, fonts } = useTheme();
  const softTints = getSoftTints(colors);
  const pill = (text: string, backgroundColor: string) => (
    <View
      style={{
        paddingHorizontal: small ? 8 : 10,
        paddingVertical: small ? 2 : 4,
        borderRadius: 999,
        backgroundColor,
      }}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}
      >
        {text}
      </Text>
    </View>
  );
  return (
    <View className="flex-row items-center flex-wrap" style={[{ gap: 6 }, style]}>
      {pill(level, softTints.lavender)}
      {shortName ? pill(shortName, softTints.amber) : null}
    </View>
  );
}
