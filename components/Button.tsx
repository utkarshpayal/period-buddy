import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon } from "./Icon";
import { PressableScale } from "./PressableScale";
import { useTheme } from "./theme";
import { getGlow, getShadow } from "./ui-tokens";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export type ButtonVariant = "primary" | "secondary" | "tonal" | "neutral" | "ghost" | "danger";
export type ButtonSize = "lg" | "md" | "sm";

// Height, side padding, label size and icon size per size. `sm` is under the
// 48dp tap floor, so it gets a vertical hitSlop that makes up the difference.
const SIZES: Record<ButtonSize, { height: number; padX: number; font: number; icon: number }> = {
  lg: { height: 54, padX: 24, font: 16, icon: 19 },
  md: { height: 46, padX: 20, font: 15, icon: 17 },
  sm: { height: 36, padX: 14, font: 13.5, icon: 15 },
};

/**
 * The app's one button. Pill-shaped, springy press, and per variant:
 * - `primary`: filled brand colour with a soft coloured glow and a top sheen
 *   (the main action on a screen or sheet; one per view).
 * - `secondary`: surface with the card shadow (the alternative action).
 * - `tonal`: pale brand tint (in-card actions that shouldn't shout).
 * - `neutral`: soft grey fill (Cancel next to a primary action in a dialog).
 * - `ghost`: text only (Cancel, Not now, Skip).
 * - `danger`: filled danger colour (delete, disconnect).
 * Layout (margins, flex, self-stretch) goes in `style`; `fullWidth` stretches it.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  icon,
  iconRight,
  loading,
  disabled,
  fullWidth,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Drawn before the label. */
  icon?: IconName;
  /** Drawn after the label, e.g. "arrow-forward". */
  iconRight?: IconName;
  /** Shows a spinner in place of the label and blocks presses. */
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, fonts, isDark } = useTheme();
  const s = SIZES[size];
  const inactive = Boolean(disabled || loading);
  const filled = variant === "primary" || variant === "danger";
  const fill = variant === "danger" ? colors.danger : colors.button;
  const fg = filled
    ? variant === "danger" ? (isDark ? colors.background : "#FFFFFF") : colors.buttonText
    : variant === "tonal" ? colors.primaryDark
    : variant === "ghost" ? colors.primaryDark
    : colors.foreground;

  const surface: ViewStyle =
    variant === "primary" || variant === "danger"
      ? { backgroundColor: fill, ...(disabled ? null : getGlow(fill, isDark)) }
      : variant === "secondary"
        ? { backgroundColor: colors.surface, ...getShadow(colors, isDark) }
        : variant === "tonal"
          ? { backgroundColor: colors.primaryLight }
          : variant === "neutral"
            ? { backgroundColor: colors.track }
            : { backgroundColor: "transparent" };

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
      hitSlop={size === "sm" ? { top: 6, bottom: 6 } : undefined}
      style={[
        {
          height: s.height,
          minWidth: s.height,
          paddingHorizontal: variant === "ghost" ? s.padX * 0.6 : s.padX,
          borderRadius: s.height / 2,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          opacity: disabled ? 0.45 : 1,
          alignSelf: fullWidth ? "stretch" : undefined,
        },
        surface,
        style,
      ]}
    >
      {filled ? (
        // Sheen: the top half catches the light, so the fill reads as a lit,
        // slightly domed surface instead of a flat sticker.
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: s.height / 2, overflow: "hidden" }]}>
          <LinearGradient
            colors={[isDark ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.20)", "rgba(255,255,255,0)"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.6 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon set="ion" name={icon} size={s.icon} color={fg} /> : null}
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={{ flexShrink: 1, fontSize: s.font, fontWeight: "700", letterSpacing: -0.1, color: fg, fontFamily: fonts.body }}
          >
            {label}
          </Text>
          {iconRight ? <Icon set="ion" name={iconRight} size={s.icon} color={fg} /> : null}
        </>
      )}
    </PressableScale>
  );
}
