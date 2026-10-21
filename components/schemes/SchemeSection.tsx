import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";
import { Icon } from "../Icon";

export type IconName = keyof typeof Ionicons.glyphMap;

export const SCHEME_BODY = { fontSize: 15, lineHeight: 22, fontWeight: "400" } as const;

/** A titled card on the scheme detail screen. */
export function SchemeSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  const { colors, fonts, isDark } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 24, borderCurve: "continuous",
        padding: 18,
        marginBottom: 16,
        ...getShadow(colors, isDark),
      }}
    >
      <View className="flex-row items-center" style={{ gap: 8, marginBottom: 10 }}>
        <Icon set="ion" name={icon} size={18} color={colors.primaryDark} />
        <Text
          accessibilityRole="header"
          style={{ flexShrink: 1, fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}
        >
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

export function SchemeBullet({ text }: { text: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View className="flex-row" style={{ marginBottom: 8, gap: 10 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 8, backgroundColor: colors.primary }} />
      <Text style={{ ...SCHEME_BODY, flex: 1, color: colors.foreground, fontFamily: fonts.body }}>
        {text}
      </Text>
    </View>
  );
}

/** Secondary button: primaryLight fill, primaryDark text, 48px tall. */
export function SchemeSecondaryButton({
  icon,
  label,
  onPress,
  loading,
  disabled,
  accessibilityLabel,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: object;
}) {
  const { colors, fonts } = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      className="flex-row items-center justify-center"
      style={[{ minHeight: 48, borderRadius: 16, paddingHorizontal: 14, gap: 8, backgroundColor: colors.primaryLight }, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.primaryDark} />
      ) : (
        <>
          <Icon set="ion" name={icon} size={18} color={colors.primaryDark} />
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={{ flexShrink: 1, fontSize: 15, fontWeight: "700", color: colors.primaryDark, fontFamily: fonts.body }}
          >
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}
