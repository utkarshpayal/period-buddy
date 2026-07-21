import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { useTheme } from "./theme";

const GRID_SIZE = 3;
const HIT_RADIUS = 28;
const MAX_BOX_SIZE = 280;
const BOX_MARGIN = 80;

export type PatternLockStatus = "idle" | "error" | "success";

type Props = {
  status?: PatternLockStatus;
  onComplete: (sequence: number[]) => void;
};

export function PatternLock({ status = "idle", onComplete }: Props) {
  const { colors } = useTheme();
  // Sized straight off the window instead of measured via onLayout: on web,
  // a `width: "100%"` + `aspectRatio` box inside an `items-center` (align-
  // items: center) parent collapses to 0x0 because the parent shrinks to
  // fit rather than stretching, so onLayout never reports a usable size.
  const { width: windowWidth } = useWindowDimensions();
  const boxSize = Math.max(200, Math.min(MAX_BOX_SIZE, windowWidth - BOX_MARGIN));
  const [sequence, setSequence] = useState<number[]>([]);
  const [livePoint, setLivePoint] = useState<{ x: number; y: number } | null>(null);
  const sequenceRef = useRef<number[]>([]);
  // The PanResponder below is memoized on `dots` (stable after first layout)
  // so it never gets recreated on re-render — reading `onComplete` through a
  // ref (instead of closing over the prop directly) keeps it from calling a
  // stale handler from whichever render first built the responder.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const dots = useMemo(() => {
    const padding = boxSize * 0.16;
    const usable = boxSize - padding * 2;
    const points: { x: number; y: number }[] = [];
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        points.push({
          x: padding + (usable * col) / (GRID_SIZE - 1),
          y: padding + (usable * row) / (GRID_SIZE - 1),
        });
      }
    }
    return points;
  }, [boxSize]);

  const activeColor = status === "error" ? colors.danger : status === "success" ? colors.success : colors.primary;

  const handleTouch = (x: number, y: number) => {
    setLivePoint({ x, y });
    dots.forEach((dot, index) => {
      if (sequenceRef.current.includes(index)) return;
      const distance = Math.hypot(dot.x - x, dot.y - y);
      if (distance <= HIT_RADIUS) {
        sequenceRef.current = [...sequenceRef.current, index];
        setSequence(sequenceRef.current);
      }
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          sequenceRef.current = [];
          setSequence([]);
          handleTouch(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        },
        onPanResponderMove: (evt) => {
          handleTouch(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        },
        onPanResponderRelease: () => {
          setLivePoint(null);
          const finished = sequenceRef.current;
          sequenceRef.current = [];
          if (finished.length > 0) onCompleteRef.current(finished);
          else setSequence([]);
        },
        onPanResponderTerminate: () => {
          setLivePoint(null);
          sequenceRef.current = [];
          setSequence([]);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dots],
  );

  return (
    <View style={{ width: boxSize, height: boxSize }} {...panResponder.panHandlers}>
      <Svg width={boxSize} height={boxSize}>
        {sequence.slice(1).map((dotIndex, i) => {
          const from = dots[sequence[i]];
          const to = dots[dotIndex];
          return (
            <Line
              key={`seg-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={activeColor}
              strokeWidth={4}
              strokeLinecap="round"
            />
          );
        })}
        {livePoint && sequence.length > 0 && (
          <Line
            x1={dots[sequence[sequence.length - 1]].x}
            y1={dots[sequence[sequence.length - 1]].y}
            x2={livePoint.x}
            y2={livePoint.y}
            stroke={activeColor}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={0.5}
          />
        )}
        {dots.map((dot, index) => {
          const isSelected = sequence.includes(index);
          return (
            <React.Fragment key={index}>
              <Circle
                cx={dot.x}
                cy={dot.y}
                r={14}
                fill={isSelected ? activeColor : "transparent"}
                opacity={isSelected ? 0.18 : 1}
                stroke={isSelected ? activeColor : colors.border}
                strokeWidth={2}
              />
              <Circle cx={dot.x} cy={dot.y} r={5} fill={isSelected ? activeColor : colors.mutedText} />
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}
