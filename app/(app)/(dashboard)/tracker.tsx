import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StatusBar, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import DayDetailsModal from "../../../components/DayDetailsModal";
import { LoadingErrorState } from "../../../components/LoadingErrorState";
import { HeaderIconButton, TabHeader } from "../../../components/ScreenHeader";
import { useTheme } from "../../../components/theme";
import { CycleHero } from "../../../components/tracker/CycleHero";
import { CycleSettingsSheet } from "../../../components/tracker/CycleSettingsSheet";
import { MonthPager } from "../../../components/tracker/MonthPager";
import { TrackerBodySkeleton } from "../../../components/tracker/TrackerBodySkeleton";
import { TrackerSearchModal } from "../../../components/tracker/TrackerSearchModal";
import { WeekStrip } from "../../../components/tracker/WeekStrip";
import { QuickLogButtons } from "../../../components/QuickLogButtons";
import { useDayLogActions } from "../../../hooks/useDayLogActions";
import { useQuickLog } from "../../../hooks/useQuickLog";
import { useTrackerData } from "../../../hooks/useTrackerData";
import { FEATURE_REGISTRY } from "../../../lib/appConfig";
import { dayLogSubtitle, dayStatus, getCycleDay, type DayStatus } from "../../../lib/cycleCalendar";
import { dateFromDayKey } from "../../../lib/format";
import { isLogFocus, type LogFocus } from "../../../lib/logFocus";
import { invalidateQueries } from "../../../lib/queryCache";
import { useSecureScreen } from "../../../lib/screenPrivacy";
import { runTapAction } from "../../../lib/tapAction";
import type { TrackerSearchAction } from "../../../lib/trackerSearch";

const TRACKER_QUICK_LOG = ["flow", "symptoms", "mood"] as const;

