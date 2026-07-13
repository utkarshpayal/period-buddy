import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAppState } from "../../../components/AppState";
import DayDetailsModal from "../../../components/DayDetailsModal";
import { useTheme } from "../../../components/theme";
import {
  getActionGradient,
  getShadow,
  getSoftTints,
  getSurfaceGradient,
} from "../../../components/ui-tokens";
import {
  cycleApi,
  type CycleSettings,
  type DayEntry as ApiDayEntry,
} from "../../../lib/api";
import type { DayEntry as LocalDayEntry } from "../../../components/AppState";

const CYCLE_LENGTH = 28;
const CURRENT_CYCLE_DAY = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

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

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getCycleDay(
  date: Date,
  cycleStartDate: Date,
  cycleLength = CYCLE_LENGTH,
) {
  const difference = Math.floor(
    (startOfDay(date).getTime() - startOfDay(cycleStartDate).getTime()) /
      MS_PER_DAY,
  );
  return (((difference % cycleLength) + cycleLength) % cycleLength) + 1;
}

function getCyclePhase(cycleDay: number, periodLength = 5): CyclePhase {
  if (cycleDay <= periodLength) return "period";
  if (cycleDay <= 11) return "follicular";
  if (cycleDay <= 16) return "ovulation";
  return "luteal";
}

function getMondayFirstWeekday(date: Date) {
  return (date.getDay() + 6) % 7;
}

function formatSettingsDate(value?: string) {
  if (!value) return getDateKey(new Date());
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return value.slice(0, 10);
  return getDateKey(parsedDate);
}

