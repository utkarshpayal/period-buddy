import React, { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { FadeInDown, FadeOutUp, useReducedMotion } from "react-native-reanimated";
import { NuraAvatar } from "../NuraAvatar";
import { PressableScale } from "../PressableScale";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";
import { Icon } from "../Icon";
import { motion } from "../motion";

/** Example questions, cycled as the row's hint. */
const QUESTIONS = [
  "Ask about your reports",
  "Explain my latest lab report",
  "Is anything outside the normal range?",
  "Which medicines am I taking?",
];
const CYCLE_MS = 3600;

/** One quiet row at the top of Documents: Nura's avatar and a cycling question hint; tap opens the chat. */
export function AskDocuments({ gutter, onAsk }: { gutter: number; onAsk: () => void }) {
  const { colors, isDark, fonts } = useTheme();
  const reduceMotion = useReducedMotion();
  const [hint, setHint] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setHint((n) => (n + 1) % QUESTIONS.length), CYCLE_MS);
    return () => clearInterval(id);
  }, [reduceMotion]);

  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 16 }}>
      <PressableScale
        scaleTo={0.98}
        onPress={onAsk}
        accessibilityRole="button"
        accessibilityLabel="Ask Nura about your reports"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          height: 60,
          paddingLeft: 10,
          paddingRight: 10,
          borderRadius: 30,
          backgroundColor: colors.surface,
          ...getShadow(colors, isDark),
        }}
      >
        <NuraAvatar size={40} />
        <View style={{ flex: 1, height: 22, overflow: "hidden", justifyContent: "center" }}>
          <Animated.Text
            key={hint}
            entering={reduceMotion ? undefined : FadeInDown.duration(motion.duration.slow)}
            exiting={reduceMotion ? undefined : FadeOutUp.duration(motion.duration.base)}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={{ fontSize: 15, color: colors.mutedText, fontFamily: fonts.body }}
          >
            {QUESTIONS[hint]}
          </Animated.Text>
        </View>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
          <Icon set="ion" name="arrow-up" size={18} color={colors.buttonText} />
        </View>
      </PressableScale>
    </View>
  );
}
