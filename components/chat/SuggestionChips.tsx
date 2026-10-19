import React from "react";
import { ScrollView, Text, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";

/**
 * One scrolling row of one-tap questions above a chat composer. `outline` is
 * Nura AI's quick replies; `soft` is the Document Assistant's suggestions
 * (tinted, with a sparkle).
 */
export function SuggestionChips({
  questions,
  onPick,
  variant,
  disabled = false,
  contentContainerStyle,
}: {
  questions: string[];
  onPick: (question: string) => void;
  variant: "outline" | "soft";
  disabled?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const { colors, fonts } = useTheme();
  const soft = variant === "soft";

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ flexGrow: 0 }}
      contentContainerStyle={[{ paddingHorizontal: 16, gap: 8 }, contentContainerStyle]}
    >
      {questions.map((question) => (
        <TouchableOpacity
          key={question}
          activeOpacity={0.8}
          disabled={disabled}
          onPress={() => onPick(question)}
          accessibilityRole="button"
          accessibilityLabel={soft ? `Ask: ${question}` : question}
          accessibilityState={{ disabled }}
          style={
            soft
              ? { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 280, height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: colors.primaryLight }
              : { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.background }
          }
        >
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={{ flexShrink: 1, color: soft ? colors.primaryDark : colors.primary, fontSize: 13.5, fontWeight: "700", fontFamily: fonts.body }}
          >
            {question}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
