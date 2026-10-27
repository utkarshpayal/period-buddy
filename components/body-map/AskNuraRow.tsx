import React from "react";
import { Text, View } from "react-native";
import { Icon } from "../Icon";
import { NuraAvatar } from "../NuraAvatar";
import { PressableScale } from "../PressableScale";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";

/**
 * "Ask Nura" as one of the app's own rows (same look as Documents'
 * AskDocuments): Nura's avatar, the actual question, and the round send
 * button. No sparkle/"AI" styling: Nura's avatar is what marks the assistant.
 */
export function AskNuraRow({ question, onPress }: { question: string; onPress: () => void }) {
  const { colors, isDark, fonts } = useTheme();
  return (
    <PressableScale
      scaleTo={0.98}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ask Nura: ${question}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 56,
        paddingLeft: 8,
        paddingRight: 8,
        paddingVertical: 8,
        borderRadius: 28,
        backgroundColor: colors.surface,
        borderWidth: isDark ? 1 : 0,
        borderColor: colors.border,
        ...getShadow(colors, isDark),
      }}
    >
      <NuraAvatar size={38} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body }}>Ask Nura</Text>
        <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ fontSize: 14.5, color: colors.text, fontFamily: fonts.body, marginTop: 1 }}>
          {question}
        </Text>
      </View>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
        <Icon set="ion" name="arrow-up" size={17} color={colors.buttonText} />
      </View>
    </PressableScale>
  );
}

/** A natural first question per symptom. */
export function nuraQuestionFor(key: string, label: string): string {
  const q: Record<string, string> = {
    cramps: "What actually helps with period cramps?",
    "abdominal-pain": "When is belly pain something to get checked?",
    bloating: "Why do I bloat before my period, and what helps?",
    headache: "Why do I get headaches around my period?",
    backache: "What eases lower back pain during my period?",
    "tender-breasts": "Why are my breasts sore before my period?",
    acne: "Why do I break out at certain times of my cycle?",
    "blood-clots": "Are period clots normal, and when should I worry?",
    "vaginal-itching": "What causes vaginal itching, and what helps?",
    "vaginal-dryness": "What helps with vaginal dryness?",
    "discharge-unusual": "Is my discharge normal?",
    nausea: "Why do I feel sick around my period?",
  };
  return q[key] ?? `What helps with ${label.toLowerCase()}?`;
}
