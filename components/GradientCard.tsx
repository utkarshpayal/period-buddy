import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "./theme";
import { getGlow } from "./ui-tokens";

/**
 * A saturated gradient card that carries white text (Home's cycle card, the
 * hubs' Book-a-call hero, paywall and celebration cards). Adds what makes it
 * read as a lit surface rather than a flat box: a sheen on the top-left, a
 * hairline inner edge, and a coloured glow underneath in its own first colour.
 * Padding and gap go in `style`; layout around it (margins) in `containerStyle`.
 */
export function GradientCard({
  colors,
  radius = 28,
  glow = true,
  style,
  containerStyle,
  children,
}: {
  colors: readonly string[];
  radius?: number;
  /** Off for a card sitting on another coloured surface. */
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const { isDark } = useTheme();
  const stops = (colors.length >= 2 ? colors : [colors[0], colors[0]]) as [string, string, ...string[]];
  return (
    // The glow sits on an un-clipped wrapper with the same corners: the
    // gradient itself clips its children (the watermark icons), which would
    // clip a shadow drawn on it too.
    <View style={[{ borderRadius: radius, borderCurve: "continuous", backgroundColor: stops[0] }, glow ? getGlow(stops[0], isDark, "strong") : null, containerStyle]}>
      <LinearGradient
        colors={stops}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[{ borderRadius: radius, borderCurve: "continuous", overflow: "hidden" }, style]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={[isDark ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.7, y: 0.6 }}
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: radius, borderCurve: "continuous", borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.18)" }]}
        />
        {children}
      </LinearGradient>
    </View>
  );
}
