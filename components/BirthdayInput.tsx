import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { checkBirthday } from "../lib/onboarding";
import { useTheme } from "./theme";
import { Icon } from "./Icon";

type Segment = "day" | "month" | "year";

type BirthdayInputProps = {
  /** YYYY-MM-DD, or "" when unset. */
  value: string;
  /** Called with a valid YYYY-MM-DD, or "" while incomplete/invalid. */
  onChange: (dateKey: string) => void;
  autoFocus?: boolean;
};

/**
 * Day / month / year typed into three boxes on the number pad, with the
 * cursor moving on by itself. Faster and less fiddly than a scroll wheel for
 * a date decades back, and it confirms the age as soon as the date is valid.
 * Used by onboarding and Edit profile.
 */
export function BirthdayInput({ value, onChange, autoFocus }: BirthdayInputProps) {
  const { colors, fonts } = useTheme();
  const [year0, month0, day0] = value ? value.split("-") : ["", "", ""];
  const [day, setDay] = useState(day0 ?? "");
  const [month, setMonth] = useState(month0 ?? "");
  const [year, setYear] = useState(year0 ?? "");
  const [focused, setFocused] = useState<Segment | null>(null);
  const refs = {
    day: useRef<TextInput>(null),
    month: useRef<TextInput>(null),
    year: useRef<TextInput>(null),
  };

  const check = checkBirthday(day, month, year);
  const validKey = check.status === "ok" ? check.dateKey : "";

  // Report upward only when the resulting value actually changes.
  const lastReported = useRef(value);
  useEffect(() => {
    if (validKey !== lastReported.current) {
      lastReported.current = validKey;
      onChange(validKey);
    }
  }, [onChange, validKey]);

  useEffect(() => {
    if (!autoFocus) return;
    // Let the step's enter animation start before the keyboard slides up.
    const timer = setTimeout(() => refs.day.current?.focus(), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  function handleDay(text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 2);
    // A first digit of 4-9 can only be a single-digit day: pad and move on.
    const next = digits.length === 1 && Number(digits) > 3 ? `0${digits}` : digits;
    setDay(next);
    if (next.length === 2) refs.month.current?.focus();
  }

  function handleMonth(text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 2);
    const next = digits.length === 1 && Number(digits) > 1 ? `0${digits}` : digits;
    setMonth(next);
    if (next.length === 2) refs.year.current?.focus();
  }

  function handleYear(text: string) {
    const next = text.replace(/\D/g, "").slice(0, 4);
    setYear(next);
    if (next.length === 4) refs.year.current?.blur();
  }

  // Backspace in an empty box steps back to the previous one.
  function backTo(segment: Segment, current: string) {
    return ({ nativeEvent }: { nativeEvent: { key: string } }) => {
      if (nativeEvent.key === "Backspace" && current === "") refs[segment].current?.focus();
    };
  }

  const isInvalid = check.status === "invalid";

  const box = (segment: Segment, label: string, flex: number, input: React.ReactNode) => (
    <Pressable onPress={() => refs[segment].current?.focus()} style={{ flex }}>
      <View
        style={{
          height: 64,
          borderRadius: 18, borderCurve: "continuous",
          borderWidth: focused === segment || isInvalid ? 1.5 : 1,
          borderColor: isInvalid ? colors.danger : focused === segment ? colors.primary : colors.border,
          backgroundColor: colors.surface,
          justifyContent: "center",
        }}
      >
        {input}
      </View>
      <Text
        style={{
          marginTop: 8,
          textAlign: "center",
          color: focused === segment ? colors.primary : colors.mutedText,
          fontSize: 13,
          fontWeight: "700",
          fontFamily: fonts.body,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  const inputStyle = {
    textAlign: "center" as const,
    color: colors.foreground,
    fontSize: 24,
    fontWeight: "800" as const,
    fontFamily: fonts.heading,
    paddingVertical: 0,
    height: "100%" as const,
  };

  return (
    <View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {box(
          "day",
          "Day",
          1,
          <TextInput
            ref={refs.day}
            accessibilityLabel="Day of birth"
            value={day}
            onChangeText={handleDay}
            onFocus={() => setFocused("day")}
            onBlur={() => setFocused(null)}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="DD"
            placeholderTextColor={colors.border}
            textContentType="none"
            autoComplete="off"
            returnKeyType="next"
            style={inputStyle}
          />,
        )}
        {box(
          "month",
          "Month",
          1,
          <TextInput
            ref={refs.month}
            accessibilityLabel="Month of birth"
            value={month}
            onChangeText={handleMonth}
            onKeyPress={backTo("day", month)}
            onFocus={() => setFocused("month")}
            onBlur={() => setFocused(null)}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="MM"
            placeholderTextColor={colors.border}
            autoComplete="off"
            returnKeyType="next"
            style={inputStyle}
          />,
        )}
        {box(
          "year",
          "Year",
          1.6,
          <TextInput
            ref={refs.year}
            accessibilityLabel="Year of birth"
            value={year}
            onChangeText={handleYear}
            onKeyPress={backTo("month", year)}
            onFocus={() => setFocused("year")}
            onBlur={() => setFocused(null)}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="YYYY"
            placeholderTextColor={colors.border}
            autoComplete="off"
            returnKeyType="done"
            style={inputStyle}
          />,
        )}
      </View>

      <View style={{ minHeight: 44, marginTop: 14, alignItems: "center", justifyContent: "center" }}>
        {check.status === "ok" ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: colors.successLight,
            }}
          >
            <Icon set="ion" name="checkmark-circle" size={16} color={colors.success} />
            <Text style={{ color: colors.success, fontSize: 13.5, fontWeight: "800", fontFamily: fonts.body }}>
              You&apos;re {check.age}
            </Text>
          </View>
        ) : isInvalid ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: colors.danger, fontSize: 13, fontWeight: "700", textAlign: "center", fontFamily: fonts.body }}
          >
            {check.message}
          </Text>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon set="ion" name="lock-closed" size={12} color={colors.mutedText} />
            <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }}>
              Private. Never shown on your profile.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
