import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import type { DayEntry as LocalDayEntry } from "../../../components/AppState";
import { useAppState } from "../../../components/AppState";
import { useAuth } from "../../../components/auth-context";
import DayDetailsModal from "../../../components/DayDetailsModal";
import { useTheme } from "../../../components/theme";
import { getShadow, getSoftTints } from "../../../components/ui-tokens";
import {
  authApi,
  cycleApi,
  type DayEntry as ApiDayEntry,
  type CycleSettings,
  type DashboardSummary,
  type Predictions,
} from "../../../lib/api";
import { getCyclePhase, type CyclePhase } from "../../../lib/cycle";

const CYCLE_LENGTH = 28;
const CURRENT_CYCLE_DAY = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

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

function getMondayFirstWeekday(date: Date) {
  return (date.getDay() + 6) % 7;
}

function formatSettingsDate(value?: string) {
  if (!value) return getDateKey(new Date());
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return value.slice(0, 10);
  return getDateKey(parsedDate);
}

// Rounded, borderless card used to group the Cycle Settings sheet into
// clearly separated sections (Cycle Information, Last Period, etc).
function SettingsSectionCard({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  const { colors, fonts } = useTheme();

  return (
    <View className="rounded-3xl p-4" style={{ backgroundColor: colors.input }}>
      <Text
        className="mb-3 text-xs font-black uppercase tracking-wide"
        style={{ color: colors.primary, fontFamily: fonts.body }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

// Pill-shaped +/- stepper shared by Cycle length, Period length, and the
// "remind me before" day count.
function PillStepper({
  max,
  min,
  onChange,
  size = "md",
  suffix,
  value,
}: {
  max: number;
  min: number;
  onChange: (next: string) => void;
  size?: "md" | "sm";
  suffix: string;
  value: string;
}) {
  const { colors, fonts } = useTheme();
  const isSmall = size === "sm";
  const buttonSize = isSmall ? 32 : 36;

  function adjust(delta: -1 | 1) {
    const current = Number.parseInt(value, 10);
    const next = Math.min(
      max,
      Math.max(min, (Number.isNaN(current) ? min : current) + delta),
    );
    onChange(String(next));
  }

  return (
    <View
      className="flex-row items-center rounded-full overflow-hidden"
      style={{ backgroundColor: colors.surface }}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        className="items-center justify-center"
        onPress={() => adjust(-1)}
        style={{ height: buttonSize, width: buttonSize }}
      >
        <Feather
          name="minus"
          size={isSmall ? 13 : 14}
          color={colors.foreground}
        />
      </TouchableOpacity>
      <View
        className="items-center justify-center"
        style={{
          height: buttonSize,
          minWidth: isSmall ? 66 : 74,
          paddingHorizontal: isSmall ? 8 : 12,
        }}
      >
        <Text
          className={isSmall ? "text-xs font-black" : "text-sm font-black"}
          style={{ color: colors.foreground, fontFamily: fonts.mono }}
        >
          {value} {suffix}
        </Text>
      </View>
      <TouchableOpacity
        activeOpacity={0.8}
        className="items-center justify-center"
        onPress={() => adjust(1)}
        style={{ height: buttonSize, width: buttonSize }}
      >
        <Feather
          name="plus"
          size={isSmall ? 13 : 14}
          color={colors.foreground}
        />
      </TouchableOpacity>
    </View>
  );
}

// Row with a label/description on the left and a Switch on the right, used
// for every toggle in the Notifications card.
function SettingsToggleRow({
  description,
  label,
  onValueChange,
  value,
}: {
  description: string;
  label: string;
  onValueChange: (next: boolean) => void;
  value: boolean;
}) {
  const { colors, fonts } = useTheme();

  return (
    <View className="flex-row items-center justify-between gap-4">
      <View className="flex-1">
        <Text
          className="text-xs font-bold"
          style={{ color: colors.foreground, fontFamily: fonts.body }}
        >
          {label}
        </Text>
        <Text
          className="mt-0.5 text-[11px] font-semibold leading-4"
          style={{ color: colors.mutedText, fontFamily: fonts.body }}
        >
          {description}
        </Text>
      </View>
      <Switch
        onValueChange={onValueChange}
        thumbColor={value ? colors.buttonText : colors.mutedText}
        trackColor={{ false: colors.border, true: colors.primary }}
        value={value}
      />
    </View>
  );
}

const RING_SIZE = 200;
const RING_RADIUS = 44;
const RING_STROKE_WIDTH = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function RingScrubber({
  activeCycleLength,
  activePeriodLength,
  ovulationDayPivot,
  cycleDay,
  previewCycleDay,
  setPreviewCycleDay,
  nextPeriodDaysAway,
}: {
  activeCycleLength: number;
  activePeriodLength: number;
  ovulationDayPivot: number;
  cycleDay: number;
  previewCycleDay: number | null;
  setPreviewCycleDay: (day: number | null) => void;
  nextPeriodDaysAway: number;
}) {
  const { colors, isDark, fonts } = useTheme();
  const displayDay = previewCycleDay ?? cycleDay;
  const displayPhase = getCyclePhase(
    displayDay,
    activePeriodLength,
    activeCycleLength,
  );
  // The progress arc is a clean single-hue gradient tinted by the current
  // cycle phase (light → full via stopOpacity), so it reads as one cohesive
  // color instead of the muddy pink→lavender→mint hero mix it used before.
  const ringColor = {
    period: colors.rose,
    follicular: colors.accent,
    ovulation: colors.secondary,
    luteal: colors.warning,
  }[displayPhase];
  const isHighFertility =
    displayPhase === "ovulation" ||
    (displayDay >= ovulationDayPivot - 5 && displayDay <= ovulationDayPivot);

  const panResponder = useMemo(() => {
    // Touch coords arrive in the 200x200 real-pixel view; the ring geometry
    // is defined in the SVG's 100x100 viewBox, hence the /2 scale-down.
    function dayFromTouch(locationX: number, locationY: number) {
      const dx = locationX / 2 - 50;
      const dy = locationY / 2 - 50;
      const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
      const fraction = ((((angleDeg + 90) % 360) + 360) % 360) / 360;
      const day = Math.round(fraction * activeCycleLength) || activeCycleLength;
      return Math.min(activeCycleLength, Math.max(1, day));
    }

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) =>
        setPreviewCycleDay(
          dayFromTouch(
            event.nativeEvent.locationX,
            event.nativeEvent.locationY,
          ),
        ),
      onPanResponderMove: (event) =>
        setPreviewCycleDay(
          dayFromTouch(
            event.nativeEvent.locationX,
            event.nativeEvent.locationY,
          ),
        ),
    });
  }, [activeCycleLength, setPreviewCycleDay]);

  const handleFraction = displayDay / activeCycleLength;
  const handleAngleRad = (handleFraction * 360 - 90) * (Math.PI / 180);
  const handleLeft = (50 + RING_RADIUS * Math.cos(handleAngleRad)) * 2;
  const handleTop = (50 + RING_RADIUS * Math.sin(handleAngleRad)) * 2;

  return (
    <View
      style={{ position: "relative", width: RING_SIZE, height: RING_SIZE }}
      {...panResponder.panHandlers}
    >
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox="0 0 100 100">
        <Defs>
          <SvgGradient id="cycleRingGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={ringColor} stopOpacity={0.5} />
            <Stop offset="1" stopColor={ringColor} stopOpacity={1} />
          </SvgGradient>
        </Defs>
        <Circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          stroke={colors.surfaceStrong}
          strokeWidth={RING_STROKE_WIDTH}
        />
        <Circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          stroke="url(#cycleRingGradient)"
          strokeWidth={RING_STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={`${handleFraction * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          transform="rotate(-90 50 50)"
        />
      </Svg>

      {/* Draggable handle marking the currently previewed cycle day */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: handleLeft - 11,
          top: handleTop - 11,
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: colors.primary,
          borderWidth: 3,
          borderColor: colors.buttonText,
          alignItems: "center",
          justifyContent: "center",
          ...getShadow(colors, isDark),
        }}
      >
        <MaterialCommunityIcons
          name="drag"
          size={10}
          color={colors.buttonText}
        />
      </View>

      <View
        pointerEvents="none"
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
          {displayPhase === "period"
            ? "PERIOD DAY"
            : displayPhase === "ovulation"
              ? "OVULATION"
              : displayDay >= activePeriodLength + 1 &&
                  displayDay < ovulationDayPivot - 5
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
          {displayPhase === "period"
            ? `${displayDay}`
            : displayPhase === "ovulation" && displayDay === cycleDay
              ? "Today"
              : displayDay >= activePeriodLength + 1 &&
                  displayDay < ovulationDayPivot - 5
                ? `${Math.max(1, ovulationDayPivot - 5 - displayDay)} Days`
                : displayDay === cycleDay
                  ? `${nextPeriodDaysAway} Days`
                  : `Day ${displayDay}`}
        </Text>
        <Text
          numberOfLines={2}
          className="font-bold text-center mt-1"
          style={{
            fontSize: 8.5,
            lineHeight: 12,
            color: isHighFertility ? colors.success : colors.mutedText,
            fontFamily: fonts.body,
            width: "100%",
          }}
        >
          {isHighFertility
            ? "High chance\nto get pregnant"
            : "Lower chance\nto get pregnant"}
        </Text>
      </View>
    </View>
  );
}

export default function Tracker() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  // Home's "Symptoms"/"Mood" quick actions deep-link here with ?log=today to
  // auto-open today's day-log modal (that's where symptoms & mood are logged).
  const { log: logParam, focus: focusParam } = useLocalSearchParams<{
    log?: string;
    focus?: string;
  }>();
  // Which day-log section Home's quick action wants us to jump to.
  const focusSection =
    focusParam === "flow" || focusParam === "symptoms" || focusParam === "mood"
      ? focusParam
      : undefined;
  const [selectedDate, setSelectedDate] = useState<SelectedDate | null>(null);
  const [dayDetailsVisible, setDayDetailsVisible] = useState(false);
  // Section the day-log modal should scroll to when opened via a quick action.
  const [modalFocusSection, setModalFocusSection] = useState<
    "flow" | "symptoms" | "mood" | undefined
  >(undefined);
  const [selectedYear, setSelectedYear] = useState(() =>
    new Date().getFullYear(),
  );
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(() =>
    new Date().getMonth(),
  );
  const [yearPickerVisible, setYearPickerVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const mainScrollRef = React.useRef<ScrollView>(null);
  const [monthLayouts, setMonthLayouts] = useState<Record<number, number>>({});
  const [cycleSettings, setCycleSettings] = useState<CycleSettings | null>(
    null,
  );
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [lastPeriodStartDate, setLastPeriodStartDate] = useState(
    getDateKey(new Date()),
  );
  const [cycleLengthInput, setCycleLengthInput] = useState(
    String(CYCLE_LENGTH),
  );
  const [periodLengthInput, setPeriodLengthInput] = useState("5");
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderDaysBeforeInput, setReminderDaysBeforeInput] = useState("2");
  const [ovulationReminder, setOvulationReminder] = useState(false);
  const [fertilityReminder, setFertilityReminder] = useState(false);
  const [pregnancyMode, setPregnancyMode] = useState(false);
  const [trackingGoal, setTrackingGoal] =
    useState<CycleSettings["trackingGoal"]>("track_period");
  const [remoteDayEntries, setRemoteDayEntries] = useState<
    Record<string, LocalDayEntry>
  >({});
  const softTints = getSoftTints(colors);

  const { user, updateUser } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [predictions, setPredictions] = useState<Predictions | null>(null);
  const [, setIsDashboardLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const [dashboardSummary, cyclePredictions] = await Promise.all([
        authApi.getDashboard(),
        cycleApi.getPredictions(),
      ]);
      setDashboard(dashboardSummary);
      setPredictions(cyclePredictions);
      if (dashboardSummary.user) {
        updateUser(dashboardSummary.user);
      }
    } catch (err) {
      console.warn(
        "Failed to load dashboard/predictions data in tracker:",
        err,
      );
    } finally {
      setIsDashboardLoading(false);
    }
  }, [updateUser]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const loggedDays = Math.max(dashboard?.trackedDays ?? 0, 0);
  const cycleDay = Math.max(
    predictions?.currentCycleDay ??
      dashboard?.predictions?.currentCycleDay ??
      1,
    1,
  );
  const nextPeriodDaysAway =
    predictions?.nextPeriodDaysAway !== undefined
      ? predictions.nextPeriodDaysAway
      : Math.max(1, (cycleSettings?.cycleLength ?? CYCLE_LENGTH) - cycleDay);
  const treeHealth =
    dashboard?.forestHealth ?? Math.min(100, Math.max(45, 55 + loggedDays * 6));

  // Lets the user drag the ring handle to preview any day of the cycle
  // instead of only ever showing today. `null` means "showing today".
  const [previewCycleDay, setPreviewCycleDay] = useState<number | null>(null);
  const isPreviewingRing =
    previewCycleDay !== null && previewCycleDay !== cycleDay;

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

  const loadSettings = useCallback(async () => {
    try {
      const settings = await cycleApi.getSettings();
      setCycleSettings(settings);
    } catch {
      setCycleSettings(null);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    setLastPeriodStartDate(
      formatSettingsDate(cycleSettings?.lastPeriodStartDate),
    );
    setCycleLengthInput(String(cycleSettings?.cycleLength ?? CYCLE_LENGTH));
    setPeriodLengthInput(String(cycleSettings?.periodLength ?? 5));
    setRemindersEnabled(cycleSettings?.remindersEnabled ?? true);
    setReminderDaysBeforeInput(String(cycleSettings?.reminderDaysBefore ?? 2));
    setOvulationReminder(cycleSettings?.ovulationReminder ?? false);
    setFertilityReminder(cycleSettings?.fertilityReminder ?? false);
    setPregnancyMode(cycleSettings?.pregnancyMode ?? false);
    setTrackingGoal(cycleSettings?.trackingGoal ?? "track_period");
  }, [cycleSettings]);

  const loadYearLogs = useCallback(async () => {
    try {
      const results = await Promise.allSettled(
        calendarMonths.map((month) =>
          cycleApi.getMonthLogs(getMonthKey(month)),
        ),
      );

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
      setRemoteDayEntries({});
    }
  }, [calendarMonths]);

  useEffect(() => {
    loadYearLogs();
  }, [loadYearLogs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadDashboard(), loadSettings(), loadYearLogs()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard, loadSettings, loadYearLogs]);

  // Scrolls the stacked 12-month calendar to whichever month the "Month
  // Selector" chevrons are pointing at (defaults to the real current month
  // on first load).
  useEffect(() => {
    if (monthLayouts[selectedMonthIndex] !== undefined) {
      const timer = setTimeout(() => {
        mainScrollRef.current?.scrollTo({
          y: monthLayouts[selectedMonthIndex] + 280, // Offset to account for top headers
          animated: true,
        });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [selectedMonthIndex, selectedYear, monthLayouts]);

  function changeSelectedMonth(direction: 1 | -1) {
    setSelectedMonthIndex((prevMonth) => {
      let nextMonth = prevMonth + direction;
      if (nextMonth < 0) {
        nextMonth = 11;
        setSelectedYear((prevYear) => prevYear - 1);
      } else if (nextMonth > 11) {
        nextMonth = 0;
        setSelectedYear((prevYear) => prevYear + 1);
      }
      return nextMonth;
    });
  }

  function mapApiDayEntry(log: ApiDayEntry): LocalDayEntry {
    return {
      // LocalDayEntry's energy/flow/mood unions now mirror the backend enum
      // exactly, so no lossy collapsing is needed here anymore.
      energy: log.energy,
      flow: log.flow,
      mood: log.mood,
      moods: log.moods,
      isIntimate: log.isIntimate ?? false,
      note: log.note ?? "",
      symptoms: log.symptoms ?? [],
      updatedAt: log.date ?? new Date().toISOString(),
      sleepHours: log.sleepHours,
      waterIntake: log.waterIntake,
      weight: log.weight,
      temperature: log.temperature,
      stressLevel: log.stressLevel,
      medication: log.medication,
      digestion: log.digestion,
      digestions: log.digestions,
      skin: log.skin,
      skins: log.skins,
      discharge: log.discharge,
      exercise: log.exercise,
    };
  }

  // Canonical 4-phase palette — one distinct color per cycle phase, reused
  // everywhere a day/phase is shown (week strip, month grid, legend, modal)
  // so the calendar always reads as the same 4-color phase map.
  const phaseStyles = useMemo(
    () => ({
      period: {
        color: colors.rose,
        bg: softTints.rose,
        label: "Period",
      },
      follicular: {
        color: colors.accent,
        bg: softTints.mint,
        label: "Follicular",
      },
      ovulation: {
        color: colors.secondary,
        bg: softTints.lavender,
        label: "Ovulation",
      },
      luteal: {
        color: colors.warning,
        bg: softTints.amber,
        label: "Luteal",
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
    const phase = getCyclePhase(
      cycleDay,
      activePeriodLength,
      activeCycleLength,
    );

    setSelectedDate({
      dateKey: getDateKey(date),
      dateLabel: getDateLabel(date),
      day: date.getDate(),
      phaseLabel: `${phaseStyles[phase].label} Phase · Day ${cycleDay}`,
    });
    setDayDetailsVisible(true);
  }

  function openToday(focus?: "flow" | "symptoms" | "mood") {
    setModalFocusSection(focus);
    const today = new Date();
    setSelectedYear(today.getFullYear());
    openDate(today);
  }

  // Auto-open today's log when arriving from Home's Log period/Symptoms/Mood
  // shortcuts, jumping to the section that matches the tapped quick action.
  useEffect(() => {
    if (logParam === "today") openToday(focusSection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logParam, focusSection]);

  function openCycleSettings() {
    setSettingsError("");
    setSettingsVisible(true);
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
      reminderDaysBefore > 10
    ) {
      setSettingsError("Reminder timing should be between 0 and 10 days.");
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
                  {user?.firstName
                    ? user.firstName.charAt(0).toUpperCase()
                    : "U"}
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
                  style={{
                    color: colors.foreground,
                    fontFamily: fonts.heading,
                  }}
                >
                  {user?.firstName || "Utkarsh"}
                </Text>
              </View>
            </View>

            <View className="flex-row gap-2.5">
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  setSearchQuery("");
                  setSearchVisible(true);
                }}
                className="h-11 w-11 items-center justify-center rounded-full"
                style={{
                  backgroundColor: colors.surface,
                  ...getShadow(colors, isDark),
                }}
              >
                <Feather name="search" size={18} color={colors.foreground} />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={openCycleSettings}
                className="h-11 w-11 items-center justify-center rounded-full"
                style={{
                  backgroundColor: colors.surface,
                  ...getShadow(colors, isDark),
                }}
              >
                <Feather name="settings" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Month Selector */}
          <View className="px-6 mt-5 flex-row items-center justify-center gap-3">
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => changeSelectedMonth(-1)}
              className="p-1.5"
            >
              <Feather name="chevron-left" size={20} color={colors.mutedText} />
            </TouchableOpacity>

            <Text
              className="text-base font-black tracking-tight"
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              {new Date(selectedYear, selectedMonthIndex, 1).toLocaleDateString(
                "en-US",
                {
                  month: "long",
                  year: "numeric",
                },
              )}
            </Text>

            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => changeSelectedMonth(1)}
              className="p-1.5"
            >
              <Feather
                name="chevron-right"
                size={20}
                color={colors.mutedText}
              />
            </TouchableOpacity>
          </View>

          {/* Horizontal dates week line */}
          <View
            className="px-6 mt-3 pb-3 flex-row justify-between border-b"
            style={{ borderColor: colors.border }}
          >
            {weekDays.map((d) => {
              const dateKey = getDateKey(d);
              const dayNum = d.getDate();
              const isToday = dateKey === todayKey;
              const weekday = d
                .toLocaleDateString("en-US", { weekday: "short" })
                .substring(0, 2);

              // Every day is colored by its actual cycle phase (period /
              // follicular / ovulation / luteal) via phaseStyles, same
              // palette as the full calendar grid and legend below. Icons
              // layer on top to call out logged flow vs predicted peaks.
              const cDay = getCycleDay(d, cycleStartDate, activeCycleLength);
              const phase = getCyclePhase(
                cDay,
                activePeriodLength,
                activeCycleLength,
              );
              const style = phaseStyles[phase];

              const entry =
                dayEntries[dateKey] ?? remoteDayEntries[dateKey];
              const hasFlowLog = Boolean(entry?.flow && entry.flow !== "none");
              const hasLog = Boolean(
                entry?.note?.trim() ||
                entry?.symptoms?.length ||
                entry?.flow ||
                entry?.mood ||
                entry?.energy ||
                dayNotes[dateKey]?.trim(),
              );
              const isPredictedPeriod = phase === "period" && !hasLog;
              const isOvulationPeakDay = cDay === ovulationDayPivot;
              const isFertile =
                cDay >= ovulationDayPivot - 5 && cDay <= ovulationDayPivot + 1;

              const markerIcon = hasFlowLog
                ? "water"
                : isOvulationPeakDay
                  ? "egg"
                  : isFertile
                    ? "dna"
                    : null;

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
                    className="h-10 w-10 items-center justify-center rounded-2xl relative"
                    style={{
                      // Logged day = solid filled; predicted (unlogged) period
                      // day = dashed outline only.
                      backgroundColor: isToday
                        ? colors.primary
                        : hasLog
                          ? style.bg
                          : "transparent",
                      borderColor: isToday ? colors.primary : style.color,
                      borderStyle: isPredictedPeriod && !isToday ? "dashed" : "solid",
                      borderWidth: isToday || hasLog || isPredictedPeriod ? 1.5 : 0,
                    }}
                  >
                    <Text
                      className="text-xs font-extrabold"
                      style={{
                        color: isToday
                          ? colors.buttonText
                          : phase === "period"
                            ? style.color
                            : colors.foreground,
                        fontFamily: fonts.body,
                      }}
                    >
                      {dayNum}
                    </Text>
                    {markerIcon && !isToday ? (
                      <MaterialCommunityIcons
                        name={markerIcon}
                        size={9}
                        color={style.color}
                        style={{ position: "absolute", bottom: 2 }}
                      />
                    ) : !isToday && phase !== "period" ? (
                      <View
                        className="absolute bottom-1.5 h-1 w-1 rounded-full"
                        style={{ backgroundColor: style.color, opacity: 0.55 }}
                      />
                    ) : null}
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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {/* Today · Cycle day N — surface card framing the ring scrubber */}
          <View
            className="mx-6 mt-6 items-center rounded-3xl px-5 pb-6 pt-5"
            style={{
              backgroundColor: colors.surface,
              ...getShadow(colors, isDark),
            }}
          >
            <Text
              className="text-xs font-extrabold uppercase tracking-wider"
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              Today · Cycle day {cycleDay}
            </Text>

          {/* Circular progress tracker — drag the handle to preview any cycle day */}
          <View className="items-center justify-center mt-3">
            <RingScrubber
              activeCycleLength={activeCycleLength}
              activePeriodLength={activePeriodLength}
              ovulationDayPivot={ovulationDayPivot}
              cycleDay={cycleDay}
              previewCycleDay={previewCycleDay}
              setPreviewCycleDay={setPreviewCycleDay}
              nextPeriodDaysAway={nextPeriodDaysAway}
            />
            {isPreviewingRing && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setPreviewCycleDay(null)}
                className="mt-3 flex-row items-center gap-1.5 rounded-full border px-3.5 py-1.5"
                style={{
                  backgroundColor: colors.surfaceSoft,
                  borderColor: colors.border,
                }}
              >
                <Feather name="rotate-ccw" size={12} color={colors.primary} />
                <Text
                  className="text-[11px] font-bold"
                  style={{ color: colors.primary, fontFamily: fonts.body }}
                >
                  Back to today
                </Text>
              </TouchableOpacity>
            )}
          </View>

            <Text
              className="mt-4 text-xs font-semibold text-center"
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              {loggedDays > 0
                ? "Keep it up — how are you feeling today?"
                : "No entries yet — how are you feeling?"}
            </Text>

            {/* "Log period" / "Symptoms" quick-entry buttons */}
            <View className="mt-4 w-full flex-row gap-3">
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => openToday("flow")}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-3.5"
                style={{ backgroundColor: colors.primary }}
              >
                <Feather name="plus" size={15} color={colors.buttonText} />
                <Text
                  className="text-sm font-extrabold"
                  style={{ color: colors.buttonText, fontFamily: fonts.body }}
                >
                  Log period
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => openToday("symptoms")}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-3.5"
                style={{
                  backgroundColor: "transparent",
                  borderColor: colors.border,
                }}
              >
                <Feather name="edit-3" size={15} color={colors.foreground} />
                <Text
                  className="text-sm font-extrabold"
                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                >
                  Symptoms
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Three Stats Cards Row */}
          <View className="px-6 mt-6 flex-row justify-between gap-3">
            {[
              { label: "Days logged", val: `${loggedDays}` },
              { label: "Period length", val: `${activePeriodLength} days` },
              { label: "Health score", val: `${treeHealth}%` },
            ].map((stat) => (
              <View
                key={stat.label}
                className="flex-1 rounded-2xl p-3.5 items-center justify-center"
                style={{
                  backgroundColor: colors.surface,
                  ...getShadow(colors, isDark),
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

          {/* Calendar Body Area */}
          <View className="mx-4 mt-6">
            <View
              className="overflow-hidden rounded-[28px] border"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                ...getShadow(colors, isDark),
              }}
            >
              <View className="px-5 pb-3 pt-5">
                <View className="flex-row items-center justify-between">
                  <Text
                    className="text-lg font-extrabold tracking-tight"
                    style={{
                      color: colors.foreground,
                      fontFamily: fonts.heading,
                    }}
                  >
                    Calendar
                  </Text>

                  {/* Year Dropdown Picker Button */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setYearPickerVisible(true)}
                    className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border"
                    style={{
                      backgroundColor: colors.surfaceSoft,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      className="text-xs font-black"
                      style={{
                        color: colors.foreground,
                        fontFamily: fonts.body,
                      }}
                    >
                      {selectedYear}
                    </Text>
                    <Feather
                      name="chevron-down"
                      size={12}
                      color={colors.mutedText}
                    />
                  </TouchableOpacity>
                </View>
                {/* The single calendar legend — one chip per cycle phase,
                    colored from phaseStyles so it always matches the day cells. */}
                <View className="mt-2 flex-row items-center flex-wrap gap-x-4 gap-y-1.5">
                  {(
                    [
                      { phase: "period", icon: "water" },
                      { phase: "follicular", icon: "sprout" },
                      { phase: "ovulation", icon: "egg" },
                      { phase: "luteal", icon: "moon-waning-crescent" },
                    ] as const
                  ).map(({ phase, icon }) => (
                    <View key={phase} className="flex-row items-center gap-1.5">
                      <View
                        className="h-4 w-4 rounded-full items-center justify-center"
                        style={{ backgroundColor: phaseStyles[phase].color }}
                      >
                        <MaterialCommunityIcons
                          name={icon}
                          size={9}
                          color={colors.buttonText}
                        />
                      </View>
                      <Text
                        className="text-[10px] font-bold"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
                      >
                        {phaseStyles[phase].label}
                      </Text>
                    </View>
                  ))}
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
                      style={{
                        color: colors.mutedText,
                        width: `${100 / 7}%`,
                        fontFamily: fonts.body,
                      }}
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
                      className={
                        monthIndex === 0 ? "pt-5" : "mt-5 border-t pt-5"
                      }
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
                        style={{
                          color: colors.foreground,
                          fontFamily: fonts.heading,
                        }}
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
                                style={{ height: 46, width: `${100 / 7}%` }}
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
                          const isFertileDay =
                            cell.cycleDay >= ovulationDayPivot - 5 &&
                            cell.cycleDay <= ovulationDayPivot + 1;
                          const isOvulationPeak =
                            cell.cycleDay === ovulationDayPivot;

                          // Every day is tinted by its actual cycle phase
                          // (period/follicular/ovulation/luteal) — the same
                          // 4-color palette as the legend below. A solid
                          // border + dot means the day has a real logged
                          // entry; a dashed border on a predicted highlight
                          // day (period start, ovulation peak) means it's
                          // algorithm-predicted, not yet confirmed by input.
                          const style = phaseStyles[cell.phase];
                          const markerIcon = hasFlowLog
                            ? "water"
                            : isOvulationPeak
                              ? "egg"
                              : isFertileDay
                                ? "dna"
                                : null;
                          // Logged vs predicted: a day the user actually logged
                          // is rendered as a SOLID FILLED pill (confirmed); a
                          // predicted period day they haven't logged yet shows
                          // as a DASHED OUTLINE only (algorithm guess, not
                          // confirmed). Other unlogged days stay neutral with a
                          // small phase dot, the selected day is a solid primary
                          // pill, and today keeps a thin primary ring.
                          const isPeriod = cell.phase === "period";
                          const isLogged = hasLog;
                          const isPredictedPeriod = isPeriod && !isLogged;
                          const dayTextColor = isSelected
                            ? colors.buttonText
                            : isToday
                              ? colors.primary
                              : isPeriod || isLogged
                                ? style.color
                                : colors.foreground;

                          return (
                            <TouchableOpacity
                              activeOpacity={0.82}
                              className="items-center justify-center"
                              key={cell.key}
                              onPress={() => openDate(cell.date)}
                              style={{ height: 46, width: `${100 / 7}%` }}
                            >
                              <View
                                className="items-center justify-center rounded-2xl relative"
                                style={{
                                  // Filled when confirmed (logged) or period-
                                  // phase-with-a-log; transparent when it's just
                                  // a predicted period day (outline only).
                                  backgroundColor: isSelected
                                    ? colors.primary
                                    : isLogged
                                      ? style.bg
                                      : "transparent",
                                  borderColor: isToday
                                    ? colors.primary
                                    : style.color,
                                  borderStyle:
                                    isPredictedPeriod && !isToday && !isSelected
                                      ? "dashed"
                                      : "solid",
                                  borderWidth: isSelected
                                    ? 0
                                    : isToday || isLogged || isPredictedPeriod
                                      ? 1.5
                                      : 0,
                                  height: 38,
                                  width: 36,
                                }}
                              >
                                <Text
                                  className="text-xs font-black"
                                  style={{ color: dayTextColor, fontFamily: fonts.mono }}
                                >
                                  {cell.day}
                                </Text>
                                {/* Phase / log indicator: a logged or peak day
                                    shows its marker icon, every other day a
                                    small phase-colored dot. */}
                                {markerIcon ? (
                                  <MaterialCommunityIcons
                                    name={markerIcon}
                                    size={9}
                                    color={isSelected ? colors.buttonText : style.color}
                                    style={{ position: "absolute", bottom: 2 }}
                                  />
                                ) : !isSelected && !isPeriod ? (
                                  <View
                                    className="absolute bottom-1.5 h-1 w-1 rounded-full"
                                    style={{ backgroundColor: style.color, opacity: hasLog ? 1 : 0.55 }}
                                  />
                                ) : null}
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
                  backgroundColor:
                    y === selectedYear ? colors.primaryLight : "transparent",
                }}
              >
                <Text
                  className="font-bold text-sm"
                  style={{
                    color:
                      y === selectedYear ? colors.primary : colors.foreground,
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
            <TouchableOpacity
              onPress={() => setSearchVisible(false)}
              style={{ paddingLeft: 4 }}
            >
              <Text
                style={{
                  color: colors.primary,
                  fontFamily: fonts.body,
                  fontWeight: "700",
                  fontSize: 14,
                }}
              >
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

              const allItems: {
                icon: string;
                title: string;
                desc: string;
                action: () => void;
              }[] = [
                {
                  icon: "droplet",
                  title: "Log today's entry",
                  desc: "Record flow, mood, symptoms and notes",
                  action: () => {
                    setSearchVisible(false);
                    openToday();
                  },
                },
                {
                  icon: "calendar",
                  title: "Period phase",
                  desc: "Days 1–5 of your cycle · heaviest flow",
                  action: () => {
                    setSearchVisible(false);
                    openToday();
                  },
                },
                {
                  icon: "sun",
                  title: "Follicular phase",
                  desc: "After period · energy rising, estrogen building",
                  action: () => {
                    setSearchVisible(false);
                  },
                },
                {
                  icon: "activity",
                  title: "Ovulation",
                  desc: "Peak fertility window · highest chance of pregnancy",
                  action: () => {
                    setSearchVisible(false);
                  },
                },
                {
                  icon: "moon",
                  title: "Luteal phase",
                  desc: "Post-ovulation · PMS symptoms may appear",
                  action: () => {
                    setSearchVisible(false);
                  },
                },
                {
                  icon: "thermometer",
                  title: "Cramps",
                  desc: "Log menstrual cramps as a symptom",
                  action: () => {
                    setSearchVisible(false);
                    openToday();
                  },
                },
                {
                  icon: "frown",
                  title: "Mood tracking",
                  desc: "Log your mood: happy, sad, irritable, calm…",
                  action: () => {
                    setSearchVisible(false);
                    openToday();
                  },
                },
                {
                  icon: "heart",
                  title: "Flow intensity",
                  desc: "Track light, medium, heavy or spotting flow",
                  action: () => {
                    setSearchVisible(false);
                    openToday();
                  },
                },
                {
                  icon: "zap",
                  title: "Energy level",
                  desc: "Record daily energy from low to high",
                  action: () => {
                    setSearchVisible(false);
                    openToday();
                  },
                },
                {
                  icon: "edit-3",
                  title: "Add a note",
                  desc: "Write a private journal entry for today",
                  action: () => {
                    setSearchVisible(false);
                    openToday();
                  },
                },
                {
                  icon: "settings",
                  title: "Cycle settings",
                  desc: "Edit cycle length, period length, reminders",
                  action: () => {
                    setSearchVisible(false);
                    openCycleSettings();
                  },
                },
                {
                  icon: "bar-chart-2",
                  title: "Cycle trend",
                  desc: "View cycle length history and averages",
                  action: () => {
                    setSearchVisible(false);
                  },
                },
                {
                  icon: "alert-circle",
                  title: "Bloating",
                  desc: "Log bloating as a symptom",
                  action: () => {
                    setSearchVisible(false);
                    openToday();
                  },
                },
                {
                  icon: "cloud",
                  title: "Headache",
                  desc: "Log headache as a symptom",
                  action: () => {
                    setSearchVisible(false);
                    openToday();
                  },
                },
                {
                  icon: "trending-up",
                  title: "Next period prediction",
                  desc: "See when your next period is expected",
                  action: () => {
                    setSearchVisible(false);
                  },
                },
                // App-wide features, so search can jump anywhere in the app,
                // not just cycle-tracker quick actions.
                {
                  icon: "trending-up",
                  title: "Smart Predictions",
                  desc: "Cycle forecasts, windows, and trends",
                  action: () => {
                    setSearchVisible(false);
                    router.push("/(app)/predictions");
                  },
                },
                {
                  icon: "message-circle",
                  title: "Gynecologist Consultation",
                  desc: "Private specialist booking, secure chat, video call",
                  action: () => {
                    setSearchVisible(false);
                    router.push("/(app)/consultation");
                  },
                },
                {
                  icon: "alert-triangle",
                  title: "Health Concerns",
                  desc: "Irregularities & symptoms",
                  action: () => {
                    setSearchVisible(false);
                    router.push("/(app)/health-issues");
                  },
                },
                {
                  icon: "help-circle",
                  title: "Anonymous Q&A",
                  desc: "Ask privately, expert-answered",
                  action: () => {
                    setSearchVisible(false);
                    router.push("/(app)/qa");
                  },
                },
                {
                  icon: "feather",
                  title: "Hygiene & Care",
                  desc: "Product guidance & comfort",
                  action: () => {
                    setSearchVisible(false);
                    router.push("/(app)/hygiene");
                  },
                },
                {
                  icon: "heart",
                  title: "Sexual Wellbeing",
                  desc: "Consent, intimacy & safety",
                  action: () => {
                    setSearchVisible(false);
                    router.push("/(app)/sexual-wellbeing");
                  },
                },
                {
                  icon: "wind",
                  title: "Forest",
                  desc: "Grow your focus/habit forest",
                  action: () => {
                    setSearchVisible(false);
                    router.push("/(app)/forest");
                  },
                },
                {
                  icon: "book-open",
                  title: "Blogs",
                  desc: "Articles on cycle health and care",
                  action: () => {
                    setSearchVisible(false);
                    router.push("/(app)/blogs");
                  },
                },
                {
                  icon: "play-circle",
                  title: "Videos",
                  desc: "Short videos and reels",
                  action: () => {
                    setSearchVisible(false);
                    router.push("/(app)/reels");
                  },
                },
                {
                  icon: "git-merge",
                  title: "Partner Sync",
                  desc: "Share cycle info with your partner, chat, video call",
                  action: () => {
                    setSearchVisible(false);
                    router.push("/(app)/partner");
                  },
                },
                {
                  icon: "toggle-left",
                  title: "Habits",
                  desc: "Daily habit tracking",
                  action: () => {
                    setSearchVisible(false);
                    router.push("/(app)/habits");
                  },
                },
                {
                  icon: "star",
                  title: "Period Buddy",
                  desc: "Anonymous cycle-matched peer chat & video call",
                  action: () => {
                    setSearchVisible(false);
                    router.push("/(app)/buddy-nomination");
                  },
                },
                {
                  icon: "users",
                  title: "Community",
                  desc: "Posts, discussions, and support",
                  action: () => {
                    setSearchVisible(false);
                    router.push("/(app)/(dashboard)/community");
                  },
                },
              ];

              const filtered =
                q.length === 0
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
                    <Text
                      style={{
                        color: colors.mutedText,
                        fontFamily: fonts.body,
                        marginTop: 12,
                        fontSize: 14,
                      }}
                    >
                      Start typing to search features, symptoms, phases…
                    </Text>
                  </View>
                );
              }

              if (filtered.length === 0) {
                return (
                  <View style={{ alignItems: "center", paddingTop: 60 }}>
                    <Feather name="search" size={36} color={colors.border} />
                    <Text
                      style={{
                        color: colors.mutedText,
                        fontFamily: fonts.body,
                        marginTop: 12,
                        fontSize: 14,
                      }}
                    >
                      No results for &quot;{searchQuery}&quot;
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
                        ...(idx === 0
                          ? {
                              borderTopLeftRadius: 14,
                              borderTopRightRadius: 14,
                            }
                          : {}),
                        ...(idx === filtered.length - 1
                          ? {
                              borderBottomLeftRadius: 14,
                              borderBottomRightRadius: 14,
                              marginBottom: 4,
                            }
                          : {}),
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
                        <Feather
                          name={item.icon as any}
                          size={16}
                          color={colors.primary}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: colors.foreground,
                            fontFamily: fonts.body,
                          }}
                        >
                          {item.title}
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            color: colors.mutedText,
                            fontFamily: fonts.body,
                            marginTop: 1,
                          }}
                          numberOfLines={1}
                        >
                          {item.desc}
                        </Text>
                      </View>
                      <Feather
                        name="chevron-right"
                        size={14}
                        color={colors.border}
                      />
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
                    style={{
                      color: colors.foreground,
                      fontFamily: fonts.heading,
                    }}
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

              <View className="mt-6" style={{ gap: 18 }}>
                {/* Cycle Information */}
                <SettingsSectionCard title="Cycle Information">
                  <View style={{ gap: 16 }}>
                    <View className="flex-row items-center justify-between gap-3">
                      <View className="flex-1">
                        <Text
                          className="text-xs font-bold"
                          style={{
                            color: colors.foreground,
                            fontFamily: fonts.body,
                          }}
                        >
                          Cycle length
                        </Text>
                        <Text
                          className="mt-0.5 text-[11px] font-semibold leading-4"
                          style={{
                            color: colors.mutedText,
                            fontFamily: fonts.body,
                          }}
                        >
                          Most cycles are usually between 24 and 35 days.
                        </Text>
                      </View>
                      <PillStepper
                        max={45}
                        min={20}
                        onChange={setCycleLengthInput}
                        suffix="days"
                        value={cycleLengthInput}
                      />
                    </View>

                    <View className="flex-row items-center justify-between gap-3">
                      <View className="flex-1">
                        <Text
                          className="text-xs font-bold"
                          style={{
                            color: colors.foreground,
                            fontFamily: fonts.body,
                          }}
                        >
                          Period length
                        </Text>
                        <Text
                          className="mt-0.5 text-[11px] font-semibold leading-4"
                          style={{
                            color: colors.mutedText,
                            fontFamily: fonts.body,
                          }}
                        >
                          This marks period phase days on your calendar.
                        </Text>
                      </View>
                      <PillStepper
                        max={10}
                        min={1}
                        onChange={setPeriodLengthInput}
                        suffix="days"
                        value={periodLengthInput}
                      />
                    </View>
                  </View>
                </SettingsSectionCard>

                {/* Last Period */}
                <SettingsSectionCard title="Last Period">
                  <Text
                    className="mb-2 text-xs font-bold"
                    style={{ color: colors.foreground, fontFamily: fonts.body }}
                  >
                    Last period start date
                  </Text>
                  <View
                    className="flex-row items-center rounded-2xl px-4 py-3.5"
                    style={{ backgroundColor: colors.surface }}
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
                      style={{
                        color: colors.foreground,
                        fontFamily: fonts.body,
                      }}
                      value={lastPeriodStartDate}
                    />
                  </View>
                  <Text
                    className="mt-2 text-[11px] font-semibold"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    Example: 2026-07-01
                  </Text>
                </SettingsSectionCard>

                {/* Tracking Goal */}
                <SettingsSectionCard title="Tracking Goal">
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
                          className="rounded-full px-3.5 py-2"
                          style={{
                            backgroundColor: isSelected
                              ? colors.primary
                              : colors.surface,
                          }}
                        >
                          <Text
                            className="text-[11px] font-black"
                            style={{
                              color: isSelected
                                ? colors.buttonText
                                : colors.foreground,
                              fontFamily: fonts.body,
                            }}
                          >
                            {goal.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </SettingsSectionCard>

                {/* Notifications */}
                <SettingsSectionCard title="Notifications">
                  <View style={{ gap: 16 }}>
                    <SettingsToggleRow
                      description="Show reminders before your expected next period."
                      label="Period reminders"
                      onValueChange={setRemindersEnabled}
                      value={remindersEnabled}
                    />

                    {remindersEnabled ? (
                      <View
                        className="flex-row items-center justify-between rounded-2xl px-4 py-3"
                        style={{ backgroundColor: colors.surface }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{
                            color: colors.foreground,
                            fontFamily: fonts.body,
                          }}
                        >
                          Remind me before
                        </Text>
                        <PillStepper
                          max={10}
                          min={0}
                          onChange={setReminderDaysBeforeInput}
                          size="sm"
                          suffix="days"
                          value={reminderDaysBeforeInput}
                        />
                      </View>
                    ) : null}

                    <SettingsToggleRow
                      description="Receive notifications for ovulation day."
                      label="Ovulation reminders"
                      onValueChange={setOvulationReminder}
                      value={ovulationReminder}
                    />

                    <SettingsToggleRow
                      description="Get notified when your fertile window starts."
                      label="Fertility window reminders"
                      onValueChange={setFertilityReminder}
                      value={fertilityReminder}
                    />

                    {/* Pregnancy Mode — kept here, below Fertility reminders */}
                    <SettingsToggleRow
                      description="Pause cycle predictions and track pregnancy."
                      label="Pregnancy Mode"
                      onValueChange={setPregnancyMode}
                      value={pregnancyMode}
                    />
                  </View>
                </SettingsSectionCard>
              </View>

              {settingsError ? (
                <View
                  className="mt-5 rounded-2xl px-4 py-3"
                  style={{ backgroundColor: colors.dangerLight }}
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
        focusSection={modalFocusSection}
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
              isIntimate: previousEntry?.isIntimate ?? false,
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
