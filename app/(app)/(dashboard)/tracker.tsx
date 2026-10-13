import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import type { DayEntry as LocalDayEntry } from "../../../components/AppState";
import { useAppState } from "../../../components/AppState";
import { useAuth } from "../../../components/auth-context";
import DayDetailsModal from "../../../components/DayDetailsModal";
import { useDataRefresh } from "../../../hooks/useDataRefresh";
import { useQuickLog } from "../../../hooks/useQuickLog";
import { useTodayKey } from "../../../hooks/useTodayKey";
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
import { isLogFocus, type LogFocus } from "../../../lib/logFocus";
import { dateFromDayKey, getDateKey, getMonthKey } from "../../../lib/format";
import { HeaderIconButton, TabHeader } from "../../../components/ScreenHeader";
import { MonthCalendar } from "../../../components/onboarding/parts";
import { SkeletonBlock } from "../../../components/Skeleton";
import { CalendarDayCell, CalendarLegend } from "../../../components/CycleCalendar";
import { getCycleDay, type DayStatus } from "../../../lib/cycleCalendar";
import { alertLogNotSaved } from "../../../lib/alert";
import { useSecureScreen } from "../../../lib/screenPrivacy";

const CYCLE_LENGTH = 28;
const CURRENT_CYCLE_DAY = 14;
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

function getMondayFirstWeekday(date: Date) {
  return (date.getDay() + 6) % 7;
}

