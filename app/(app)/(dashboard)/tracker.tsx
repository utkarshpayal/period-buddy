import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppState } from "../../../components/AppState";
import DayDetailsModal from "../../../components/DayDetailsModal";
import { useTheme } from "../../../components/theme";

const CYCLE_LENGTH = 28;
const CURRENT_CYCLE_DAY = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type CyclePhase = "follicular" | "luteal" | "ovulation" | "period";

type CalendarCell =
  | {
      cycleDay: number;
      date: Date;
      dateKey: string;
      day: number;
      kind: "day";
      key: string;
      phase: CyclePhase;
    }
  | {
      kind: "blank";
      key: string;
    };

type SelectedDate = {
  dateKey: string;
  dateLabel: string;
  day: number;
  phaseLabel: string;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getCycleDay(date: Date, cycleStartDate: Date) {
  const difference = Math.floor(
    (startOfDay(date).getTime() - startOfDay(cycleStartDate).getTime()) /
      MS_PER_DAY,
  );
  return (((difference % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH) + 1;
}

function getCyclePhase(cycleDay: number): CyclePhase {
  if (cycleDay <= 5) return "period";
  if (cycleDay <= 11) return "follicular";
  if (cycleDay <= 16) return "ovulation";
  return "luteal";
}

export default function Tracker() {
  const { colors, isDark } = useTheme();
  const [selectedDate, setSelectedDate] = useState<SelectedDate | null>(null);
  const [dayDetailsVisible, setDayDetailsVisible] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const cycleStartDate = useMemo(
    () => addDays(new Date(), -(CURRENT_CYCLE_DAY - 1)),
    [],
  );
  const todayKey = getDateKey(new Date());

  const monthLabel = useMemo(
    () =>
      currentMonth.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
    [currentMonth],
  );

  const { dayEntries, dayNotes, earnTokens, saveDayEntry } = useAppState();

  const phaseStyles = useMemo(
    () => ({
      follicular: {
        color: "#fbbf24",
        bg: isDark ? "#382914" : "#fef3c7",
        label: "Follicular",
      },
      luteal: {
        color: "#8b5cf6",
        bg: isDark ? "#231942" : "#f3e8ff",
        label: "Luteal",
      },
      ovulation: {
        color: colors.primary,
        bg: isDark ? "#3b1a2d" : "#fff0f6",
        label: "Ovulation",
      },
      period: {
        color: "#ef4444",
        bg: isDark ? "#361e12" : "#fee2e2",
        label: "Period",
      },
    }),
    [colors.primary, isDark],
  );

  const days = useMemo<CalendarCell[]>(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const blanks: CalendarCell[] = Array.from(
      { length: firstWeekday },
      (_, index) => ({ key: `blank-${index}`, kind: "blank" }),
    );

    const monthDays: CalendarCell[] = Array.from(
      { length: daysInMonth },
      (_, index) => {
        const day = index + 1;
        const date = new Date(year, month, day);
        const cycleDay = getCycleDay(date, cycleStartDate);

        return {
          cycleDay,
          date,
          dateKey: getDateKey(date),
          day,
          kind: "day",
          key: `day-${day}`,
          phase: getCyclePhase(cycleDay),
        };
      },
    );

    return [...blanks, ...monthDays];
  }, [currentMonth, cycleStartDate]);

  function changeMonth(direction: -1 | 1) {
    setCurrentMonth(
      (month) => new Date(month.getFullYear(), month.getMonth() + direction, 1),
    );
  }

  function openDate(date: Date) {
    const cycleDay = getCycleDay(date, cycleStartDate);
    const phase = getCyclePhase(cycleDay);

    setSelectedDate({
      dateKey: getDateKey(date),
      dateLabel: getDateLabel(date),
      day: date.getDate(),
      phaseLabel: `${phaseStyles[phase].label} Phase • Day ${cycleDay}`,
    });
  }

  function openToday() {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    openDate(today);
    setDayDetailsVisible(true);
  }

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 140 }}
        >
          {/* Header Bar */}
          <View className="px-6 pt-6 flex-row justify-between items-start">
            <View>
              <Text
                className="text-3xl font-extrabold tracking-tight"
                style={{ color: colors.foreground }}
              >
                Period Tracker
              </Text>
              <Text
                className="mt-1 text-xs font-semibold"
                style={{ color: colors.mutedText }}
              >
                Track your cycle, flow & dynamic symptoms
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={openToday}
              className="p-2.5 rounded-full border shadow-2xs"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <MaterialCommunityIcons
                name="calendar-heart"
                size={20}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>

          {/* Elegant Horizontal Legend Row */}
          <View className="px-6 mt-5 flex-row flex-wrap gap-2">
            {(Object.keys(phaseStyles) as CyclePhase[]).map((key) => (
              <View
                key={key}
                className="flex-row items-center px-3 py-1.5 rounded-full border"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <View
                  className="w-2.5 h-2.5 rounded-full mr-2"
                  style={{ backgroundColor: phaseStyles[key].color }}
                />
                <Text
                  className="text-[10px] font-bold tracking-wide"
                  style={{ color: colors.foreground }}
                >
                  {phaseStyles[key].label}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar Body Area */}
          <View className="mx-6 mt-6">
            <View className="flex-row items-center justify-between px-1">
              <Text
                className="text-lg font-extrabold tracking-tight"
                style={{ color: colors.foreground }}
              >
                {monthLabel}
              </Text>
              <View className="flex-row gap-1.5">
                <TouchableOpacity
                  activeOpacity={0.7}
                  className="rounded-full p-2 border"
                  onPress={() => changeMonth(-1)}
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <Feather
                    name="chevron-left"
                    size={16}
                    color={colors.foreground}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.7}
                  className="rounded-full p-2 border"
                  onPress={() => changeMonth(1)}
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <Feather
                    name="chevron-right"
                    size={16}
                    color={colors.foreground}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Clean Rounded Calendar Matrix */}
            <View
              className="mt-4 rounded-3xl border p-5 shadow-2xs"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <View className="flex-row justify-between mb-4">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <Text
                    key={d}
                    className="text-center text-xs font-bold uppercase tracking-widest"
                    style={{ color: colors.mutedText, width: `${100 / 7}%` }}
                  >
                    {d.substring(0, 1)}
                  </Text>
                ))}
              </View>

              <View className="flex-row flex-wrap row-gap-3">
                {days.map((cell) => {
                  if (cell.kind === "blank") {
                    return (
                      <View
                        key={cell.key}
                        style={{ width: `${100 / 7}%`, aspectRatio: 1 }}
                      />
                    );
                  }

                  const isSelected = selectedDate?.dateKey === cell.dateKey;
                  const isToday = cell.dateKey === todayKey;
                  const entry = dayEntries[cell.dateKey];
                  const hasLog = Boolean(
                    entry?.note.trim() ||
                    entry?.symptoms.length ||
                    entry?.flow ||
                    entry?.mood ||
                    entry?.energy ||
                    dayNotes[cell.dateKey]?.trim(),
                  );
                  const phaseStyle = phaseStyles[cell.phase];

                  return (
                    <TouchableOpacity
                      key={cell.key}
                      className="items-center justify-center p-1 relative"
                      activeOpacity={0.8}
                      onPress={() => openDate(cell.date)}
                      style={{ width: `${100 / 7}%`, aspectRatio: 1 }}
                    >
                      <View
                        className="w-full h-full rounded-full items-center justify-center border relative"
                        style={{
                          backgroundColor: isSelected
                            ? colors.primary
                            : isToday
                              ? colors.primaryLight
                              : "transparent",
                          borderColor: isSelected
                            ? colors.primary
                            : isToday
                              ? colors.primary
                              : "transparent",
                        }}
                      >
                        {/* Soft colored under-dot for matching the phase organically */}
                        {!isSelected && !isToday && (
                          <View
                            className="absolute bottom-1 w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: phaseStyle.color }}
                          />
                        )}

                        <Text
                          className="text-sm font-bold"
                          style={{
                            color: isSelected
                              ? colors.buttonText
                              : isToday
                                ? colors.primary
                                : colors.foreground,
                          }}
                        >
                          {cell.day}
                        </Text>

                        {/* Top corner smart token logging indicator dot */}
                        {hasLog && (
                          <View
                            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: isSelected
                                ? colors.buttonText
                                : colors.accent,
                            }}
                          />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Clean Functional Dashboard Row Integration Preview */}
            {selectedDate && (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setDayDetailsVisible(true)}
                className="mt-5 rounded-2xl border p-4 flex-row items-center justify-between shadow-3xs"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <View className="flex-1">
                  <Text
                    className="text-sm font-bold"
                    style={{ color: colors.foreground }}
                  >
                    {selectedDate.dateLabel}
                  </Text>
                  <Text
                    className="text-xs font-semibold mt-0.5"
                    style={{ color: colors.mutedText }}
                  >
                    {selectedDate.phaseLabel}
                  </Text>

                  {dayEntries[selectedDate.dateKey]?.symptoms.length ? (
                    <View className="flex-row gap-1.5 mt-2 flex-wrap">
                      {dayEntries[selectedDate.dateKey].symptoms.map(
                        (s, idx) => (
                          <View
                            key={idx}
                            className="bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-md"
                          >
                            <Text
                              className="text-[10px] font-bold"
                              style={{ color: "white" }}
                            >
                              {s}
                            </Text>
                          </View>
                        ),
                      )}
                    </View>
                  ) : (
                    <Text
                      className="text-[11px] font-medium mt-1.5 italic"
                      style={{ color: colors.mutedText }}
                    >
                      No symptoms logged for this date. Tap to log.
                    </Text>
                  )}
                </View>
                <Feather name="edit-3" size={16} color={colors.primary} />
              </TouchableOpacity>
            )}

            {/* Core Action Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              className="mt-6 rounded-2xl py-4 items-center justify-center shadow-md"
              style={{ backgroundColor: colors.primary }}
              onPress={openToday}
            >
              <Text
                className="text-center text-base font-bold tracking-wide"
                style={{ color: colors.buttonText }}
              >
                Log Today's Symptoms
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>

      <DayDetailsModal
        visible={dayDetailsVisible}
        onClose={() => setDayDetailsVisible(false)}
        day={selectedDate?.day}
        dateLabel={selectedDate?.dateLabel}
        phaseLabel={selectedDate?.phaseLabel}
        entry={selectedDate ? dayEntries[selectedDate.dateKey] : undefined}
        details={
          selectedDate ? (dayNotes[selectedDate.dateKey] ?? "") : undefined
        }
        onSaveEntry={(entry) => {
          if (selectedDate) {
            const previousEntry = dayEntries[selectedDate.dateKey];
            const hadLog = Boolean(
              previousEntry?.note.trim() ||
              previousEntry?.symptoms.length ||
              previousEntry?.flow ||
              previousEntry?.mood ||
              previousEntry?.energy,
            );
            saveDayEntry(selectedDate.dateKey, entry);
            if (!hadLog) earnTokens(5);
          }
        }}
        onLogSymptom={(symptom) => {
          if (selectedDate) {
            const previousEntry = dayEntries[selectedDate.dateKey];
            saveDayEntry(selectedDate.dateKey, {
              energy: previousEntry?.energy,
              flow: previousEntry?.flow,
              mood: previousEntry?.mood,
              note: previousEntry?.note ?? "",
              symptoms: Array.from(
                new Set([...(previousEntry?.symptoms ?? []), symptom]),
              ),
            });
            earnTokens(1);
          }
        }}
      />
    </>
  );
}
