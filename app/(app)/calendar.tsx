import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, StatusBar, StyleSheet, Text, View, type ViewToken } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DayDetailsModal from "../../components/DayDetailsModal";
import {
  MINI_HEIGHT,
  MONTH_BLOCK_HEIGHT,
  MiniMonth,
  MonthBlock,
  WeekdayHeader,
  CalendarKeyButton,
} from "../../components/CycleCalendar";
import { useTheme } from "../../components/theme";
import { useCycleCalendar } from "../../hooks/useCycleCalendar";
import { useDayLogActions } from "../../hooks/useDayLogActions";
import { dayLogSubtitle, type DayStatus } from "../../lib/cycleCalendar";
import { getDateKey } from "../../lib/format";
import { HeaderIconButton } from "../../components/ScreenHeader";
import { useContentWidth } from "../../lib/layout";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { SegmentedControl } from "../../components/SegmentedControl";

/**
 * Full-screen cycle calendar, Flo-style: a Month view (months scroll
 * vertically under a pinned weekday row) and a Year view (all 12 months as
 * small calendars; tap one to open it). Tapping a day opens the same day-log
 * sheet as the Tracker. `?view=year` opens the year view; `?month=YYYY-MM`
 * sets the month to start on.
 */

const FIRST_YEAR = 2020;
const LAST_YEAR = 2035;
const MONTHS = Array.from({ length: (LAST_YEAR - FIRST_YEAR + 1) * 12 }, (_, i) => new Date(FIRST_YEAR, i, 1));
const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
const monthIndexOf = (d: Date) => Math.min(MONTHS.length - 1, Math.max(0, (d.getFullYear() - FIRST_YEAR) * 12 + d.getMonth()));

const SIDE = 24;
const MINI_GAP = 16;
const MINI_ROW_GAP = 18;
const YEAR_TITLE = 56;
const YEAR_BLOCK_HEIGHT = YEAR_TITLE + 4 * MINI_HEIGHT + 3 * MINI_ROW_GAP + 28;

type View_ = "month" | "year";

function parseMonthParam(value?: string) {
  const m = value && /^(\d{4})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
}

