import React, { useEffect } from "react";
import { Text, View, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { BearMascot } from "./BearMascot";
import { useTheme } from "./theme";

/**
 * Branded, theme-aware app loader: the Buddy bear mascot sitting inside a
 * rotating gradient arc with a soft pulsing halo. Use this instead of a bare
 * <ActivityIndicator> anywhere the app is waiting — it's the default spinner
 * inside LoadingErrorState, and can be dropped in directly as a full-screen or
 * inline loader.
 */
export function Loader({
  size = 72,
  label,
  fullscreen = false,
  style,
}: {
  size?: number;
  label?: string;
  fullscreen?: boolean;
  style?: ViewStyle;
}) {
  const { colors, fonts, isDark } = useTheme();
  const rotation = useSharedValue(0);
  const halo = useSharedValue(0.5);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1400, easing: Easing.linear }),
      -1,
      false,
    );
    halo.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.5, { duration: 800, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
  }, [rotation, halo]);

  const arcStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: halo.value * 0.4,
    transform: [{ scale: 0.9 + halo.value * 0.25 }],
  }));

  const ring = size;
  const stroke = Math.max(4, size * 0.07);
  const r = (ring - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  const content = (
    <View className="items-center" style={style}>
      <View style={{ width: ring, height: ring, alignItems: "center", justifyContent: "center" }}>
        {/* Soft pulsing halo behind everything */}
        <Animated.View
          style={[
            {
              position: "absolute",
              width: ring,
              height: ring,
              borderRadius: ring / 2,
              backgroundColor: colors.primary,
            },
            haloStyle,
          ]}
        />
        {/* Rotating gradient arc */}
        <Animated.View style={[{ position: "absolute", width: ring, height: ring }, arcStyle]}>
          <Svg width={ring} height={ring}>
            <Defs>
              <SvgGradient id="loaderArc" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={colors.primary} stopOpacity={1} />
                <Stop offset="1" stopColor={colors.accent} stopOpacity={0.15} />
              </SvgGradient>
            </Defs>
            <Circle
              cx={ring / 2}
              cy={ring / 2}
              r={r}
              fill="none"
              stroke={colors.border}
              strokeWidth={stroke}
              opacity={isDark ? 0.4 : 0.6}
            />
            <Circle
              cx={ring / 2}
              cy={ring / 2}
              r={r}
              fill="none"
              stroke="url(#loaderArc)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${circumference * 0.7} ${circumference}`}
            />
          </Svg>
        </Animated.View>
        {/* Mascot in the centre */}
        <BearMascot
          faceColor={colors.primary}
          featureColor={colors.buttonText}
          noseColor={colors.accent}
          size={size * 0.5}
        />
      </View>
      {label ? (
        <Text
          className="mt-4 text-sm font-semibold"
          style={{ color: colors.mutedText, fontFamily: fonts.body }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );

  if (fullscreen) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}>
        {content}
      </View>
    );
  }
  return content;
}
