import React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { MedicalReview } from "../lib/api";
import { medicalReviewLabel } from "../lib/medicalReview";
import { useTheme } from "./theme";
import { Icon } from "./Icon";

/**
 * "Medically reviewed by <name> · <date>" pill for a blog article or a
 * wellbeing / health-issue guide. Renders nothing unless the backend's
 * review stamp says the item was medically reviewed.
 */
export function MedicalReviewBadge({
  item,
  style,
  variant = "default",
}: {
  item?: MedicalReview | null;
  style?: StyleProp<ViewStyle>;
  /** `onDark`: translucent light-on-dark pill for video overlays (reels). */
  variant?: "default" | "onDark";
}) {
  const { colors, fonts } = useTheme();
  const label = medicalReviewLabel(item);
  if (!label) return null;
  const text = label.date ? `${label.title} · ${label.date}` : label.title;
  const onDark = variant === "onDark";
  const tint = onDark ? "#FFFFFF" : colors.success;
  return (
    <View
      accessible
      accessibilityLabel={label.date ? `${label.title}, ${label.date}` : label.title}
      className="flex-row items-center self-start"
      style={[{ gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: onDark ? "rgba(0,0,0,0.38)" : colors.successLight }, style]}
    >
      <Icon set="ion" name="shield-checkmark" size={13} color={onDark ? colors.success : tint} />
      <Text
        maxFontSizeMultiplier={1.3}
        numberOfLines={2}
        style={{ flexShrink: 1, color: tint, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}
      >
        {text}
      </Text>
    </View>
  );
}
