import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { ChatTopicId } from "../../lib/api";
import { CHAT_TOPICS, isTopicLocked, type ChatTopic } from "../../lib/chatTopics";
import { DEFAULT_COMPANION_DISCLAIMER } from "../../lib/qaFallback";
import { NuraAvatar } from "../NuraAvatar";
import { useTheme } from "../theme";
import { getLogCategoryTints } from "../ui-tokens";
import { showTopicLockedAlert } from "./topicLock";
import { Icon } from "../Icon";

/**
 * Nura AI's welcome before the first exchange: greeting, "Try asking"
 * questions (one tap sends) and, unless the chat opened on a topic, the topic
 * chips that swap those questions.
 */
export function QaWelcome({
  firstName,
  activeTopic,
  activeTopicId,
  starterQuestions,
  showTopics,
  dateOfBirth,
  onAsk,
  onToggleTopic,
}: {
  firstName: string;
  /** The scoped topic, if any ("general" doesn't count). */
  activeTopic: ChatTopic | undefined;
  activeTopicId: ChatTopicId | null;
  starterQuestions: string[];
  showTopics: boolean;
  dateOfBirth?: string | null;
  onAsk: (question: string) => void;
  onToggleTopic: (topicId: ChatTopicId) => void;
}) {
  const { colors, fonts } = useTheme();
  const categoryTints = getLogCategoryTints(colors);

  return (
    <View>
      <View className="items-center" style={{ marginTop: 12, marginBottom: 28 }}>
        <NuraAvatar size={72} />
        <Text
          style={{ color: colors.foreground, fontSize: 24, lineHeight: 30, fontWeight: "800", textAlign: "center", marginTop: 14, fontFamily: fonts.heading }}
        >
          {firstName ? `Hi ${firstName}, I'm Nura` : "Hi, I'm Nura"}
        </Text>
        <Text style={{ color: colors.mutedText, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 6, fontFamily: fonts.body }}>
          {activeTopic ? `Ask me anything about ${activeTopic.label.toLowerCase()}.` : "Ask me anything about your cycle, body or health."}
        </Text>
        <View className="flex-row items-center" style={{ gap: 5, marginTop: 10 }}>
          <Icon set="ion" name="lock-closed" size={12} color={colors.success} />
          <Text style={{ color: colors.success, fontSize: 13.5, fontWeight: "700", fontFamily: fonts.body }}>Private & anonymous</Text>
        </View>
      </View>

      <Text style={{ color: colors.foreground, fontSize: 14.5, fontWeight: "800", marginBottom: 10, fontFamily: fonts.heading }}>Try asking</Text>
      <View style={{ gap: 8 }}>
        {starterQuestions.map((question) => (
          <TouchableOpacity
            key={question}
            activeOpacity={0.8}
            onPress={() => onAsk(question)}
            accessibilityRole="button"
            className="flex-row items-center"
            style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, borderCurve: "continuous", backgroundColor: colors.surface }}
          >
            <Icon set="ion" name="chatbubble-ellipses-outline" size={18} color={activeTopic ? categoryTints[activeTopic.tint].color : colors.primary} />
            <Text style={{ flex: 1, color: colors.foreground, fontSize: 14.5, fontWeight: "600", fontFamily: fonts.body }}>{question}</Text>
            <Icon set="ion" name="arrow-forward" size={16} color={colors.mutedText} />
          </TouchableOpacity>
        ))}
      </View>

      {showTopics ? (
        <>
          <Text style={{ color: colors.foreground, fontSize: 14.5, fontWeight: "800", marginTop: 24, marginBottom: 10, fontFamily: fonts.heading }}>
            Or pick a topic
          </Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {CHAT_TOPICS.map((topic) => {
              const tint = categoryTints[topic.tint];
              const isActive = activeTopicId === topic.id;
              const locked = isTopicLocked(topic, dateOfBirth);
              return (
                <TouchableOpacity
                  key={topic.id}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={locked ? `${topic.label}, locked` : topic.label}
                  onPress={() => (locked ? showTopicLockedAlert(topic) : onToggleTopic(topic.id))}
                  className="flex-row items-center rounded-full"
                  style={{
                    gap: 6,
                    paddingLeft: 6,
                    paddingRight: 14,
                    paddingVertical: 6,
                    borderWidth: 1.5,
                    backgroundColor: isActive ? tint.light : colors.surface,
                    borderColor: isActive ? tint.color : "transparent",
                    opacity: locked ? 0.55 : 1,
                  }}
                >
                  <View className="items-center justify-center rounded-full" style={{ width: 26, height: 26, backgroundColor: tint.light }}>
                    <Icon set="feather" name={locked ? "lock" : topic.icon} size={13} color={tint.color} />
                  </View>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13.5, fontWeight: "700", fontFamily: fonts.body }}>
                    {topic.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}

      <Text style={{ color: colors.mutedText, fontSize: 13.5, lineHeight: 18, textAlign: "center", marginTop: 24, fontFamily: fonts.body }}>
        {DEFAULT_COMPANION_DISCLAIMER}
      </Text>
    </View>
  );
}
