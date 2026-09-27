import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { DayEntry as LocalDayEntry } from "./AppState";
import { useTheme, type ThemeColors } from "./theme";
import { getSoftTints } from "./ui-tokens";
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
  const { colors } = useTheme();
  return useMemo(() => {
    const soft = getSoftTints(colors);
    return {
      period: { color: colors.rose, bg: soft.rose, label: "Period" },
      follicular: { color: colors.accent, bg: soft.mint, label: "Follicular" },
      ovulation: { color: colors.secondary, bg: soft.lavender, label: "Ovulation" },
      luteal: { color: colors.warning, bg: soft.amber, label: "Luteal" },
    };
  }, [colors]);
}

/** Fertile-window wash: translucent secondary when it's hex, else the theme's soft lavender. */
export const fertileWash = (colors: ThemeColors) =>
  /^#[0-9a-f]{6}$/i.test(colors.secondary) ? `${colors.secondary}24` : getSoftTints(colors).lavender;

type Lookups = {
  model: CalendarModel;
  entryFor: (dateKey: string) => LocalDayEntry | undefined;
  noteFor: (dateKey: string) => string | undefined;
  todayKey: string;
};

/* ────────────────────────────── Month (full size) ────────────────────────────── */

/** One day circle, shared by the month grids and the Tracker's week strip. */
export function CalendarDayCell({ s, selected, palette, onPress }: { s: DayStatus; selected: boolean; palette: PhasePalette; onPress: (s: DayStatus) => void }) {
  const { colors, fonts } = useTheme();
  const style = palette[s.phase];
  const isPeriod = s.phase === "period";
  const background = selected ? colors.primary : s.isLogged ? style.bg : s.isFertile && !isPeriod ? fertileWash(colors) : "transparent";
  const ring = selected ? null : s.isToday ? colors.primary : s.isPredictedPeriod ? colors.rose : null;
  const textColor = selected ? colors.buttonText : s.isToday ? colors.primary : s.isLogged || isPeriod ? style.color : colors.foreground;
  const icon = s.hasFlow ? "water" : s.isOvulation ? "egg" : null;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(s)}
      accessibilityRole="button"
      accessibilityLabel={`${s.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}, ${style.label} phase${s.isToday ? ", today" : ""}${s.isLogged ? ", logged" : ""}${s.isPredictedPeriod ? ", predicted period" : ""}`}
      style={{ width: `${100 / 7}%`, height: DAY_CELL, alignItems: "center", justifyContent: "center" }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: background,
          borderWidth: ring ? 1.5 : 0,
          borderColor: ring ?? "transparent",
          borderStyle: s.isPredictedPeriod && !s.isToday ? "dashed" : "solid",
        }}
      >
        <Text style={{ color: textColor, fontSize: 14.5, fontWeight: s.isToday || selected || s.isLogged ? "800" : "500", fontFamily: fonts.body, marginTop: icon ? -4 : 0 }}>
          {s.day}
        </Text>
        {icon ? (
          <MaterialCommunityIcons name={icon} size={9} color={selected ? colors.buttonText : style.color} style={{ position: "absolute", bottom: 4 }} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

/** A full month: title + 6×7 grid (fixed MONTH_BLOCK_HEIGHT). */
export const MonthBlock = React.memo(function MonthBlock({
  monthDate,
  lookups,
  selectedKey,
  onPressDay,
}: {
  monthDate: Date;
  lookups: Lookups;
  selectedKey: string | null;
  onPressDay: (s: DayStatus) => void;
}) {
  const { colors, fonts } = useTheme();
  const palette = usePhasePalette();
  const slots = useMemo(() => monthSlots(monthDate), [monthDate]);
  const { model, entryFor, noteFor, todayKey } = lookups;
  return (
    <View style={{ height: MONTH_BLOCK_HEIGHT, paddingHorizontal: 12 }}>
      <View style={{ height: MONTH_TITLE_HEIGHT, justifyContent: "flex-end", paddingHorizontal: 8, paddingBottom: 8 }}>
        <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800", fontFamily: fonts.heading }}>
          {MONTH_NAMES[monthDate.getMonth()]}
          <Text style={{ color: colors.mutedText, fontWeight: "600" }}>{` ${monthDate.getFullYear()}`}</Text>
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {slots.map((date, i) =>
          date ? (
            <CalendarDayCell
              key={i}
              s={dayStatus(date, model, entryFor, noteFor, todayKey)}
              selected={selectedKey === getDateKey(date)}
              palette={palette}
              onPress={onPressDay}
            />
          ) : (
            <View key={i} style={{ width: `${100 / 7}%`, height: DAY_CELL }} />
          ),
        )}
      </View>
    </View>
  );
});

export function WeekdayHeader() {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 12 }}>
      {WEEKDAY_LABELS.map((d, i) => (
        <Text key={i} style={{ width: `${100 / 7}%`, textAlign: "center", color: colors.mutedText, fontSize: 12, fontWeight: "700", fontFamily: fonts.body }}>
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

/** A small month for the year view: period days filled, predicted dashed, fertile tinted. */
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
  const isThisMonth = (() => {
    const now = new Date();
    return now.getFullYear() === monthDate.getFullYear() && now.getMonth() === monthDate.getMonth();
  })();
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
          const loggedPeriod = s.phase === "period" && s.isLogged;
          const bg = loggedPeriod ? palette.period.color : s.isFertile && s.phase !== "period" ? fertileWash(colors) : "transparent";
          const ring = s.isToday ? colors.primary : s.isPredictedPeriod ? colors.rose : null;
          return (
            <View key={i} style={{ width: `${100 / 7}%`, height: MINI_CELL, alignItems: "center", justifyContent: "center" }}>
              <View
                style={{
                  width: dot,
                  height: dot,
                  borderRadius: dot / 2,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: bg,
                  borderWidth: ring ? 1 : 0,
                  borderColor: ring ?? "transparent",
                  borderStyle: s.isPredictedPeriod && !s.isToday ? "dashed" : "solid",
                }}
              >
                <Text style={{ fontSize: 7.5, fontWeight: loggedPeriod || s.isToday ? "800" : "500", color: loggedPeriod ? colors.buttonText : s.phase === "period" ? palette.period.color : colors.mutedText, fontFamily: fonts.body }}>
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