export default function Tracker() {
  const { colors, isDark } = useTheme();
  const [selectedDate, setSelectedDate] = useState<SelectedDate | null>(null);
  const [dayDetailsVisible, setDayDetailsVisible] = useState(false);
  const [selectedYear, setSelectedYear] = useState(() =>
    new Date().getFullYear(),
  );
  const [cycleSettings, setCycleSettings] = useState<CycleSettings | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [lastPeriodStartDate, setLastPeriodStartDate] = useState(
    getDateKey(new Date()),
  );
  const [cycleLengthInput, setCycleLengthInput] = useState(String(CYCLE_LENGTH));
  const [periodLengthInput, setPeriodLengthInput] = useState("5");
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderDaysBeforeInput, setReminderDaysBeforeInput] = useState("2");
  const [remoteDayEntries, setRemoteDayEntries] = useState<
    Record<string, LocalDayEntry>
  >({});
  const softTints = getSoftTints(colors);
  const surfaceGradient = getSurfaceGradient(colors, isDark) as [string, string];
  const actionGradient = getActionGradient(colors) as [string, string];

  const cycleStartDate = useMemo(() => {
    if (cycleSettings?.lastPeriodStartDate) {
      return new Date(cycleSettings.lastPeriodStartDate);
    }
    return addDays(new Date(), -(CURRENT_CYCLE_DAY - 1));
  }, [cycleSettings]);
  const todayKey = getDateKey(new Date());

  const calendarMonths = useMemo(
    () =>
      Array.from(
        { length: 12 },
        (_, index) => new Date(selectedYear, index, 1),
      ),
    [selectedYear],
  );

  const yearOptions = useMemo(
    () => [selectedYear - 1, selectedYear, selectedYear + 1],
    [selectedYear],
  );

  const { dayEntries, dayNotes, earnTokens, saveDayEntry } = useAppState();
  const activeCycleLength = cycleSettings?.cycleLength ?? CYCLE_LENGTH;
  const activePeriodLength = cycleSettings?.periodLength ?? 5;

  useEffect(() => {
    let isMounted = true;

    async function loadSettings() {
      try {
        const settings = await cycleApi.getSettings();
        if (isMounted) setCycleSettings(settings);
      } catch {
        if (isMounted) setCycleSettings(null);
      }
    }

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setLastPeriodStartDate(
      formatSettingsDate(cycleSettings?.lastPeriodStartDate),
    );
    setCycleLengthInput(String(cycleSettings?.cycleLength ?? CYCLE_LENGTH));
    setPeriodLengthInput(String(cycleSettings?.periodLength ?? 5));
    setRemindersEnabled(cycleSettings?.remindersEnabled ?? true);
    setReminderDaysBeforeInput(
      String(cycleSettings?.reminderDaysBefore ?? 2),
    );
  }, [cycleSettings]);

  useEffect(() => {
    let isMounted = true;
    async function loadYearLogs() {
      try {
        const results = await Promise.allSettled(
          calendarMonths.map((month) => cycleApi.getMonthLogs(getMonthKey(month))),
        );
        if (!isMounted) return;

        const entries = results.reduce<Record<string, LocalDayEntry>>(
          (acc, result) => {
            if (result.status !== "fulfilled") return acc;

            result.value.forEach((log) => {
              acc[log.dateKey] = mapApiDayEntry(log);
            });

            return acc;
          },
          {},
        );

        setRemoteDayEntries(entries);
      } catch {
        if (isMounted) setRemoteDayEntries({});
      }
    }

    loadYearLogs();

    return () => {
      isMounted = false;
    };
  }, [calendarMonths]);

  function mapApiDayEntry(log: ApiDayEntry): LocalDayEntry {
    return {
      energy:
        log.energy === "medium"
          ? "steady"
          : (log.energy as LocalDayEntry["energy"]),
      flow:
        log.flow === "spotting"
          ? "light"
          : (log.flow as LocalDayEntry["flow"]),
      mood:
        log.mood === "sad" ||
        log.mood === "anxious" ||
        log.mood === "irritable" ||
        log.mood === "neutral" ||
        log.mood === "energetic"
          ? "emotional"
          : (log.mood as LocalDayEntry["mood"]),
      note: log.note ?? "",
      symptoms: log.symptoms ?? [],
      updatedAt: log.date ?? new Date().toISOString(),
    };
  }

  const phaseStyles = useMemo(
    () => ({
      follicular: {
        color: colors.warning,
        bg: softTints.amber,
        label: "Follicular",
      },
      luteal: {
        color: colors.secondary,
        bg: softTints.mint,
        label: "Luteal",
      },
      ovulation: {
        color: colors.primary,
        bg: softTints.pink,
        label: "Ovulation",
      },
      period: {
        color: colors.rose,
        bg: softTints.rose,
        label: "Period",
      },
    }),
    [colors, softTints],
  );

  function buildCalendarDays(monthDate: Date): CalendarCell[] {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstWeekday = getMondayFirstWeekday(new Date(year, month, 1));
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const blanks: CalendarCell[] = Array.from(
      { length: firstWeekday },
      (_, index) => ({
        key: `blank-${year}-${month}-${index}`,
        kind: "blank",
      }),
    );

    const monthDays: CalendarCell[] = Array.from(
      { length: daysInMonth },
      (_, index) => {
        const day = index + 1;
        const date = new Date(year, month, day);
        const cycleDay = getCycleDay(date, cycleStartDate, activeCycleLength);

        return {
          cycleDay,
          date,
          dateKey: getDateKey(date),
          day,
          kind: "day",
          key: `day-${year}-${month}-${day}`,
          phase: getCyclePhase(cycleDay, activePeriodLength),
        };
      },
    );

    return [...blanks, ...monthDays];
  }

  function openDate(date: Date) {
    const cycleDay = getCycleDay(date, cycleStartDate, activeCycleLength);
    const phase = getCyclePhase(cycleDay, activePeriodLength);

    setSelectedDate({
      dateKey: getDateKey(date),
      dateLabel: getDateLabel(date),
      day: date.getDate(),
      phaseLabel: `${phaseStyles[phase].label} Phase • Day ${cycleDay}`,
    });
    setDayDetailsVisible(true);
  }

  function openToday() {
    const today = new Date();
    setSelectedYear(today.getFullYear());
    openDate(today);
  }

  function openCycleSettings() {
    setSettingsError("");
    setSettingsVisible(true);
  }

  function adjustNumberInput(
    value: string,
    setter: (nextValue: string) => void,
    delta: -1 | 1,
    min: number,
    max: number,
  ) {
    const current = Number.parseInt(value, 10);
    const next = Math.min(max, Math.max(min, (Number.isNaN(current) ? min : current) + delta));
    setter(String(next));
  }

  async function handleSaveCycleSettings() {
    const cleanedDate = lastPeriodStartDate.trim();
    const cycleLength = Number.parseInt(cycleLengthInput, 10);
    const periodLength = Number.parseInt(periodLengthInput, 10);
    const reminderDaysBefore = Number.parseInt(reminderDaysBeforeInput, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanedDate)) {
      setSettingsError("Use YYYY-MM-DD for the last period start date.");
      return;
    }

    if (Number.isNaN(cycleLength) || cycleLength < 20 || cycleLength > 45) {
      setSettingsError("Cycle length should be between 20 and 45 days.");
      return;
    }

    if (Number.isNaN(periodLength) || periodLength < 1 || periodLength > 10) {
      setSettingsError("Period length should be between 1 and 10 days.");
      return;
    }

    if (
      Number.isNaN(reminderDaysBefore) ||
      reminderDaysBefore < 0 ||
      reminderDaysBefore > 14
    ) {
      setSettingsError("Reminder timing should be between 0 and 14 days.");
      return;
    }

    try {
      setSettingsSaving(true);
      setSettingsError("");
      const savedSettings = await cycleApi.saveSettings({
        cycleLength,
        lastPeriodStartDate: cleanedDate,
        periodLength,
        reminderDaysBefore,
        remindersEnabled,
      });
      setCycleSettings(savedSettings);
      setSettingsVisible(false);
      setSelectedYear(new Date().getFullYear());
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Unable to save cycle settings right now.",
      );
    } finally {
      setSettingsSaving(false);
    }
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
                Track your cycle, flow, mood, and symptoms
              </Text>
            </View>
            {/* <View className="flex-row gap-2">
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={openCycleSettings}
                className="p-2.5 rounded-full border shadow-2xs"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Feather name="settings" size={18} color={colors.foreground} />
              </TouchableOpacity>

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
            </View> */}
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

          <View
            className="mx-6 mt-5 rounded-3xl border overflow-hidden shadow-sm"
            style={{ borderColor: colors.border }}
          >
            <LinearGradient
              colors={surfaceGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="p-4"
              style={{ borderColor: colors.border }}
            >
              <View className="flex-row items-center justify-between gap-4">
                <View className="flex-1">
                  <Text
                    className="text-xs font-bold tracking-widest uppercase"
                    style={{ color: colors.primary }}
                  >
                    Cycle Setup
                  </Text>
                  <Text
                    className="mt-1 text-sm font-extrabold"
                    style={{ color: colors.foreground }}
                  >
                    {cycleSettings
                      ? `${activeCycleLength}-day cycle • ${activePeriodLength}-day period`
                      : "Add your cycle baseline"}
                  </Text>
                  <Text
                    className="mt-1 text-[11px] font-semibold leading-4"
                    style={{ color: colors.mutedText }}
                  >
                    Last period started {lastPeriodStartDate}. Update this to
                    improve predictions and calendar phases.
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={openCycleSettings}
                  className="rounded-full px-4 py-2.5"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{ color: colors.buttonText }}
                  >
                    Edit
                  </Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>

          {/* Calendar Body Area */}
          <View className="mx-4 mt-6">
            <View className="px-2">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text
                    className="text-lg font-extrabold tracking-tight"
                    style={{ color: colors.foreground }}
                  >
                    Calendar
                  </Text>
                  {/* <Text
                    className="mt-1 text-xs font-semibold leading-5"
                    style={{ color: colors.mutedText }}
                  >
                    All 12 months are in one scroll. Tap any date to add flow,
                    symptoms, mood, energy, or notes.
                  </Text> */}
                </View>
                <TouchableOpacity
                  activeOpacity={0.82}
                  className="rounded-full border px-4 py-2"
                  onPress={openToday}
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <Text
                    className="text-xs font-black"
                    style={{ color: colors.primary }}
                  >
                    Today
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              className="-mx-4 mt-4"
              contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
            >
              {yearOptions.map((year) => {
                const isSelected = year === selectedYear;

                return (
                  <TouchableOpacity
                    activeOpacity={0.82}
                    className="rounded-full border px-4 py-2"
                    key={year}
                    onPress={() => setSelectedYear(year)}
                    style={{
                      backgroundColor: isSelected
                        ? colors.primary
                        : colors.surface,
                      borderColor: isSelected ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      className="text-xs font-black"
                      style={{
                        color: isSelected ? colors.background : colors.mutedText,
                      }}
                    >
                      {year}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View
              className="mt-4 overflow-hidden rounded-[28px] border"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                ...getShadow(colors, isDark),
              }}
            >
              <View className="px-5 pb-3 pt-5">
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text
                      className="text-xl font-black tracking-tight"
                      style={{ color: colors.foreground }}
                    >
                      {selectedYear}
                    </Text>
                    <Text
                      className="mt-0.5 text-[11px] font-bold"
                      style={{ color: colors.mutedText }}
                    >
                      Period dates are shown in pink
                    </Text>
                  </View>
                </View>
              </View>

              <View
                className="border-y px-5 py-3"
                style={{ borderColor: colors.border }}
              >
                <View className="flex-row">
                  {WEEKDAY_LABELS.map((day, index) => (
                    <Text
                      className="text-center text-[10px] font-black uppercase"
                      key={`${day}-${index}`}
                      style={{ color: colors.mutedText, width: `${100 / 7}%` }}
                    >
                      {day}
                    </Text>
                  ))}
                </View>
              </View>

              <View className="px-4 pb-6">
                {calendarMonths.map((monthDate, monthIndex) => {
                  const monthDays = buildCalendarDays(monthDate);
                  const monthKey = getMonthKey(monthDate);

                  return (
                    <View
                      key={monthKey}
                      className={monthIndex === 0 ? "pt-5" : "mt-5 border-t pt-5"}
                      style={{
                        borderColor:
                          monthIndex === 0 ? "transparent" : colors.border,
                      }}
                    >
                      <Text
                        className="mb-4 text-center text-sm font-black"
                        style={{ color: colors.foreground }}
                      >
                        {monthDate.toLocaleDateString("en-US", {
                          month: "long",
                        })}
                      </Text>

                      <View className="flex-row flex-wrap row-gap-1.5">
                        {monthDays.map((cell) => {
                          if (cell.kind === "blank") {
                            return (
                              <View
                                key={cell.key}
                                style={{ height: 42, width: `${100 / 7}%` }}
                              />
                            );
                          }

                          const isSelected =
                            selectedDate?.dateKey === cell.dateKey;
                          const isToday = cell.dateKey === todayKey;
                          const entry =
                            dayEntries[cell.dateKey] ??
                            remoteDayEntries[cell.dateKey];
                          const hasLog = Boolean(
                            entry?.note.trim() ||
                              entry?.symptoms.length ||
                              entry?.flow ||
                              entry?.mood ||
                              entry?.energy ||
                              dayNotes[cell.dateKey]?.trim(),
                          );
                          const hasFlowLog = Boolean(
                            entry?.flow && entry.flow !== "none",
                          );
                          const isPeriodDay =
                            cell.phase === "period" || hasFlowLog;
                          const isFertileDay =
                            cell.cycleDay >= 10 && cell.cycleDay <= 16;
                          const isOvulationPeak = cell.cycleDay === 14;
                          const dayTextColor = isPeriodDay
                            ? colors.buttonText
                            : isFertileDay
                              ? colors.secondary
                              : isSelected
                                ? colors.primary
                                : colors.foreground;

                          return (
                            <TouchableOpacity
                              activeOpacity={0.82}
                              className="items-center justify-center"
                              key={cell.key}
                              onPress={() => openDate(cell.date)}
                              style={{ height: 42, width: `${100 / 7}%` }}
                            >
                              <View
                                className="items-center justify-center rounded-full border relative"
                                style={{
                                  backgroundColor: isPeriodDay
                                    ? colors.primary
                                    : isSelected
                                      ? colors.primaryLight
                                      : "transparent",
                                  borderColor: isPeriodDay
                                    ? colors.primary
                                    : isSelected || isToday
                                      ? colors.primary
                                      : isOvulationPeak
                                        ? colors.secondary
                                        : "transparent",
                                  borderStyle:
                                    !isPeriodDay &&
                                    (isToday || isOvulationPeak)
                                      ? "dashed"
                                      : "solid",
                                  borderWidth:
                                    isSelected ||
                                    isToday ||
                                    isOvulationPeak ||
                                    isPeriodDay
                                      ? 1.5
                                      : 0,
                                  height: 34,
                                  width: 34,
                                }}
                              >
                                <Text
                                  className="text-xs font-black"
                                  style={{ color: dayTextColor }}
                                >
                                  {cell.day}
                                </Text>
                                {hasLog && (
                                  <View
                                    className="absolute bottom-1 h-1 w-1 rounded-full"
                                    style={{
                                      backgroundColor: isPeriodDay
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
                  );
                })}
              </View>
            </View>

            {/* Core Action Button */}
            {/* <TouchableOpacity
              activeOpacity={0.85}
              className="mt-6 rounded-full overflow-hidden shadow-lg"
              onPress={openToday}
            >
              <LinearGradient
                colors={actionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                className="py-4 items-center justify-center"
              >
                <Text
                  className="text-center text-base font-bold tracking-wide"
                  style={{ color: colors.buttonText }}
                >
                  {"Log Today's Symptoms"}
                </Text>
              </LinearGradient>
            </TouchableOpacity> */}
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal
        animationType="slide"
        transparent
        visible={settingsVisible}
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable
            accessibilityLabel="Close cycle settings"
            className="absolute inset-0"
            onPress={() => setSettingsVisible(false)}
            style={{ backgroundColor: colors.overlay }}
          />

          <View
            className="max-h-[88%] overflow-hidden rounded-t-[28px] border"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <View className="items-center pt-3">
              <View
                className="h-1 w-12 rounded-full"
                style={{ backgroundColor: colors.border }}
              />
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 24, paddingBottom: 32 }}
            >
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                  <Text
                    className="text-[11px] font-black uppercase tracking-widest"
                    style={{ color: colors.primary }}
                  >
                    Cycle Settings
                  </Text>
                  <Text
                    className="mt-1 text-2xl font-black tracking-tight"
                    style={{ color: colors.foreground }}
                  >
                    Set your baseline
                  </Text>
                  <Text
                    className="mt-2 text-xs font-semibold leading-5"
                    style={{ color: colors.mutedText }}
                  >
                    These values power cycle day, phase colors, reminders, and
                    predictions.
                  </Text>
                </View>

                <TouchableOpacity
                  accessibilityLabel="Close cycle settings"
                  onPress={() => setSettingsVisible(false)}
                  className="rounded-full border p-2"
                  style={{
                    backgroundColor: colors.input,
                    borderColor: colors.border,
                  }}
                >
                  <Feather name="x" size={16} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              <View className="mt-6 gap-4">
                <View>
                  <Text
                    className="mb-2 text-xs font-bold"
                    style={{ color: colors.foreground }}
                  >
                    Last period start date
                  </Text>
                  <View
                    className="flex-row items-center rounded-2xl border px-4 py-3.5"
                    style={{
                      backgroundColor: colors.input,
                      borderColor: colors.border,
                    }}
                  >
                    <MaterialCommunityIcons
                      name="calendar-start"
                      size={18}
                      color={colors.primary}
                    />
                    <TextInput
                      autoCapitalize="none"
                      keyboardType="numbers-and-punctuation"
                      onChangeText={(text) => {
                        setSettingsError("");
                        setLastPeriodStartDate(text);
                      }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.mutedText}
                      className="ml-3 flex-1 text-sm font-bold outline-none"
                      style={{ color: colors.foreground }}
                      value={lastPeriodStartDate}
                    />
                  </View>
                  <Text
                    className="mt-2 text-[11px] font-semibold"
                    style={{ color: colors.mutedText }}
                  >
                    Example: 2026-07-01
                  </Text>
                </View>

                {[
                  {
                    helper: "Most cycles are usually between 24 and 35 days.",
                    label: "Cycle length",
                    max: 45,
                    min: 20,
                    setValue: setCycleLengthInput,
                    suffix: "days",
                    value: cycleLengthInput,
                  },
                  {
                    helper: "This marks period phase days on your calendar.",
                    label: "Period length",
                    max: 10,
                    min: 1,
                    setValue: setPeriodLengthInput,
                    suffix: "days",
                    value: periodLengthInput,
                  },
                ].map((item) => (
                  <View
                    key={item.label}
                    className="rounded-2xl border p-4"
                    style={{
                      backgroundColor: colors.input,
                      borderColor: colors.border,
                    }}
                  >
                    <View className="flex-row items-center justify-between gap-3">
                      <View className="flex-1">
                        <Text
                          className="text-xs font-bold"
                          style={{ color: colors.foreground }}
                        >
                          {item.label}
                        </Text>
                        <Text
                          className="mt-1 text-[11px] font-semibold leading-4"
                          style={{ color: colors.mutedText }}
                        >
                          {item.helper}
                        </Text>
                      </View>

                      <View className="flex-row items-center rounded-full border overflow-hidden">
                        <TouchableOpacity
                          activeOpacity={0.8}
                          className="h-9 w-9 items-center justify-center"
                          onPress={() =>
                            adjustNumberInput(
                              item.value,
                              item.setValue,
                              -1,
                              item.min,
                              item.max,
                            )
                          }
                          style={{ backgroundColor: colors.surface }}
                        >
                          <Feather
                            name="minus"
                            size={14}
                            color={colors.foreground}
                          />
                        </TouchableOpacity>
                        <View
                          className="h-9 min-w-[74px] items-center justify-center border-x px-3"
                          style={{
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                          }}
                        >
                          <Text
                            className="text-sm font-black"
                            style={{ color: colors.foreground }}
                          >
                            {item.value} {item.suffix}
                          </Text>
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          className="h-9 w-9 items-center justify-center"
                          onPress={() =>
                            adjustNumberInput(
                              item.value,
                              item.setValue,
                              1,
                              item.min,
                              item.max,
                            )
                          }
                          style={{ backgroundColor: colors.surface }}
                        >
                          <Feather
                            name="plus"
                            size={14}
                            color={colors.foreground}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}

                <View
                  className="rounded-2xl border p-4"
                  style={{
                    backgroundColor: colors.input,
                    borderColor: colors.border,
                  }}
                >
                  <View className="flex-row items-center justify-between gap-4">
                    <View className="flex-1">
                      <Text
                        className="text-xs font-bold"
                        style={{ color: colors.foreground }}
                      >
                        Period reminders
                      </Text>
                      <Text
                        className="mt-1 text-[11px] font-semibold leading-4"
                        style={{ color: colors.mutedText }}
                      >
                        Show reminders before your expected next period.
                      </Text>
                    </View>
                    <Switch
                      onValueChange={setRemindersEnabled}
                      thumbColor={
                        remindersEnabled ? colors.buttonText : colors.mutedText
                      }
                      trackColor={{
                        false: colors.border,
                        true: colors.primary,
                      }}
                      value={remindersEnabled}
                    />
                  </View>

                  {remindersEnabled ? (
                    <View className="mt-4 flex-row items-center justify-between rounded-2xl border px-4 py-3">
                      <Text
                        className="text-xs font-bold"
                        style={{ color: colors.foreground }}
                      >
                        Remind me before
                      </Text>
                      <View className="flex-row items-center rounded-full border overflow-hidden">
                        <TouchableOpacity
                          activeOpacity={0.8}
                          className="h-8 w-8 items-center justify-center"
                          onPress={() =>
                            adjustNumberInput(
                              reminderDaysBeforeInput,
                              setReminderDaysBeforeInput,
                              -1,
                              0,
                              14,
                            )
                          }
                          style={{ backgroundColor: colors.surface }}
                        >
                          <Feather
                            name="minus"
                            size={13}
                            color={colors.foreground}
                          />
                        </TouchableOpacity>
                        <View
                          className="h-8 min-w-[66px] items-center justify-center border-x px-2"
                          style={{
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                          }}
                        >
                          <Text
                            className="text-xs font-black"
                            style={{ color: colors.foreground }}
                          >
                            {reminderDaysBeforeInput} days
                          </Text>
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          className="h-8 w-8 items-center justify-center"
                          onPress={() =>
                            adjustNumberInput(
                              reminderDaysBeforeInput,
                              setReminderDaysBeforeInput,
                              1,
                              0,
                              14,
                            )
                          }
                          style={{ backgroundColor: colors.surface }}
                        >
                          <Feather
                            name="plus"
                            size={13}
                            color={colors.foreground}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>

              {settingsError ? (
                <View
                  className="mt-5 rounded-2xl border px-4 py-3"
                  style={{
                    backgroundColor: colors.dangerLight,
                    borderColor: colors.danger,
                  }}
                >
                  <Text
                    className="text-center text-xs font-bold"
                    style={{ color: colors.danger }}
                  >
                    {settingsError}
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.9}
                className="mt-6 overflow-hidden rounded-full"
                disabled={settingsSaving}
                onPress={handleSaveCycleSettings}
                style={{ opacity: settingsSaving ? 0.7 : 1 }}
              >
                <LinearGradient
                  colors={actionGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  className="flex-row items-center justify-center gap-2 py-4"
                >
                  {settingsSaving ? (
                    <ActivityIndicator size="small" color={colors.buttonText} />
                  ) : null}
                  <Text
                    className="text-sm font-black"
                    style={{ color: colors.buttonText }}
                  >
                    {settingsSaving ? "Saving Settings" : "Save Cycle Settings"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <DayDetailsModal
        visible={dayDetailsVisible}
        onClose={() => setDayDetailsVisible(false)}
        day={selectedDate?.day}
        dateLabel={selectedDate?.dateLabel}
        phaseLabel={selectedDate?.phaseLabel}
        entry={
          selectedDate
            ? (dayEntries[selectedDate.dateKey] ??
              remoteDayEntries[selectedDate.dateKey])
            : undefined
        }
        details={
          selectedDate ? (dayNotes[selectedDate.dateKey] ?? "") : undefined
        }
        onSaveEntry={(entry) => {
          if (selectedDate) {
            const previousEntry =
              dayEntries[selectedDate.dateKey] ??
              remoteDayEntries[selectedDate.dateKey];
            const hadLog = Boolean(
              previousEntry?.note.trim() ||
              previousEntry?.symptoms.length ||
              previousEntry?.flow ||
              previousEntry?.mood ||
              previousEntry?.energy,
            );
            saveDayEntry(selectedDate.dateKey, entry);
            cycleApi
              .saveLog({
                dateKey: selectedDate.dateKey,
                ...entry,
              })
              .then((result) => {
                setRemoteDayEntries((current) => ({
                  ...current,
                  [selectedDate.dateKey]: mapApiDayEntry(result.cycleLog),
                }));
                if (result.tokensEarned) earnTokens(result.tokensEarned);
              })
              .catch(() => {});
            if (!hadLog) earnTokens(5);
          }
        }}
        onLogSymptom={(symptom) => {
          if (selectedDate) {
            const previousEntry =
              dayEntries[selectedDate.dateKey] ??
              remoteDayEntries[selectedDate.dateKey];
            const nextEntry = {
              energy: previousEntry?.energy,
              flow: previousEntry?.flow,
              mood: previousEntry?.mood,
              note: previousEntry?.note ?? "",
              symptoms: Array.from(
                new Set([...(previousEntry?.symptoms ?? []), symptom]),
              ),
            };
            saveDayEntry(selectedDate.dateKey, nextEntry);
            cycleApi
              .saveLog({
                dateKey: selectedDate.dateKey,
                ...nextEntry,
              })
              .then((result) => {
                setRemoteDayEntries((current) => ({
                  ...current,
                  [selectedDate.dateKey]: mapApiDayEntry(result.cycleLog),
                }));
                if (result.tokensEarned) earnTokens(result.tokensEarned);
              })
              .catch(() => {});
            earnTokens(1);
          }
        }}
      />
    </>
  );
}
