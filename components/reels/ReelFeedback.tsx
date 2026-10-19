import React, { memo, useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Icon } from "../Icon";

export type Burst = { key: number; x: number; y: number };

const HEART = 96;

/** Double-tap heart: pops in where the finger was, floats up and fades. */
export const HeartBurst = memo(function HeartBurst({ burst }: { burst: Burst | null }) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const lift = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!burst) return;
    lift.value = 0;
    if (reduceMotion) {
      scale.value = 1;
      opacity.value = withSequence(withTiming(1, { duration: 80 }), withDelay(450, withTiming(0, { duration: 200 })));
      return;
    }
    scale.value = withSequence(
      withTiming(0, { duration: 0 }),
      withSpring(1.15, { damping: 9, stiffness: 260 }),
      withTiming(1, { duration: 120 }),
    );
    opacity.value = withSequence(withTiming(1, { duration: 60 }), withDelay(520, withTiming(0, { duration: 260 })));
    lift.value = withDelay(520, withTiming(-60, { duration: 300, easing: Easing.out(Easing.quad) }));
  }, [burst, lift, opacity, reduceMotion, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: lift.value }, { scale: scale.value }, { rotate: "-8deg" }],
  }));

  if (!burst) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", left: burst.x - HEART / 2, top: burst.y - HEART / 2 }, style]}
    >
      <Icon set="ion" name="heart" size={HEART} color="#FF3B5C" style={{ textShadowColor: "rgba(0,0,0,0.25)", textShadowRadius: 8 }} />
    </Animated.View>
  );
});

/** Brief centred mute/unmute icon after a single tap. */
export const MuteFlash = memo(function MuteFlash({ flashKey, muted }: { flashKey: number; muted: boolean }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    if (flashKey === 0) return;
    opacity.value = withSequence(withTiming(1, { duration: 120 }), withDelay(550, withTiming(0, { duration: 220 })));
    scale.value = withSequence(withTiming(0.8, { duration: 0 }), withTiming(1, { duration: 160 }));
  }, [flashKey, opacity, scale]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={[
          { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
          style,
        ]}
      >
        <Icon set="ion" name={muted ? "volume-mute" : "volume-high"} size={32} color="white" />
      </Animated.View>
    </View>
  );
});