function formatSettingsDate(value?: string) {
  if (!value) return getDateKey(new Date());
  // A stored day ("…T00:00:00.000Z") is that calendar day; going through
  // new Date() would shift it back a day west of UTC on every save.
  const parsedDate = dateFromDayKey(value);
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
  description?: string;
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
        {description ? (
          <Text
            className="mt-0.5 text-xs font-semibold leading-4"
            style={{ color: colors.mutedText, fontFamily: fonts.body }}
          >
            {description}
          </Text>
        ) : null}
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

/** Placeholder with the tracker body's shape, shown until the dashboard and
 *  predictions load, so the ring and stats never flash default values. */
function TrackerBodySkeleton() {
  const { colors, isDark } = useTheme();
  const card = { backgroundColor: colors.surface, borderRadius: 24, ...getShadow(colors, isDark) };
  return (
    <View accessibilityLabel="Loading your cycle" accessible>
      <View className="mx-6 mt-4 items-center px-5 pb-6 pt-5" style={card}>
        <SkeletonBlock width={150} height={14} />
        <SkeletonBlock width={200} height={200} radius={100} style={{ marginTop: 16 }} />
        <View className="mt-5 w-full flex-row" style={{ gap: 12 }}>
          <SkeletonBlock width="48%" height={48} radius={16} style={{ flex: 1 }} />
          <SkeletonBlock width="48%" height={48} radius={16} style={{ flex: 1 }} />
        </View>
      </View>
      <View className="mx-6 mt-4 p-5" style={card}>
        <SkeletonBlock width={140} height={16} />
        <SkeletonBlock height={260} radius={16} style={{ marginTop: 16 }} />
      </View>
    </View>
  );
}

const RING_SIZE = 196;
const daysLabel = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
// In the 100×100 viewBox the ring is drawn in.
const RING_RADIUS = 43;
const RING_STROKE_WIDTH = 7;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Read-only ring showing where today sits in the current cycle. */
function CycleRing({
  activeCycleLength,
  activePeriodLength,
  ovulationDayPivot,
  cycleDay,
  nextPeriodDaysAway,
  nextPeriodDate,
  fertilityReliable,
}: {
  activeCycleLength: number;
  activePeriodLength: number;
  ovulationDayPivot: number;
  cycleDay: number;
  nextPeriodDaysAway: number;
  /** Already formatted ("Nov 10"), or undefined before predictions load. */
  nextPeriodDate?: string;
  /** False when cycles are too irregular for a calendar-based fertile window. */
  fertilityReliable: boolean;
}) {
  const { colors, fonts } = useTheme();
  const displayDay = cycleDay;
  const displayPhase = getCyclePhase(
    displayDay,
    activePeriodLength,
    activeCycleLength,
  );
  // Progress arc in the current phase's colour, solid.
  const ringColor = {
    period: colors.primary,
    follicular: colors.accentText,
    ovulation: colors.secondary,
    luteal: colors.warning,
  }[displayPhase];
  // Text-safe version of the phase colour (mint and lavender are too pale
  // to read as text on a light surface).
  const labelColor = {
    period: colors.primaryDark,
    follicular: colors.accentText,
    ovulation: colors.info,
    luteal: colors.warning,
  }[displayPhase];
  // Only ever says when fertility is likely high. The other days get no
  // label: a calendar estimate can't promise a day is low-risk.
  const isHighFertility =
    fertilityReliable &&
    (displayPhase === "ovulation" ||
      (displayDay >= ovulationDayPivot - 5 && displayDay <= ovulationDayPivot));

  const handleFraction = Math.min(displayDay / activeCycleLength, 1);
  const handleAngleRad = (handleFraction * 360 - 90) * (Math.PI / 180);
  const scale = RING_SIZE / 100;
  const handleLeft = (50 + RING_RADIUS * Math.cos(handleAngleRad)) * scale;
  const handleTop = (50 + RING_RADIUS * Math.sin(handleAngleRad)) * scale;
  // The estimated fertile window (5 days before ovulation through the day
  // after) as a soft lavender band on the track.
  const fertileStart = (ovulationDayPivot - 6) / activeCycleLength;
  const fertileLength = (7 / activeCycleLength) * RING_CIRCUMFERENCE;

  return (
    <View
      accessible
      accessibilityLabel={`Cycle day ${displayDay} of ${activeCycleLength}`}
      style={{ position: "relative", width: RING_SIZE, height: RING_SIZE }}
    >
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox="0 0 100 100">
        <Circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke={colors.primaryLight} strokeWidth={RING_STROKE_WIDTH} />
        {fertilityReliable ? (
          <Circle
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            stroke={colors.secondaryLight}
            strokeWidth={RING_STROKE_WIDTH}
            strokeDasharray={`${fertileLength} ${RING_CIRCUMFERENCE}`}
            strokeDashoffset={-fertileStart * RING_CIRCUMFERENCE}
            transform="rotate(-90 50 50)"
          />
        ) : null}
        <Circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          stroke={ringColor}
          strokeWidth={RING_STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={`${handleFraction * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          transform="rotate(-90 50 50)"
        />
      </Svg>

      {/* Marker for today's position in the cycle */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: handleLeft - 10,
          top: handleTop - 10,
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: colors.surface,
          borderWidth: 4,
          borderColor: ringColor,
        }}
      />

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
          gap: 2,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ color: labelColor, fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 1.2, fontFamily: fonts.body }}
        >
          {displayPhase === "period"
            ? "PERIOD"
            : displayPhase === "ovulation"
              ? "OVULATION"
              : displayDay >= activePeriodLength + 1 && displayDay < ovulationDayPivot - 5
                ? "FERTILE IN"
                : "PERIOD IN"}
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={{ color: colors.foreground, fontSize: 36, lineHeight: 44, fontWeight: "700", letterSpacing: -0.5, fontFamily: fonts.heading }}
        >
          {displayPhase === "period"
            ? `Day ${displayDay}`
            : displayPhase === "ovulation"
              ? "Today"
              : displayDay >= activePeriodLength + 1 && displayDay < ovulationDayPivot - 5
                ? daysLabel(Math.max(1, ovulationDayPivot - 5 - displayDay))
                : nextPeriodDaysAway <= 0
                  ? "Today"
                  : daysLabel(nextPeriodDaysAway)}
        </Text>
        {isHighFertility ? (
          <Text numberOfLines={1} style={{ color: colors.success, fontSize: 12, lineHeight: 16, fontWeight: "700", fontFamily: fonts.body }}>
            High fertility
          </Text>
        ) : nextPeriodDate && displayPhase === "period" ? (
          <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 12, lineHeight: 16, fontFamily: fonts.body }}>
            {`Next period ${nextPeriodDate}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function Tracker() {
  useSecureScreen("tracker");
  const insets = useSafeAreaInsets();
  // "Log period" logs today in one tap, "Symptoms" opens the small sheet
  // (same as Home); "All details" in the sheet opens today's full log here,
  // once the sheet has closed (useQuickLog).
  const quickLog = useQuickLog({
    toastBottom: 62 + Math.max(insets.bottom, 12) + 14,
    openFullLog: (focus) => openToday(focus),
  });
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  // Home's "Symptoms"/"Mood" quick actions deep-link here with ?log=today to
  // auto-open today's day-log modal (that's where symptoms & mood are logged).
  const { log: logParam, focus: focusParam } = useLocalSearchParams<{
    log?: string;
    focus?: string;
  }>();
  // Which day-log section Home's quick action wants us to jump to.
  const focusSection = isLogFocus(focusParam) ? focusParam : undefined;
  const [selectedDate, setSelectedDate] = useState<SelectedDate | null>(null);
  const [dayDetailsVisible, setDayDetailsVisible] = useState(false);
  // Section the day-log modal should scroll to when opened via a quick action.
  const [modalFocusSection, setModalFocusSection] = useState<LogFocus | undefined>(undefined);
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

  const { updateUser } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [predictions, setPredictions] = useState<Predictions | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
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

  // Anchor the whole calendar (past AND future months) on the backend's
  // history-aware prediction, so future period days project from the most
  // recent *actual* logged period start — not the stale onboarding
  // lastPeriodStartDate. This is why shifting your latest period by a day now
  // moves next month, the month after, and so on. Falls back to the configured
  // settings date only until predictions load / when there's no history.
  const cycleStartDate = useMemo(() => {
    if (predictions?.currentPeriodStartDateISO) {
      return dateFromDayKey(predictions.currentPeriodStartDateISO);
    }
    if (cycleSettings?.lastPeriodStartDate) {
      return dateFromDayKey(cycleSettings.lastPeriodStartDate);
    }
    return addDays(new Date(), -(CURRENT_CYCLE_DAY - 1));
  }, [predictions, cycleSettings]);
  const todayKey = useTodayKey();

  const calendarMonths = useMemo(
    () =>
      Array.from(
        { length: 12 },
        (_, index) => new Date(selectedYear, index, 1),
      ),
    [selectedYear],
  );

  const { dayEntries, dayNotes, earnTokens, saveDayEntry, removeDayEntry } = useAppState();
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
    const start = dateFromDayKey(startISO);
    const windowEnd = addDays(start, activePeriodLength - 1);
    const actualStart = dateFromDayKey(actualStartISO);
    const actualEnd = dateFromDayKey(actualEndISO);
    if (actualStart < start || actualStart > windowEnd) return null; // stale/projected
    return { start, windowEnd, actualEnd };
  }, [predictions, activePeriodLength]);

  // Predictions only apply going forward. Past days must keep whatever was
  // (or wasn't) logged — re-anchoring on a newly logged period must NOT
  // retroactively repaint old months. So the dashed "predicted period"
  // highlight is shown only for today and future dates.
  // Derived from todayKey, not frozen at mount: the tracker tab stays mounted,
  // so a mount-time value would still be yesterday after midnight.
  const todayStart = useMemo(() => {
    const [y, m, d] = todayKey.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [todayKey]);

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

  function shiftMonth(delta: -1 | 1) {
    const target = PAGER_MONTHS[pagerIndexOf(selectedYear, selectedMonthIndex) + delta];
    if (!target) return;
    setSelectedYear(target.getFullYear());
    setSelectedMonthIndex(target.getMonth());
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

  // Key for the day cells, one fixed row (components/CycleCalendar.tsx).
  const phaseLegendRow = <CalendarLegend />;

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
  const openCalendarDay = useCallback((st: DayStatus) => openDateRef.current(st.date), []);
  // This week (Monday first) for the strip under the header — same cells as the calendar.
  const weekCells = useMemo<CalendarCell[]>(() => {
    const today = new Date();
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - getMondayFirstWeekday(today));
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const cycleDay = getCycleDay(date, cycleStartDate, activeCycleLength);
      return {
        cycleDay,
        date,
        dateKey: getDateKey(date),
        day: date.getDate(),
        kind: "day" as const,
        key: `week-${getDateKey(date)}`,
        phase: getCyclePhase(cycleDay, activePeriodLength, activeCycleLength),
      };
    });
  }, [cycleStartDate, activeCycleLength, activePeriodLength]);

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
    const isPeriod = cell.phase === "period";
    // Predicted highlight is forward-looking only, and never pads past the
    // actually-logged current period.
    const isPredictedPeriod =
      isPeriod && !isLogged && !isPhantomPeriodTail(cell.date) && startOfDay(cell.date) >= todayStart;

    const status: DayStatus = {
      date: cell.date,
      dateKey: cell.dateKey,
      day: cell.day,
      cycleDay: cell.cycleDay,
      phase: cell.phase,
      isToday,
      isLogged,
      hasFlow: hasFlowLog,
      isPredictedPeriod,
      isFertile: isFertileDay,
      isOvulation: isOvulationPeak,
    };
    return (
      <CalendarDayCell
        key={cell.key}
        s={status}
        selected={isSelected}
        palette={phaseStyles}
        height={CAL_CELL}
        onPress={openCalendarDay}
      />
    );
  }, [selectedDate?.dateKey, todayKey, dayEntries, remoteDayEntries, dayNotes, phaseStyles, ovulationDayPivot, isPhantomPeriodTail, todayStart, openCalendarDay]);

  function openDate(date: Date) {
    // Future days can't be logged; the calendar cells are disabled too.
    if (getDateKey(date) > getDateKey(new Date())) return;
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
  // Latest openDate for the memoised day cells.
  const openDateRef = useRef(openDate);
  openDateRef.current = openDate;
  const renderMonthPage = useCallback(
    ({ item }: { item: Date }) => (
      <CalendarMonthPage monthDate={item} width={calendarWidth} buildDays={buildCalendarDays} renderDay={renderCalendarDay} />
    ),
    [calendarWidth, buildCalendarDays, renderCalendarDay],
  );

  function openToday(focus?: LogFocus) {
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
      setSettingsError("Pick the day your last period started.");
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
          <TabHeader
            title="Tracker"
            subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
            right={
              <>
                <HeaderIconButton
                  icon="search"
                  accessibilityLabel="Search"
                  onPress={() => {
                    setSearchQuery("");
                    setSearchVisible(true);
                  }}
                />

                <HeaderIconButton icon="settings-outline" accessibilityLabel="Cycle settings" onPress={openCycleSettings} />
              </>
            }
          />
          {/* This week */}
          <View className="flex-row mt-3" style={{ paddingHorizontal: 12 }}>
            {WEEKDAY_LABELS.map((label, index) => (
              <Text
                key={`wk-label-${index}`}
                style={{ width: `${100 / 7}%`, textAlign: "center", color: colors.mutedText, fontSize: 12.5, fontWeight: "700", fontFamily: fonts.body }}
              >
                {label}
              </Text>
            ))}
          </View>
          <View className="flex-row pb-2" style={{ paddingHorizontal: 12 }}>
            {isDashboardLoading
              ? weekCells.map((cell) => (
                  <View key={cell.key} style={{ width: `${100 / 7}%`, height: CAL_CELL, alignItems: "center", justifyContent: "center" }}>
                    <SkeletonBlock width={38} height={38} radius={19} />
                  </View>
                ))
              : weekCells.map(renderCalendarDay)}
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
          {isDashboardLoading ? (
            <TrackerBodySkeleton />
          ) : (
            <>
            {/* Today · Cycle day N — surface card framing the ring */}
            <View
              className="mx-6 mt-4 items-center"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 24,
                padding: 20,
                gap: 18,
                ...getShadow(colors, isDark),
              }}
            >
              <Text style={{ color: colors.mutedText, fontSize: 13, lineHeight: 18, fontWeight: "500", fontFamily: fonts.body }}>
                {`Today · Cycle day ${cycleDay} of ${activeCycleLength}`}
              </Text>

              <View className="items-center justify-center">
                <CycleRing
                  activeCycleLength={activeCycleLength}
                  activePeriodLength={activePeriodLength}
                  ovulationDayPivot={ovulationDayPivot}
                  cycleDay={cycleDay}
                  nextPeriodDaysAway={nextPeriodDaysAway}
                  nextPeriodDate={predictions?.nextPeriodDate}
                  fertilityReliable={predictions?.ovulationReliable !== false}
                />
              </View>

              {/* "Log period" / "Symptoms" quick-entry buttons */}
              <View className="w-full flex-row" style={{ gap: 10 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => void quickLog.logPeriodNow()}
                  accessibilityRole="button"
                  accessibilityLabel={quickLog.periodLoggedToday ? "Period logged today. Change flow" : "Log period for today"}
                  className="flex-1 flex-row items-center justify-center"
                  style={{
                    height: 48,
                    borderRadius: 16,
                    gap: 8,
                    backgroundColor: colors.primary,
                    shadowColor: colors.primary,
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.28,
                    shadowRadius: 14,
                    elevation: 4,
                  }}
                >
                  <Feather name={quickLog.periodLoggedToday ? "check" : "plus"} size={18} color={colors.buttonText} />
                  <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontSize: 14, fontWeight: "700", color: colors.buttonText, fontFamily: fonts.body }}>
                    {quickLog.periodLoggedToday ? "Period logged" : "Log period"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => void quickLog.openSheet("symptoms")}
                  accessibilityRole="button"
                  className="flex-1 flex-row items-center justify-center border"
                  style={{ height: 48, borderRadius: 16, gap: 8, backgroundColor: colors.surface, borderColor: colors.border }}
                >
                  <Feather name="activity" size={18} color={colors.primary} />
                  <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                    Log symptoms
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Calendar — one month at a time, swiped horizontally. */}
            <View
              className="mx-6 mt-4"
              style={{ backgroundColor: colors.surface, borderRadius: 24, paddingTop: 20, paddingBottom: 14, ...getShadow(colors, isDark) }}
            >
              <View className="flex-row items-center px-5" style={{ gap: 8 }}>
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
                    style={{ flexShrink: 1, color: colors.foreground, fontSize: 17, lineHeight: 24, fontWeight: "700", fontFamily: fonts.heading }}
                  >
                    {MONTH_NAMES[selectedMonthIndex]}
                    <Text style={{ color: colors.mutedText, fontWeight: "400" }}>{` ${selectedYear}`}</Text>
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
                {([-1, 1] as const).map((delta) => (
                  <TouchableOpacity
                    key={delta}
                    activeOpacity={0.7}
                    onPress={() => shiftMonth(delta)}
                    accessibilityRole="button"
                    accessibilityLabel={delta < 0 ? "Previous month" : "Next month"}
                    hitSlop={6}
                    className="items-center justify-center rounded-full border"
                    style={{ width: 32, height: 32, borderColor: colors.border, backgroundColor: colors.surface }}
                  >
                    <Ionicons name={delta < 0 ? "chevron-back" : "chevron-forward"} size={16} color={colors.foreground} />
                  </TouchableOpacity>
                ))}
              </View>

              <View className="px-5 mt-3">{phaseLegendRow}</View>

              <View className="flex-row px-3 mt-4 mb-1">
                {WEEKDAY_LABELS.map((day, index) => (
                  <Text
                    key={`${day}-${index}`}
                    className="text-center"
                    style={{ width: `${100 / 7}%`, color: colors.mutedText, fontSize: 12.5, fontWeight: "700", fontFamily: fonts.body }}
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
            </>
          )}
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
                  desc: "After your period · energy rising",
                  action: () => {
                    setSearchVisible(false);
                  },
                },
                {
                  icon: "activity",
                  title: "Ovulation",
                  desc: "Peak fertility window",
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
                  desc: "Book a specialist, chat or video call",
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
                  desc: "Share your cycle with your partner",
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
                  desc: "Chat with someone on a similar cycle",
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
                      fontSize: 12.5,
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
                            fontSize: 12.5,
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
              contentContainerStyle={{ padding: 24, paddingBottom: Math.max(insets.bottom, 12) + 20 }}
            >
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                  <Text
                    className="text-[12px] font-black uppercase tracking-widest"
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
                <SettingsSectionCard title="Last period started">
                  <MonthCalendar
                    selectedKey={lastPeriodStartDate}
                    highlightLength={Number.parseInt(periodLengthInput, 10) || 5}
                    minDate={addDays(new Date(), -365)}
                    maxDate={new Date()}
                    onSelect={(dateKey) => {
                      setSettingsError("");
                      setLastPeriodStartDate(dateKey);
                    }}
                  />
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
                            className="text-xs font-black"
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
                      label="Ovulation reminders"
                      onValueChange={setOvulationReminder}
                      value={ovulationReminder}
                    />

                    <SettingsToggleRow
                      label="Fertility window reminders"
                      onValueChange={setFertilityReminder}
                      value={fertilityReminder}
                    />

                    {/* Pregnancy Mode — kept here, below Fertility reminders */}
                    <SettingsToggleRow
                      description="Pauses period and fertility reminders."
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
                replace: true,
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
              .catch(alertLogNotSaved);
          }
        }}
        onClearEntry={async () => {
          if (!selectedDate) return;
          const { dateKey } = selectedDate;
          const result = await cycleApi.deleteLog(dateKey);
          removeDayEntry(dateKey);
          setRemoteDayEntries(({ [dateKey]: _removed, ...rest }) => rest);
          // Mirrors the backend taking back the +5 "new log" credit.
          if (result.deleted) earnTokens(-5);
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
              .catch(alertLogNotSaved);
          }
        }}
      />
      {quickLog.overlays}
    </>
  );
}
