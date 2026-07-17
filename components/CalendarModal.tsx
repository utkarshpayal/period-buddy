import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "./theme";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type CalendarModalProps = {
  initialDateKey?: string;
  maximumDate?: Date;
  minimumDate?: Date;
  onClose: () => void;
  onSelect: (dateKey: string) => void;
  visible: boolean;
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function CalendarModal({
  initialDateKey,
  maximumDate,
  minimumDate,
  onClose,
  onSelect,
  visible,
}: CalendarModalProps) {
  const { colors, fonts } = useTheme();
  const initialDate = initialDateKey ? new Date(`${initialDateKey}T00:00:00`) : (maximumDate ?? new Date());
  const [viewedYear, setViewedYear] = useState(initialDate.getFullYear());
  const [viewedMonth, setViewedMonth] = useState(initialDate.getMonth());

  useEffect(() => {
    if (!visible) return;
    const base = initialDateKey ? new Date(`${initialDateKey}T00:00:00`) : (maximumDate ?? new Date());
    setViewedYear(base.getFullYear());
    setViewedMonth(base.getMonth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const min = minimumDate ? startOfDay(minimumDate) : undefined;
  const max = maximumDate ? startOfDay(maximumDate) : undefined;

  function changeMonth(delta: number) {
    let nextMonth = viewedMonth + delta;
    let nextYear = viewedYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setViewedMonth(nextMonth);
    setViewedYear(nextYear);
  }

  function changeYear(delta: number) {
    setViewedYear((year) => year + delta);
  }

  const firstOfMonth = new Date(viewedYear, viewedMonth, 1);
  const daysInMonth = new Date(viewedYear, viewedMonth + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();
  const today = startOfDay(new Date());
  const selectedDate = initialDateKey ? startOfDay(new Date(`${initialDateKey}T00:00:00`)) : null;

  const cells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: colors.overlay }}
      >
        <View
          className="w-full rounded-[28px] border p-5"
          style={{ backgroundColor: colors.surface, borderColor: colors.border, maxWidth: 380 }}
        >
          {/* Year navigation */}
          <View className="flex-row items-center justify-between mb-1">
            <TouchableOpacity onPress={() => changeYear(-1)} className="p-2" hitSlop={6}>
              <Ionicons name="play-back" size={14} color={colors.mutedText} />
            </TouchableOpacity>
            <Text
              className="text-sm font-black"
              style={{ color: colors.mutedText, fontFamily: fonts.mono }}
            >
              {viewedYear}
            </Text>
            <TouchableOpacity onPress={() => changeYear(1)} className="p-2" hitSlop={6}>
              <Ionicons name="play-forward" size={14} color={colors.mutedText} />
            </TouchableOpacity>
          </View>

          {/* Month navigation */}
          <View className="flex-row items-center justify-between mb-4">
            <TouchableOpacity onPress={() => changeMonth(-1)} className="p-2" hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text
              className="text-lg font-black"
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              {MONTH_LABELS[viewedMonth]}
            </Text>
            <TouchableOpacity onPress={() => changeMonth(1)} className="p-2" hitSlop={8}>
              <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Weekday header */}
          <View className="flex-row justify-between mb-2">
            {WEEKDAY_LABELS.map((label, index) => (
              <View key={index} style={{ width: 40 }} className="items-center">
                <Text
                  className="text-[11px] font-black uppercase"
                  style={{ color: colors.mutedText }}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>

          {/* Day grid */}
          <View className="flex-row flex-wrap">
            {cells.map((day, index) => {
              if (day === null) {
                return <View key={`blank-${index}`} style={{ width: 40, height: 40 }} />;
              }

              const cellDate = new Date(viewedYear, viewedMonth, day);
              const isDisabled = (min && cellDate < min) || (max && cellDate > max);
              const isSelected = selectedDate ? isSameDay(cellDate, selectedDate) : false;
              const isToday = isSameDay(cellDate, today);

              return (
                <TouchableOpacity
                  key={day}
                  activeOpacity={0.8}
                  disabled={Boolean(isDisabled)}
                  onPress={() => onSelect(toDateKey(cellDate))}
                  style={{
                    width: 40,
                    height: 40,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View
                    className="items-center justify-center rounded-full"
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: isSelected ? colors.primary : "transparent",
                      borderWidth: isToday && !isSelected ? 1 : 0,
                      borderColor: colors.primary,
                    }}
                  >
                    <Text
                      className="text-sm font-bold"
                      style={{
                        color: isDisabled
                          ? colors.border
                          : isSelected
                            ? colors.buttonText
                            : colors.foreground,
                      }}
                    >
                      {day}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onClose}
            className="mt-5 items-center rounded-full py-3"
            style={{ backgroundColor: colors.input }}
          >
            <Text className="text-sm font-bold" style={{ color: colors.foreground }}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
