import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Doctor, DoctorAvailability } from "../../lib/api";
import { dayChipLabel, formatSessionWhen, formatTime, shortZoneName } from "../../lib/consultationFormat";
import { SLOT_PERIODS, getDoctorDisplayName, slotPeriod } from "../../lib/consultationModel";
import { BottomSheet } from "../BottomSheet";
import { DoctorPhoto } from "../DoctorPhoto";
import { EmptyState } from "../EmptyState";
import { SkeletonRow } from "../Skeleton";
import { useTheme } from "../theme";
import { Icon } from "../Icon";

type Slot = { start: string };
type SlotDay = { key: string; slots: Slot[] };

const GUTTER = 24;
const GRID_GAP = 8;
const GRID_COLUMNS = 3;

/**
 * Bottom sheet for picking a doctor's open day and time (local time), ending
 * in Continue. The caller closes it before opening the payment sheet: two
 * native Modals can't present at once.
 */
export function SlotPicker({
  doctor,
  fee,
  availability,
  loading,
  error,
  slotDays,
  daySlots,
  selectedDayKey,
  selectedSlotStart,
  onSelectDay,
  onSelectSlot,
  onRetry,
  onClose,
  onContinue,
}: {
  /** The sheet is open while this is set. */
  doctor: Doctor | null;
  /** Formatted fee, or null when the doctor isn't bookable yet. */
  fee: string | null;
  availability: DoctorAvailability | null;
  loading: boolean;
  error: string | null;
  slotDays: SlotDay[];
  daySlots: Slot[];
  selectedDayKey: string | null;
  selectedSlotStart: string | null;
  onSelectDay: (key: string) => void;
  onSelectSlot: (start: string) => void;
  onRetry: () => void;
  onClose: () => void;
  onContinue: () => void;
}) {
  const { colors, isDark, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const zoneName = useMemo(() => shortZoneName(), []);
  const [gridWidth, setGridWidth] = useState(0);

  if (!doctor) return null;

  const name = getDoctorDisplayName(doctor);
  const selectedDay = slotDays.find((day) => day.key === selectedDayKey);
  const selectedChip = selectedDay ? dayChipLabel(selectedDay.slots[0].start) : null;
  // Three even columns that fill the row exactly; the last row doesn't stretch.
  const cellWidth = gridWidth ? Math.floor((gridWidth - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS) : undefined;
  const canContinue = Boolean(fee && selectedSlotStart && !error);
  const body = { fontFamily: fonts.body };
  const label = { ...body, fontSize: 13, fontWeight: "600" as const, color: colors.mutedText };

  const renderBody = () => {
    if (loading && !availability) {
      return (
        <View style={{ paddingHorizontal: GUTTER, paddingTop: 8, gap: 12 }}>
          <SkeletonRow />
          <SkeletonRow />
        </View>
      );
    }
    if (error) {
      return (
        <View style={{ paddingHorizontal: GUTTER }}>
          <EmptyState compact icon="calendar-alert" title="Couldn't load open times" message={error} actionLabel="Retry" onAction={onRetry} />
        </View>
      );
    }
    if (slotDays.length === 0) {
      return (
        <View style={{ paddingHorizontal: GUTTER, paddingVertical: 32, alignItems: "center" }}>
          <Text style={{ ...body, fontSize: 15, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>
            No open times
          </Text>
          <Text style={{ ...label, marginTop: 6, textAlign: "center", lineHeight: 19 }}>
            {availability && !availability.isAvailable
              ? `${name} isn't taking bookings right now. Please check back soon.`
              : `Nothing in the next ${availability?.windowDays ?? 14} days. Please check back soon or try another specialist.`}
          </Text>
        </View>
      );
    }

    return (
      <>
        {/* Month, then the days that have open times */}
        <Text
          style={{ paddingHorizontal: GUTTER, fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}
        >
          {selectedChip ? selectedChip.month : ""}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: GUTTER - 6, paddingTop: 12 }}
        >
          {slotDays.map((day) => {
            const isSelected = day.key === selectedDayKey;
            const chip = dayChipLabel(day.slots[0].start);
            return (
              <Pressable
                key={day.key}
                onPress={() => onSelectDay(day.key)}
                accessibilityRole="button"
                accessibilityLabel={`${chip.top} ${chip.day} ${chip.month}`}
                accessibilityState={{ selected: isSelected }}
                style={{ width: 52, alignItems: "center", marginHorizontal: 1 }}
              >
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}
                  style={{ ...body, fontSize: 12, fontWeight: "600", color: isSelected ? colors.foreground : colors.mutedText }}
                >
                  {chip.top}
                </Text>
                <View
                  style={{
                    marginTop: 8,
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isSelected ? colors.primary : "transparent",
                  }}
                >
                  <Text
                    maxFontSizeMultiplier={1.2}
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: isSelected ? colors.buttonText : colors.foreground,
                      fontFamily: fonts.heading,
                    }}
                  >
                    {chip.day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: GUTTER, marginTop: 20 }} />

        {/* Times, by part of the day */}
        <View style={{ paddingHorizontal: GUTTER }} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width - GUTTER * 2)}>
          {SLOT_PERIODS.map((period) => {
            const slots = daySlots.filter((slot) => slotPeriod(slot.start) === period.key);
            if (!slots.length) return null;
            return (
              <View key={period.key} style={{ marginTop: 20 }}>
                <Text style={{ ...label, marginBottom: 10 }}>{period.label}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP }}>
                  {slots.map((slot) => {
                    const isSelected = selectedSlotStart === slot.start;
                    const time = formatTime(slot.start);
                    return (
                      <Pressable
                        key={slot.start}
                        onPress={() => onSelectSlot(slot.start)}
                        accessibilityRole="button"
                        accessibilityLabel={time}
                        accessibilityState={{ selected: isSelected }}
                        style={{
                          width: cellWidth ?? "31%",
                          height: 44,
                          borderRadius: 12,
                          borderWidth: 1,
                          alignItems: "center",
                          justifyContent: "center",
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isSelected ? colors.primary : isDark ? colors.background : colors.surface,
                        }}
                      >
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          maxFontSizeMultiplier={1.3}
                          style={{ ...body, fontSize: 14, fontWeight: "600", color: isSelected ? colors.buttonText : colors.foreground }}
                        >
                          {time}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
          <Text style={{ ...label, fontSize: 12, marginTop: 20 }}>
            Times are in your time zone{zoneName ? ` (${zoneName})` : ""}
          </Text>
        </View>
      </>
    );
  };

  return (
    <BottomSheet
      visible
      onClose={onClose}
      style={{
        maxHeight: height * 0.88,
        // Dark: lift the sheet off the dimmed page (surface + hairline edge from BottomSheet).
        backgroundColor: isDark ? colors.surface : colors.background,
      }}
    >

      {/* Who it's with */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: GUTTER, paddingTop: 16, paddingBottom: 20 }}>
        <DoctorPhoto
          name={name}
          uri={doctor.avatarUrl}
          size={44}
          backgroundColor={colors.primaryLight}
          textColor={colors.primary}
          fontFamily={fonts.heading}
        />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>
            {name}
          </Text>
          <Text numberOfLines={1} style={{ ...label, marginTop: 2 }}>
            {[doctor.specialty, "Video consultation"].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Icon set="feather" name="x" size={22} color={colors.mutedText} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {renderBody()}
      </ScrollView>

      {/* What's picked, and the way on to payment */}
      <View
        style={{
          borderTopWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: GUTTER,
          paddingTop: 14,
          paddingBottom: Math.max(16, insets.bottom + 8),
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{
              ...body,
              fontSize: 14,
              fontWeight: "700",
              color: selectedSlotStart ? colors.foreground : colors.mutedText,
            }}
          >
            {selectedSlotStart ? formatSessionWhen(selectedSlotStart) : "Select a time"}
          </Text>
          <Text numberOfLines={1} style={{ ...label, fontSize: 12, marginTop: 2 }}>
            {fee ? `${fee} · 1 session` : "Booking isn't open yet"}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={!canContinue}
          onPress={onContinue}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canContinue }}
          style={{
            height: 48,
            paddingHorizontal: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: canContinue ? colors.primary : colors.surfaceStrong,
          }}
        >
          <Text
            style={{ ...body, fontSize: 15, fontWeight: "700", color: canContinue ? colors.buttonText : colors.mutedText }}
          >
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}
