import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { useDataRefresh } from "../../../hooks/useDataRefresh";
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
import { buildCalendarModel, dayStatus, type DayStatus } from "../../../lib/cycleCalendar";
import { CalendarDayCell } from "../../../components/CycleCalendar";
import { getDateKey, getMonthKey } from "../../../lib/format";

const CYCLE_LENGTH = 28;
const CURRENT_CYCLE_DAY = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// Every month page gets 6 rows so swiping never changes the card's height.
const CAL_ROWS = 6;
const CAL_CELL = 46;
// The month pager is one continuous strip, so swiping crosses years without
// any re-centering. Only ~3 pages are ever mounted (windowSize).
const PAGER_START_YEAR = 2020;
const PAGER_END_YEAR = 2035;
const PAGER_MONTHS = Array.from(
  { length: (PAGER_END_YEAR - PAGER_START_YEAR + 1) * 12 },
  (_, i) => new Date(PAGER_START_YEAR, i, 1),
);
const pagerIndexOf = (year: number, month: number) =>
  Math.min(PAGER_MONTHS.length - 1, Math.max(0, (year - PAGER_START_YEAR) * 12 + month));

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

/**
 * One month page of the pager. Memoised so a swipe (which only changes the
 * selected month) doesn't rebuild every day cell.
 */
