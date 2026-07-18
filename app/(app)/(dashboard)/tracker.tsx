import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
import Svg, { Circle } from "react-native-svg";
import { useAppState } from "../../../components/AppState";
import DayDetailsModal from "../../../components/DayDetailsModal";
import { useTheme } from "../../../components/theme";
import { getShadow, getSoftTints } from "../../../components/ui-tokens";
import { useAuth } from "../../../components/auth-context";
import {
  authApi,
  cycleApi,
  type CycleSettings,
  type DayEntry as ApiDayEntry,
  type DashboardSummary,
  type Predictions,
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

// Mirrors the backend's getCyclePhase (src/utils/cycle.js) so the calendar's
// phase coloring scales with the user's actual cycle length instead of the
// fixed 28-day assumption baked into the old 11/16-day thresholds.
function getCyclePhase(
  cycleDay: number,
  periodLength = 5,
  cycleLength = CYCLE_LENGTH,
): CyclePhase {
  if (cycleDay <= periodLength) return "period";
  const ovulationDay = Math.max(periodLength + 1, cycleLength - 13);
  if (cycleDay < ovulationDay - 5) return "follicular";
  if (cycleDay <= ovulationDay + 1) return "ovulation";
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
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<SelectedDate | null>(null);
  const [dayDetailsVisible, setDayDetailsVisible] = useState(false);
  const [selectedYear, setSelectedYear] = useState(() =>
    new Date().getFullYear(),
  );
  const [yearPickerVisible, setYearPickerVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const mainScrollRef = React.useRef<ScrollView>(null);
  const [monthLayouts, setMonthLayouts] = useState<Record<number, number>>({});
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
  const [ovulationReminder, setOvulationReminder] = useState(false);
  const [fertilityReminder, setFertilityReminder] = useState(false);
  const [pregnancyMode, setPregnancyMode] = useState(false);
  const [trackingGoal, setTrackingGoal] = useState<CycleSettings["trackingGoal"]>("track_period");
  const [remoteDayEntries, setRemoteDayEntries] = useState<
    Record<string, LocalDayEntry>
  >({});
  const softTints = getSoftTints(colors);

  const { user, updateUser } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [predictions, setPredictions] = useState<Predictions | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadDashboard() {
      try {
        const [dashboardSummary, cyclePredictions] = await Promise.all([
          authApi.getDashboard(),
          cycleApi.getPredictions(),
        ]);

        if (isMounted) {
          setDashboard(dashboardSummary);
          setPredictions(cyclePredictions);
          if (dashboardSummary.user) {
            updateUser(dashboardSummary.user);
          }
        }
      } catch (err) {
        console.warn("Failed to load dashboard/predictions data in tracker:", err);
      } finally {
        if (isMounted) setIsDashboardLoading(false);
      }
    }
    loadDashboard();
    return () => {
      isMounted = false;
    };
  }, []);

  const loggedDays = Math.max(dashboard?.trackedDays ?? 0, 0);
  const cycleDay = Math.max(
    predictions?.currentCycleDay ??
    dashboard?.predictions?.currentCycleDay ??
    1,
    1,
  );
  const nextPeriodDaysAway = predictions?.nextPeriodDaysAway !== undefined ? predictions.nextPeriodDaysAway : Math.max(1, (cycleSettings?.cycleLength ?? CYCLE_LENGTH) - cycleDay);
  const treeHealth =
    dashboard?.forestHealth ?? Math.min(100, Math.max(45, 55 + loggedDays * 6));
  const currentPhase = predictions?.currentPhase || dashboard?.predictions?.currentPhase || "follicular";

  const weekDays = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday, etc.
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayOfWeek); // Go back to Sunday

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      return d;
    });
  }, []);

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
  // Same pivot as getCyclePhase's internal "ovulationDay" — reused below to
  // size the fertile window / ovulation-peak highlight to the real cycle
  // length instead of the old hardcoded 10-16 / day-14 constants.
  const ovulationDayPivot = Math.max(
    activePeriodLength + 1,
    activeCycleLength - 13,
  );

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
    setOvulationReminder(cycleSettings?.ovulationReminder ?? false);
    setFertilityReminder(cycleSettings?.fertilityReminder ?? false);
    setPregnancyMode(cycleSettings?.pregnancyMode ?? false);
    setTrackingGoal(cycleSettings?.trackingGoal ?? "track_period");
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

  const currentMonthIndex = useMemo(() => new Date().getMonth(), []);
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    if (selectedYear === currentYear && monthLayouts[currentMonthIndex] !== undefined) {
      const timer = setTimeout(() => {
        mainScrollRef.current?.scrollTo({
          y: monthLayouts[currentMonthIndex] + 280, // Offset to account for top headers
          animated: true,
        });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [selectedYear, monthLayouts, currentMonthIndex, currentYear]);

  function mapApiDayEntry(log: ApiDayEntry): LocalDayEntry {
    return {
      // LocalDayEntry's energy/flow/mood unions now mirror the backend enum
      // exactly, so no lossy collapsing is needed here anymore.
      energy: log.energy,
      flow: log.flow,
      mood: log.mood,
      note: log.note ?? "",
      symptoms: log.symptoms ?? [],
      updatedAt: log.date ?? new Date().toISOString(),
      sleepHours: log.sleepHours,
      waterIntake: log.waterIntake,
      weight: log.weight,
      temperature: log.temperature,
      stressLevel: log.stressLevel,
      medication: log.medication,
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
        color: colors.success,
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
          phase: getCyclePhase(cycleDay, activePeriodLength, activeCycleLength),
        };
      },
    );

    return [...blanks, ...monthDays];
  }

  function openDate(date: Date) {
    const cycleDay = getCycleDay(date, cycleStartDate, activeCycleLength);
    const phase = getCyclePhase(cycleDay, activePeriodLength, activeCycleLength);

    setSelectedDate({
      dateKey: getDateKey(date),
      dateLabel: getDateLabel(date),
      day: date.getDate(),
      phaseLabel: `${phaseStyles[phase].label} Phase · Day ${cycleDay}`,
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
        ovulationReminder,
        fertilityReminder,
        pregnancyMode,
        trackingGoal,
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
        {/* FIXED HEADER AND SELECTORS */}
        <View style={{ backgroundColor: colors.background, zIndex: 10 }}>
          {/* Personalized Greeting Header */}
          <View className="px-6 pt-4 flex-row justify-between items-center">
            <View className="flex-row items-center gap-3">
              <View
                className="h-12 w-12 rounded-full items-center justify-center border"
                style={{
                  backgroundColor: colors.primaryLight,
                  borderColor: colors.primary,
                }}
              >
                <Text
                  className="text-lg font-black"
                  style={{ color: colors.primary, fontFamily: fonts.mono }}
                >
                  {user?.firstName ? user.firstName.charAt(0).toUpperCase() : "U"}
                </Text>
              </View>
              <View>
                <Text
                  className="text-xs font-semibold"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  Hello,
                </Text>
                <Text
                  className="text-lg font-black tracking-tight"
                  style={{ color: colors.foreground, fontFamily: fonts.heading }}
                >
                  {user?.firstName || "Utkarsh"}
                </Text>
              </View>
            </View>

            <View className="flex-row gap-2">
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => { setSearchQuery(""); setSearchVisible(true); }}
                className="p-2.5 rounded-full border"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Feather name="search" size={18} color={colors.foreground} />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={openCycleSettings}
                className="p-2.5 rounded-full border"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Feather name="settings" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Month Selector */}
          <View className="px-6 mt-4 flex-row items-center justify-between">
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setSelectedYear(prev => prev - 1);
              }}
              className="p-1"
            >
              <Feather name="chevron-left" size={18} color={colors.mutedText} />
            </TouchableOpacity>

            <Text
              className="text-sm font-extrabold tracking-tight"
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </Text>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setSelectedYear(prev => prev + 1);
              }}
              className="p-1"
            >
              <Feather name="chevron-right" size={18} color={colors.mutedText} />
            </TouchableOpacity>
          </View>

          {/* Horizontal dates week line */}
          <View className="px-6 mt-3 pb-3 flex-row justify-between border-b" style={{ borderColor: colors.border }}>
            {weekDays.map((d) => {
              const dateKey = getDateKey(d);
              const dayNum = d.getDate();
              const isToday = dateKey === todayKey;
              const weekday = d.toLocaleDateString("en-US", { weekday: "short" }).substring(0, 2);

              // Cycle math for phase highlighting
              const cDay = getCycleDay(d, cycleStartDate, activeCycleLength);
              const phase = getCyclePhase(cDay, activePeriodLength, activeCycleLength);

              const isPeriod = phase === "period";
              const isFertile = cDay >= ovulationDayPivot - 5 && cDay <= ovulationDayPivot + 1;

              return (
                <TouchableOpacity
                  key={dateKey}
                  activeOpacity={0.8}
                  onPress={() => openDate(d)}
                  className="items-center"
                >
                  <Text
                    className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    {weekday}
                  </Text>
                  <View
                    className={`h-9 w-9 items-center justify-center rounded-full ${
                      isToday
                        ? ""
                        : isPeriod
                        ? "border-2 border-dashed"
                        : isFertile
                        ? "border border-dotted"
                        : "border border-transparent"
                    }`}
                    style={{
                      backgroundColor: isToday ? colors.primary : "transparent",
                      borderColor: isToday
                        ? "transparent"
                        : isPeriod
                        ? colors.rose
                        : isFertile
                        ? colors.success
                        : "transparent",
                    }}
                  >
                    <Text
                      className="text-xs font-extrabold"
                      style={{
                        color: isToday
                          ? colors.buttonText
                          : isPeriod
                          ? colors.rose
                          : colors.foreground,
                        fontFamily: fonts.body,
                      }}
                    >
                      {dayNum}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* SCROLLABLE BODY */}
        <ScrollView
          ref={mainScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 140 }}
        >

          {/* Circular progress tracker ("todays log in circle") */}
          <View className="items-center justify-center mt-7">
            <View style={{ position: "relative", width: 200, height: 200 }}>
              <Svg width={200} height={200} viewBox="0 0 100 100">
                <Circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke={colors.surfaceStrong}
                  strokeWidth={4.5}
                />
                <Circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke={colors.primary}
                  strokeWidth={4.5}
                  strokeLinecap="round"
                  strokeDasharray={`${(cycleDay / activeCycleLength) * 276} 276`}
                  transform="rotate(-90 50 50)"
                />
              </Svg>

              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  justifyContent: "center",
                  alignItems: "center",
                  paddingHorizontal: 28,
                  paddingVertical: 20,
                }}
              >
                <View
                  className="p-1.5 rounded-lg mb-1.5"
                  style={{ backgroundColor: colors.primaryLight }}
                >
                  <Ionicons name="water" size={16} color={colors.primary} />
                </View>
                <Text
                  numberOfLines={1}
                  className="font-black uppercase tracking-wider text-center"
                  style={{
                    fontSize: 9,
                    color: colors.mutedText,
                    fontFamily: fonts.body,
                    width: "100%",
                  }}
                >
                  {currentPhase === "period"
                    ? "PERIOD DAY"
                    : currentPhase === "ovulation"
                    ? "OVULATION"
                    : cycleDay >= activePeriodLength + 1 && cycleDay < ovulationDayPivot - 5
                    ? "OVULATION IN"
                    : "PERIOD IN"}
                </Text>
                <Text
                  numberOfLines={1}
                  className="font-black text-center mt-0.5"
                  style={{
                    fontSize: 22,
                    color: colors.foreground,
                    fontFamily: fonts.heading,
                    width: "100%",
                  }}
                >
                  {currentPhase === "period"
                    ? `${cycleDay}`
                    : currentPhase === "ovulation"
                    ? "Today"
                    : cycleDay >= activePeriodLength + 1 && cycleDay < ovulationDayPivot - 5
                    ? `${Math.max(1, ovulationDayPivot - 5 - cycleDay)} Days`
                    : `${nextPeriodDaysAway} Days`}
                </Text>
                <Text
                  numberOfLines={2}
                  className="font-bold text-center mt-1"
                  style={{
                    fontSize: 8.5,
                    lineHeight: 12,
                    color: currentPhase === "ovulation" || (cycleDay >= ovulationDayPivot - 5 && cycleDay <= ovulationDayPivot)
                      ? colors.success
                      : colors.mutedText,
                    fontFamily: fonts.body,
                    width: "100%",
                  }}
                >
                  {currentPhase === "ovulation" || (cycleDay >= ovulationDayPivot - 5 && cycleDay <= ovulationDayPivot)
                    ? "High chance\nto get pregnant"
                    : "Lower chance\nto get pregnant"}
                </Text>
              </View>
            </View>
          </View>

          {/* Three Stats Cards Row */}
          <View className="px-6 mt-7 flex-row justify-between gap-3">
            {[
              { label: "Days logged", val: `${loggedDays}` },
              { label: "Period length", val: `${activePeriodLength} days` },
              { label: "Health score", val: `${treeHealth}%` },
            ].map((stat) => (
              <View
                key={stat.label}
                className="flex-1 rounded-2xl border p-3.5 items-center justify-center"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Text
                  className="text-base font-black"
                  style={{ color: colors.foreground, fontFamily: fonts.mono }}
                >
                  {stat.val}
                </Text>
                <Text
                  className="text-[9px] font-bold uppercase tracking-wider text-center mt-1"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>

          {/* "+ Log today's entry" Button */}
          <View className="px-6 mt-5">
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={openToday}
              className="w-full rounded-2xl py-4 flex-row items-center justify-center gap-2"
              style={{
                backgroundColor: colors.primary,
              }}
            >
              <Feather name="plus" size={16} color={colors.buttonText} />
              <Text
                className="text-sm font-extrabold"
                style={{ color: colors.buttonText, fontFamily: fonts.body }}
              >
                Log today's entry
              </Text>
            </TouchableOpacity>
          </View>

          {/* Elegant Horizontal Legend Row */}
          <View className="px-6 mt-6 flex-row flex-wrap gap-2">
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
                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                >
                  {phaseStyles[key].label}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar Body Area */}
          <View className="mx-4 mt-6">
            <View className="px-2">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text
                    className="text-lg font-extrabold tracking-tight"
                    style={{ color: colors.foreground, fontFamily: fonts.heading }}
                  >
                    Calendar
                  </Text>
                </View>

                <View className="flex-row gap-2 items-center">
                  {/* Year Dropdown Picker Button */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setYearPickerVisible(true)}
                    className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      className="text-xs font-black"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                    >
                      {selectedYear}
                    </Text>
                    <Feather name="chevron-down" size={12} color={colors.mutedText} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.82}
                    className="rounded-full border px-3 py-1.5"
                    onPress={openToday}
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      className="text-xs font-black"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      Today
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

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
                      style={{ color: colors.foreground, fontFamily: fonts.heading }}
                    >
                      {selectedYear}
                    </Text>
                    <Text
                      className="mt-0.5 text-[11px] font-bold"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      Period dates are shown in {isDark ? "blush" : "coral"}
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
                      style={{ color: colors.mutedText, width: `${100 / 7}%`, fontFamily: fonts.body }}
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
                      onLayout={(e) => {
                        const y = e.nativeEvent.layout.y;
                        setMonthLayouts((prev) => {
                          if (prev[monthIndex] === y) return prev;
                          return { ...prev, [monthIndex]: y };
                        });
                      }}
                    >
                      <Text
                        className="mb-4 text-center text-sm font-black"
                        style={{ color: colors.foreground, fontFamily: fonts.heading }}
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
                            cell.cycleDay >= ovulationDayPivot - 5 &&
                            cell.cycleDay <= ovulationDayPivot + 1;
                          const isOvulationPeak =
                            cell.cycleDay === ovulationDayPivot;
                          
                          const dayTextColor = isSelected
                            ? colors.buttonText
                            : isPeriodDay
                              ? colors.primary
                              : isFertileDay
                                ? colors.success
                                : isToday
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
                                  backgroundColor: isSelected
                                    ? colors.primary
                                    : isPeriodDay
                                      ? colors.primaryLight
                                      : "transparent",
                                  borderColor: isSelected
                                    ? colors.primary
                                    : isToday
                                      ? colors.primary
                                      : isPeriodDay
                                        ? colors.primary
                                        : isOvulationPeak
                                          ? colors.success
                                          : "transparent",
                                  borderStyle:
                                    !isSelected && !isPeriodDay && (isToday || isOvulationPeak)
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
                                  style={{ color: dayTextColor, fontFamily: fonts.mono }}
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
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Year Picker Dropdown Modal */}
      <Modal
        visible={yearPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setYearPickerVisible(false)}
      >
        <Pressable
          className="flex-1 justify-center items-center"
          style={{ backgroundColor: colors.overlay }}
          onPress={() => setYearPickerVisible(false)}
        >
          <View
            className="w-[260px] p-4 rounded-3xl border"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              ...getShadow(colors, isDark),
            }}
          >
            <Text
              className="text-center font-extrabold mb-3 text-base"
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              Select Year
            </Text>
            {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
              <TouchableOpacity
                key={y}
                onPress={() => {
                  setSelectedYear(y);
                  setYearPickerVisible(false);
                }}
                className="py-3 px-4 rounded-xl flex-row items-center justify-between"
                style={{
                  backgroundColor: y === selectedYear ? colors.primaryLight : "transparent",
                }}
              >
                <Text
                  className="font-bold text-sm"
                  style={{
                    color: y === selectedYear ? colors.primary : colors.foreground,
                    fontFamily: fonts.body,
                  }}
                >
                  {y}
                </Text>
                {y === selectedYear && (
                  <Feather name="check" size={16} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Search Overlay Modal ── */}
      <Modal
        visible={searchVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSearchVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.overlay }}>
          {/* Header bar with search input */}
          <View
            style={{
              backgroundColor: colors.surface,
              paddingTop: 56,
              paddingBottom: 10,
              paddingHorizontal: 16,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Feather name="search" size={18} color={colors.mutedText} />
            <TextInput
              autoFocus
              placeholder="Search features, symptoms, phases…"
              placeholderTextColor={colors.mutedText}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{
                flex: 1,
                fontSize: 15,
                fontFamily: fonts.body,
                color: colors.foreground,
                padding: 0,
              }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Feather name="x-circle" size={18} color={colors.mutedText} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setSearchVisible(false)} style={{ paddingLeft: 4 }}>
              <Text style={{ color: colors.primary, fontFamily: fonts.body, fontWeight: "700", fontSize: 14 }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>

          {/* Results list */}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ backgroundColor: colors.background }}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {(() => {
              const q = searchQuery.toLowerCase().trim();

              const allItems: { icon: string; title: string; desc: string; action: () => void }[] = [
                {
                  icon: "droplet",
                  title: "Log today's entry",
                  desc: "Record flow, mood, symptoms and notes",
                  action: () => { setSearchVisible(false); openToday(); },
                },
                {
                  icon: "calendar",
                  title: "Period phase",
                  desc: "Days 1–5 of your cycle · heaviest flow",
                  action: () => { setSearchVisible(false); openToday(); },
                },
                {
                  icon: "sun",
                  title: "Follicular phase",
                  desc: "After period · energy rising, estrogen building",
                  action: () => { setSearchVisible(false); },
                },
                {
                  icon: "activity",
                  title: "Ovulation",
                  desc: "Peak fertility window · highest chance of pregnancy",
                  action: () => { setSearchVisible(false); },
                },
                {
                  icon: "moon",
                  title: "Luteal phase",
                  desc: "Post-ovulation · PMS symptoms may appear",
                  action: () => { setSearchVisible(false); },
                },
                {
                  icon: "thermometer",
                  title: "Cramps",
                  desc: "Log menstrual cramps as a symptom",
                  action: () => { setSearchVisible(false); openToday(); },
                },
                {
                  icon: "frown",
                  title: "Mood tracking",
                  desc: "Log your mood: happy, sad, irritable, calm…",
                  action: () => { setSearchVisible(false); openToday(); },
                },
                {
                  icon: "heart",
                  title: "Flow intensity",
                  desc: "Track light, medium, heavy or spotting flow",
                  action: () => { setSearchVisible(false); openToday(); },
                },
                {
                  icon: "zap",
                  title: "Energy level",
                  desc: "Record daily energy from low to high",
                  action: () => { setSearchVisible(false); openToday(); },
                },
                {
                  icon: "edit-3",
                  title: "Add a note",
                  desc: "Write a private journal entry for today",
                  action: () => { setSearchVisible(false); openToday(); },
                },
                {
                  icon: "settings",
                  title: "Cycle settings",
                  desc: "Edit cycle length, period length, reminders",
                  action: () => { setSearchVisible(false); openCycleSettings(); },
                },
                {
                  icon: "bar-chart-2",
                  title: "Cycle trend",
                  desc: "View cycle length history and averages",
                  action: () => { setSearchVisible(false); },
                },
                {
                  icon: "alert-circle",
                  title: "Bloating",
                  desc: "Log bloating as a symptom",
                  action: () => { setSearchVisible(false); openToday(); },
                },
                {
                  icon: "cloud",
                  title: "Headache",
                  desc: "Log headache as a symptom",
                  action: () => { setSearchVisible(false); openToday(); },
                },
                {
                  icon: "trending-up",
                  title: "Next period prediction",
                  desc: "See when your next period is expected",
                  action: () => { setSearchVisible(false); },
                },
                // App-wide features, so search can jump anywhere in the app,
                // not just cycle-tracker quick actions.
                {
                  icon: "trending-up",
                  title: "Smart Predictions",
                  desc: "Cycle forecasts, windows, and trends",
                  action: () => { setSearchVisible(false); router.push("/(app)/predictions"); },
                },
                {
                  icon: "message-circle",
                  title: "Gynecologist Consultation",
                  desc: "Private specialist booking, secure chat, video call",
                  action: () => { setSearchVisible(false); router.push("/(app)/consultation"); },
                },
                {
                  icon: "alert-triangle",
                  title: "Health Concerns",
                  desc: "Irregularities & symptoms",
                  action: () => { setSearchVisible(false); router.push("/(app)/health-issues"); },
                },
                {
                  icon: "help-circle",
                  title: "Anonymous Q&A",
                  desc: "Ask privately, expert-answered",
                  action: () => { setSearchVisible(false); router.push("/(app)/qa"); },
                },
                {
                  icon: "feather",
                  title: "Hygiene & Care",
                  desc: "Product guidance & comfort",
                  action: () => { setSearchVisible(false); router.push("/(app)/hygiene"); },
                },
                {
                  icon: "heart",
                  title: "Sexual Wellbeing",
                  desc: "Consent, intimacy & safety",
                  action: () => { setSearchVisible(false); router.push("/(app)/sexual-wellbeing"); },
                },
                {
                  icon: "wind",
                  title: "Forest",
                  desc: "Grow your focus/habit forest",
                  action: () => { setSearchVisible(false); router.push("/(app)/forest"); },
                },
                {
                  icon: "book-open",
                  title: "Blogs",
                  desc: "Articles on cycle health and care",
                  action: () => { setSearchVisible(false); router.push("/(app)/blogs"); },
                },
                {
                  icon: "play-circle",
                  title: "Videos",
                  desc: "Short videos and reels",
                  action: () => { setSearchVisible(false); router.push("/(app)/reels"); },
                },
                {
                  icon: "git-merge",
                  title: "Partner Sync",
                  desc: "Share cycle info with your partner, chat, video call",
                  action: () => { setSearchVisible(false); router.push("/(app)/partner"); },
                },
                {
                  icon: "toggle-left",
                  title: "Habits",
                  desc: "Daily habit tracking",
                  action: () => { setSearchVisible(false); router.push("/(app)/habits"); },
                },
                {
                  icon: "star",
                  title: "Period Buddy",
                  desc: "Anonymous cycle-matched peer chat & video call",
                  action: () => { setSearchVisible(false); router.push("/(app)/buddy-nomination"); },
                },
                {
                  icon: "users",
                  title: "Community",
                  desc: "Posts, discussions, and support",
                  action: () => { setSearchVisible(false); router.push("/(app)/(dashboard)/community"); },
                },
              ];

              const filtered = q.length === 0
                ? []
                : allItems.filter(
                    (item) =>
                      item.title.toLowerCase().includes(q) ||
                      item.desc.toLowerCase().includes(q),
                  );

              if (q.length === 0) {
                return (
                  <View style={{ alignItems: "center", paddingTop: 60 }}>
                    <Feather name="search" size={36} color={colors.border} />
                    <Text style={{ color: colors.mutedText, fontFamily: fonts.body, marginTop: 12, fontSize: 14 }}>
                      Start typing to search features, symptoms, phases…
                    </Text>
                  </View>
                );
              }

              if (filtered.length === 0) {
                return (
                  <View style={{ alignItems: "center", paddingTop: 60 }}>
                    <Feather name="search" size={36} color={colors.border} />
                    <Text style={{ color: colors.mutedText, fontFamily: fonts.body, marginTop: 12, fontSize: 14 }}>
                      No results for "{searchQuery}"
                    </Text>
                  </View>
                );
              }

              return (
                <>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: colors.mutedText,
                      fontFamily: fonts.body,
                      paddingHorizontal: 20,
                      paddingTop: 18,
                      paddingBottom: 8,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                    }}
                  >
                    {filtered.length} result{filtered.length === 1 ? "" : "s"}
                  </Text>
                  {filtered.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      activeOpacity={0.7}
                      onPress={item.action}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 20,
                        paddingVertical: 13,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                        backgroundColor: colors.surface,
                        marginHorizontal: 12,
                        marginTop: idx === 0 ? 0 : 4,
                        borderRadius: 14,
                        marginBottom: idx === filtered.length - 1 ? 0 : -4,
                        ...(idx === 0 ? { borderTopLeftRadius: 14, borderTopRightRadius: 14 } : {}),
                        ...(idx === filtered.length - 1 ? { borderBottomLeftRadius: 14, borderBottomRightRadius: 14, marginBottom: 4 } : {}),
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          backgroundColor: colors.primaryLight,
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 12,
                        }}
                      >
                        <Feather name={item.icon as any} size={16} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                          {item.title}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.mutedText, fontFamily: fonts.body, marginTop: 1 }} numberOfLines={1}>
                          {item.desc}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={14} color={colors.border} />
                    </TouchableOpacity>
                  ))}
                </>
              );
            })()}
          </ScrollView>
        </View>
      </Modal>

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
                    style={{ color: colors.primary, fontFamily: fonts.body }}
                  >
                    Cycle Settings
                  </Text>
                  <Text
                    className="mt-1 text-2xl font-black tracking-tight"
                    style={{ color: colors.foreground, fontFamily: fonts.heading }}
                  >
                    Set your baseline
                  </Text>
                  <Text
                    className="mt-2 text-xs font-semibold leading-5"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
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
                    style={{ color: colors.foreground, fontFamily: fonts.body }}
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
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                      value={lastPeriodStartDate}
                    />
                  </View>
                  <Text
                    className="mt-2 text-[11px] font-semibold"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
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
                          style={{ color: colors.foreground, fontFamily: fonts.body }}
                        >
                          {item.label}
                        </Text>
                        <Text
                          className="mt-1 text-[11px] font-semibold leading-4"
                          style={{ color: colors.mutedText, fontFamily: fonts.body }}
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
                            style={{ color: colors.foreground, fontFamily: fonts.mono }}
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
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        Period reminders
                      </Text>
                      <Text
                        className="mt-1 text-[11px] font-semibold leading-4"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
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
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
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
                            style={{ color: colors.foreground, fontFamily: fonts.mono }}
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

                  {/* Ovulation & Fertility Reminders */}
                  <View className="mt-4 flex-row items-center justify-between rounded-2xl border px-4 py-3" style={{ backgroundColor: colors.input, borderColor: colors.border }}>
                    <View className="flex-1">
                      <Text className="text-xs font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                        Ovulation reminders
                      </Text>
                      <Text className="mt-1 text-[11px] font-semibold leading-4" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                        Receive notifications for ovulation day.
                      </Text>
                    </View>
                    <Switch
                      onValueChange={setOvulationReminder}
                      thumbColor={ovulationReminder ? colors.buttonText : colors.mutedText}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      value={ovulationReminder}
                    />
                  </View>

                  <View className="mt-4 flex-row items-center justify-between rounded-2xl border px-4 py-3" style={{ backgroundColor: colors.input, borderColor: colors.border }}>
                    <View className="flex-1">
                      <Text className="text-xs font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                        Fertility window reminders
                      </Text>
                      <Text className="mt-1 text-[11px] font-semibold leading-4" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                        Get notified when your fertile window starts.
                      </Text>
                    </View>
                    <Switch
                      onValueChange={setFertilityReminder}
                      thumbColor={fertilityReminder ? colors.buttonText : colors.mutedText}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      value={fertilityReminder}
                    />
                  </View>

                  {/* Pregnancy Mode */}
                  <View className="mt-4 flex-row items-center justify-between rounded-2xl border px-4 py-3" style={{ backgroundColor: colors.input, borderColor: colors.border }}>
                    <View className="flex-1">
                      <Text className="text-xs font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                        Pregnancy Mode
                      </Text>
                      <Text className="mt-1 text-[11px] font-semibold leading-4" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                        Pause cycle predictions and track pregnancy.
                      </Text>
                    </View>
                    <Switch
                      onValueChange={setPregnancyMode}
                      thumbColor={pregnancyMode ? colors.buttonText : colors.mutedText}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      value={pregnancyMode}
                    />
                  </View>

                  {/* Tracking Goals */}
                  <View className="mt-4 rounded-2xl border p-4" style={{ backgroundColor: colors.input, borderColor: colors.border }}>
                    <Text className="text-xs font-bold mb-3" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                      Choose your tracking goal
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      {[
                        { id: "track_period", label: "Track Period" },
                        { id: "avoid_pregnancy", label: "Avoid Pregnancy" },
                        { id: "achieve_pregnancy", label: "Achieve Pregnancy" },
                        { id: "manage_symptoms", label: "Manage Symptoms" },
                        { id: "general_health", label: "General Health" },
                      ].map((goal) => {
                        const isSelected = trackingGoal === goal.id;
                        return (
                          <TouchableOpacity
                            key={goal.id}
                            activeOpacity={0.8}
                            onPress={() => setTrackingGoal(goal.id as any)}
                            className="rounded-full border px-3.5 py-1.5"
                            style={{
                              backgroundColor: isSelected ? colors.primary : colors.surface,
                              borderColor: isSelected ? colors.primary : colors.border,
                            }}
                          >
                            <Text
                              className="text-[11px] font-black"
                              style={{ color: isSelected ? colors.buttonText : colors.foreground, fontFamily: fonts.body }}
                            >
                              {goal.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
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
                    style={{ color: colors.danger, fontFamily: fonts.body }}
                  >
                    {settingsError}
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.9}
                className="mt-6 rounded-full py-4 flex-row items-center justify-center gap-2"
                disabled={settingsSaving}
                onPress={handleSaveCycleSettings}
                style={{
                  backgroundColor: colors.primary,
                  opacity: settingsSaving ? 0.7 : 1,
                }}
              >
                {settingsSaving ? (
                  <ActivityIndicator size="small" color={colors.buttonText} />
                ) : null}
                <Text
                  className="text-sm font-black"
                  style={{ color: colors.buttonText, fontFamily: fonts.body }}
                >
                  {settingsSaving ? "Saving Settings" : "Save Cycle Settings"}
                </Text>
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
                // Award exactly what the backend actually credited — avoid
                // double-counting with an optimistic local award.
                if (result.tokensEarned) earnTokens(result.tokensEarned);
              })
              .catch(() => {});
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
                // Award exactly what the backend actually credited — avoid
                // double-counting with an optimistic local award.
                if (result.tokensEarned) earnTokens(result.tokensEarned);
              })
              .catch(() => {});
          }
        }}
      />
    </>
  );
}
