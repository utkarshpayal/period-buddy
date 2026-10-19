import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { DayEntry as LocalDayEntry } from "./AppState";
import { useTheme } from "./theme";
import { getSoftTints } from "./ui-tokens";
import type { CyclePhase } from "../lib/cycle";
import { MONTH_NAMES, WEEKDAY_LABELS, dayStatus, monthSlots, type CalendarModel, type DayStatus } from "../lib/cycleCalendar";
import { getDateKey } from "../lib/format";
import { Icon } from "./Icon";

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

export type Lookups = {
  model: CalendarModel;
  entryFor: (dateKey: string) => LocalDayEntry | undefined;
  noteFor: (dateKey: string) => string | undefined;
  todayKey: string;
};

/* ────────────────────────────── Month (full size) ────────────────────────────── */

/**
 * One day circle — the single day design for every calendar (Tracker pager,
 * Calendar screen month view). One visual signal per meaning:
 *   today → foreground ring over its state fill · logged period → solid
 *   period colour · predicted period → dashed ring · past period (not logged)
 *   → soft period tint · fertile → soft lavender · ovulation → lavender ring
 *   + egg · selected (not today) → primary ring · has a log → dot under the
 *   number (logged period days too).
 */
export function CalendarDayCell({
  s,
  selected,
  palette,
  onPress,
  height = DAY_CELL,
}: {
  s: DayStatus;
  selected: boolean;
  palette: PhasePalette;
  onPress: (s: DayStatus) => void;
  height?: number;
}) {
  const { colors, fonts } = useTheme();
  const isPeriod = s.phase === "period";
  const loggedPeriod = isPeriod && (s.hasFlow || s.isLogged);
  const pastPeriod = isPeriod && !loggedPeriod && !s.isPredictedPeriod;
  const size = Math.min(40, height - 6);

  const filled = loggedPeriod;
  const fertile = s.isFertile && !isPeriod;
  const background = loggedPeriod
    ? palette.period.color
    : pastPeriod
      ? palette.period.bg
      : fertile || s.isOvulation
        ? colors.secondaryLight
        : "transparent";
  // Today keeps its state fill and gets a foreground ring, which reads
  // against every fill in both themes (no pink-on-pink with period days).
  const ring = s.isToday
    ? { color: colors.foreground, width: 2, style: "solid" as const }
    : filled
      ? null
      : selected
        ? { color: colors.primary, width: 2, style: "solid" as const }
        : s.isPredictedPeriod
          ? { color: palette.period.color, width: 1.5, style: "dashed" as const }
          : s.isOvulation
            ? { color: colors.secondary, width: 1.5, style: "solid" as const }
            : null;
  const textColor = filled
    ? colors.buttonText
    : isPeriod
      ? colors.primaryDark
      : fertile || s.isOvulation
        ? colors.info
        : colors.foreground;
  const showLogDot = s.isLogged;
  // Future days can't be logged, so they don't open the log modal. Same
  // `todayKey` as `isToday`, so the two can't disagree around midnight.
  const isFuture = s.isFuture;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(s)}
      disabled={isFuture}
      accessibilityRole="button"
      accessibilityState={{ disabled: isFuture }}
      accessibilityLabel={`${s.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}, ${palette[s.phase].label} phase${s.isToday ? ", today" : ""}${s.isLogged ? ", logged" : ""}${s.isPredictedPeriod ? ", predicted period" : ""}${s.isOvulation ? ", ovulation" : ""}`}
      style={{ width: `${100 / 7}%`, height, alignItems: "center", justifyContent: "center", opacity: isFuture ? 0.7 : 1 }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: background,
          borderWidth: ring?.width ?? 0,
          borderColor: ring?.color ?? "transparent",
          borderStyle: ring?.style ?? "solid",
        }}
      >
        <Text
          style={{
            color: textColor,
            fontSize: 14,
            fontWeight: filled || s.isToday || s.isLogged || s.isOvulation ? "700" : "500",
            fontFamily: fonts.body,
          }}
        >
          {s.day}
        </Text>
        {s.isOvulation && !filled ? (
          <Icon set="mci"
            name="egg"
            size={9}
            color={palette.ovulation.color}
            style={{ position: "absolute", top: 1, right: 1 }}
          />
        ) : null}
      </View>
      {showLogDot ? (
        <View
          style={{
            position: "absolute",
            bottom: 1,
            width: 5,
            height: 5,
            borderRadius: 3,
            backgroundColor: colors.primary,
          }}
        />
      ) : null}
    </TouchableOpacity>
  );
}

/**
 * Key for the day cells: each signal as a small swatch with its label, in a
 * row that wraps on narrow screens or large text.
 */
export function CalendarLegend() {
  const { colors, fonts } = useTheme();
  const palette = usePhasePalette();
  const swatch = { width: 10, height: 10, borderRadius: 5 } as const;
  const item = (label: string, mark: React.ReactNode) => (
    <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {mark}
      <Text maxFontSizeMultiplier={1.3} style={{ color: colors.mutedText, fontSize: 12, lineHeight: 16, fontFamily: fonts.body }}>
        {label}
      </Text>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8, columnGap: 14 }}>
      {item("Today", <View style={{ ...swatch, borderWidth: 2, borderColor: colors.foreground }} />)}
      {item("Period", <View style={{ ...swatch, backgroundColor: palette.period.color }} />)}
      {item("Predicted", <View style={{ ...swatch, borderWidth: 1.5, borderStyle: "dashed", borderColor: palette.period.color }} />)}
      {item("Fertile", <View style={{ ...swatch, backgroundColor: colors.secondaryLight, borderWidth: 1, borderColor: colors.secondary }} />)}
      {item("Ovulation", <Icon set="mci" name="egg" size={12} color={palette.ovulation.color} />)}
      {item("Logged", <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary }} />)}
    </View>
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
          // Same rules as CalendarDayCell, scaled down.
          const isPeriod = s.phase === "period";
          const loggedPeriod = isPeriod && (s.hasFlow || s.isLogged);
          const pastPeriod = isPeriod && !loggedPeriod && !s.isPredictedPeriod;
          const bg = loggedPeriod
            ? palette.period.color
            : pastPeriod
              ? palette.period.bg
              : (s.isFertile && !isPeriod) || s.isOvulation
                ? colors.secondaryLight
                : "transparent";
          const ring = s.isToday ? colors.foreground : s.isPredictedPeriod ? palette.period.color : null;
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
                  borderWidth: ring ? (s.isToday ? 1.5 : 1) : 0,
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
