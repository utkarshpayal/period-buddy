import React, { useEffect, useState } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { subscriptionApi, type MySubscription } from "../../lib/api";
import { aiMessagesLeft } from "../../lib/pricing";
import { Icon } from "../Icon";
import { useTheme } from "../theme";

/**
 * "17 of 20 Nura AI messages left today", from GET /api/subscriptions/me's
 * fair-use usage (lib/pricing.ts#aiMessagesLeft). Renders nothing while fair
 * use is off, on an older backend, or if the request fails. `refreshKey`
 * changes (e.g. the message count) re-read it, since every answer uses one.
 */
export function AiUsageNote({ refreshKey = 0, style }: { refreshKey?: number; style?: StyleProp<ViewStyle> }) {
  const { colors, fonts } = useTheme();
  const [usage, setUsage] = useState<MySubscription["usage"]>();

  useEffect(() => {
    let live = true;
    subscriptionApi
      .getMe({ force: refreshKey > 0 })
      .then((me) => live && setUsage(me.usage))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [refreshKey]);

  const left = aiMessagesLeft(usage);
  if (!left) return null;
  const tone = left.none ? colors.danger : left.low ? colors.warning : colors.mutedText;
  return (
    <View
      className="flex-row items-center justify-center"
      style={[{ gap: 6, paddingHorizontal: 20 }, style]}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
    >
      <Icon set="ion" name={left.none ? "alert-circle-outline" : "chatbubble-ellipses-outline"} size={14} color={tone} />
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={1.3}
        style={{ flexShrink: 1, color: tone, fontSize: 13, lineHeight: 18, textAlign: "center", fontFamily: fonts.body, fontWeight: left.low ? "700" : "400" }}
      >
        {left.text}
      </Text>
    </View>
  );
}
