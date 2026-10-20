import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Switch, Text, TouchableOpacity, View } from "react-native";
import { BottomSheet } from "../BottomSheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cycleApi, getFriendlyErrorMessage, type CycleSettings } from "../../lib/api";
import { addDays, DEFAULT_CYCLE_LENGTH } from "../../lib/cycleCalendar";
import { dateFromDayKey, getDateKey } from "../../lib/format";
import { AppModalHost } from "../modals/AppModalHost";
import { MonthCalendar } from "../onboarding/parts";
import { useTheme } from "../theme";
import { Icon } from "../Icon";

const TRACKING_GOALS: { id: NonNullable<CycleSettings["trackingGoal"]>; label: string }[] = [
  { id: "track_period", label: "Track Period" },
  { id: "avoid_pregnancy", label: "Avoid Pregnancy" },
  { id: "achieve_pregnancy", label: "Achieve Pregnancy" },
  { id: "manage_symptoms", label: "Manage Symptoms" },
  { id: "general_health", label: "General Health" },
];

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
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Decrease"
        activeOpacity={0.8}
        className="items-center justify-center"
        onPress={() => adjust(-1)}
        style={{ height: buttonSize, width: buttonSize }}
      >
        <Icon set="feather"
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
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Increase"
        activeOpacity={0.8}
        className="items-center justify-center"
        onPress={() => adjust(1)}
        style={{ height: buttonSize, width: buttonSize }}
      >
        <Icon set="feather"
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

/**
 * The Tracker's Cycle Settings bottom sheet. The form is filled from
 * `settings` each time the sheet opens (not on every refetch, which would
 * wipe edits in progress); `onSaved` gets the server's copy.
 */
export function CycleSettingsSheet({
  visible,
  settings,
  onClose,
  onSaved,
}: {
  visible: boolean;
  settings: CycleSettings | null;
  onClose: () => void;
  onSaved: (settings: CycleSettings) => void;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const savingRef = useRef(false);
  const [lastPeriodStartDate, setLastPeriodStartDate] = useState(() => getDateKey(new Date()));
  const [cycleLengthInput, setCycleLengthInput] = useState(String(DEFAULT_CYCLE_LENGTH));
  const [periodLengthInput, setPeriodLengthInput] = useState("5");
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderDaysBeforeInput, setReminderDaysBeforeInput] = useState("2");
  const [ovulationReminder, setOvulationReminder] = useState(false);
  const [fertilityReminder, setFertilityReminder] = useState(false);
  const [pregnancyMode, setPregnancyMode] = useState(false);
  const [trackingGoal, setTrackingGoal] = useState<CycleSettings["trackingGoal"]>("track_period");

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => {
    if (!visible) return;
    const s = settingsRef.current;
    setSettingsError("");
    setLastPeriodStartDate(formatSettingsDate(s?.lastPeriodStartDate));
    setCycleLengthInput(String(s?.cycleLength ?? DEFAULT_CYCLE_LENGTH));
    setPeriodLengthInput(String(s?.periodLength ?? 5));
    setRemindersEnabled(s?.remindersEnabled ?? true);
    setReminderDaysBeforeInput(String(s?.reminderDaysBefore ?? 2));
    setOvulationReminder(s?.ovulationReminder ?? false);
    setFertilityReminder(s?.fertilityReminder ?? false);
    setPregnancyMode(s?.pregnancyMode ?? false);
    setTrackingGoal(s?.trackingGoal ?? "track_period");
  }, [visible]);

  async function save() {
    if (savingRef.current) return;
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
    if (Number.isNaN(reminderDaysBefore) || reminderDaysBefore < 0 || reminderDaysBefore > 10) {
      setSettingsError("Reminder timing should be between 0 and 10 days.");
      return;
    }

    savingRef.current = true;
    setSettingsSaving(true);
    setSettingsError("");
    try {
      const saved = await cycleApi.saveSettings({
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
      onSaved(saved);
      onClose();
    } catch (error) {
      setSettingsError(getFriendlyErrorMessage(error));
    } finally {
      savingRef.current = false;
      setSettingsSaving(false);
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={() => onClose()}
      backdropLabel="Close cycle settings"
      style={{ maxHeight: "88%", backgroundColor: colors.surface, borderWidth: 1 }}
      overlay={visible ? <AppModalHost inline /> : null}
    >

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
            onPress={() => onClose()}
            className="rounded-full border p-2"
            style={{
              backgroundColor: colors.input,
              borderColor: colors.border,
            }}
          >
            <Icon set="feather" name="x" size={16} color={colors.foreground} />
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
              {TRACKING_GOALS.map((goal) => {
                const isSelected = trackingGoal === goal.id;
                return (
                  <TouchableOpacity
                    key={goal.id}
                    activeOpacity={0.8}
                    onPress={() => setTrackingGoal(goal.id)}
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
          onPress={save}
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
    </BottomSheet>
  );
}
