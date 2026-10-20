import React, { memo } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import Markdown from "react-native-markdown-display";
import Animated, { FadeInUp } from "react-native-reanimated";
import type { DocumentChatMessage } from "../../lib/api";
import { NuraAvatar } from "../NuraAvatar";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";
import { Icon } from "../Icon";
import { motion } from "../motion";

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dayLabel(dateString: string) {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

/** The Document Assistant's mark, beside its replies and the typing dots. */
export function DocumentAssistantMark() {
  return <NuraAvatar size={28} />;
}

/**
 * One Document Assistant message, with a day label above it when it starts a
 * new day. Memoized, and `markdownStyle` must be memoized by the caller: a
 * new style object would re-parse every reply's Markdown on every render.
 */
export const DocumentChatBubble = memo(function DocumentChatBubble({
  message,
  showDay,
  animate,
  playing,
  preparing,
  markdownStyle,
  onListen,
}: {
  message: DocumentChatMessage;
  showDay: boolean;
  /** New turns fade in; history doesn't. */
  animate: boolean;
  playing: boolean;
  preparing: boolean;
  markdownStyle: React.ComponentProps<typeof Markdown>["style"];
  onListen: (id: string, text: string) => void;
}) {
  const { colors, fonts, isDark } = useTheme();
  const isAssistant = message.role === "assistant";

  return (
    <View>
      {showDay ? (
        <Text style={{ alignSelf: "center", fontSize: 13, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body, marginBottom: 14 }}>
          {dayLabel(message.createdAt)}
        </Text>
      ) : null}
      <Animated.View entering={animate ? FadeInUp.duration(motion.duration.base) : undefined}>
        {isAssistant ? (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "92%" }}>
            <DocumentAssistantMark />
            <View
              style={{
                flexShrink: 1,
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: 10,
                borderRadius: 20,
                borderBottomLeftRadius: 6,
                backgroundColor: colors.surface,
                ...getShadow(colors, isDark),
              }}
            >
              <Markdown style={markdownStyle}>{message.text}</Markdown>
              <View className="flex-row items-center justify-between" style={{ marginTop: 6, gap: 12 }}>
                <TouchableOpacity
                  onPress={() => onListen(message._id, message.text)}
                  activeOpacity={0.7}
                  disabled={preparing}
                  accessibilityRole="button"
                  accessibilityLabel={playing ? "Pause" : "Listen to this reply"}
                  hitSlop={8}
                  className="flex-row items-center"
                  style={{ gap: 4, paddingVertical: 2, paddingHorizontal: 8, marginLeft: -8, borderRadius: 12, backgroundColor: playing ? colors.primaryLight : "transparent" }}
                >
                  {preparing ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Icon set="ion" name={playing ? "pause" : "volume-high-outline"} size={16} color={colors.primary} />
                  )}
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primaryDark, fontFamily: fonts.body }}>{playing ? "Pause" : "Listen"}</Text>
                </TouchableOpacity>
                <Text style={{ color: colors.mutedText, fontSize: 12, fontFamily: fonts.body }}>{formatTime(message.createdAt)}</Text>
              </View>
            </View>
          </View>
        ) : (
          <View
            style={{
              maxWidth: "82%",
              alignSelf: "flex-end",
              paddingHorizontal: 16,
              paddingTop: 11,
              paddingBottom: 8,
              borderRadius: 20,
              borderBottomRightRadius: 6,
              backgroundColor: colors.primary,
            }}
          >
            <Text style={{ color: colors.buttonText, fontSize: 15, lineHeight: 22, fontFamily: fonts.body }}>{message.text}</Text>
            <Text style={{ color: colors.buttonText, opacity: 0.75, fontSize: 12, textAlign: "right", marginTop: 4, fontFamily: fonts.body }}>
              {message._id.startsWith("pending_") ? "Sending…" : formatTime(message.createdAt)}
            </Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
});
