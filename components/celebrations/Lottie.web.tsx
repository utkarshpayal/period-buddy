import React from "react";
import { Icon } from "../Icon";
import { useTheme } from "../theme";

// lottie-react-native needs @lottiefiles/dotlottie-react on web, which the
// app doesn't ship; web gets the still versions instead.

export function SuccessCheck({ size = 24 }: { size?: number }) {
  const { colors } = useTheme();
  return <Icon set="ion" name="checkmark-circle" size={size} color={colors.primary} />;
}

export function CelebrationBurst(_props: { size?: number }) {
  return null;
}
