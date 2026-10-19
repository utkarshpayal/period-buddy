import React, { useEffect } from "react";
import { ActivityIndicator, TouchableOpacity } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import type { ThemeColors } from "./theme";
import { Icon } from "./Icon";

interface VoiceOrbProps {
  colors: ThemeColors;
  isRecording: boolean;
  isTranscribing: boolean;
  level: number; // 0..1 live mic amplitude
  onPress: () => void;
  size?: number;
}

function Ring({
  active,
  color,
  delay,
  level,
  size,
}: {
  active: boolean;
  color: string;
  delay: number;
  level: SharedValue<number>;
  size: number;
}) {
  const ambient = useSharedValue(0);

  useEffect(() => {
    if (active) {
      // Staggered so the rings ripple outwards instead of pulsing together.
      ambient.value = withDelay(
        delay,
        withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.ease) }), -1, false),
      );
    } else {
      ambient.value = withTiming(0, { duration: 250 });
    }
  }, [active, ambient, delay]);

  const style = useAnimatedStyle(() => {
    const boost = level.value * 0.55;
    const scale = 0.72 + ambient.value * 0.5 + boost;
    const opacity = active ? (1 - ambient.value) * 0.45 + level.value * 0.25 : 0;
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

export function VoiceOrb({ colors, isRecording, isTranscribing, level, onPress, size = 52 }: VoiceOrbProps) {
  const levelShared = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    levelShared.value = withTiming(level, { duration: 90, easing: Easing.out(Easing.quad) });
  }, [level, levelShared]);

  useEffect(() => {
    if (isRecording) {
      pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      pulse.value = withTiming(0, { duration: 200 });
    }
  }, [isRecording, pulse]);

  const coreStyle = useAnimatedStyle(() => {
    const scale = isRecording ? 1 + pulse.value * 0.06 + levelShared.value * 0.14 : 1;
    return { transform: [{ scale }] };
  });

  const coreColor = isRecording ? colors.danger : colors.border;
  const iconColor = isRecording ? "#fff" : colors.mutedText;
  const ringSize = size * 1.9;

  return (
    <TouchableOpacity
      accessibilityLabel={isTranscribing ? "Transcribing" : isRecording ? "Stop recording" : "Start recording"}
      accessibilityRole="button"
      disabled={isTranscribing}
      onPress={onPress}
      activeOpacity={0.85}
      style={{ width: ringSize, height: ringSize, alignItems: "center", justifyContent: "center" }}
    >
      <Ring active={isRecording} color={colors.primary} delay={0} level={levelShared} size={ringSize} />
      <Ring active={isRecording} color={colors.accent} delay={450} level={levelShared} size={ringSize * 0.82} />

      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: coreColor,
            shadowColor: isRecording ? colors.primary : "transparent",
            shadowOpacity: 0.5,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 0 },
            elevation: isRecording ? 6 : 0,
          },
          coreStyle,
        ]}
      >
        {isTranscribing ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <Icon set="feather" name="mic" size={size * 0.42} color={iconColor} />
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}
