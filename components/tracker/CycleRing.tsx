import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { getCyclePhase } from "../../lib/cycle";
import { useTheme } from "../theme";

const RING_SIZE = 196;
const daysLabel = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
// In the 100×100 viewBox the ring is drawn in.
const RING_RADIUS = 43;
const RING_STROKE_WIDTH = 7;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Read-only ring showing where today sits in the current cycle. */
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
  const handleAngleRad = (handleFraction * 360 - 90) * (Math.PI / 180);
  const scale = RING_SIZE / 100;
  const handleLeft = (50 + RING_RADIUS * Math.cos(handleAngleRad)) * scale;
  const handleTop = (50 + RING_RADIUS * Math.sin(handleAngleRad)) * scale;
  // The estimated fertile window (5 days before ovulation through the day
  // after) as a soft lavender band on the track.
  const fertileStart = (ovulationDayPivot - 6) / activeCycleLength;
  const fertileLength = (6 / activeCycleLength) * RING_CIRCUMFERENCE;

  return (
    <View
      accessible
      accessibilityLabel={`Cycle day ${displayDay} of ${activeCycleLength}`}
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
        <Circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          stroke={ringColor}
          strokeWidth={RING_STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={`${handleFraction * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          transform="rotate(-90 50 50)"
        />
      </Svg>

      {/* Marker for today's position in the cycle */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: handleLeft - 10,
          top: handleTop - 10,
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: colors.surface,
          borderWidth: 4,
          borderColor: ringColor,
        }}
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
        {/* While late the big value is "N days late", so never "PERIOD IN". */}
        <Text
          numberOfLines={1}
          style={{ color: labelColor, fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 1.2, fontFamily: fonts.body }}
        >
          {daysLate > 0 || displayPhase === "period"
            ? "PERIOD"
            : displayPhase === "ovulation"
              ? "OVULATION"
              : displayDay >= activePeriodLength + 1 && displayDay < ovulationDayPivot - 5
                ? "FERTILE IN"
                : "PERIOD IN"}
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={{ color: colors.foreground, fontSize: 40, lineHeight: 46, fontWeight: "800", letterSpacing: -1.2, fontVariant: ["tabular-nums"], fontFamily: fonts.heading }}
        >
          {daysLate > 0
            ? `${daysLate} ${daysLate === 1 ? "day" : "days"} late`
            : displayPhase === "period"
            ? `Day ${displayDay}`
            : displayPhase === "ovulation"
              ? "Today"
              : displayDay >= activePeriodLength + 1 && displayDay < ovulationDayPivot - 5
                ? daysLabel(Math.max(1, ovulationDayPivot - 5 - displayDay))
                : nextPeriodDaysAway <= 0
                  ? "Today"
                  : daysLabel(nextPeriodDaysAway)}
        </Text>
        {isHighFertility ? (
          <Text numberOfLines={1} style={{ color: colors.success, fontSize: 12, lineHeight: 16, fontWeight: "700", fontFamily: fonts.body }}>
            High fertility
          </Text>
        ) : nextPeriodDate && displayPhase === "period" ? (
          <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 12, lineHeight: 16, fontFamily: fonts.body }}>
            {`Next period ${nextPeriodDate}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
