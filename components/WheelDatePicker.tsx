import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Text,
  View,
} from "react-native";
import { useTheme } from "./theme";

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const EDGE_HEIGHT = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2;

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type WheelDatePickerProps = {
  \\\?: string;
  /** Value the wheel starts on when `dateKey` isn't set yet. Defaults to today (clamped to range). */
  defaultDate?: Date;
  maximumDate: Date;
  minimumDate: Date;
  onChange: (dateKey: string) => void;
};

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function clampDateToRange(date: Date, min: Date, max: Date) {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type WheelColumnProps = {
  data: number[];
  onSelect: (index: number) => void;
  renderLabel: (value: number) => string;
  selectedIndex: number;
  width: `${number}%`;
};

function WheelColumn({ data, onSelect, renderLabel, selectedIndex, width }: WheelColumnProps) {
  const { colors, fonts } = useTheme();
  const listRef = useRef<FlatList<number>>(null);
  const skipNextRecenter = useRef(true);

  useEffect(() => {
    if (skipNextRecenter.current) {
      skipNextRecenter.current = false;
      return;
    }
    listRef.current?.scrollToOffset({ animated: true, offset: selectedIndex * ITEM_HEIGHT });
  }, [selectedIndex]);

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    onSelect(Math.max(0, Math.min(data.length - 1, index)));
  }

  return (
    <View style={{ height: WHEEL_HEIGHT, width }}>
      <FlatList
        ref={listRef}
        data={data}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ index, length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index })}
        initialScrollIndex={selectedIndex}
        keyExtractor={(item) => String(item)}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        contentContainerStyle={{ paddingVertical: EDGE_HEIGHT }}
        renderItem={({ index, item }) => {
          const isSelected = index === selectedIndex;
          return (
            <View style={{ alignItems: "center", height: ITEM_HEIGHT, justifyContent: "center" }}>
              <Text
                style={{
                  color: isSelected ? colors.foreground : colors.mutedText,
                  fontFamily: isSelected ? fonts.monoSemiBold : fonts.mono,
                  fontSize: isSelected ? 18 : 15,
                  opacity: isSelected ? 1 : 0.5,
                }}
              >
                {renderLabel(item)}
              </Text>
            </View>
          );
        }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
      />
    </View>
  );
}

/**
 * Full-width, three-column (day/month/year) scroll wheel — the inline
 * onboarding date picker pattern popularized by Flo, used in place of a
 * tap-to-open month-grid modal so date entry never leaves the step.
 */
export function WheelDatePicker({ dateKey, defaultDate, maximumDate, minimumDate, onChange }: WheelDatePickerProps) {
  const { colors } = useTheme();
  const initial = dateKey
    ? new Date(`${dateKey}T00:00:00`)
    : clampDateToRange(defaultDate ?? new Date(), minimumDate, maximumDate);

  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());
  const [day, setDay] = useState(initial.getDate());

  // A wheel always shows *some* value — unlike a tap-to-open modal, there's
  // no "unselected" state — so sync the parent's value once on mount instead
  // of waiting for the user to scroll away from the default.
  useEffect(() => {
    if (!dateKey) onChange(toDateKey(initial.getFullYear(), initial.getMonth(), initial.getDate()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const minYear = minimumDate.getFullYear();
  const maxYear = maximumDate.getFullYear();
  const years = useMemo(
    () => Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index),
    [maxYear, minYear],
  );
  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => index), []);
  const days = useMemo(
    () => Array.from({ length: daysInMonth(year, month) }, (_, index) => index + 1),
    [month, year],
  );

  function commit(nextYear: number, nextMonth: number, nextDay: number) {
    const clampedDay = Math.min(nextDay, daysInMonth(nextYear, nextMonth));
    const clamped = clampDateToRange(new Date(nextYear, nextMonth, clampedDay), minimumDate, maximumDate);
    setYear(clamped.getFullYear());
    setMonth(clamped.getMonth());
    setDay(clamped.getDate());
    onChange(toDateKey(clamped.getFullYear(), clamped.getMonth(), clamped.getDate()));
  }

  return (
    <View style={{ height: WHEEL_HEIGHT, width: "100%" }}>
      <View
        pointerEvents="none"
        style={{
          backgroundColor: colors.primaryLight,
          borderColor: colors.border,
          borderRadius: 14,
          borderWidth: 1,
          height: ITEM_HEIGHT,
          left: 0,
          position: "absolute",
          right: 0,
          top: EDGE_HEIGHT,
        }}
      />

      <View style={{ flexDirection: "row", width: "100%" }}>
        <WheelColumn
          data={days}
          onSelect={(index) => commit(year, month, days[index])}
          renderLabel={(value) => String(value)}
          selectedIndex={day - 1}
          width="22%"
        />
        <WheelColumn
          data={months}
          onSelect={(index) => commit(year, months[index], day)}
          renderLabel={(value) => MONTH_LABELS[value]}
          selectedIndex={month}
          width="48%"
        />
        <WheelColumn
          data={years}
          onSelect={(index) => commit(years[index], month, day)}
          renderLabel={(value) => String(value)}
          selectedIndex={years.indexOf(year)}
          width="30%"
        />
      </View>

      <LinearGradient
        colors={[colors.surface, `${colors.surface}00`] as [string, string]}
        pointerEvents="none"
        style={{ height: EDGE_HEIGHT, left: 0, position: "absolute", right: 0, top: 0 }}
      />
      <LinearGradient
        colors={[`${colors.surface}00`, colors.surface] as [string, string]}
        pointerEvents="none"
        style={{ bottom: 0, height: EDGE_HEIGHT, left: 0, position: "absolute", right: 0 }}
      />
    </View>
  );
}
