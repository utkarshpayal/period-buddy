import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { CalendarDayCell, CalendarLegend, usePhasePalette, type Lookups, type PhasePalette } from "../CycleCalendar";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";
import { MONTH_NAMES, WEEKDAY_LABELS, dayStatus, monthSlots, type DayStatus } from "../../lib/cycleCalendar";
import { dateFromDayKey, getDateKey, getMonthKey } from "../../lib/format";
import { Icon } from "../Icon";

// Every month page gets 6 rows so swiping never changes the card's height.
const CAL_ROWS = 6;
export const TRACKER_CELL = 46;
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

/**
 * One month page of the pager. Memoised so a swipe (which only changes the
 * selected month) doesn't rebuild every day cell.
 */
const CalendarMonthPage = React.memo(function CalendarMonthPage({
  monthDate,
  width,
  lookups,
  palette,
  selectedKey,
  onPressDay,
}: {
  monthDate: Date;
  width: number;
  lookups: Lookups;
  palette: PhasePalette;
  selectedKey: string | null;
  onPressDay: (s: DayStatus) => void;
}) {
  const slots = useMemo(() => monthSlots(monthDate), [monthDate]);
  const { model, entryFor, noteFor, todayKey } = lookups;
  return (
    <View style={{ width, paddingHorizontal: 12, flexDirection: "row", flexWrap: "wrap" }}>
      {slots.map((date, i) =>
        date ? (
          <CalendarDayCell
            key={i}
            s={dayStatus(date, model, entryFor, noteFor, todayKey)}
            selected={selectedKey === getDateKey(date)}
            palette={palette}
            height={TRACKER_CELL}
            onPress={onPressDay}
          />
        ) : (
          <View key={i} style={{ width: `${100 / 7}%`, height: TRACKER_CELL }} />
        ),
      )}
    </View>
  );
});

/**
 * The Tracker's calendar card: month title (opens the full Calendar), a
 * "Today" pill once you've moved away, chevrons, the legend, and the months
 * swiped horizontally. The selected month is the parent's (`year`/`month`),
 * so chevrons, "Today" and swipes all go through `onChangeMonth`.
 */
export function MonthPager({
  year,
  month,
  onChangeMonth,
  lookups,
  selectedKey,
  onPressDay,
  onOpenCalendar,
}: {
  year: number;
  month: number;
  onChangeMonth: (year: number, month: number) => void;
  lookups: Lookups;
  selectedKey: string | null;
  onPressDay: (s: DayStatus) => void;
  onOpenCalendar: () => void;
}) {
  const { colors, fonts, isDark } = useTheme();
  const palette = usePhasePalette();
  const monthListRef = useRef<FlatList<Date>>(null);
  const [calendarWidth, setCalendarWidth] = useState(0);
  const calendarPositioned = useRef(false);
  // Set when the user swiped to the month, so the pager isn't scrolled again.
  const monthFromSwipe = useRef(false);
  // Pager page last scrolled to, so only one-page moves animate.
  const pagerIndexRef = useRef(-1);

  // Keeps the month pager on the selected month (chevrons, "Today", year
  // change). The first positioning is instant; later ones animate.
  useEffect(() => {
    if (!calendarWidth) return;
    const index = pagerIndexOf(year, month);
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
  }, [month, year, calendarWidth]);

  const pagerKey = useCallback((m: Date) => getMonthKey(m), []);
  const getPagerLayout = useCallback(
    (_: ArrayLike<Date> | null | undefined, index: number) => ({ length: calendarWidth, offset: calendarWidth * index, index }),
    [calendarWidth],
  );
  // The header follows the swipe: as soon as a month page is mostly on
  // screen it becomes the selected month. (onMomentumScrollEnd alone isn't
  // reliable for a nested paging list on Android.) FlatList needs these
  // callbacks to keep one identity, so the latest values are read via a ref.
  const latest = useRef({ year, month, onChangeMonth });
  latest.current = { year, month, onChangeMonth };
  const selectPagerMonth = useRef((target: Date | undefined) => {
    if (!target) return;
    const { year: currentYear, month: currentMonth, onChangeMonth: change } = latest.current;
    if (target.getFullYear() === currentYear && target.getMonth() === currentMonth) return;
    monthFromSwipe.current = true;
    change(target.getFullYear(), target.getMonth());
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

  const renderMonthPage = useCallback(
    ({ item }: { item: Date }) => (
      <CalendarMonthPage
        monthDate={item}
        width={calendarWidth}
        lookups={lookups}
        palette={palette}
        selectedKey={selectedKey}
        onPressDay={onPressDay}
      />
    ),
    [calendarWidth, lookups, palette, selectedKey, onPressDay],
  );

  const today = dateFromDayKey(lookups.todayKey);
  const isViewingCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  function shiftMonth(delta: -1 | 1) {
    const target = PAGER_MONTHS[pagerIndexOf(year, month) + delta];
    if (target) onChangeMonth(target.getFullYear(), target.getMonth());
  }

  return (
    <View
      className="mx-6 mt-4"
      style={{ backgroundColor: colors.surface, borderRadius: 24, paddingTop: 20, paddingBottom: 14, ...getShadow(colors, isDark) }}
    >
      <View className="flex-row items-center px-5" style={{ gap: 8 }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onOpenCalendar}
          accessibilityRole="button"
          accessibilityLabel={`${MONTH_NAMES[month]} ${year}. Open full calendar`}
          className="flex-row items-center flex-1"
          style={{ gap: 5, minWidth: 0 }}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={{ flexShrink: 1, color: colors.foreground, fontSize: 17, lineHeight: 24, fontWeight: "700", fontFamily: fonts.heading }}
          >
            {MONTH_NAMES[month]}
            <Text style={{ color: colors.mutedText, fontWeight: "400" }}>{` ${year}`}</Text>
          </Text>
          <Icon set="mci" name="calendar-month-outline" size={16} color={colors.mutedText} />
        </TouchableOpacity>

        {!isViewingCurrentMonth && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onChangeMonth(today.getFullYear(), today.getMonth())}
            accessibilityRole="button"
            accessibilityLabel="Go to today"
            hitSlop={6}
            className="items-center justify-center rounded-full"
            style={{ width: 32, height: 32, backgroundColor: colors.primaryLight }}
          >
            <Icon set="mci" name="calendar-today" size={16} color={colors.primary} />
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
            <Icon set="ion" name={delta < 0 ? "chevron-back" : "chevron-forward"} size={16} color={colors.foreground} />
          </TouchableOpacity>
        ))}
      </View>

      <View className="px-5 mt-3">
        <CalendarLegend />
      </View>

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
      <View onLayout={(e) => setCalendarWidth(e.nativeEvent.layout.width)} style={{ height: CAL_ROWS * TRACKER_CELL }}>
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
            initialScrollIndex={pagerIndexOf(year, month)}
            getItemLayout={getPagerLayout}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            windowSize={3}
            extraData={renderMonthPage}
            viewabilityConfig={pagerViewability}
            onViewableItemsChanged={onPagerViewable}
            onMomentumScrollEnd={onPagerSettled}
            renderItem={renderMonthPage}
          />
        ) : null}
      </View>
    </View>
  );
}
