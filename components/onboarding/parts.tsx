import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import Pressable from "../PressableFeedback";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { getDateKey } from "../../lib/format";
import { addDays, parseDateKey } from "../../lib/onboarding";
import { useTheme } from "../theme";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { getShadow } from "../ui-tokens";

// Building blocks for components/onboarding/OnboardingFlow.tsx. Kept
// presentational: every value comes in through props.

/** Thin progress bar that eases between steps instead of jumping. */
export function ProgressBar({ progress }: { progress: number }) {
  const { colors } = useTheme();
  const width = useSharedValue(progress);

  useEffect(() => {
    width.value = withTiming(progress, { duration: 320 });
  }, [progress, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(0.04, width.value) * 100}%` }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      style={{ flex: 1, height: 5, borderRadius: 999, backgroundColor: colors.track, overflow: "hidden" }}
    >
      <Animated.View style={[{ height: "100%", borderRadius: 999, backgroundColor: colors.primary }, fillStyle]} />
    </View>
  );
}

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
};

/** Full-width bottom call to action. */
export function PrimaryButton({ label, onPress, disabled, loading, icon = "arrow-forward" }: PrimaryButtonProps) {
  return <Button label={label} onPress={onPress} disabled={disabled} loading={loading} iconRight={icon} fullWidth />;
}

/** Low-emphasis text action (Skip, Not sure, ...). */
export function TextButton({ label, onPress, align = "center" }: { label: string; onPress: () => void; align?: "center" | "right" }) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: align === "center" ? "center" : "flex-end", paddingVertical: 6 })}
    >
      <Text style={{ color: colors.mutedText, fontSize: 14, fontWeight: "700", fontFamily: fonts.body }}>{label}</Text>
    </Pressable>
  );
}

type OptionCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  multi?: boolean;
};

/** Tappable answer row: icon, label, optional hint, and a check. */
export function OptionCard({ icon, label, hint, selected, onPress, multi }: OptionCardProps) {
  const { colors, fonts, isDark } = useTheme();

  return (
    <Pressable
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderRadius: 20,
        borderCurve: "continuous",
        // Constant width so picking an answer never shifts the row.
        borderWidth: 1.5,
        borderColor: selected ? colors.primary : "transparent",
        backgroundColor: selected ? colors.primaryLight : colors.surface,
        ...(selected ? null : getShadow(colors, isDark)),
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 14, borderCurve: "continuous",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: selected ? colors.surface : colors.surfaceSoft,
        }}
      >
        <Icon set="ion" name={icon} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.foreground, fontSize: 15.5, fontWeight: "700", letterSpacing: -0.2, fontFamily: fonts.body }}>{label}</Text>
        {hint ? (
          <Text style={{ color: colors.mutedText, fontSize: 13, marginTop: 2, fontFamily: fonts.body }}>{hint}</Text>
        ) : null}
      </View>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: multi ? 8 : 12,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: selected ? 0 : 1.5,
          borderColor: colors.border,
          backgroundColor: selected ? colors.primary : "transparent",
        }}
      >
        {selected ? <Icon set="ion" name="checkmark" size={15} color={colors.buttonText} /> : null}
      </View>
    </Pressable>
  );
}

/** Small selectable pill, used for quick picks. */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primaryLight : colors.surface,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ color: selected ? colors.primaryDark : colors.foreground, fontSize: 13.5, fontWeight: "700", fontFamily: fonts.body }}>
        {label}
      </Text>
    </Pressable>
  );
}

type NumberStepperProps = {
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
  quickPicks?: number[];
};

/** Big number with − / + buttons, plus optional one-tap common values. */
export function NumberStepper({ value, min, max, unit, onChange, quickPicks }: NumberStepperProps) {
  const { colors, fonts } = useTheme();

  const roundButton = (icon: "remove" | "add", disabled: boolean, next: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={icon === "add" ? `Increase to ${next}` : `Decrease to ${next}`}
      disabled={disabled}
      onPress={() => onChange(next)}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surface,
        borderWidth: 1.5,
        borderColor: colors.border,
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      <Icon set="ion" name={icon} size={24} color={colors.foreground} />
    </Pressable>
  );

  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 28 }}>
        {roundButton("remove", value <= min, Math.max(min, value - 1))}
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${value} ${unit}`}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "increment") onChange(Math.min(max, value + 1));
            if (event.nativeEvent.actionName === "decrement") onChange(Math.max(min, value - 1));
          }}
          style={{ alignItems: "center", minWidth: 96 }}
        >
          <Text style={{ color: colors.foreground, fontSize: 64, lineHeight: 72, fontWeight: "800", fontFamily: fonts.heading }}>
            {value}
          </Text>
          <Text style={{ color: colors.mutedText, fontSize: 14, fontWeight: "700", fontFamily: fonts.body }}>{unit}</Text>
        </View>
        {roundButton("add", value >= max, Math.min(max, value + 1))}
      </View>

      {quickPicks?.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 28 }}>
          {quickPicks.map((pick) => (
            <Chip key={pick} label={`${pick} ${unit}`} selected={pick === value} onPress={() => onChange(pick)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

type MonthCalendarProps = {
  selectedKey: string;
  onSelect: (dateKey: string) => void;
  /** Days after the selected start that are drawn as period days. */
  highlightLength: number;
  minDate: Date;
  maxDate: Date;
};

/**
 * Compact Monday-first month grid (like every calendar in the app). Future
 * days are disabled; the chosen start and the following period days are
 * shaded so the user sees their period, not just a dot.
 */
export function MonthCalendar({ selectedKey, onSelect, highlightLength, minDate, maxDate }: MonthCalendarProps) {
  const { colors, fonts } = useTheme();
  const initialMonth = selectedKey ? parseDateKey(selectedKey) : maxDate;
  const [month, setMonth] = useState(new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1));

  const todayKey = getDateKey(new Date());
  const minKey = getDateKey(minDate);
  const maxKey = getDateKey(maxDate);

  const periodKeys = useMemo(() => {
    if (!selectedKey) return new Set<string>();
    const start = parseDateKey(selectedKey);
    return new Set(Array.from({ length: Math.max(1, highlightLength) }, (_, index) => getDateKey(addDays(start, index))));
  }, [highlightLength, selectedKey]);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const leading = (first.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const list: (Date | null)[] = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= days; day += 1) list.push(new Date(month.getFullYear(), month.getMonth(), day));
    while (list.length % 7) list.push(null);
    return list;
  }, [month]);

  const canGoBack = new Date(month.getFullYear(), month.getMonth(), 1) > new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const canGoForward = new Date(month.getFullYear(), month.getMonth(), 1) < new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const navButton = (direction: -1 | 1, enabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction < 0 ? "Previous month" : "Next month"}
      disabled={!enabled}
      hitSlop={8}
      onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + direction, 1))}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surfaceSoft,
        opacity: !enabled ? 0.3 : pressed ? 0.6 : 1,
      })}
    >
      <Icon set="ion" name={direction < 0 ? "chevron-back" : "chevron-forward"} size={18} color={colors.foreground} />
    </Pressable>
  );

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderCurve: "continuous", padding: 14, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        {navButton(-1, canGoBack)}
        <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "800", fontFamily: fonts.heading }}>{monthLabel}</Text>
        {navButton(1, canGoForward)}
      </View>

      <View style={{ flexDirection: "row" }}>
        {WEEKDAY_LABELS.map((label, index) => (
          <Text
            key={`${label}-${index}`}
            style={{ flex: 1, textAlign: "center", color: colors.mutedText, fontSize: 13.5, fontWeight: "700", fontFamily: fonts.body, paddingVertical: 6 }}
          >
            {label}
          </Text>
        ))}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((date, index) => {
          if (!date) return <View key={`blank-${index}`} style={{ width: `${100 / 7}%`, height: 42 }} />;
          const key = getDateKey(date);
          const disabled = key > maxKey || key < minKey;
          const isStart = key === selectedKey;
          const inPeriod = periodKeys.has(key);
          const isToday = key === todayKey;

          return (
            <View key={key} style={{ width: `${100 / 7}%`, height: 42, alignItems: "center", justifyContent: "center" }}>
              <Pressable
                hitSlop={5}
                accessibilityRole="button"
                accessibilityLabel={date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
                accessibilityState={{ disabled, selected: isStart }}
                disabled={disabled}
                onPress={() => onSelect(key)}
                style={({ pressed }) => ({
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isStart ? colors.primary : inPeriod ? colors.primaryLight : "transparent",
                  borderWidth: isToday && !isStart ? 1.5 : 0,
                  borderColor: colors.primary,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{
                    color: isStart ? colors.buttonText : disabled ? colors.border : inPeriod ? colors.primaryDark : colors.foreground,
                    fontSize: 14,
                    fontWeight: isStart || inPeriod || isToday ? "800" : "600",
                    fontFamily: fonts.body,
                  }}
                >
                  {date.getDate()}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
