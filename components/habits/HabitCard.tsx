import React, { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { Habit } from "../../lib/api";
import { weekSummary } from "../../lib/habits";
import { CelebrationBurst } from "../celebrations/Lottie";
import { Icon } from "../Icon";
import { listEntering, motion } from "../motion";
import { PressableScale } from "../PressableScale";
import { useTheme } from "../theme";
import { getShadow, withAlpha } from "../ui-tokens";
import { resolveHabitColor } from "./habitColor";

const WEEK_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/** Seven dots, oldest first, today ringed: how the habit went this week. */
function WeekDots({ habit, tint }: { habit: Habit; tint: string }) {
  const { colors, fonts } = useTheme();
  if (!habit.week?.length) return null;
  return (
    <View className="flex-row items-end" style={{ gap: 6 }} importantForAccessibility="no-hide-descendants">
      {habit.week.map((day, i) => {
        const isToday = i === habit.week!.length - 1;
        const [y, m, d] = day.dateKey.split("-").map(Number);
        const letter = WEEK_LETTERS[new Date(y, m - 1, d).getDay()];
        return (
          <View key={day.dateKey} className="items-center" style={{ gap: 3 }}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: isToday ? "800" : "600",
                color: isToday ? colors.foreground : colors.mutedText,
                fontFamily: fonts.body,
              }}
              maxFontSizeMultiplier={1.2}
            >
              {letter}
            </Text>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: day.done ? tint : withAlpha(tint, 0.14),
                borderWidth: isToday ? 1.5 : 0,
                borderColor: day.done ? tint : withAlpha(tint, 0.6),
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

/**
 * One habit: tap to tick off today (instantly; the screen rolls back if the
 * save fails), press and hold to remove. Shows why it was suggested, this
 * week's dots and the streak.
 */
export function HabitCard({
  habit,
  index,
  celebrating,
  onToggle,
  onRemove,
}: {
  habit: Habit;
  index: number;
  celebrating: boolean;
  onToggle: (habit: Habit) => void;
  onRemove: (habit: Habit) => void;
}) {
  const { colors, isDark, fonts } = useTheme();
  const reduceMotion = useReducedMotion();
  const tint = resolveHabitColor(habit.color, colors);
  const points = habit.rewardPoints ?? habit.tokens;

  // The check pops when it fills.
  const pop = useSharedValue(1);
  useEffect(() => {
    if (habit.completed && !reduceMotion) {
      pop.value = withSequence(withTiming(1.25, { duration: motion.duration.fast }), withSpring(1, motion.spring));
    }
  }, [habit.completed, pop, reduceMotion]);
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const summary = weekSummary(habit);
  const label = [
    habit.title,
    habit.reason,
    habit.streak > 0 ? `${habit.streak} day streak` : null,
    summary,
    `${points} points`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Animated.View
      entering={listEntering(index)}
      exiting={FadeOut.duration(motion.duration.base)}
      layout={LinearTransition.springify().damping(18)}
    >
      <PressableScale
        onPress={() => onToggle(habit)}
        onLongPress={() => onRemove(habit)}
        delayLongPress={450}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: habit.completed }}
        accessibilityLabel={label}
        accessibilityHint="Double tap to tick off today"
        accessibilityActions={[{ name: "remove", label: "Remove habit" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "remove") onRemove(habit);
        }}
        style={{
          borderRadius: 22,
          borderCurve: "continuous",
          padding: 16,
          backgroundColor: habit.completed ? withAlpha(tint, isDark ? 0.16 : 0.08) : colors.surface,
          ...getShadow(colors, isDark),
        }}
      >
        <View className="flex-row items-center">
          <View
            className="h-11 w-11 items-center justify-center rounded-2xl mr-3.5"
            style={{ backgroundColor: withAlpha(tint, 0.16), borderCurve: "continuous" }}
          >
            <Icon set="ion" name={habit.icon as any} size={20} color={tint} />
          </View>

          <View className="flex-1" style={{ minWidth: 0 }}>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              style={{
                fontSize: 15,
                fontWeight: "700",
                letterSpacing: -0.2,
                color: habit.completed ? colors.mutedText : colors.foreground,
                textDecorationLine: habit.completed ? "line-through" : "none",
                fontFamily: fonts.heading,
              }}
            >
              {habit.title}
            </Text>
            {habit.reason ? (
              <Text
                className="mt-0.5 text-xs"
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
                style={{ color: colors.mutedText, fontFamily: fonts.body, flexShrink: 1 }}
              >
                {habit.reason}
              </Text>
            ) : null}
          </View>

          <View style={{ marginLeft: 12 }}>
            {celebrating ? (
              <View pointerEvents="none" style={{ position: "absolute", left: -27, top: -27, width: 84, height: 84 }}>
                <CelebrationBurst size={84} />
              </View>
            ) : null}
            <Animated.View
              style={[
                {
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: habit.completed ? tint : "transparent",
                  borderWidth: 2,
                  borderColor: habit.completed ? tint : withAlpha(tint, 0.45),
                },
                checkStyle,
              ]}
            >
              {habit.completed ? <Icon set="feather" name="check" size={16} color={colors.buttonText} /> : null}
            </Animated.View>
          </View>
        </View>

        <View className="mt-3 flex-row items-end justify-between" style={{ paddingLeft: 58 }}>
          <WeekDots habit={habit} tint={tint} />
          <View className="flex-row items-center" style={{ gap: 4 }}>
            {habit.streak > 0 ? (
              <>
                <Icon set="ion" name="flame" size={14} color={colors.warning} />
                <Text
                  style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, fontFamily: fonts.mono, fontVariant: ["tabular-nums"] }}
                  maxFontSizeMultiplier={1.3}
                >
                  {habit.streak}
                </Text>
                <Text style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }} maxFontSizeMultiplier={1.3}>
                  {" · "}
                </Text>
              </>
            ) : null}
            <Text
              style={{ fontSize: 13, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.mono }}
              maxFontSizeMultiplier={1.3}
            >
              +{points}
            </Text>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}
