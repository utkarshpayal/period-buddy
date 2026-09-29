import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "./theme";
import { getShadow } from "./ui-tokens";

// Shared page chrome. Everything here copies Home's header (dashboard
// home.tsx): 24px gutter, 38px round surface buttons with the soft shadow,
// Manrope 800 titles. Use these instead of hand-rolling a header per screen,
// so every page reads as the same app.

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** 38px round action button, same as Home's notification bell. */
export function HeaderIconButton({
  icon,
  onPress,
  accessibilityLabel,
  active,
  color,
  disabled,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  /** Tinted state, e.g. a filter that's switched on. */
  active?: boolean;
  color?: string;
}) {
  const { colors, isDark } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={6}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? colors.primaryLight : colors.surface,
        opacity: disabled ? 0.45 : 1,
        ...getShadow(colors, isDark),
      }}
    >
      <Ionicons name={icon} size={18} color={color ?? (active ? colors.primary : colors.foreground)} />
    </TouchableOpacity>
  );
}

/** Back button + title (+ optional subtitle and right-hand actions). */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <View className="flex-row items-center px-6 pt-3 pb-2" style={{ gap: 12 }}>
      <HeaderIconButton
        icon="chevron-back"
        accessibilityLabel="Go back"
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))}
      />
      <HeaderTitle title={title} subtitle={subtitle} size={20} />
      {right ? <View className="flex-row items-center" style={{ gap: 8 }}>{right}</View> : null}
    </View>
  );
}

/** Title row of a top-level tab screen (no back button), same scale as Home. */
export function TabHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View className="flex-row items-center px-6 pt-3 pb-2" style={{ gap: 12 }}>
      <HeaderTitle title={title} subtitle={subtitle} size={22} />
      {right ? <View className="flex-row items-center" style={{ gap: 8 }}>{right}</View> : null}
    </View>
  );
}

function HeaderTitle({ title, subtitle, size }: { title: string; subtitle?: string; size: number }) {
  const { colors, fonts } = useTheme();
  return (
    <View className="flex-1">
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={{ color: colors.foreground, fontSize: size, fontWeight: "800", letterSpacing: -0.3, fontFamily: fonts.heading }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 13, marginTop: 1, fontFamily: fonts.body }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** Home's section title: small colour bar, 14.5/800 title, optional link. */
export function SectionHeader({
  title,
  barColor,
  actionLabel,
  onAction,
  style,
}: {
  title: string;
  barColor?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View className="flex-row items-center justify-between" style={[{ marginBottom: 10 }, style]}>
      <View className="flex-row items-center flex-1" style={{ gap: 7 }}>
        <View style={{ width: 5, height: 14, borderRadius: 3, backgroundColor: barColor ?? colors.primary }} />
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={{ flexShrink: 1, fontSize: 14.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}
        >
          {title}
        </Text>
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity activeOpacity={0.7} onPress={onAction} className="flex-row items-center" style={{ gap: 2 }} hitSlop={8}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary, fontFamily: fonts.body }}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
