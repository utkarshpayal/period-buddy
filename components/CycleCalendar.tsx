import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type EntryAnimationsValues,
} from "react-native-reanimated";
import type { DayEntry as LocalDayEntry } from "./AppState";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet } from "./BottomSheet";
import { Icon } from "./Icon";
import { useTheme } from "./theme";
import { getSoftTints, withAlpha } from "./ui-tokens";
import type { CyclePhase } from "../lib/cycle";
import { MONTH_NAMES, WEEKDAY_LABELS, dayStatus, monthSlots, type CalendarModel, type DayStatus } from "../lib/cycleCalendar";
import { getDateKey } from "../lib/format";

/**
 * Calendar pieces shared by the Calendar screen's month and year views.
 * Heights are fixed (so lists can use getItemLayout and scroll smoothly) and
 * every block is memoised: scrolling never rebuilds a month that didn't change.
 */

export const MONTH_TITLE_HEIGHT = 44;
export const DAY_CELL = 48;
export const MONTH_BLOCK_HEIGHT = MONTH_TITLE_HEIGHT + DAY_CELL * 6 + 16;

export type PhasePalette = Record<CyclePhase, { color: string; bg: string; label: string }>;

export function usePhasePalette(): PhasePalette {
  const { colors, isDark } = useTheme();
  return useMemo(() => {
    const soft = getSoftTints(colors);
    return {
      // Plain names (lib/cycleCopy.ts PHASE_COPY), not the medical ones.
      period: { color: colors.rose, bg: soft.rose, label: "Period" },
      // Light mint is too pale for a ring on white; its darker text shade isn't.
      follicular: { color: isDark ? colors.accent : colors.accentText, bg: soft.mint, label: "After period" },
      ovulation: { color: colors.secondary, bg: soft.lavender, label: "Fertile" },
      luteal: { color: colors.warning, bg: soft.amber, label: "Before period" },
    };
  }, [colors, isDark]);
}

export type Lookups = {
  model: CalendarModel;
  entryFor: (dateKey: string) => LocalDayEntry | undefined;
  noteFor: (dateKey: string) => string | undefined;
  todayKey: string;
};

/* ────────────────────────────── Month (full size) ────────────────────────────── */

/**
 * What a day is drawn as. Ordinary days are just their number; a soft circle
 * only where it matters:
 *   "period"    logged period → solid rose circle, white number
 *   "predicted" predicted period → dotted rose ring, no fill
 *   "fertile"   fertile window (likely ovulation included) → soft lavender circle
 * Today gets a dark ring. Future days are faded: they can't be logged yet and
 * whatever they show is a prediction.
 */
export type DayBand = "period" | "predicted" | "fertile" | null;

export function dayBand(s: DayStatus): DayBand {
  const isPeriod = s.phase === "period";
  if (isPeriod && !s.isFuture && (s.hasFlow || s.isLogged)) return "period";
  if (s.isPredictedPeriod) return "predicted";
  if (!isPeriod && s.isFertile) return "fertile";
  return null;
}

/**
 * A run of day cells (a month grid or one week), 7 to a row. The one
 * calendar renderer: Tracker month pager and week strip, Calendar screen.
 * `stagger` makes freshly shown days arrive in a diagonal wave (the Tracker's
 * month pager, on opening and on every month change).
 */
export function CalendarDayGrid({
  dates,
  lookups,
  palette,
  onPressDay,
  height = DAY_CELL,
  stagger = false,
}: {
  dates: (Date | null)[];
  lookups: Lookups;
  palette: PhasePalette;
  onPressDay: (s: DayStatus) => void;
  height?: number;
  stagger?: boolean;
}) {
  const { model, entryFor, noteFor, todayKey } = lookups;
  return (
    <>
      {dates.map((d, i) =>
        d ? (
          // Keyed by date, so a day that changes (logged, cleared) is the same
          // cell and can animate the change, while a new month mounts fresh.
          <CalendarDayCell
            key={getDateKey(d)}
            s={dayStatus(d, model, entryFor, noteFor, todayKey)}
            palette={palette}
            height={height}
            onPress={onPressDay}
            enterDelay={stagger ? (Math.floor(i / 7) + (i % 7)) * 18 : undefined}
          />
        ) : (
          <View key={`blank-${i}`} style={{ width: `${100 / 7}%`, height }} />
        ),
      )}
    </>
  );
}

