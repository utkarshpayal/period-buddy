import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeOut, LinearTransition } from "react-native-reanimated";
import type { HabitSuggestion } from "../../lib/api";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { listEntering, motion } from "../motion";
import { useTheme } from "../theme";
import { getShadow, withAlpha } from "../ui-tokens";
import { resolveHabitColor, suggestionColor } from "./habitColor";

/** One pick: what, why (from her logs), Add, and × for "Not for me". */
export function SuggestionCard({
  idea,
  index,
  adding,
  disabled,
  onAdd,
  onDismiss,
}: {
  idea: HabitSuggestion;
  index: number;
  adding: boolean;
  disabled: boolean;
  onAdd: (idea: HabitSuggestion) => void;
  onDismiss: (idea: HabitSuggestion) => void;
}) {
  const { colors, isDark, fonts } = useTheme();
  const tint = resolveHabitColor(suggestionColor(idea), colors);

  return (
    <Animated.View
      entering={listEntering(index)}
      exiting={FadeOut.duration(motion.duration.base)}
      layout={LinearTransition.springify().damping(18)}
      style={{
        borderRadius: 22,
        borderCurve: "continuous",
        padding: 16,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: withAlpha(tint, 0.22),
        ...getShadow(colors, isDark),
      }}
    >
      <View className="flex-row items-start">
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl mr-3.5"
          style={{ backgroundColor: withAlpha(tint, 0.16), borderCurve: "continuous" }}
        >
          <Icon set="ion" name={idea.icon as any} size={20} color={tint} />
        </View>
        <View className="flex-1" style={{ minWidth: 0 }}>
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={1.4}
            style={{ fontSize: 15, fontWeight: "700", letterSpacing: -0.2, color: colors.foreground, fontFamily: fonts.heading }}
          >
            {idea.title}
          </Text>
          <Text
            className="mt-1 text-xs leading-5"
            numberOfLines={2}
            maxFontSizeMultiplier={1.4}
            style={{ color: colors.mutedText, fontFamily: fonts.body }}
          >
            {idea.reason}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => onDismiss(idea)}
          disabled={adding}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={`Not for me: ${idea.title}`}
          className="ml-2 h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.surfaceSoft }}
        >
          <Icon set="feather" name="x" size={14} color={colors.mutedText} />
        </TouchableOpacity>
      </View>

      <View className="mt-3 flex-row items-center justify-between" style={{ paddingLeft: 58 }}>
        <Text
          style={{ fontSize: 13, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.mono }}
          maxFontSizeMultiplier={1.3}
        >
          +{idea.rewardPoints} pts a day
        </Text>
        <Button
          label="Add habit"
          size="sm"
          variant="tonal"
          icon="add"
          loading={adding}
          disabled={disabled}
          accessibilityLabel={`Add habit: ${idea.title}`}
          onPress={() => onAdd(idea)}
        />
      </View>
    </Animated.View>
  );
}

/** Shown instead of picks when nothing was logged lately: habits only come from logs. */
export function LogFirstCard({ onLog }: { onLog: () => void }) {
  const { colors, isDark, fonts } = useTheme();
  return (
    <View
      className="items-center p-6"
      style={{ borderRadius: 24, borderCurve: "continuous", backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
    >
      <View
        className="h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: withAlpha(colors.primary, 0.12) }}
      >
        <Icon set="ion" name="calendar-outline" size={26} color={colors.primary} />
      </View>
      <Text
        className="mt-4 text-center"
        style={{ fontSize: 17, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground, fontFamily: fonts.heading }}
      >
        Habits made for you
      </Text>
      <Text
        className="mt-1.5 mb-5 text-center text-xs leading-5"
        style={{ color: colors.mutedText, fontFamily: fonts.body, maxWidth: 280 }}
      >
        Log how you feel today (flow, mood, symptoms, sleep) and Nura will pick habits that fit you.
      </Text>
      <Button label="Log today" size="md" icon="add" onPress={onLog} />
    </View>
  );
}
