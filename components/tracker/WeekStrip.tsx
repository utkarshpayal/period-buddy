import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { CalendarDayGrid, usePhasePalette, type Lookups } from "../CycleCalendar";
import { SkeletonBlock } from "../Skeleton";
import { useTheme } from "../theme";
import { WEEKDAY_LABELS, weekDates, type DayStatus } from "../../lib/cycleCalendar";
import { dateFromDayKey, getDateKey } from "../../lib/format";
import { TRACKER_CELL } from "./MonthPager";

/**
 * This week (Monday first) under the Tracker's header, drawn with the same
 * day cells as the calendar. Follows `lookups.todayKey`, so it moves on at
 * midnight while the tab stays mounted.
 */
export function WeekStrip({
  lookups,
  onPressDay,
  loading,
}: {
  lookups: Lookups;
  onPressDay: (s: DayStatus) => void;
  loading: boolean;
}) {
  const { colors, fonts } = useTheme();
  const palette = usePhasePalette();
  const dates = useMemo(() => weekDates(dateFromDayKey(lookups.todayKey)), [lookups.todayKey]);

  return (
    <>
      <View className="flex-row mt-3" style={{ paddingHorizontal: 12 }}>
        {WEEKDAY_LABELS.map((label, index) => (
          <Text
            key={`wk-label-${index}`}
            style={{ width: `${100 / 7}%`, textAlign: "center", color: colors.mutedText, fontSize: 13.5, fontWeight: "700", fontFamily: fonts.body }}
          >
            {label}
          </Text>
        ))}
      </View>
      <View className="flex-row pb-2" style={{ paddingHorizontal: 12 }}>
        {loading
          ? dates.map((date) => (
              <View key={getDateKey(date)} style={{ width: `${100 / 7}%`, height: TRACKER_CELL, alignItems: "center", justifyContent: "center" }}>
                <SkeletonBlock width={38} height={38} radius={19} />
              </View>
            ))
          : <CalendarDayGrid dates={dates} lookups={lookups} palette={palette} height={TRACKER_CELL} onPressDay={onPressDay} />}
      </View>
    </>
  );
}