/** A day arriving: fades in and springs up from a little smaller. */
function dayEntering(delay: number) {
  return (_values: EntryAnimationsValues) => {
    "worklet";
    return {
      initialValues: { opacity: 0, transform: [{ scale: 0.6 }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: 220 })),
        transform: [{ scale: withDelay(delay, withSpring(1, { damping: 13, stiffness: 220 })) }],
      },
    };
  };
}

function CalendarDayCell({
  s,
  palette,
  onPress,
  height,
  enterDelay,
}: {
  s: DayStatus;
  palette: PhasePalette;
  onPress: (s: DayStatus) => void;
  height: number;
  enterDelay?: number;
}) {
  const { colors, fonts } = useTheme();
  const reduceMotion = useReducedMotion();
  const band = dayBand(s);
  const size = Math.min(38, height - 8);
  const isFuture = s.isFuture;
  const background =
    band === "period" ? palette.period.color : band === "fertile" ? colors.secondaryLight : "transparent";
  const textColor =
    band === "period" ? colors.buttonText : band === "predicted" ? colors.primaryDark : band === "fertile" ? colors.info : colors.foreground;

  // Press squeeze and the pop when this day's log changes share one scale.
  const press = useSharedValue(1);
  const pop = useSharedValue(1);
  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value * pop.value }] }));

  // Logging or clearing this day pops its circle and sends out a ripple, in
  // step with the tracker hero's surge. Only the day's own log counts:
  // predictions shifting across the month change quietly. Not on first show.
  const signature = `${band === "period"}|${s.isLogged}`;
  const prevSignature = useRef(signature);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (prevSignature.current === signature) return;
    prevSignature.current = signature;
    if (reduceMotion) return;
    pop.value = withSequence(withTiming(0.72, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 200 }));
    setBurst((n) => n + 1);
  }, [signature, reduceMotion, pop]);

  const entering = useMemo(() => (enterDelay == null ? undefined : dayEntering(enterDelay)), [enterDelay]);
  const ringColor = band === "period" || band === "predicted" ? palette.period.color : band === "fertile" ? colors.secondary : colors.primary;

  return (
    <Pressable
      onPress={() => onPress(s)}
      onPressIn={() => {
        if (!reduceMotion) press.value = withSpring(0.86, { damping: 18, stiffness: 400 });
      }}
      onPressOut={() => {
        if (!reduceMotion) press.value = withSpring(1, { damping: 10, stiffness: 260 });
      }}
      // Future days can't be logged, so they don't open the log modal.
      disabled={isFuture}
      accessibilityRole="button"
      accessibilityState={{ disabled: isFuture }}
      accessibilityLabel={`${s.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}, ${isFuture ? "predicted " : ""}${palette[s.phase].label.toLowerCase()}${s.isToday ? ", today" : ""}${s.isLogged ? ", logged" : ""}${s.isOvulation ? ", likely ovulation" : ""}`}
      // Faded = disabled: still readable, clearly not tappable yet.
      style={{ width: `${100 / 7}%`, height, alignItems: "center", justifyContent: "center", opacity: isFuture ? 0.45 : 1 }}
    >
      <Animated.View entering={entering} style={{ alignItems: "center", justifyContent: "center" }}>
        {s.isToday && !reduceMotion ? <TodayPing size={size} color={colors.primary} /> : null}
        {burst > 0 ? <DayRipple key={burst} size={size} color={ringColor} /> : null}
        <Animated.View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: background,
              borderWidth: s.isToday ? 2 : 0,
              borderColor: colors.foreground,
            },
            circleStyle,
          ]}
        >
          {band === "predicted" ? <DottedRing size={size} color={palette.period.color} /> : null}
          <Text
            style={{
              color: textColor,
              fontSize: 15,
              fontWeight: s.isToday || band ? "700" : "500",
              fontVariant: ["tabular-nums"],
              fontFamily: fonts.body,
            }}
          >
            {s.day}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/** A predicted period day: a ring of dots, spinning gently into place when it appears. */