export default function Tracker() {
  useSecureScreen("tracker");
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const router = useRouter();
  // "Log period" logs today in one tap, "Symptoms"/"Mood" open the small
  // sheet (same as Home); "All details" in the sheet opens today's full log here,
  // once the sheet has closed (useQuickLog).
  const quickLog = useQuickLog({
    toastBottom: 62 + Math.max(insets.bottom, 12) + 14,
    openFullLog: (focus) => openTodayRef.current(focus),
  });
  // Home's "Symptoms"/"Mood" quick actions deep-link here with ?log=today to
  // auto-open today's day-log modal (that's where symptoms & mood are logged).
  const { log: logParam, focus: focusParam } = useLocalSearchParams<{ log?: string; focus?: string }>();
  const focusSection = isLogFocus(focusParam) ? focusParam : undefined;

  const data = useTrackerData();
  const { model, predictions, dashboard, settings, setSettings, entryFor, noteFor, todayKey, loadYear, isDayLoaded, dayLoadFailed, ensureDayLoaded } = data;
  const { save, clear, logSymptoms } = useDayLogActions(data);

  const [selected, setSelected] = useState<DayStatus | null>(null);
  const [dayDetailsVisible, setDayDetailsVisible] = useState(false);
  // Section the day-log modal should scroll to when opened via a quick action.
  const [modalFocusSection, setModalFocusSection] = useState<LogFocus | undefined>(undefined);
  const today = dateFromDayKey(todayKey);
  const [selectedYear, setSelectedYear] = useState(() => today.getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(() => today.getMonth());
  const [searchVisible, setSearchVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // The pager can cross into another year; its logs load on the way.
  useEffect(() => {
    loadYear(selectedYear);
  }, [loadYear, selectedYear]);

  const lookups = useMemo(() => ({ model, entryFor, noteFor, todayKey }), [model, entryFor, noteFor, todayKey]);

  const cycleDay = Math.max(
    predictions?.currentCycleDay ??
      dashboard?.predictions?.currentCycleDay ??
      getCycleDay(today, model.cycleStartDate, model.cycleLength),
    1,
  );
  const nextPeriodDaysAway = predictions?.nextPeriodDaysAway ?? Math.max(1, model.cycleLength - cycleDay);

  const openDay = useCallback((st: DayStatus) => {
    // Future days can't be logged; their cells are disabled too.
    if (st.isFuture) return;
    ensureDayLoaded(st.dateKey);
    setSelected(st);
    setDayDetailsVisible(true);
  }, [ensureDayLoaded]);
  const openDayFromCalendar = useCallback(
    (st: DayStatus) => {
      setModalFocusSection(undefined);
      openDay(st);
    },
    [openDay],
  );

  function openToday(focus?: LogFocus) {
    setModalFocusSection(focus);
    setSelectedYear(today.getFullYear());
    setSelectedMonthIndex(today.getMonth());
    openDay(dayStatus(today, model, entryFor, noteFor, todayKey));
  }
  const openTodayRef = useRef(openToday);
  openTodayRef.current = openToday;

  // Auto-open today's log when arriving from Home's Log period/Symptoms/Mood
  // shortcuts, jumping to the section that matches the tapped quick action.
  useEffect(() => {
    if (logParam === "today") openTodayRef.current(focusSection);
  }, [logParam, focusSection]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    invalidateQueries("cycle:");
    invalidateQueries("auth:dashboard");
    try {
      await data.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [data]);

  function onSearchAction(action: TrackerSearchAction) {
    setSearchVisible(false);
    if (action.type === "logToday") openToday(action.focus);
    else if (action.type === "settings") setSettingsVisible(true);
    else if (action.type === "route") router.push(action.route as never);
    else {
      const route = FEATURE_REGISTRY.find((f) => f.key === action.key)?.route;
      // Through the launch guard, so a locked feature shows its sheet.
      if (route) void runTapAction({ type: "route", value: route, fallbackUrl: null }, router);
    }
  }

  // Any log or settings change replays the hero's update animation: today's
  // quick logs, plus a bump for days saved from the calendar.
  const [logEdits, setLogEdits] = useState(0);
  const bumpHero = () => setLogEdits((n) => n + 1);
  const heroPulseKey = [
    logEdits,
    quickLog.periodLoggedToday,
    ...TRACKER_QUICK_LOG.map((k) => quickLog.loggedCount(k)),
    settings ? JSON.stringify(settings) : "",
  ].join("|");

  const calendarMonthParam = `${selectedYear}-${String(selectedMonthIndex + 1).padStart(2, "0")}`;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        {/* Fixed header and this week */}
        <View style={{ backgroundColor: colors.background, zIndex: 10 }}>
          <TabHeader
            title="Tracker"
            subtitle={today.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
            right={
              <>
                <HeaderIconButton icon="search" accessibilityLabel="Search" onPress={() => setSearchVisible(true)} />
                <HeaderIconButton icon="settings-outline" accessibilityLabel="Cycle settings" onPress={() => setSettingsVisible(true)} />
              </>
            }
          />
          <WeekStrip lookups={lookups} onPressDay={openDayFromCalendar} loading={data.loading} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          directionalLockEnabled
          contentContainerStyle={{ paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          <LoadingErrorState
            loading={data.loading}
            error={data.error?.message ?? null}
            offline={data.error?.offline}
            onRetry={data.reloadModel}
            skeleton={<TrackerBodySkeleton />}
          >
            {/* Today · Cycle day N and the quick-log buttons on one animated panel */}
            <CycleHero
              activeCycleLength={model.cycleLength}
              activePeriodLength={model.periodLength}
              ovulationDayPivot={model.ovulationDay}
              cycleDay={cycleDay}
              nextPeriodDaysAway={nextPeriodDaysAway}
              nextPeriodDate={predictions?.nextPeriodDate}
              fertilityReliable={predictions?.ovulationReliable !== false}
              daysLate={predictions?.isLate ? (predictions.daysLate ?? 0) : 0}
              pulseKey={heroPulseKey}
            >
              {/* Same one-tap Log period / Symptoms / Mood buttons as Home */}
              <QuickLogButtons
                keys={TRACKER_QUICK_LOG}
                periodLoggedToday={quickLog.periodLoggedToday}
                loggedCount={quickLog.loggedCount}
                onPress={quickLog.onQuickAction}
              />
            </CycleHero>

            <View style={{ height: 8 }} />

            <MonthPager
              year={selectedYear}
              month={selectedMonthIndex}
              onChangeMonth={(year, month) => {
                setSelectedYear(year);
                setSelectedMonthIndex(month);
              }}
              lookups={lookups}
             
              onPressDay={openDayFromCalendar}
              onOpenCalendar={() => router.push({ pathname: "/(app)/calendar", params: { month: calendarMonthParam } })}
            />
          </LoadingErrorState>
        </ScrollView>
      </SafeAreaView>

      <TrackerSearchModal visible={searchVisible} onClose={() => setSearchVisible(false)} onAction={onSearchAction} />

      <CycleSettingsSheet
        visible={settingsVisible}
        settings={settings}
        onClose={() => setSettingsVisible(false)}
        onSaved={setSettings}
      />

      <DayDetailsModal
        visible={dayDetailsVisible}
        focusSection={modalFocusSection}
        onClose={() => setDayDetailsVisible(false)}
        day={selected?.day}
        dateKey={selected?.dateKey}
        loaded={selected ? isDayLoaded(selected.dateKey) : true}
        loadFailed={selected ? dayLoadFailed(selected.dateKey) : false}
        onRetryLoad={() => selected && ensureDayLoaded(selected.dateKey)}
        dateLabel={selected?.date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}
        phaseLabel={selected ? dayLogSubtitle(selected) : undefined}
        entry={selected ? entryFor(selected.dateKey) : undefined}
        details={selected ? (noteFor(selected.dateKey) ?? "") : undefined}
        onSaveEntry={async (entry) => {
          if (selected) await save(selected.dateKey, entry, true);
          bumpHero();
        }}
        onClearEntry={async () => {
          if (selected) await clear(selected.dateKey);
          bumpHero();
        }}
        onLogSymptom={(symptoms) => {
          if (selected) logSymptoms(selected.dateKey, symptoms);
          bumpHero();
        }}
      />
      {quickLog.overlays}
    </>
  );
}
