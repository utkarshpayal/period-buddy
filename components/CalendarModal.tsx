import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, PanResponder, Pressable, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInLeft, FadeInRight, ZoomIn } from "react-native-reanimated";
import { useTheme } from "./theme";
import { AppLockCover } from "./AppLockScreen";
import { Icon } from "./Icon";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CELL_WIDTH = `${100 / 7}%` as const;

export type CalendarModalProps = {
  initialDateKey?: string;
  maximumDate?: Date;
  minimumDate?: Date;
  onClose: () => void;
  onSelect: (dateKey: string) => void;
  visible: boolean;
  /** Small caption above the selected date, e.g. "Start date". */
  title?: string;
  /** Tints the days between these keys (inclusive), for range pickers. */
  rangeStart?: string;
  rangeEnd?: string;
  /** Which end of the range this picker sets; the band previews the pending pick. */
  rangeEdge?: "start" | "end";
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromKey(key: string) {
  return new Date(`${key}T00:00:00`);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function monthIndex(year: number, month: number) {
  return year * 12 + month;
}

function formatHeaderDate(key: string) {
  const d = fromKey(key);
  return `${WEEKDAY_SHORT[d.getDay()]}, ${d.getDate()} ${MONTH_LABELS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

/**
 * Centred date picker: header with the picked date, month/year jump grid
 * (tap the month title), a day grid that slides between months (chevrons or
 * swipe), a Today shortcut, and Cancel / Done. Nothing is sent until Done.
 */
export function CalendarModal({
  initialDateKey,
  maximumDate,
  minimumDate,
  onClose,
  onSelect,
  visible,
  title = "Select date",
  rangeStart,
  rangeEnd,
  rangeEdge,
}: CalendarModalProps) {
  const { colors, fonts } = useTheme();
  const min = minimumDate ? startOfDay(minimumDate) : undefined;
  const max = maximumDate ? startOfDay(maximumDate) : undefined;
  const todayKey = toDateKey(new Date());

  const baseDate = () => (initialDateKey ? fromKey(initialDateKey) : max ?? new Date());
  const [pending, setPending] = useState<string | null>(initialDateKey ?? null);
  const [viewedYear, setViewedYear] = useState(baseDate().getFullYear());
  const [viewedMonth, setViewedMonth] = useState(baseDate().getMonth());
  const [mode, setMode] = useState<"days" | "months">("days");
  const [direction, setDirection] = useState<1 | -1>(1);

  useEffect(() => {
    if (!visible) return;
    const base = baseDate();
    setPending(initialDateKey ?? null);
    setViewedYear(base.getFullYear());
    setViewedMonth(base.getMonth());
    setMode("days");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const current = monthIndex(viewedYear, viewedMonth);
  const minMonth = min ? monthIndex(min.getFullYear(), min.getMonth()) : -Infinity;
  const maxMonth = max ? monthIndex(max.getFullYear(), max.getMonth()) : Infinity;
  const canPrev = current > minMonth;
  const canNext = current < maxMonth;

  function goToMonth(target: number) {
    const clamped = Math.min(Math.max(target, minMonth), maxMonth);
    if (clamped === current) return;
    setDirection(clamped > current ? 1 : -1);
    setViewedYear(Math.floor(clamped / 12));
    setViewedMonth(clamped % 12);
  }

  // Horizontal swipe on the grid changes month. Refs keep the handler current.
  const swipe = useRef({ prev: () => {}, next: () => {} });
  swipe.current = { prev: () => goToMonth(current - 1), next: () => goToMonth(current + 1) };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -40) swipe.current.next();
          else if (g.dx > 40) swipe.current.prev();
        },
      }),
    []
  );

  const isDisabled = (d: Date) => Boolean((min && d < min) || (max && d > max));
  const todayAllowed = !isDisabled(startOfDay(new Date()));

  function pickToday() {
    setPending(todayKey);
    const now = new Date();
    goToMonth(monthIndex(now.getFullYear(), now.getMonth()));
    setMode("days");
  }

  // Always six rows so the card never changes height between months.
  const firstWeekday = new Date(viewedYear, viewedMonth, 1).getDay();
  const daysInMonth = new Date(viewedYear, viewedMonth + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: 42 }, (_, i) => {
    const day = i - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

  // While picking one end of a range, preview the band with the pending date.
  const bandStart = (rangeEdge === "start" ? pending : null) ?? rangeStart ?? null;
  const bandEnd = (rangeEdge === "end" ? pending : null) ?? rangeEnd ?? null;

  const navButton = (icon: "chevron-back" | "chevron-forward", enabled: boolean, onPress: () => void, label: string) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      hitSlop={6}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surfaceSoft,
        opacity: enabled ? 1 : 0.35,
      }}
    >
      <Icon set="ion" name={icon} size={18} color={colors.foreground} />
    </TouchableOpacity>
  );

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 }}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close calendar"
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.overlay }}
        />
        <Animated.View
          entering={ZoomIn.springify().damping(18).stiffness(220).mass(0.7)}
          accessibilityViewIsModal
          style={{
            width: "100%",
            maxWidth: 380,
            borderRadius: 28,
            overflow: "hidden",
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 12,
          }}
        >
          {/* Header: caption + picked date */}
          <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, backgroundColor: colors.primaryLight }}>
            <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: colors.mutedText, fontFamily: fonts.body }}>
              {title}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
              <Animated.Text
                key={pending ?? "none"}
                entering={FadeIn.duration(180)}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={{ flexShrink: 1, fontSize: 22, fontWeight: "800", color: pending ? colors.foreground : colors.mutedText, fontFamily: fonts.heading }}
              >
                {pending ? formatHeaderDate(pending) : "No date picked"}
              </Animated.Text>
              {todayAllowed && pending !== todayKey ? (
                <TouchableOpacity
                  onPress={pickToday}
                  accessibilityRole="button"
                  accessibilityLabel="Pick today"
                  hitSlop={9}
                  style={{ marginLeft: 12, paddingHorizontal: 12, height: 30, borderRadius: 15, justifyContent: "center", backgroundColor: colors.surface }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primaryDark, fontFamily: fonts.body }}>Today</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            {/* Month title (tap to jump) + chevrons */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <TouchableOpacity
                onPress={() => setMode(mode === "days" ? "months" : "days")}
                accessibilityRole="button"
                accessibilityLabel={mode === "days" ? "Choose month and year" : "Back to days"}
                hitSlop={6}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 6 }}
              >
                <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                  {mode === "days" ? `${MONTH_LABELS[viewedMonth]} ${viewedYear}` : String(viewedYear)}
                </Text>
                <Icon set="ion" name={mode === "days" ? "chevron-down" : "chevron-up"} size={16} color={colors.mutedText} />
              </TouchableOpacity>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {mode === "days" ? (
                  <>
                    {navButton("chevron-back", canPrev, () => goToMonth(current - 1), "Previous month")}
                    {navButton("chevron-forward", canNext, () => goToMonth(current + 1), "Next month")}
                  </>
                ) : (
                  <>
                    {navButton("chevron-back", viewedYear * 12 + 11 > minMonth, () => setViewedYear((y) => y - 1), "Previous year")}
                    {navButton("chevron-forward", viewedYear * 12 < maxMonth, () => setViewedYear((y) => y + 1), "Next year")}
                  </>
                )}
              </View>
            </View>

            {mode === "months" ? (
              <Animated.View key={`months-${viewedYear}`} entering={FadeIn.duration(180)} style={{ flexDirection: "row", flexWrap: "wrap", paddingBottom: 6 }}>
                {MONTH_LABELS.map((label, m) => {
                  const idx = monthIndex(viewedYear, m);
                  const off = idx < minMonth || idx > maxMonth;
                  const on = m === viewedMonth;
                  return (
                    <View key={label} style={{ width: "33.333%", padding: 5 }}>
                      <TouchableOpacity
                        disabled={off}
                        onPress={() => {
                          goToMonth(idx);
                          setMode("days");
                        }}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={`${label} ${viewedYear}`}
                        accessibilityState={{ disabled: off, selected: on }}
                        style={{
                          height: 48,
                          borderRadius: 14,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: on ? colors.primary : colors.surfaceSoft,
                          opacity: off ? 0.35 : 1,
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "700", color: on ? colors.buttonText : colors.foreground, fontFamily: fonts.body }}>
                          {label.slice(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </Animated.View>
            ) : (
              <View {...pan.panHandlers}>
                {/* Weekday header */}
                <View style={{ flexDirection: "row", marginBottom: 4 }}>
                  {WEEKDAY_LABELS.map((label, index) => (
                    <View key={index} style={{ width: CELL_WIDTH, alignItems: "center" }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body }}>{label}</Text>
                    </View>
                  ))}
                </View>

                {/* Day grid */}
                <View style={{ overflow: "hidden" }}>
                  <Animated.View
                    key={`${viewedYear}-${viewedMonth}`}
                    entering={(direction === 1 ? FadeInRight : FadeInLeft).duration(220)}
                    style={{ flexDirection: "row", flexWrap: "wrap" }}
                  >
                    {cells.map((day, index) => {
                      if (day === null) return <View key={`blank-${index}`} style={{ width: CELL_WIDTH, aspectRatio: 1 }} />;

                      const cellDate = new Date(viewedYear, viewedMonth, day);
                      const key = toDateKey(cellDate);
                      const disabled = isDisabled(cellDate);
                      const selected = key === pending;
                      const isToday = key === todayKey;
                      const inBand = bandStart && bandEnd ? key >= bandStart && key <= bandEnd && bandStart !== bandEnd : false;
                      const bandLeft = inBand && key !== bandStart;
                      const bandRight = inBand && key !== bandEnd;

                      return (
                        <TouchableOpacity
                          key={key}
                          activeOpacity={0.7}
                          disabled={disabled}
                          onPress={() => setPending(key)}
                          accessibilityRole="button"
                          accessibilityLabel={`${WEEKDAY_SHORT[cellDate.getDay()]} ${day} ${MONTH_LABELS[viewedMonth]} ${viewedYear}`}
                          accessibilityState={{ disabled, selected }}
                          style={{ width: CELL_WIDTH, aspectRatio: 1, alignItems: "center", justifyContent: "center" }}
                        >
                          {inBand ? (
                            <View
                              style={{
                                position: "absolute",
                                top: "12%",
                                bottom: "12%",
                                left: bandLeft ? 0 : "50%",
                                right: bandRight ? 0 : "50%",
                                backgroundColor: colors.primaryLight,
                              }}
                            />
                          ) : null}
                          <View
                            style={{
                              width: "76%",
                              aspectRatio: 1,
                              borderRadius: 999,
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: selected ? colors.primary : "transparent",
                              borderWidth: isToday && !selected ? 1.5 : 0,
                              borderColor: colors.primary,
                            }}
                          >
                            <Text
                              maxFontSizeMultiplier={1.2}
                              style={{
                                fontSize: 15,
                                fontWeight: selected || isToday ? "800" : "500",
                                fontFamily: fonts.body,
                                color: disabled ? colors.border : selected ? colors.buttonText : isToday ? colors.primaryDark : colors.foreground,
                              }}
                            >
                              {day}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </Animated.View>
                </View>
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={{ flexDirection: "row", gap: 10, padding: 16, paddingTop: 12 }}>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={{ flex: 1, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSoft }}
            >
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => pending && onSelect(pending)}
              disabled={!pending}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Done"
              accessibilityState={{ disabled: !pending }}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pending ? colors.primary : colors.border,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "800", color: pending ? colors.buttonText : colors.mutedText, fontFamily: fonts.body }}>Done</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
      <AppLockCover />
    </Modal>
  );
}
