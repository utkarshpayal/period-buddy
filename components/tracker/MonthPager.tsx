import React, { useMemo, useRef } from "react";
import { PanResponder, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInLeft, FadeInRight, ZoomIn, ZoomOut, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { CalendarDayGrid, CalendarKeyButton, usePhasePalette, type Lookups } from "../CycleCalendar";
import { motion } from "../motion";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";
import { MONTH_NAMES, WEEKDAY_LABELS, monthSlots, type DayStatus } from "../../lib/cycleCalendar";
import { dateFromDayKey } from "../../lib/format";
import { Icon } from "../Icon";
import { haptics } from "../../lib/haptics";

// Every month gets 6 rows so changing month never changes the card's height.
const CAL_ROWS = 6;
export const TRACKER_CELL = 46;
// How far a horizontal drag (or how fast a flick) changes the month.
const SWIPE_DISTANCE = 56;
const SWIPE_VELOCITY = 0.35;

/**
 * The Tracker's calendar card: month title (opens the full Calendar), an ⓘ
 * for the colour key, a "Today" pill once you've moved away, chevrons, and
 * the month itself.
 *
 * Only the selected month is drawn. Arrows, Today and a horizontal swipe
 * change `year`/`month` (through `onChangeMonth`) with a light tick: the
 * title rolls in from that side and the days arrive in a diagonal wave
 * (also on first show).
 * There is deliberately no long horizontal list of months: that design kept
 * mis-positioning itself on Android (opening on January 2020, drifting years
 * back after Today, sliding left and right on its own), and a single month
 * has nothing to scroll.
 */
export function MonthPager({
  year,
  month,
  onChangeMonth,
  lookups,
  onPressDay,
  onOpenCalendar,
}: {
  year: number;
  month: number;
  onChangeMonth: (year: number, month: number) => void;
  lookups: Lookups;
  onPressDay: (s: DayStatus) => void;
  onOpenCalendar: () => void;
}) {
  const { colors, fonts, isDark } = useTheme();
  const palette = usePhasePalette();
  const monthDate = useMemo(() => new Date(year, month, 1), [year, month]);
  const slots = useMemo(() => monthSlots(monthDate), [monthDate]);
  // Which way the last change went, so the new month slides in from that side.
  const direction = useRef<1 | -1>(1);

  const today = dateFromDayKey(lookups.todayKey);
  const isViewingCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  // Latest values for the pan handlers, which are created once.
  const latest = useRef({ year, month, onChangeMonth });
  latest.current = { year, month, onChangeMonth };
  const goTo = (target: Date) => {
    const { year: y, month: m, onChangeMonth: change } = latest.current;
    direction.current = target.getFullYear() * 12 + target.getMonth() >= y * 12 + m ? 1 : -1;
    haptics.select();
    change(target.getFullYear(), target.getMonth());
  };
  const shiftMonth = (delta: -1 | 1) => {
    const { year: y, month: m } = latest.current;
    goTo(new Date(y, m + delta, 1));
  };

  // The month follows the finger a little while dragging, then either
  // changes (far or fast enough) or springs back.
  const dragX = useSharedValue(0);
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }],
    opacity: 1 - Math.min(Math.abs(dragX.value) / 240, 0.35),
  }));
  const pan = useMemo(
    () =>
      PanResponder.create({
        // Only clearly horizontal drags: vertical ones still scroll the page,
        // and taps still reach the day cells. Capture, so a swipe that starts
        // on a date is taken from that date's tap handler.
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
          dragX.value = g.dx * 0.5;
        },
        onPanResponderRelease: (_, g) => {
          dragX.value = withSpring(0, motion.spring);
          if (g.dx <= -SWIPE_DISTANCE || g.vx <= -SWIPE_VELOCITY) shiftMonth(1);
          else if (g.dx >= SWIPE_DISTANCE || g.vx >= SWIPE_VELOCITY) shiftMonth(-1);
        },
        onPanResponderTerminate: () => {
          dragX.value = withSpring(0, motion.spring);
        },
      }),
    // Handlers read the latest month through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const entering = (direction.current > 0 ? FadeInRight : FadeInLeft).duration(motion.duration.base).easing(motion.easing.enter);
  const titleEntering = (direction.current > 0 ? FadeInRight : FadeInLeft).duration(motion.duration.slow).easing(motion.easing.enter);

  return (
    <View
      className="mx-6 mt-4"
      style={{ backgroundColor: colors.surface, borderRadius: 24, borderCurve: "continuous", paddingTop: 20, paddingBottom: 14, ...getShadow(colors, isDark) }}
    >
      <View className="flex-row items-center px-5" style={{ gap: 8 }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onOpenCalendar}
          accessibilityRole="button"
          accessibilityLabel={`${MONTH_NAMES[month]} ${year}. Open full calendar`}
          className="flex-row items-center flex-1"
          style={{ gap: 5, minWidth: 0 }}
        >
          <Animated.Text
            key={`${year}-${month}`}
            entering={titleEntering}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={{ flexShrink: 1, color: colors.foreground, fontSize: 17, lineHeight: 24, fontWeight: "700", fontFamily: fonts.heading }}
          >
            {MONTH_NAMES[month]}
            <Text style={{ color: colors.mutedText, fontWeight: "400", fontFamily: fonts.heading }}>{` ${year}`}</Text>
          </Animated.Text>
          <Icon set="mci" name="calendar-month-outline" size={16} color={colors.mutedText} />
        </TouchableOpacity>
        <CalendarKeyButton />

        {!isViewingCurrentMonth && (
          <Animated.View entering={ZoomIn.springify().damping(14)} exiting={ZoomOut.duration(motion.duration.fast)}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => goTo(new Date(today.getFullYear(), today.getMonth(), 1))}
            accessibilityRole="button"
            accessibilityLabel="Go to today"
            hitSlop={6}
            className="items-center justify-center rounded-full"
            style={{ width: 32, height: 32, backgroundColor: colors.primaryLight }}
          >
            <Icon set="mci" name="calendar-today" size={16} color={colors.primary} />
          </TouchableOpacity>
          </Animated.View>
        )}
        {([-1, 1] as const).map((delta) => (
          <TouchableOpacity
            key={delta}
            activeOpacity={0.7}
            onPress={() => shiftMonth(delta)}
            accessibilityRole="button"
            accessibilityLabel={delta < 0 ? "Previous month" : "Next month"}
            hitSlop={6}
            className="items-center justify-center rounded-full border"
            style={{ width: 32, height: 32, borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <Icon set="ion" name={delta < 0 ? "chevron-back" : "chevron-forward"} size={16} color={colors.foreground} />
          </TouchableOpacity>
        ))}
      </View>

      <View className="flex-row px-3 mt-4 mb-1">
        {WEEKDAY_LABELS.map((day, index) => (
          <Text
            key={`${day}-${index}`}
            className="text-center"
            style={{ width: `${100 / 7}%`, color: colors.mutedText, fontSize: 12.5, fontWeight: "700", fontFamily: fonts.body }}
          >
            {day}
          </Text>
        ))}
      </View>

      {/* One month; swipe or use the arrows to change it. */}
      <View {...pan.panHandlers} style={{ height: CAL_ROWS * TRACKER_CELL, overflow: "hidden" }}>
        <Animated.View style={dragStyle}>
          <Animated.View
            key={`${year}-${month}`}
            entering={entering}
            style={{ paddingHorizontal: 12, flexDirection: "row", flexWrap: "wrap" }}
          >
            <CalendarDayGrid dates={slots} lookups={lookups} palette={palette} height={TRACKER_CELL} onPressDay={onPressDay} stagger />
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
}