export function DottedRing({ size, color, dots = 14 }: { size: number; color: string; dots?: number }) {
  const r = size / 2 - 1.5;
  const gap = (2 * Math.PI * r) / dots;
  return (
    <Animated.View entering={ringEntering} pointerEvents="none" style={{ position: "absolute", width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeDasharray={`0.01 ${gap - 0.01}`}
        />
      </Svg>
    </Animated.View>
  );
}

function ringEntering(_values: EntryAnimationsValues) {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ rotate: "-90deg" }, { scale: 0.7 }] },
    animations: {
      opacity: withTiming(1, { duration: 260 }),
      transform: [
        { rotate: withTiming("0deg", { duration: 480, easing: Easing.out(Easing.back(1.4)) }) },
        { scale: withSpring(1, { damping: 12, stiffness: 200 }) },
      ],
    },
  };
}

/** Today's slow, soft ping: a tint swelling out from the ring and fading, then a pause. */
function TodayPing({ size, color }: { size: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withSequence(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), withDelay(1400, withTiming(0, { duration: 0 }))),
      -1,
      false,
    );
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: (1 - t.value) * 0.45,
    transform: [{ scale: 1 + t.value * 0.35 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: withAlpha(color, 0.35) }, style]}
    />
  );
}

/** One ring rolling out from a day whose log just changed. */
function DayRipple({ size, color }: { size: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) });
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: (1 - t.value) * 0.7,
    transform: [{ scale: 1 + t.value * 0.7 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color }, style]}
    />
  );
}

/**
 * The calendar's key, kept off the calendar itself: an ⓘ button (or a quiet
 * text link) that opens a short sheet explaining the circles, today and faded days.
 */
export function CalendarKeyButton({ variant = "icon" }: { variant?: "icon" | "link" }) {
  const { colors, fonts } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "icon" ? (
        <TouchableOpacity
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="What the calendar colours mean"
          hitSlop={8}
          style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
        >
          <Icon set="ion" name="information-circle-outline" size={21} color={colors.mutedText} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          hitSlop={{ top: 10, bottom: 10 }}
          style={{ flexDirection: "row", alignItems: "center", alignSelf: "center", gap: 6, paddingVertical: 4 }}
        >
          <Icon set="ion" name="information-circle-outline" size={17} color={colors.mutedText} />
          <Text style={{ color: colors.mutedText, fontSize: 13.5, fontWeight: "600", fontFamily: fonts.body }}>What the colours mean</Text>
        </TouchableOpacity>
      )}
      <CalendarKeySheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

function CalendarKeySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, fonts } = useTheme();
  const palette = usePhasePalette();
  const insets = useSafeAreaInsets();
  const circle = (style: object) => <View style={{ width: 28, height: 28, borderRadius: 14, ...style }} />;
  const row = (mark: React.ReactNode, title: string, detail: string) => (
    <View key={title} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 9 }}>
      {mark}
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", fontFamily: fonts.body }}>{title}</Text>
        {detail ? <Text style={{ color: colors.mutedText, fontSize: 13, lineHeight: 18, fontFamily: fonts.body }}>{detail}</Text> : null}
      </View>
    </View>
  );
  return (
    <BottomSheet visible={visible} onClose={onClose} style={{ paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 20, fontWeight: "800", marginTop: 6, marginBottom: 8, fontFamily: fonts.heading }}>
        Reading your calendar
      </Text>
      {row(circle({ backgroundColor: palette.period.color }), "Period", "Days you logged.")}
      {row(
        <View style={{ width: 28, height: 28 }}>
          <DottedRing size={28} color={palette.period.color} dots={10} />
        </View>,
        "Predicted period", "When your next one is likely. It gets better the more you log.")}
      {row(circle({ backgroundColor: colors.secondaryLight }), "Fertile days", "Most likely days to get pregnant.")}
      {row(circle({ borderWidth: 2, borderColor: colors.foreground }), "Today", "")}
      {row(<View style={{ width: 28, alignItems: "center", opacity: 0.45 }}><Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600", fontFamily: fonts.body }}>28</Text></View>, "Faded days", "Still to come, so they can't be logged yet.")}
      <Text style={{ color: colors.mutedText, fontSize: 13, lineHeight: 19, marginTop: 10, fontFamily: fonts.body }}>
        Tap any day to see which phase it&apos;s in and what to expect.
      </Text>
    </BottomSheet>
  );
}

/** A full month: title + 6×7 grid (fixed MONTH_BLOCK_HEIGHT). */
export const MonthBlock = React.memo(function MonthBlock({
  monthDate,
  lookups,
  onPressDay,
}: {
  monthDate: Date;
  lookups: Lookups;
  onPressDay: (s: DayStatus) => void;
}) {
  const { colors, fonts } = useTheme();
  const palette = usePhasePalette();
  const slots = useMemo(() => monthSlots(monthDate), [monthDate]);
  return (
    <View style={{ height: MONTH_BLOCK_HEIGHT, paddingHorizontal: 12 }}>
      <View style={{ height: MONTH_TITLE_HEIGHT, justifyContent: "flex-end", paddingHorizontal: 8, paddingBottom: 8 }}>
        <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800", fontFamily: fonts.heading }}>
          {MONTH_NAMES[monthDate.getMonth()]}
          <Text style={{ color: colors.mutedText, fontWeight: "600" }}>{` ${monthDate.getFullYear()}`}</Text>
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <CalendarDayGrid dates={slots} lookups={lookups} palette={palette} onPressDay={onPressDay} />
      </View>
    </View>
  );
});

export function WeekdayHeader() {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 12 }}>
      {WEEKDAY_LABELS.map((d, i) => (
        <Text key={i} style={{ width: `${100 / 7}%`, textAlign: "center", color: colors.mutedText, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>
          {d}
        </Text>
      ))}
    </View>
  );
}

