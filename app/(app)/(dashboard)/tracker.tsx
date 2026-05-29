import { Ionicons } from "@expo/vector-icons";
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
        label: "Follicular",
      },
      luteal: {
        color: "#8b5cf6",
        label: "Luteal",
      },
      ovulation: {
        color: colors.primary,
        label: "Ovulation",
      },
      period: {
        color: "#ef4444",
        label: "Period",
      },
    }),
    [colors.primary],
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
      phaseLabel: `${phaseStyles[phase].label} - Cycle day ${cycleDay}`,
    });
    setDayDetailsVisible(true);
  }

  function openToday() {
    const today = new Date();

    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    openDate(today);
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
        <ScrollView contentContainerClassName="pb-20">
          <View className="px-6 pt-6">
            <Text
              className="text-3xl font-bold"
              style={{ color: colors.foreground }}
            >
              Period Tracker
            </Text>
            <Text className="mt-2 text-sm" style={{ color: colors.mutedText }}>
              Track your cycle and symptoms — tap a day for details
            </Text>
          </View>

          <View className="mx-6 mt-6">
            <View className="flex-row items-center justify-between">
              <Text
                className="text-lg font-bold"
                style={{ color: colors.foreground }}
              >
                {monthLabel}
              </Text>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="rounded-lg p-2"
                  onPress={() => changeMonth(-1)}
                  style={{ backgroundColor: colors.surface }}
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color={colors.primary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  className="rounded-lg p-2"
                  onPress={() => changeMonth(1)}
                  style={{ backgroundColor: colors.surface }}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.primary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View
              className="mt-4 rounded-2xl border-2 p-4"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <View className="flex-row justify-between">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <Text
                    key={d}
                    className="text-center text-xs font-bold"
                    style={{ color: colors.mutedText, width: `${100 / 7}%` }}
                  >
                    {d}
                  </Text>
                ))}
              </View>

              <View className="mt-4 flex-row flex-wrap">
                {days.map((cell) => {
                  if (cell.kind === "blank") {
                    return (
                      <View
                        key={cell.key}
                        style={{ padding: 3, width: `${100 / 7}%` }}
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
                      accessibilityLabel={`${getDateLabel(cell.date)}, ${phaseStyle.label}, cycle day ${cell.cycleDay}`}
                      className="mb-2 items-center justify-center"
                      activeOpacity={0.85}
                      onPress={() => openDate(cell.date)}
                      style={{ padding: 3, width: `${100 / 7}%` }}
                    >
                      <View
                        style={{
                          alignItems: "center",
                          alignSelf: "center",
                          aspectRatio: 1,
                          backgroundColor: isSelected
                            ? colors.primary
                            : isToday
                              ? colors.primaryLight
                              : colors.background,
                          borderColor: isSelected
                            ? colors.primary
                            : phaseStyle.color,
                          borderRadius: 10,
                          borderWidth: isSelected || isToday ? 2 : 1,
                          justifyContent: "center",
                          maxWidth: 40,
                          position: "relative",
                          width: "100%",
                        }}
                      >
                        <Text
                          style={{
                            color: isSelected
                              ? colors.buttonText
                              : colors.foreground,
                            fontWeight: "700",
                          }}
                        >
                          {cell.day}
                        </Text>
                        {hasLog ? (
                          <View
                            style={{
                              backgroundColor: isSelected
                                ? colors.buttonText
                                : colors.accent,
                              borderRadius: 5,
                              height: 5,
                              position: "absolute",
                              right: 5,
                              top: 5,
                              width: 5,
                            }}
                          />
                        ) : null}
                      </View>

                      <View
                        style={{
                          height: 6,
                          alignItems: "center",
                          justifyContent: "center",
                          marginTop: 5,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: phaseStyle.color,
                            borderRadius: 4,
                            height: 4,
                            width: cell.phase === "luteal" ? 10 : 18,
                          }}
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {selectedDate ? (
              <View
                className="mt-4 rounded-xl border px-4 py-3"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Text
                  className="font-bold"
                  style={{ color: colors.foreground }}
                >
                  {selectedDate.dateLabel}
                </Text>
                <Text
                  className="mt-1 text-sm"
                  style={{ color: colors.mutedText }}
                >
                  {selectedDate.phaseLabel}
                </Text>
                {dayEntries[selectedDate.dateKey]?.symptoms.length ? (
                  <Text
                    className="mt-2 text-sm"
                    style={{ color: colors.foreground }}
                  >
                    {dayEntries[selectedDate.dateKey].symptoms.length} symptoms
                    logged
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Legend */}
            <View className="mt-6 gap-3">
              <View className="flex-row items-center gap-3">
                <View
                  className="h-6 w-6 rounded"
                  style={{ backgroundColor: "#ef4444" }}
                />
                <Text style={{ color: colors.foreground }}>Period</Text>
              </View>
              <View className="flex-row items-center gap-3">
                <View
                  className="h-6 w-6 rounded"
                  style={{ backgroundColor: "#fbbf24" }}
                />
                <Text style={{ color: colors.foreground }}>Follicular</Text>
              </View>
              <View className="flex-row items-center gap-3">
                <View
                  className="h-6 w-6 rounded"
                  style={{ backgroundColor: colors.primary }}
                />
                <Text style={{ color: colors.foreground }}>Ovulation</Text>
              </View>
              <View className="flex-row items-center gap-3">
                <View
                  className="h-6 w-6 rounded"
                  style={{ backgroundColor: "#8b5cf6" }}
                />
                <Text style={{ color: colors.foreground }}>Luteal</Text>
              </View>
            </View>

            {/* Log Today */}
            <TouchableOpacity
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Log today's symptoms"
              className="mt-8 rounded-xl"
              style={{
                backgroundColor: colors.primary,
                paddingVertical: 14,
                paddingHorizontal: 16,
              }}
              onPress={openToday}
            >
              <Text
                className="text-center text-lg font-bold"
                style={{ color: colors.buttonText }}
              >
                {"Log Today's Symptoms"}
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
