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

/**
 * One day circle — the single day design for every calendar (Tracker pager,
 * Calendar screen month view). One visual signal per meaning:
 *   logged period → solid period colour · predicted period → dashed ring ·
 *   past period (not logged) → soft period tint · fertile → soft lavender ·
 *   ovulation → egg · today → primary ring · has a log → dot under the number.
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

  const background = selected
    ? colors.primary
    : loggedPeriod
      ? palette.period.color
      : pastPeriod
        ? palette.period.bg
        : s.isFertile && !isPeriod
          ? fertileWash(colors)
          : "transparent";
  const filled = selected || loggedPeriod;
  const ring = s.isToday && !selected ? colors.primary : s.isPredictedPeriod && !selected ? palette.period.color : null;
  const textColor = filled
    ? colors.buttonText
    : s.isToday
      ? colors.primary
      : isPeriod
        ? palette.period.color
        : colors.foreground;
  const showLogDot = s.isLogged && !loggedPeriod;
  // Future days can't be logged, so they don't open the log modal.
  const isFuture = s.dateKey > getDateKey(new Date());

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(s)}
      disabled={isFuture}
      accessibilityRole="button"
      accessibilityState={{ disabled: isFuture }}
      accessibilityLabel={`${s.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}, ${palette[s.phase].label} phase${s.isToday ? ", today" : ""}${s.isLogged ? ", logged" : ""}${s.isPredictedPeriod ? ", predicted period" : ""}${s.isOvulation ? ", ovulation" : ""}`}
      style={{ width: `${100 / 7}%`, height, alignItems: "center", justifyContent: "center", opacity: isFuture ? 0.55 : 1 }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: background,
          borderWidth: ring ? (s.isToday ? 2 : 1.5) : 0,
          borderColor: ring ?? "transparent",
          borderStyle: s.isPredictedPeriod && !s.isToday ? "dashed" : "solid",
        }}
      >
        <Text
          style={{
            color: textColor,
            fontSize: 14.5,
            fontWeight: s.isToday || filled || isPeriod || s.isLogged ? "800" : "500",
            fontFamily: fonts.body,
          }}
        >
          {s.day}
        </Text>
        {s.isOvulation && !filled ? (
          <MaterialCommunityIcons
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
            backgroundColor: selected ? colors.primary : colors.primaryDark,
          }}
        />
      ) : null}
    </TouchableOpacity>
  );
}

/** Legend for CalendarDayCell's signals; the same on every calendar. */
/**
 * Key for the day cells: five equal columns, each a miniature of the real day
 * treatment with its label underneath. Fixed columns (not a wrapping row) so
 * it's always one tidy band, whatever the screen width or font scale.
 */
export function CalendarLegend() {
  const { colors, fonts } = useTheme();
  const palette = usePhasePalette();
  const chip = { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" } as const;
  const item = (label: string, swatch: React.ReactNode) => (
    <View key={label} style={{ flex: 1, alignItems: "center", gap: 5 }}>
      {swatch}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={{ color: colors.mutedText, fontSize: 12, fontWeight: "600", fontFamily: fonts.body }}
      >
        {label}
      </Text>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
      {item("Period", <View style={{ ...chip, backgroundColor: palette.period.color }} />)}
      {item("Predicted", <View style={{ ...chip, borderWidth: 1.5, borderStyle: "dashed", borderColor: palette.period.color }} />)}
      {item("Fertile", <View style={{ ...chip, backgroundColor: fertileWash(colors) }} />)}
      {item(
        "Ovulation",
        <View style={chip}>
          <MaterialCommunityIcons name="egg" size={14} color={palette.ovulation.color} />
        </View>,
      )}
      {item(
        "Logged",
        <View style={{ ...chip, justifyContent: "flex-end", paddingBottom: 1 }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primaryDark }} />
        </View>,
      )}
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
