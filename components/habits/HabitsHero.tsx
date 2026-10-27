import React, { useEffect } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { LivingTree } from "../forest/LivingTree";
import { CelebrationBurst } from "../celebrations/Lottie";
import { Icon } from "../Icon";
import { motion } from "../motion";
import { useTheme } from "../theme";
import { getShadow, withAlpha } from "../ui-tokens";
import { useTween } from "../../hooks/useTween";

const TREE_BOX = 108;
/** A seed still shows before the first tick. */
const SEED_GROWTH = 0.04;

function copyFor(done: number, total: number) {
  if (total === 0) return { title: "Plant today's tree", line: "Add a habit below and tick it off to grow it." };
  if (done === total) return { title: "In full bloom", line: `All ${total} done today. Lovely work.` };
  if (done === 0) return { title: `0 of ${total} done`, line: "Tick off a habit to sprout today's tree." };
  const left = total - done;
  return {
    title: `${done} of ${total} done`,
    line: left === 1 ? "One more and it blooms." : `${left} more to full bloom.`,
  };
}

/** Same shape all day, a new one each day. */
const seedFor = (dateKey: string) => [...dateKey].reduce((sum, c) => sum + c.charCodeAt(0) * 7, 0) % 997;

/**
 * Today's tree: grows from a seed as habits are ticked (in proportion to how
 * many are done) and blooms when all are. Ticks also count towards the
 * Forest's daily habit task, which the link opens.
 */
export function HabitsHero({
  done,
  total,
  todayKey,
  onOpenForest,
}: {
  done: number;
  total: number;
  todayKey: string;
  onOpenForest: () => void;
}) {
  const { colors, isDark, fonts } = useTheme();
  const reduceMotion = useReducedMotion();
  const ratio = total ? done / total : 0;
  const allDone = total > 0 && done === total;
  const tree = useTween(SEED_GROWTH + (1 - SEED_GROWTH) * ratio, 900);

  const bar = useSharedValue(reduceMotion ? ratio : 0);
  useEffect(() => {
    bar.value = reduceMotion ? ratio : withTiming(ratio, { duration: motion.duration.slow, easing: motion.easing.enter });
  }, [bar, ratio, reduceMotion]);
  const barStyle = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }));

  const { title, line } = copyFor(done, total);

  return (
    <View
      style={{
        borderRadius: 24,
        borderCurve: "continuous",
        padding: 18,
        backgroundColor: colors.surface,
        ...getShadow(colors, isDark),
      }}
    >
      <View className="flex-row items-center">
        <View className="flex-1 pr-4" style={{ minWidth: 0 }} accessible accessibilityLabel={`Today's tree. ${title}. ${line}`}>
          <Text
            style={{ fontSize: 11.5, fontWeight: "800", letterSpacing: 1, color: colors.success, fontFamily: fonts.heading }}
            maxFontSizeMultiplier={1.3}
          >
            TODAY&apos;S TREE
          </Text>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={{
              marginTop: 4,
              fontSize: 24,
              fontWeight: "800",
              letterSpacing: -0.6,
              color: colors.foreground,
              fontFamily: fonts.heading,
              fontVariant: ["tabular-nums"],
            }}
          >
            {title}
          </Text>
          <Text
            className="mt-1 text-xs leading-5"
            numberOfLines={2}
            maxFontSizeMultiplier={1.4}
            style={{ color: colors.mutedText, fontFamily: fonts.body }}
          >
            {line}
          </Text>
          {total > 0 ? (
            <View
              className="mt-3 overflow-hidden rounded-full"
              style={{ height: 8, backgroundColor: withAlpha(colors.success, 0.15) }}
            >
              <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: colors.success }, barStyle]} />
            </View>
          ) : null}
        </View>

        <View
          style={{
            width: TREE_BOX,
            height: TREE_BOX,
            borderRadius: TREE_BOX / 2,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "flex-end",
            backgroundColor: withAlpha(colors.success, isDark ? 0.18 : 0.12),
          }}
          importantForAccessibility="no-hide-descendants"
        >
          <LivingTree growth={tree.value} seed={seedFor(todayKey)} size={TREE_BOX - 12} vitality="thriving" />
        </View>
        {allDone ? (
          <View pointerEvents="none" style={{ position: "absolute", right: -20, top: -20, width: 150, height: 150 }}>
            <CelebrationBurst size={150} />
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        onPress={onOpenForest}
        accessibilityRole="link"
        accessibilityLabel="Open your Forest. Ticking a habit counts as today's habit care there."
        hitSlop={{ top: 12, bottom: 12 }}
        className="mt-4 flex-row items-center self-start"
        style={{ gap: 6 }}
      >
        <Icon set="mci" name="tree-outline" size={15} color={colors.success} />
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.success, fontFamily: fonts.body }} maxFontSizeMultiplier={1.3}>
          Ticks also grow your Forest
        </Text>
        <Icon set="feather" name="chevron-right" size={14} color={colors.success} />
      </TouchableOpacity>
    </View>
  );
}