/* ─────────────────────────────── Year (mini months) ─────────────────────────────── */

export const MINI_TITLE = 22;
export const MINI_CELL = 15;
export const MINI_HEIGHT = MINI_TITLE + MINI_CELL * 6;

/** A small month for the year view: the same meanings as the month view, as tinted dots. */
export const MiniMonth = React.memo(function MiniMonth({
  monthDate,
  lookups,
  width,
  onPress,
}: {
  monthDate: Date;
  lookups: Lookups;
  width: number;
  onPress: (monthDate: Date) => void;
}) {
  const { colors, fonts } = useTheme();
  const palette = usePhasePalette();
  const slots = useMemo(() => monthSlots(monthDate), [monthDate]);
  const { model, entryFor, noteFor, todayKey } = lookups;
  const isThisMonth = todayKey.slice(0, 7) === getDateKey(monthDate).slice(0, 7);
  const dot = MINI_CELL - 2;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(monthDate)}
      accessibilityRole="button"
      accessibilityLabel={`${MONTH_NAMES[monthDate.getMonth()]} ${monthDate.getFullYear()}. Open month`}
      style={{ width, height: MINI_HEIGHT }}
    >
      <Text style={{ height: MINI_TITLE, color: isThisMonth ? colors.primary : colors.foreground, fontSize: 13, fontWeight: "800", fontFamily: fonts.heading }}>
        {MONTH_NAMES[monthDate.getMonth()].slice(0, 3)}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {slots.map((date, i) => {
          if (!date) return <View key={i} style={{ width: `${100 / 7}%`, height: MINI_CELL }} />;
          const s = dayStatus(date, model, entryFor, noteFor, todayKey);
          // Same meanings as the month view, as small tinted dots.
          const band = dayBand(s);
          const bg = band === "period" ? palette.period.color : band === "predicted" ? palette.period.bg : band === "fertile" ? colors.secondaryLight : "transparent";
          return (
            <View key={i} style={{ width: `${100 / 7}%`, height: MINI_CELL, alignItems: "center", justifyContent: "center", opacity: s.isFuture ? 0.45 : 1 }}>
              <View
                style={{
                  width: dot,
                  height: dot,
                  borderRadius: dot / 2,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: s.isToday ? colors.foreground : bg,
                }}
              >
                <Text style={{ fontSize: 7.5, fontWeight: band || s.isToday ? "800" : "500", color: s.isToday ? colors.background : band === "period" ? colors.buttonText : band === "predicted" ? colors.primaryDark : band === "fertile" ? colors.info : colors.mutedText, fontFamily: fonts.body }}>
                  {s.day}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </TouchableOpacity>
  );
});