const CalendarMonthPage = React.memo(function CalendarMonthPage({
  monthDate,
  width,
  buildDays,
  renderDay,
}: {
  monthDate: Date;
  width: number;
  buildDays: (monthDate: Date) => CalendarCell[];
  renderDay: (cell: CalendarCell) => React.ReactNode;
}) {
  const cells = buildDays(monthDate);
  const monthKey = getMonthKey(monthDate);
  const padded: CalendarCell[] = [
    ...cells,
    ...Array.from({ length: CAL_ROWS * 7 - cells.length }, (_, i) => ({ key: `pad-${monthKey}-${i}`, kind: "blank" as const })),
  ];
  return <View style={{ width, paddingHorizontal: 12, flexDirection: "row", flexWrap: "wrap" }}>{padded.map(renderDay)}</View>;
});

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDateLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // The month pager and its measured page width.
  const monthListRef = useRef<FlatList<Date>>(null);
  const [calendarWidth, setCalendarWidth] = useState(0);
  const calendarPositioned = useRef(false);
  // Set when the user swiped to the month, so the pager isn't scrolled again.
  const monthFromSwipe = useRef(false);
  // Pager page last scrolled to, so only one-page moves animate.
  const pagerIndexRef = useRef(-1);
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
  const softTints = useMemo(() => getSoftTints(colors), [colors]);

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
    // Monday-first, like every calendar grid in the app.
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - getMondayFirstWeekday(today));

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, []);

  // Anchor the whole calendar (past AND future months) on the backend's
  // history-aware prediction, so future period days project from the most
  // recent *actual* logged period start — not the stale onboarding
  // lastPeriodStartDate. This is why shifting your latest period by a day now
  // moves next month, the month after, and so on. Falls back to the configured
  // settings date only until predictions load / when there's no history.
  const cycleStartDate = useMemo(() => {
    if (predictions?.currentPeriodStartDateISO) {
      return new Date(predictions.currentPeriodStartDateISO);
    }
    if (cycleSettings?.lastPeriodStartDate) {
      return new Date(cycleSettings.lastPeriodStartDate);
    }
    return addDays(new Date(), -(CURRENT_CYCLE_DAY - 1));
  }, [predictions, cycleSettings]);
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
  // Prefer the history-derived cycle length so future-month phase coloring
  // matches the backend prediction (median/weighted length), not the raw
  // configured value.
  const activeCycleLength =
    predictions?.cycleLength ?? cycleSettings?.cycleLength ?? CYCLE_LENGTH;
  const activePeriodLength = predictions?.periodLength ?? cycleSettings?.periodLength ?? 5;
  // Same pivot as getCyclePhase's internal "ovulationDay" — reused below to
  // size the fertile window / ovulation-peak highlight to the real cycle
  // length instead of the old hardcoded 10-16 / day-14 constants.
  const ovulationDayPivot = Math.max(
    activePeriodLength + 1,
    activeCycleLength - 13,
  );

  // The calendar paints `activePeriodLength` days as "period" from the anchor,
  // but the user's *actual* current period may be shorter than the configured
  // length. Without this, the tail days of the configured window (after the
  // real bleeding ended) show as dashed "predicted period" right after the last
  // logged day — which reads as "it's predicting a period the day after my
  // cycle ended". We use the backend's actual start/end to suppress that tail,
  // but ONLY when the current cycle was really logged (anchor sits inside this
  // cycle's period window). For a stale/projected current period — where
  // nothing was logged — the full predicted highlight is still correct.
  const currentPeriodMask = useMemo(() => {
    const startISO = predictions?.currentPeriodStartDateISO;
    const actualStartISO = predictions?.actualPeriodStartISO;
    const actualEndISO = predictions?.actualPeriodEndISO;
    if (!startISO || !actualStartISO || !actualEndISO) return null;
    const start = startOfDay(new Date(startISO));
    const windowEnd = addDays(start, activePeriodLength - 1);
    const actualStart = startOfDay(new Date(actualStartISO));
    const actualEnd = startOfDay(new Date(actualEndISO));
    if (actualStart < start || actualStart > windowEnd) return null; // stale/projected
    return { start, windowEnd, actualEnd };
  }, [predictions, activePeriodLength]);

  // Predictions only apply going forward. Past days must keep whatever was
  // (or wasn't) logged — re-anchoring on a newly logged period must NOT
  // retroactively repaint old months. So the dashed "predicted period"
  // highlight is shown only for today and future dates.
  const todayStart = useMemo(() => startOfDay(new Date()), []);

  // True for a day inside the current cycle's configured period window that
  // falls *after* the actually-logged bleeding ended — i.e. a phantom tail day.
  const isPhantomPeriodTail = useCallback(
    (date: Date) => {
      if (!currentPeriodMask) return false;
      const d = startOfDay(date);
      return (
        d > currentPeriodMask.actualEnd &&
        d >= currentPeriodMask.start &&
        d <= currentPeriodMask.windowEnd
      );
    },
    [currentPeriodMask],
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

      // Merge, don't replace: neighbouring years (and this week's strip)
      // keep their markers when the pager crosses into another year.
      setRemoteDayEntries((current) => ({ ...current, ...entries }));
    } catch {
      // keep what's already loaded
    }
  }, [calendarMonths]);

  useEffect(() => {
    loadYearLogs();
  }, [loadYearLogs]);

  // Saving a day log only patches that one calendar cell locally, but it can
  // also move predictions/phase, streak and tracked-day counts — and cycle
  // data can change from other screens while this tab stays mounted. When
  // the change was made here, refetch the summary + settings only (the cell
  // is already up to date); when catching up on return, reload the logs too.
  useDataRefresh(["cycle", "dashboard", "profile"], ({ whileFocused }) => {
    const refreshSettings = cycleApi
      .getSettings()
      .then(setCycleSettings)
      .catch(() => {});
    return Promise.all([
      loadDashboard(),
      refreshSettings,
      whileFocused ? Promise.resolve() : loadYearLogs(),
    ]);
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadDashboard(), loadSettings(), loadYearLogs()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard, loadSettings, loadYearLogs]);

  // Keeps the month pager on the selected month (chevrons, "Today", year
  // change). The first positioning is instant; later ones animate.
  useEffect(() => {
    if (!calendarWidth) return;
    const index = pagerIndexOf(selectedYear, selectedMonthIndex);
    if (monthFromSwipe.current) {
      monthFromSwipe.current = false;
      calendarPositioned.current = true;
      pagerIndexRef.current = index;
      return;
    }
    // One page (chevrons) glides; longer jumps (Today, year picker) land
    // instantly, so the swipe tracker below never sees the months in between.
    const animated = calendarPositioned.current && Math.abs(index - pagerIndexRef.current) <= 1;
    monthListRef.current?.scrollToOffset({ offset: index * calendarWidth, animated });
    calendarPositioned.current = true;
    pagerIndexRef.current = index;
  }, [selectedMonthIndex, selectedYear, calendarWidth]);

  const pagerKey = useCallback((m: Date) => getMonthKey(m), []);
  const getPagerLayout = useCallback(
    (_: ArrayLike<Date> | null | undefined, index: number) => ({ length: calendarWidth, offset: calendarWidth * index, index }),
    [calendarWidth],
  );
  // The header follows the swipe: as soon as a month page is mostly on
  // screen it becomes the selected month. (onMomentumScrollEnd alone isn't
  // reliable for a nested paging list on Android.) FlatList needs these
  // callbacks to keep one identity, so the latest state is read via a ref.
  const pagerMonthRef = useRef({ year: selectedYear, month: selectedMonthIndex });
  pagerMonthRef.current = { year: selectedYear, month: selectedMonthIndex };
  const selectPagerMonth = useRef((month: Date | undefined) => {
    if (!month) return;
    const { year, month: current } = pagerMonthRef.current;
    if (month.getFullYear() === year && month.getMonth() === current) return;
    monthFromSwipe.current = true;
    setSelectedYear(month.getFullYear());
    setSelectedMonthIndex(month.getMonth());
  }).current;
  const pagerViewability = useRef({ itemVisiblePercentThreshold: 60, minimumViewTime: 0 }).current;
  const onPagerViewable = useRef(({ viewableItems }: { viewableItems: { item: Date }[] }) =>
    selectPagerMonth(viewableItems[0]?.item),
  ).current;
  const onPagerSettled = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      if (calendarWidth) selectPagerMonth(PAGER_MONTHS[Math.round(e.nativeEvent.contentOffset.x / calendarWidth)]);
    },
    [calendarWidth, selectPagerMonth],
  );

  const calendarMonthParam = `${selectedYear}-${String(selectedMonthIndex + 1).padStart(2, "0")}`;
  const today = new Date();
  const isViewingCurrentMonth =
    selectedYear === today.getFullYear() &&
    selectedMonthIndex === today.getMonth();

  function jumpToToday() {
    setSelectedYear(today.getFullYear());
    setSelectedMonthIndex(today.getMonth());
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

  // Shared calendar model + lookups (lib/cycleCalendar) for the week strip,
  // so it paints days exactly like the calendar grids.
  const calendarModel = useMemo(() => buildCalendarModel(predictions, cycleSettings), [predictions, cycleSettings]);
  const entryFor = useCallback((dateKey: string) => dayEntries[dateKey] ?? remoteDayEntries[dateKey], [dayEntries, remoteDayEntries]);
  const noteFor = useCallback((dateKey: string) => dayNotes[dateKey], [dayNotes]);
  const currentPhase = getCyclePhase(cycleDay, activePeriodLength, activeCycleLength);

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

  // Phase key for the calendar: a small dot + label per phase, coloured from
  // phaseStyles so it always matches the day cells. Kept to one line.
  const phaseLegendRow = (
    <View className="flex-row items-center justify-between">
      {(["period", "follicular", "ovulation", "luteal"] as const).map((phase) => (
        <View key={phase} className="flex-row items-center" style={{ gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: phaseStyles[phase].color }} />
          <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 11, fontWeight: "600", fontFamily: fonts.body }}>
            {phaseStyles[phase].label}
          </Text>
        </View>
      ))}
    </View>
  );

  const buildCalendarDays = useCallback((monthDate: Date): CalendarCell[] => {
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
  }, [cycleStartDate, activeCycleLength, activePeriodLength]);

  /**
   * One day in the month grid. Soft by default: a plain number with a faint
   * phase dot. A logged day gets a soft fill in its phase colour, a predicted
   * period day a dashed rose ring, the fertile window a light lavender wash,
   * today a primary ring and the selected day a solid primary circle. Icons
   * appear only for logged flow and the ovulation peak.
   */
  const renderCalendarDay = useCallback((cell: CalendarCell) => {
    if (cell.kind === "blank") {
      return <View key={cell.key} style={{ width: `${100 / 7}%`, height: CAL_CELL }} />;
    }
    const isSelected = selectedDate?.dateKey === cell.dateKey;
    const isToday = cell.dateKey === todayKey;
    const entry = dayEntries[cell.dateKey] ?? remoteDayEntries[cell.dateKey];
    const isLogged = Boolean(
      entry?.note.trim() || entry?.symptoms.length || entry?.flow || entry?.mood || entry?.energy || dayNotes[cell.dateKey]?.trim(),
    );
    const hasFlowLog = Boolean(entry?.flow && entry.flow !== "none");
    const isOvulationPeak = cell.cycleDay === ovulationDayPivot;
    const isFertileDay = cell.cycleDay >= ovulationDayPivot - 5 && cell.cycleDay <= ovulationDayPivot + 1;
    const style = phaseStyles[cell.phase];
    const isPeriod = cell.phase === "period";
    // Predicted highlight is forward-looking only, and never pads past the
    // actually-logged current period.
    const isPredictedPeriod =
      isPeriod && !isLogged && !isPhantomPeriodTail(cell.date) && startOfDay(cell.date) >= todayStart;

    const background = isSelected
      ? colors.primary
      : isLogged
        ? style.bg
        : isFertileDay && !isPeriod
          ? /^#[0-9a-f]{6}$/i.test(colors.secondary)
            ? `${colors.secondary}24`
            : softTints.lavender
          : "transparent";
    const ring = isSelected ? null : isToday ? colors.primary : isPredictedPeriod ? colors.rose : null;
    const textColor = isSelected
      ? colors.buttonText
      : isToday
        ? colors.primary
        : isLogged || isPeriod
          ? style.color
          : colors.foreground;
    const markerIcon = hasFlowLog ? "water" : isOvulationPeak ? "egg" : null;

    return (
      <TouchableOpacity
        key={cell.key}
        activeOpacity={0.7}
        onPress={() => openDateRef.current(cell.date)}
        accessibilityRole="button"
        accessibilityLabel={`${cell.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}, ${style.label} phase${isToday ? ", today" : ""}${isLogged ? ", logged" : ""}${isPredictedPeriod ? ", predicted period" : ""}`}
        style={{ width: `${100 / 7}%`, height: CAL_CELL, alignItems: "center", justifyContent: "center" }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: background,
            borderWidth: ring ? 1.5 : 0,
            borderColor: ring ?? "transparent",
            borderStyle: isPredictedPeriod && !isToday ? "dashed" : "solid",
          }}
        >
          <Text
            style={{
              color: textColor,
              fontSize: 14,
              fontWeight: isToday || isSelected || isLogged ? "800" : "500",
              fontFamily: fonts.body,
              marginTop: markerIcon ? -4 : 0,
            }}
          >
            {cell.day}
          </Text>
          {markerIcon ? (
            <MaterialCommunityIcons
              name={markerIcon}
              size={9}
              color={isSelected ? colors.buttonText : style.color}
              style={{ position: "absolute", bottom: 4 }}
            />
          ) : !isSelected && !isPeriod && !isLogged ? (
            <View style={{ position: "absolute", bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: style.color, opacity: 0.4 }} />
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }, [selectedDate?.dateKey, todayKey, dayEntries, remoteDayEntries, dayNotes, phaseStyles, ovulationDayPivot, isPhantomPeriodTail, todayStart, colors, fonts, softTints]);

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
  const openWeekDay = (st: DayStatus) => openDate(st.date);
  // Latest openDate for the memoised day cells.
  const openDateRef = useRef(openDate);
  openDateRef.current = openDate;
  const renderMonthPage = useCallback(
    ({ item }: { item: Date }) => (
      <CalendarMonthPage monthDate={item} width={calendarWidth} buildDays={buildCalendarDays} renderDay={renderCalendarDay} />
    ),
    [calendarWidth, buildCalendarDays, renderCalendarDay],
  );

  function openToday(focus?: "flow" | "symptoms" | "mood") {
    setModalFocusSection(focus);
    const today = new Date();
    setSelectedYear(today.getFullYear());
    setSelectedMonthIndex(today.getMonth());
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
          {/* Greeting */}
          <View className="px-5 pt-4 flex-row items-center">
            <View
              className="items-center justify-center rounded-full"
              style={{ width: 44, height: 44, backgroundColor: colors.primaryLight }}
            >
              <Text style={{ color: colors.primary, fontSize: 18, fontWeight: "800", fontFamily: fonts.heading }}>
                {user?.firstName ? user.firstName.charAt(0).toUpperCase() : "U"}
              </Text>
            </View>
            <View className="flex-1" style={{ marginLeft: 12 }}>
              <Text style={{ color: colors.mutedText, fontSize: 12.5, fontWeight: "600", fontFamily: fonts.body }}>Hello,</Text>
              <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 19, fontWeight: "800", fontFamily: fonts.heading }}>
                {user?.firstName || "there"}
              </Text>
            </View>
            {(
              [
                { icon: "search" as const, label: "Search", onPress: () => { setSearchQuery(""); setSearchVisible(true); } },
                { icon: "settings" as const, label: "Cycle settings", onPress: openCycleSettings },
              ]
            ).map((b) => (
              <TouchableOpacity
                key={b.icon}
                activeOpacity={0.7}
                onPress={b.onPress}
                accessibilityRole="button"
                accessibilityLabel={b.label}
                className="items-center justify-center rounded-full"
                style={{ width: 40, height: 40, marginLeft: 8, backgroundColor: colors.surface }}
              >
                <Feather name={b.icon} size={18} color={colors.foreground} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Today + this week, painted with the same day circles as the calendar. */}
          <View className="px-5 mt-5 flex-row items-center justify-between">
            <Text style={{ color: colors.foreground, fontSize: 15.5, fontWeight: "800", fontFamily: fonts.heading }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
            </Text>
            <View
              className="flex-row items-center rounded-full"
              style={{ backgroundColor: phaseStyles[currentPhase].bg, paddingHorizontal: 10, paddingVertical: 4, gap: 5 }}
            >
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: phaseStyles[currentPhase].color }} />
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700", fontFamily: fonts.body }}>
                {`${phaseStyles[currentPhase].label} · Day ${cycleDay}`}
              </Text>
            </View>
          </View>
          <View className="flex-row mt-3" style={{ paddingHorizontal: 12 }}>
            {weekDays.map((d) => (
              <Text
                key={`wd-${getDateKey(d)}`}
                style={{ width: `${100 / 7}%`, textAlign: "center", color: colors.mutedText, fontSize: 11.5, fontWeight: "700", fontFamily: fonts.body }}
              >
                {d.toLocaleDateString("en-US", { weekday: "short" }).charAt(0)}
              </Text>
            ))}
          </View>
          <View className="flex-row pb-2" style={{ paddingHorizontal: 12 }}>
            {weekDays.map((d) => (
              <CalendarDayCell
                key={getDateKey(d)}
                s={dayStatus(d, calendarModel, entryFor, noteFor, todayKey)}
                selected={false}
                palette={phaseStyles}
                onPress={openWeekDay}
              />
            ))}
          </View>
        </View>

        {/* SCROLLABLE BODY */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          directionalLockEnabled
          contentContainerStyle={{ paddingBottom: 140 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {/* Today · Cycle day N — surface card framing the ring scrubber */}
          <View
            className="mx-5 mt-4 items-center rounded-3xl px-5 pb-6 pt-5"
            style={{
              backgroundColor: colors.surface,
              ...getShadow(colors, isDark),
            }}
          >
            <Text style={{ color: colors.mutedText, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>
              {`Today · Cycle day ${cycleDay}`}
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

          {/* Three stats */}
          <View className="mx-5 mt-4 flex-row" style={{ gap: 10 }}>
            {[
              { label: "Days logged", val: `${loggedDays}` },
              { label: "Period length", val: `${activePeriodLength} days` },
              { label: "Health score", val: `${treeHealth}%` },
            ].map((stat) => (
              <View
                key={stat.label}
                className="flex-1 items-center justify-center rounded-2xl"
                style={{ backgroundColor: colors.surface, paddingVertical: 14, paddingHorizontal: 8 }}
              >
                <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800", fontFamily: fonts.heading }}>{stat.val}</Text>
                <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 11.5, fontWeight: "600", fontFamily: fonts.body, marginTop: 2 }}>
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar — one month at a time, swiped horizontally. */}
          <View
            className="mx-5 mt-6 rounded-3xl"
            style={{ backgroundColor: colors.surface, paddingTop: 18, paddingBottom: 14, ...getShadow(colors, isDark) }}
          >
            <View className="flex-row items-center px-5">
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push({ pathname: "/(app)/calendar", params: { month: calendarMonthParam } })}
                accessibilityRole="button"
                accessibilityLabel={`${MONTH_NAMES[selectedMonthIndex]} ${selectedYear}. Open full calendar`}
                className="flex-row items-center flex-1"
                style={{ gap: 5, minWidth: 0 }}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={{ flexShrink: 1, color: colors.foreground, fontSize: 18, fontWeight: "800", fontFamily: fonts.heading }}
                >
                  {MONTH_NAMES[selectedMonthIndex]}
                  <Text style={{ color: colors.mutedText, fontWeight: "600" }}>{` ${selectedYear}`}</Text>
                </Text>
                <MaterialCommunityIcons name="calendar-month-outline" size={16} color={colors.mutedText} />
              </TouchableOpacity>

              {!isViewingCurrentMonth && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={jumpToToday}
                  accessibilityRole="button"
                  accessibilityLabel="Go to today"
                  hitSlop={6}
                  className="items-center justify-center rounded-full"
                  style={{ width: 32, height: 32, backgroundColor: colors.primaryLight }}
                >
                  <MaterialCommunityIcons name="calendar-today" size={16} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>

            <View className="px-5 mt-3">{phaseLegendRow}</View>

            <View className="flex-row px-3 mt-4 mb-1">
              {WEEKDAY_LABELS.map((day, index) => (
                <Text
                  key={`${day}-${index}`}
                  className="text-center"
                  style={{ width: `${100 / 7}%`, color: colors.mutedText, fontSize: 11.5, fontWeight: "700", fontFamily: fonts.body }}
                >
                  {day}
                </Text>
              ))}
            </View>

            {/* Swipeable months: one continuous strip, so swipes and chevrons cross years. */}
            <View onLayout={(e) => setCalendarWidth(e.nativeEvent.layout.width)} style={{ height: CAL_ROWS * CAL_CELL }}>
              {calendarWidth > 0 ? (
                <FlatList
                  ref={monthListRef}
                  data={PAGER_MONTHS}
                  keyExtractor={pagerKey}
                  horizontal
                  pagingEnabled
                  nestedScrollEnabled
                  decelerationRate="fast"
                  showsHorizontalScrollIndicator={false}
                  initialScrollIndex={pagerIndexOf(selectedYear, selectedMonthIndex)}
                  getItemLayout={getPagerLayout}
                  initialNumToRender={1}
                  maxToRenderPerBatch={2}
                  windowSize={3}
                  extraData={renderCalendarDay}
                  viewabilityConfig={pagerViewability}
                  onViewableItemsChanged={onPagerViewable}
                  onMomentumScrollEnd={onPagerSettled}
                  renderItem={renderMonthPage}
                />
              ) : null}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

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
                    router.push("/(app)/graphs-reports");
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
                    router.push("/(app)/predictions");
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
                    router.push({ params: { new: "1" }, pathname: "/(app)/qa" });
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
