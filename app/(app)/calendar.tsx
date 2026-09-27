import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, StatusBar, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, type ViewToken } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import DayDetailsModal from "../../components/DayDetailsModal";
import {
  MINI_HEIGHT,
  MONTH_BLOCK_HEIGHT,
  MiniMonth,
  MonthBlock,
  WeekdayHeader,
  fertileWash,
  usePhasePalette,
} from "../../components/CycleCalendar";
import { useTheme } from "../../components/theme";
import { useCycleCalendar } from "../../hooks/useCycleCalendar";
import { cycleApi } from "../../lib/api";
import { mapApiDayEntry, type DayStatus } from "../../lib/cycleCalendar";

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

const SIDE = 20;
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
  const router = useRouter();
  const { colors, fonts, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const palette = usePhasePalette();
  const params = useLocalSearchParams<{ view?: string; month?: string }>();
  const { model, entryFor, noteFor, loadYear, setRemoteEntry, todayKey } = useCycleCalendar();
  const { saveDayEntry, earnTokens } = useAppState();

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
  const onMonthsViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<Date>[] }) => {
    const first = viewableItems[0]?.item;
    new Set(viewableItems.map((v) => v.item.getFullYear())).forEach((y) => loadYearRef.current(y));
    if (first) setFocusMonth(first);
  }).current;
  const onYearsViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<number>[] }) => {
    viewableItems.forEach((v) => loadYearRef.current(v.item));
  }).current;

  const openDay = useCallback((s: DayStatus) => setSelected(s), []);
  const openMonth = useCallback((monthDate: Date) => {
    setFocusMonth(monthDate);
    setView("month");
  }, []);

  const renderMonth = useCallback(
    ({ item }: { item: Date }) => <MonthBlock monthDate={item} lookups={lookups} selectedKey={selected?.dateKey ?? null} onPressDay={openDay} />,
    [lookups, selected?.dateKey, openDay],
  );
  const renderYear = useCallback(
    ({ item: year }: { item: number }) => (
      <View style={{ height: YEAR_BLOCK_HEIGHT, paddingHorizontal: SIDE }}>
        <View style={{ height: YEAR_TITLE, justifyContent: "flex-end", paddingBottom: 12 }}>
          <Text style={{ color: year === new Date().getFullYear() ? colors.primary : colors.foreground, fontSize: 24, fontWeight: "900", fontFamily: fonts.heading }}>{year}</Text>
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

  const save = (dateKey: string, entry: Parameters<typeof saveDayEntry>[1]) => {
    saveDayEntry(dateKey, entry);
    cycleApi
      .saveLog({ dateKey, ...entry })
      .then((result) => {
        setRemoteEntry(dateKey, mapApiDayEntry(result.cycleLog));
        if (result.tokensEarned) earnTokens(result.tokensEarned);
      })
      .catch(() => {});
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top", "bottom"]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      {/* Header */}
      <View className="flex-row items-center" style={{ paddingHorizontal: 12, paddingTop: 8, height: 52 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" className="items-center justify-center" style={{ width: 40, height: 40 }}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View className="flex-1 items-center">
          <View className="flex-row rounded-full" style={{ backgroundColor: colors.surface, padding: 3 }}>
            {(["month", "year"] as const).map((v) => {
              const active = view === v;
              return (
                <TouchableOpacity
                  key={v}
                  onPress={() => setView(v)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  className="items-center justify-center rounded-full"
                  style={{ width: 86, height: 32, backgroundColor: active ? colors.primary : "transparent" }}
                >
                  <Text style={{ color: active ? colors.buttonText : colors.mutedText, fontSize: 13.5, fontWeight: "700", fontFamily: fonts.body }}>
                    {v === "month" ? "Month" : "Year"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <TouchableOpacity
          onPress={goToday}
          disabled={showingToday}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go to today"
          className="items-center justify-center rounded-full"
          style={{ width: 40, height: 40, opacity: showingToday ? 0.35 : 1 }}
        >
          <MaterialCommunityIcons name="calendar-today" size={21} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {view === "month" ? (
        <>
          <View style={{ paddingTop: 10, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
            <WeekdayHeader />
          </View>
          <FlatList
            key="months"
            ref={monthListRef}
            data={MONTHS}
            keyExtractor={(d) => `${d.getFullYear()}-${d.getMonth()}`}
            renderItem={renderMonth}
            getItemLayout={monthLayout}
            initialScrollIndex={monthIndexOf(focusMonth)}
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
          initialScrollIndex={Math.min(YEARS.length - 1, Math.max(0, focusMonth.getFullYear() - FIRST_YEAR))}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
          showsVerticalScrollIndicator={false}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onYearsViewable}
        />
      )}

      {/* Legend */}
      <View
        className="flex-row items-center justify-between"
        style={{ paddingHorizontal: SIDE, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.background }}
      >
        <LegendItem label="Period">
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: palette.period.color }} />
        </LegendItem>
        <LegendItem label="Predicted">
          <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.rose }} />
        </LegendItem>
        <LegendItem label="Fertile">
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: fertileWash(colors), borderWidth: 1, borderColor: palette.ovulation.color }} />
        </LegendItem>
        <LegendItem label="Ovulation">
          <MaterialCommunityIcons name="egg" size={12} color={palette.ovulation.color} />
        </LegendItem>
      </View>

      <DayDetailsModal
        visible={selected !== null}
        onClose={() => setSelected(null)}
        day={selected?.day}
        dateLabel={selected?.date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}
        phaseLabel={selected ? `${palette[selected.phase].label} Phase · Day ${selected.cycleDay}` : undefined}
        entry={selected ? entryFor(selected.dateKey) : undefined}
        details={selected ? (noteFor(selected.dateKey) ?? "") : undefined}
        onSaveEntry={(entry) => {
          if (selected) save(selected.dateKey, entry);
        }}
        onLogSymptom={(symptom) => {
          if (!selected) return;
          const prev = entryFor(selected.dateKey);
          save(selected.dateKey, {
            energy: prev?.energy,
            flow: prev?.flow,
            mood: prev?.mood,
            isIntimate: prev?.isIntimate ?? false,
            note: prev?.note ?? "",
            symptoms: Array.from(new Set([...(prev?.symptoms ?? []), symptom])),
          });
        }}
      />
    </SafeAreaView>
  );
}

function LegendItem({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors, fonts } = useTheme();
  return (
    <View className="flex-row items-center" style={{ gap: 6 }}>
      {children}
      <Text style={{ color: colors.mutedText, fontSize: 11.5, fontWeight: "600", fontFamily: fonts.body }}>{label}</Text>
    </View>
  );
}
