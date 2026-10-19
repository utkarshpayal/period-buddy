import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { CalendarDayCell, usePhasePalette, type Lookups } from "../CycleCalendar";
import { SkeletonBlock } from "../Skeleton";
import { useTheme } from "../theme";
import { WEEKDAY_LABELS, dayStatus, weekDates, type DayStatus } from "../../lib/cycleCalendar";
import { dateFromDayKey, getDateKey } from "../../lib/format";
import { TRACKER_CELL } from "./MonthPager";

/**
 * This week (Monday first) under the Tracker's header, drawn with the same
 * day cells as the calendar. Follows `lookups.todayKey`, so it moves on at
 * midnight while the tab stays mounted.
 */
export function WeekStrip({
  lookups,
  selectedKey,
  onPressDay,
  loading,
}: {
  lookups: Lookups;
  selectedKey: string | null;
  onPressDay: (s: DayStatus) => void;
  loading: boolean;
}) {
  const { colors, fonts } = useTheme();
  const palette = usePhasePalette();
  const dates = useMemo(() => weekDates(dateFromDayKey(lookups.todayKey)), [lookups.todayKey]);
  const { model, entryFor, noteFor, todayKey } = lookups;

  return (
    <>
      <View className="flex-row mt-3" style={{ paddingHorizontal: 12 }}>
        {WEEKDAY_LABELS.map((label, index) => (
          <Text
            key={`wk-label-${index}`}
            style={{ width: `${100 / 7}%`, textAlign: "center", color: colors.mutedText, fontSize: 12.5, fontWeight: "700", fontFamily: fonts.body }}
          >
            {label}
          </Text>
        ))}
      </View>
      <View className="flex-row pb-2" style={{ paddingHorizontal: 12 }}>
        {dates.map((date) => {
          const key = getDateKey(date);
          return loading ? (
            <View key={key} style={{ width: `${100 / 7}%`, height: TRACKER_CELL, alignItems: "center", justifyContent: "center" }}>
              <SkeletonBlock width={38} height={38} radius={19} />
            </View>
          ) : (
            <CalendarDayCell
              key={key}
              s={dayStatus(date, model, entryFor, noteFor, todayKey)}
              selected={selectedKey === key}
              palette={palette}
              height={TRACKER_CELL}
              onPress={onPressDay}
            />
          );
        })}
      </View>
    </>
  );
}
