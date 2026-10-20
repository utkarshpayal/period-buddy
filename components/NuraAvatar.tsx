import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "./theme";

const AVATAR_SOURCE = require("../assets/images/illustrations/nura-avatar.png");
// The illustration is a tall half-body (871×1294).
const ASPECT = 1294 / 871;

/**
 * Nura's head and shoulders in a round blush badge: the assistant's face
 * wherever the app shows it (tab bar centre button, Nura AI card).
 */
export function NuraAvatar({ size, style }: { size: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const width = size * 0.82;
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, overflow: "hidden", alignItems: "center", backgroundColor: colors.primaryLight },
        style,
      ]}
    >
      <Image source={AVATAR_SOURCE} style={{ width, height: width * ASPECT, marginTop: size * 0.07 }} contentFit="contain" />
    </View>
  );
}