export default function CalendarScreen() {
  useSecureScreen("calendar");
  const router = useRouter();
  const { colors, fonts, isDark } = useTheme();
  const width = useContentWidth();
  const params = useLocalSearchParams<{ view?: string; month?: string }>();
  const { model, entryFor, noteFor, loadYear, isDayLoaded, dayLoadFailed, ensureDayLoaded, setRemoteEntry, removeRemoteEntry, todayKey } = useCycleCalendar();
  const { save, clear, logSymptoms } = useDayLogActions({ entryFor, setRemoteEntry, removeRemoteEntry });

  const [view, setView] = useState<View_>(params.view === "year" ? "year" : "month");
  const [focusMonth, setFocusMonth] = useState(() => parseMonthParam(params.month));
  const [selected, setSelected] = useState<DayStatus | null>(null);
  const monthListRef = useRef<FlatList<Date>>(null);
  const yearListRef = useRef<FlatList<number>>(null);

  const lookups = useMemo(() => ({ model, entryFor, noteFor, todayKey }), [model, entryFor, noteFor, todayKey]);
  const miniWidth = Math.floor((width - SIDE * 2 - MINI_GAP * 2) / 3);

  // Load logs for whichever years are on screen.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;
  const loadYearRef = useRef(loadYear);
  loadYearRef.current = loadYear;
  // The month list reports what's on screen while it mounts, before it has
  // scrolled to its starting month, which can be January 2020 (index 0).
  // Until a report includes the month it was opened on, ignore them, so the
  // header and the Year view never jump years back.
  const monthListSettled = useRef(false);
  const monthListTarget = useRef(0);
  // Where each list starts, fixed while it's open. Computing it from the
  // month on screen (which changes as you scroll) made the list jump back to
  // it on every re-render.
  const [monthStartIndex, setMonthStartIndex] = useState(() => monthIndexOf(parseMonthParam(params.month)));
  const [yearStartIndex, setYearStartIndex] = useState(() =>
    Math.min(YEARS.length - 1, Math.max(0, parseMonthParam(params.month).getFullYear() - FIRST_YEAR)),
  );
  // Pin each freshly mounted list to its start once, on its first layout.
  const monthListPinned = useRef(false);
  const yearListPinned = useRef(false);
  const onMonthsViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<Date>[] }) => {
    if (!monthListSettled.current) {
      if (!viewableItems.some((v) => v.index === monthListTarget.current)) return;
      monthListSettled.current = true;
    }
    const first = viewableItems[0]?.item;
    new Set(viewableItems.map((v) => v.item.getFullYear())).forEach((y) => loadYearRef.current(y));
    if (first) setFocusMonth(first);
  }).current;
  const onYearsViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<number>[] }) => {
    viewableItems.forEach((v) => loadYearRef.current(v.item));
  }).current;

  // Future days can't be logged; the calendar cells are disabled too.
  const openDay = useCallback(
    (s: DayStatus) => {
      if (s.dateKey > getDateKey(new Date())) return;
      ensureDayLoaded(s.dateKey);
      setSelected(s);
    },
    [ensureDayLoaded],
  );
  const openMonth = useCallback((monthDate: Date) => {
    setFocusMonth(monthDate);
    monthListSettled.current = false;
    monthListPinned.current = false;
    monthListTarget.current = monthIndexOf(monthDate);
    setMonthStartIndex(monthIndexOf(monthDate));
    setView("month");
  }, []);

  const renderMonth = useCallback(
    ({ item }: { item: Date }) => <MonthBlock monthDate={item} lookups={lookups} onPressDay={openDay} />,
    [lookups, openDay],
  );
  const renderYear = useCallback(
    ({ item: year }: { item: number }) => (
      <View style={{ height: YEAR_BLOCK_HEIGHT, paddingHorizontal: SIDE }}>
        <View style={{ height: YEAR_TITLE, justifyContent: "flex-end", paddingBottom: 12 }}>
          <Text style={{ color: year === new Date().getFullYear() ? colors.primary : colors.foreground, fontSize: 22, fontWeight: "800", fontFamily: fonts.heading }}>{year}</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: MINI_GAP, rowGap: MINI_ROW_GAP }}>
          {Array.from({ length: 12 }, (_, m) => (
            <MiniMonth key={m} monthDate={MONTHS[(year - FIRST_YEAR) * 12 + m]} lookups={lookups} width={miniWidth} onPress={openMonth} />
          ))}
        </View>
      </View>
    ),
    [lookups, miniWidth, openMonth, colors, fonts],
  );

  const monthStartOffset = useMemo(() => ({ x: 0, y: monthStartIndex * MONTH_BLOCK_HEIGHT }), [monthStartIndex]);
  const yearStartOffset = useMemo(() => ({ x: 0, y: yearStartIndex * YEAR_BLOCK_HEIGHT }), [yearStartIndex]);
  const monthLayout = useCallback((_: ArrayLike<Date> | null | undefined, index: number) => ({ length: MONTH_BLOCK_HEIGHT, offset: MONTH_BLOCK_HEIGHT * index, index }), []);
  const yearLayout = useCallback((_: ArrayLike<number> | null | undefined, index: number) => ({ length: YEAR_BLOCK_HEIGHT, offset: YEAR_BLOCK_HEIGHT * index, index }), []);

  const now = new Date();
  const showingToday =
    view === "month" ? focusMonth.getFullYear() === now.getFullYear() && focusMonth.getMonth() === now.getMonth() : false;
  const goToday = () => {
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    if (view === "month") monthListRef.current?.scrollToIndex({ index: monthIndexOf(thisMonth), animated: true });
    else yearListRef.current?.scrollToIndex({ index: now.getFullYear() - FIRST_YEAR, animated: true });
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top", "bottom"]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      {/* Header */}
      <View className="flex-row items-center" style={{ paddingHorizontal: 24, paddingTop: 12, height: 56 }}>
        <HeaderIconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => router.back()} />
        <View className="flex-1 items-center">
          <SegmentedControl
            segments={[
              { key: "month", label: "Month" },
              { key: "year", label: "Year" },
            ]}
            value={view}
            onChange={(next) => {
              // The month list mounts fresh: ignore its reports until it's on the month.
              if (next === "month") {
                monthListSettled.current = false;
                monthListPinned.current = false;
                setMonthStartIndex(monthIndexOf(focusMonth));
              } else {
                yearListPinned.current = false;
                setYearStartIndex(Math.min(YEARS.length - 1, Math.max(0, focusMonth.getFullYear() - FIRST_YEAR)));
              }
              setView(next);
            }}
            height={38}
            style={{ width: 184 }}
          />
        </View>
        <HeaderIconButton icon="today-outline" accessibilityLabel="Go to today" color={colors.primary} disabled={showingToday} onPress={goToday} />
      </View>

      {view === "month" ? (
        <>
          <View style={{ paddingTop: 10, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
            <WeekdayHeader />
          </View>
          <FlatList
            key="months"
            ref={(list) => {
              monthListRef.current = list;
              // Each time the month list mounts (opening, or back from Year view).
              if (list && !monthListSettled.current) monthListTarget.current = monthStartIndex;
            }}
            data={MONTHS}
            keyExtractor={(d) => `${d.getFullYear()}-${d.getMonth()}`}
            renderItem={renderMonth}
            getItemLayout={monthLayout}
            initialScrollIndex={monthStartIndex}
            // Belt and braces for opening on the right month (Android can
            // ignore initialScrollIndex and sit on January 2020): start offset
            // at creation, then pin it once laid out.
            contentOffset={monthStartOffset}
            onLayout={() => {
              if (monthListPinned.current) return;
              monthListPinned.current = true;
              const index = monthListTarget.current;
              requestAnimationFrame(() => monthListRef.current?.scrollToOffset({ offset: index * MONTH_BLOCK_HEIGHT, animated: false }));
            }}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={5}
            showsVerticalScrollIndicator={false}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onMonthsViewable}
            contentContainerStyle={{ paddingBottom: 16 }}
          />
        </>
      ) : (
        <FlatList
          key="years"
          ref={yearListRef}
          data={YEARS}
          keyExtractor={(y) => String(y)}
          renderItem={renderYear}
          getItemLayout={yearLayout}
          initialScrollIndex={yearStartIndex}
          contentOffset={yearStartOffset}
          onLayout={() => {
            if (yearListPinned.current) return;
            yearListPinned.current = true;
            const index = yearStartIndex;
            requestAnimationFrame(() => yearListRef.current?.scrollToOffset({ offset: index * YEAR_BLOCK_HEIGHT, animated: false }));
          }}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
          showsVerticalScrollIndicator={false}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onYearsViewable}
        />
      )}

      {/* Colour key behind one quiet link, not printed over the calendar. */}
      <View style={{ paddingHorizontal: SIDE, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.background }}>
        <CalendarKeyButton variant="link" />
      </View>

      <DayDetailsModal
        visible={selected !== null}
        onClose={() => setSelected(null)}
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
        }}
        onClearEntry={async () => {
          if (selected) await clear(selected.dateKey);
        }}
        onLogSymptom={(symptoms) => {
          if (selected) logSymptoms(selected.dateKey, symptoms);
        }}
      />
    </SafeAreaView>
  );
}
