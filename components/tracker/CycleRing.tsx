import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { getCyclePhase } from "../../lib/cycle";
import { useTheme } from "../theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
// Values roll: the old one lifts out as the new one rises in.
const rollIn = FadeInDown.duration(340).easing(Easing.out(Easing.cubic));
const rollOut = FadeOutUp.duration(200);

const RING_SIZE = 196;
const daysLabel = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
// In the 100×100 viewBox the ring is drawn in.
const RING_RADIUS = 43;
const RING_STROKE_WIDTH = 7;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Read-only ring showing where today sits in the current cycle. The arc
 * draws itself on first show and glides to a new day; today's marker rides
 * its tip, and the centre text rolls when it changes.
 */
export function CycleRing({
  activeCycleLength,
  activePeriodLength,
  ovulationDayPivot,
  cycleDay,
  nextPeriodDaysAway,
  nextPeriodDate,
  fertilityReliable,
  daysLate = 0,
}: {
  activeCycleLength: number;
  activePeriodLength: number;
  ovulationDayPivot: number;
  cycleDay: number;
  nextPeriodDaysAway: number;
  /** Already formatted ("Nov 10"), or undefined before predictions load. */
  nextPeriodDate?: string;
  /** False when cycles are too irregular for a calendar-based fertile window. */
  fertilityReliable: boolean;
  /** Days since the period was due with none logged (0 = not late). */
  daysLate?: number;
}) {
  const { colors, fonts } = useTheme();
  const displayDay = cycleDay;
  const displayPhase = getCyclePhase(
    displayDay,
    activePeriodLength,
    activeCycleLength,
  );
  // Progress arc in the current phase's colour, solid.
  const ringColor = {
    period: colors.primary,
    follicular: colors.accentText,
    ovulation: colors.secondary,
    luteal: colors.warning,
  }[displayPhase];
  // Text-safe version of the phase colour (mint and lavender are too pale
  // to read as text on a light surface).
  const labelColor = {
    period: colors.primaryDark,
    follicular: colors.accentText,
    ovulation: colors.info,
    luteal: colors.warning,
  }[displayPhase];
  // Only ever says when fertility is likely high. The other days get no
  // label: a calendar estimate can't promise a day is low-risk.
  const isHighFertility =
    fertilityReliable &&
    (displayPhase === "ovulation" ||
      (displayDay >= ovulationDayPivot - 5 && displayDay <= ovulationDayPivot));

  const handleFraction = Math.min(displayDay / activeCycleLength, 1);
  const scale = RING_SIZE / 100;
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? handleFraction : 0);
  useEffect(() => {
    progress.value = reduceMotion
      ? handleFraction
      : withDelay(120, withTiming(handleFraction, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [handleFraction, reduceMotion, progress]);
  // A full-length dash slid back by the unfilled share draws the arc.
  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress.value),
  }));
  const markerStyle = useAnimatedStyle(() => {
    const angle = (progress.value * 360 - 90) * (Math.PI / 180);
    return {
      left: (50 + RING_RADIUS * Math.cos(angle)) * scale - 10,
      top: (50 + RING_RADIUS * Math.sin(angle)) * scale - 10,
      opacity: progress.value > 0.004 ? 1 : 0,
    };
  });
  // The estimated fertile window (5 days before ovulation through the day
  // after) as a soft lavender band on the track.
  const fertileStart = (ovulationDayPivot - 6) / activeCycleLength;
  const fertileLength = (6 / activeCycleLength) * RING_CIRCUMFERENCE;

  // While late the big value is "N days late", so never "PERIOD IN".
  const label =
    daysLate > 0 || displayPhase === "period"
      ? "PERIOD"
      : displayPhase === "ovulation"
        ? "OVULATION"
        : displayDay >= activePeriodLength + 1 && displayDay < ovulationDayPivot - 5
          ? "FERTILE IN"
          : "PERIOD IN";
  const value =
    daysLate > 0
      ? `${daysLate} ${daysLate === 1 ? "day" : "days"} late`
      : displayPhase === "period"
        ? `Day ${displayDay}`
        : displayPhase === "ovulation"
          ? "Today"
          : displayDay >= activePeriodLength + 1 && displayDay < ovulationDayPivot - 5
            ? daysLabel(Math.max(1, ovulationDayPivot - 5 - displayDay))
            : nextPeriodDaysAway <= 0
              ? "Today"
              : daysLabel(nextPeriodDaysAway);
  const sub = isHighFertility
    ? { text: "High fertility", color: colors.success, bold: true }
    : nextPeriodDate && displayPhase === "period"
      ? { text: `Next period ${nextPeriodDate}`, color: colors.mutedText, bold: false }
      : null;

  return (
    <View
      accessible
      accessibilityLabel={`Cycle day ${displayDay} of ${activeCycleLength}. ${label.toLowerCase()} ${value}`}
      style={{ position: "relative", width: RING_SIZE, height: RING_SIZE }}
    >
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox="0 0 100 100">
        <Circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke={colors.primaryLight} strokeWidth={RING_STROKE_WIDTH} />
        {fertilityReliable ? (
          <Circle
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            stroke={colors.secondaryLight}
            strokeWidth={RING_STROKE_WIDTH}
            strokeDasharray={`${fertileLength} ${RING_CIRCUMFERENCE}`}
            strokeDashoffset={-fertileStart * RING_CIRCUMFERENCE}
            transform="rotate(-90 50 50)"
          />
        ) : null}
        <AnimatedCircle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          stroke={ringColor}
          strokeWidth={RING_STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          animatedProps={arcProps}
          transform="rotate(-90 50 50)"
        />
      </Svg>

      {/* Marker for today's position in the cycle */}
      <Animated.View
        pointerEvents="none"
        style={[{
          position: "absolute",
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: colors.surface,
          borderWidth: 4,
          borderColor: ringColor,
        }, markerStyle]}
      />

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 28,
          gap: 2,
        }}
      >
        <Roll text={label} height={16} style={{ color: labelColor, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, fontFamily: fonts.body }} />
        <Roll
          text={value}
          height={46}
          fit
          style={{ color: colors.foreground, fontSize: 40, fontWeight: "800", letterSpacing: -1.2, fontVariant: ["tabular-nums"], fontFamily: fonts.heading }}
        />
        {sub ? <Roll text={sub.text} height={16} style={{ color: sub.color, fontSize: 13, fontWeight: sub.bold ? "700" : "400", fontFamily: fonts.body }} /> : null}
      </View>
    </View>
  );
}

/** One line of the centre text in a fixed-height slot, rolling when `text` changes. */
function Roll({ text, height, fit, style }: { text: string; height: number; fit?: boolean; style: object }) {
  return (
    <View style={{ height, alignSelf: "stretch", overflow: "hidden" }}>
      <Animated.Text
        key={text}
        entering={rollIn}
        exiting={rollOut}
        numberOfLines={1}
        adjustsFontSizeToFit={fit}
        minimumFontScale={fit ? 0.75 : undefined}
        style={[{ position: "absolute", left: 0, right: 0, textAlign: "center", lineHeight: height }, style]}
      >
        {text}
      </Animated.Text>
    </View>
  );
}
