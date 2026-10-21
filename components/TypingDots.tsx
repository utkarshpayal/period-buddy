import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "./theme";

function Dot({ delay, color }: { delay: number; color: string }) {
  const lift = useSharedValue(0);
  useEffect(() => {
    lift.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 300 }), withTiming(0, { duration: 300 })), -1, false),
    );
  }, [delay, lift]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + lift.value * 0.65,
    transform: [{ translateY: -3 * lift.value }],
  }));
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }, style]} />;
}

/** Chat "is typing" bubble: three bouncing dots, the pattern people expect. */
export function TypingDots() {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel="Nura is typing"
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 20, borderCurve: "continuous",
        borderBottomLeftRadius: 6,
        backgroundColor: colors.surface,
      }}
    >
      <Dot delay={0} color={colors.mutedText} />
      <Dot delay={150} color={colors.mutedText} />
      <Dot delay={300} color={colors.mutedText} />
    </View>
  );
}
