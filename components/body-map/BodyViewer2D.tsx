import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import { Pressable, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { BODY_VIEWS_2D, type BodyView2D } from "../../lib/bodyModel.generated";
import { nearestAnchor, regionLabel, type BodyMarker, type SymptomSide } from "../../lib/bodyRegions";
import { PAIN_COLORS } from "./painColors";

/**
 * The 2D fallback: front/back renders of the same model
 * (scripts/generate-body-model.mjs) with the same pulsing pain dots at the
 * same anchors, for builds without expo-gl, no WebGL, or a failed model.
 */
const IMAGES: Record<BodyView2D, number> = {
  front: require("../../assets/models/female-body-front.png"),
  back: require("../../assets/models/female-body-back.png"),
};

type Props = {
  view: BodyView2D;
  markers: BodyMarker[];
  selectedKey: string | null;
  reduceMotion: boolean;
  onTapAnchor: (anchorKey: string) => void;
};

export function BodyViewer2D({ view, markers, selectedKey, reduceMotion, onTapAnchor }: Props) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const { aspect, points } = BODY_VIEWS_2D[view];
  const h = Math.min(box.height, box.width / aspect);
  const w = h * aspect;
  const left = (box.width - w) / 2;
  const top = (box.height - h) / 2;

  const onLayout = (e: LayoutChangeEvent) =>
    setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  const onBodyPress = (e: GestureResponderEvent) => {
    const u = (e.nativeEvent.locationX - left) / w;
    const v = (e.nativeEvent.locationY - top) / h;
    const hit = nearestAnchor<[number, number]>([u, v], points, (a, b) => Math.hypot((a[0] - b[0]) * aspect, a[1] - b[1]), 0.09);
    if (hit) onTapAnchor(hit.key);
  };

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      <Pressable
        onPress={onBodyPress}
        style={{ flex: 1 }}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Body, ${view} view`}
      >
        {w > 0 ? (
          <Image source={IMAGES[view]} style={{ position: "absolute", left, top, width: w, height: h }} contentFit="contain" />
        ) : null}
      </Pressable>
      {w > 0
        ? markers.map((m, i) => {
            const pt = points[m.key];
            if (!pt) return null;
            return (
              <PainDot2D
                key={m.key}
                marker={m}
                x={left + pt[0] * w}
                y={top + pt[1] * h}
                selected={m.key === selectedKey}
                delay={i * 180}
                still={reduceMotion}
                onPress={() => onTapAnchor(m.key)}
              />
            );
          })
        : null}
    </View>
  );
}

function PainDot2D({
  marker,
  x,
  y,
  selected,
  delay,
  still,
  onPress,
}: {
  marker: BodyMarker;
  x: number;
  y: number;
  selected: boolean;
  delay: number;
  still: boolean;
  onPress: () => void;
}) {
  const color = PAIN_COLORS[marker.intensity];
  const core = 10 + marker.intensity * 2 + (selected ? 4 : 0);
  const ripple = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    ripple.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: marker.recent ? 1200 : 2000, easing: Easing.out(Easing.quad) }), -1, false),
    );
    return () => cancelAnimation(ripple);
  }, [delay, marker.recent, ripple, still]);
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: still ? 0 : (1 - ripple.value) * 0.7,
    transform: [{ scale: 1 + ripple.value * 2.2 }],
  }));
  const R = core * 3;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={14}
      accessibilityRole="button"
      accessibilityLabel={`${regionLabel(marker.regionId, marker.key.split(":")[1] as SymptomSide)}: ${marker.symptoms.map((s) => s.label).join(", ")}`}
      style={{ position: "absolute", left: x - R / 2, top: y - R / 2, width: R, height: R, alignItems: "center", justifyContent: "center" }}
    >
      <View style={{ position: "absolute", width: core * 2.4, height: core * 2.4, borderRadius: core * 1.2, backgroundColor: color, opacity: 0.22 }} />
      <Animated.View
        style={[
          { position: "absolute", width: core, height: core, borderRadius: core / 2, borderWidth: 2, borderColor: color },
          rippleStyle,
        ]}
      />
      <View
        style={{
          width: core,
          height: core,
          borderRadius: core / 2,
          backgroundColor: color,
          borderWidth: selected ? 3 : 2,
          borderColor: "#ffffff",
        }}
      />
    </Pressable>
  );
}
