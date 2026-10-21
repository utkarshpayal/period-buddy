import { LinearGradient } from "expo-linear-gradient";
import React, { memo } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import type { ChatMessage } from "../../hooks/useQaConversation";
import { URGENT_SAFETY_SOURCE } from "../../lib/qaFallback";
import { NuraAvatar } from "../NuraAvatar";
import { useTheme } from "../theme";
import { Icon } from "../Icon";
import { getShadow } from "../ui-tokens";

/**
 * One Nura AI message. Memoized: a long thread only redraws the bubbles whose
 * props changed (the one starting or stopping playback), not all of them.
 */
export const QaMessageBubble = memo(function QaMessageBubble({
  message,
  showAvatar,
  playing,
  preparing,
  onListen,
  onRetry,
  onOpenPrivacy,
}: {
  message: ChatMessage;
  /** Only the first of consecutive assistant messages shows the avatar. */
  showAvatar: boolean;
  playing: boolean;
  preparing: boolean;
  onListen: (id: string, text: string) => void;
  onRetry: (message: ChatMessage) => void;
  onOpenPrivacy: () => void;
}) {
  const { colors, fonts, isDark } = useTheme();

  if (message.sender === "user") {
    return (
      <LinearGradient
        colors={[colors.primary, colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{
          maxWidth: "82%",
          alignSelf: "flex-end",
          paddingHorizontal: 16,
          paddingVertical: 11,
          borderRadius: 22,
          borderCurve: "continuous",
          borderBottomRightRadius: 6,
        }}
      >
        <Text style={{ color: colors.buttonText, fontSize: 15, lineHeight: 22, fontFamily: fonts.body }}>{message.text}</Text>
      </LinearGradient>
    );
  }

  const isUrgent = message.source === URGENT_SAFETY_SOURCE;
  return (
    <View className="flex-row items-end" style={{ gap: 8 }}>
      <View style={{ width: 28 }}>{showAvatar ? <NuraAvatar size={28} /> : null}</View>
      <View
        style={{
          flexShrink: 1,
          maxWidth: "86%",
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 10,
          borderRadius: 22, borderCurve: "continuous",
          borderBottomLeftRadius: 6,
          backgroundColor: isUrgent ? colors.dangerLight : colors.surface,
          borderWidth: isUrgent ? 1 : 0,
          borderColor: colors.danger,
          ...(isUrgent ? null : getShadow(colors, isDark)),
        }}
      >
        {isUrgent || message.personalized ? (
          <View className="mb-1.5 flex-row items-center" style={{ gap: 5 }}>
            <Icon set="ion" name={isUrgent ? "warning-outline" : "calendar-outline"} size={14} color={isUrgent ? colors.danger : colors.primary} />
            <Text style={{ color: isUrgent ? colors.danger : colors.primary, fontSize: 12.5, fontWeight: "700", fontFamily: fonts.body }}>
              {isUrgent ? "Please get care soon" : "Based on your logs"}
            </Text>
          </View>
        ) : null}
        <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 22, fontFamily: fonts.body }}>{message.text}</Text>
        {isUrgent && message.disclaimer ? (
          <Text style={{ color: colors.mutedText, fontSize: 12.5, lineHeight: 17, marginTop: 8, fontFamily: fonts.body }}>{message.disclaimer}</Text>
        ) : null}
        {message.action === "retry" ? (
          // An offline answer: say so, since it wasn't saved and isn't Nura AI's real reply.
          <View className="flex-row items-center" style={{ gap: 10, marginTop: 8 }}>
            <Icon set="ion" name="cloud-offline-outline" size={14} color={colors.mutedText} />
            <Text style={{ flexShrink: 1, color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }}>Offline answer · not saved</Text>
            <TouchableOpacity onPress={() => onRetry(message)} accessibilityRole="button" accessibilityLabel="Ask again" hitSlop={8}>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {message.action === "privacy" ? (
          <TouchableOpacity
            onPress={onOpenPrivacy}
            accessibilityRole="button"
            hitSlop={8}
            className="flex-row items-center self-start"
            style={{ gap: 4, marginTop: 8 }}
          >
            <Text style={{ color: colors.primary, fontSize: 13.5, fontWeight: "700", fontFamily: fonts.body }}>Open privacy settings</Text>
            <Icon set="ion" name="chevron-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => onListen(message.id, message.text)}
            activeOpacity={0.7}
            disabled={preparing}
            accessibilityRole="button"
            accessibilityLabel={playing ? "Pause" : "Listen to this reply"}
            hitSlop={8}
            className="flex-row items-center self-start"
            style={{ gap: 4, marginTop: 8 }}
          >
            {preparing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Icon set="ion" name={playing ? "pause-circle-outline" : "volume-high-outline"} size={17} color={colors.mutedText} />
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});
