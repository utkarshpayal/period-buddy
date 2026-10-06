import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DayEntry } from "./AppState";
import { alert } from "../lib/alert";
import { AppModalHost } from "./modals/AppModalHost";
import { useTheme } from "./theme";
import { useSecureScreen } from "../lib/screenPrivacy";
import {
  getLogCategoryTints,
  getShadow,
  MOOD_OPTIONS,
  type LogCategoryTint,
} from "./ui-tokens";

type LogOption<Value extends string> = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: Value;
};

// Physical symptoms — the catch-all tag list. "Nausea" also renders again
// under Digestion & stool (same tag, same toggle) since it belongs to both
// groupings in the reference app; everything else here is symptoms-only.
const symptomOptions: LogOption<string>[] = [
  { icon: "gift-outline", label: "Everything is fine", value: "everything-is-fine" },
  { icon: "pulse-outline", label: "Cramps", value: "cramps" },
  { icon: "heart-half-outline", label: "Tender breasts", value: "tender-breasts" },
  { icon: "flash-outline", label: "Headache", value: "headache" },
  { icon: "sparkles-outline", label: "Acne", value: "acne" },
  { icon: "body-outline", label: "Backache", value: "backache" },
  { icon: "bed-outline", label: "Fatigue", value: "fatigue" },
  { icon: "restaurant-outline", label: "Cravings", value: "cravings" },
  { icon: "moon-outline", label: "Insomnia", value: "insomnia" },
  { icon: "medkit-outline", label: "Abdominal pain", value: "abdominal-pain" },
  { icon: "flame-outline", label: "Vaginal itching", value: "vaginal-itching" },
  { icon: "water-outline", label: "Vaginal dryness", value: "vaginal-dryness" },
];

// Free-form tags stored in DayEntry.symptoms (no backend enum, so these are
// safe to ship without a server change) for categories the typed fields
// (flow/discharge/digestion) don't have dedicated slots for.
const bloodClotOption: LogOption<string> = {
  icon: "disc-outline",
  label: "Blood clots",
  value: "blood-clots",
};

const ovulationOptions: LogOption<string>[] = [
  { icon: "help-circle-outline", label: "Not tested", value: "ovulation-not-tested" },
  { icon: "checkmark-circle-outline", label: "Test: positive", value: "ovulation-test-positive" },
  { icon: "remove-circle-outline", label: "Test: negative", value: "ovulation-test-negative" },
  { icon: "create-outline", label: "Ovulation: my method", value: "ovulation-my-method" },
];

const sexOptions: LogOption<string>[] = [
  { icon: "heart-dislike-outline", label: "Didn't have sex", value: "sex-none" },
  { icon: "shield-checkmark-outline", label: "Protected sex", value: "sex-protected" },
  { icon: "shield-outline", label: "Unprotected sex", value: "sex-unprotected" },
  { icon: "happy-outline", label: "Oral sex", value: "sex-oral" },
  { icon: "ellipse-outline", label: "Anal sex", value: "sex-anal" },
  { icon: "hand-left-outline", label: "Masturbation", value: "sex-masturbation" },
  { icon: "people-outline", label: "Sensual touch", value: "sex-sensual-touch" },
  { icon: "cube-outline", label: "Sex toys", value: "sex-toys" },
  { icon: "sparkles-outline", label: "Orgasm", value: "sex-orgasm" },
  { icon: "flame-outline", label: "High sex drive", value: "sex-drive-high" },
  { icon: "heart-outline", label: "Natural sex drive", value: "sex-drive-natural" },
  { icon: "heart-half-outline", label: "Low sex drive", value: "sex-drive-low" },
];

// Extra discharge descriptors beyond the typed `discharge` enum's five values
// — logged as tags so they don't need a backend enum change either.
const extraDischargeOptions: LogOption<string>[] = [
  { icon: "ellipse-outline", label: "Spotting", value: "discharge-spotting" },
  { icon: "help-circle-outline", label: "Unusual", value: "discharge-unusual" },
  { icon: "snow-outline", label: "Clumpy white", value: "discharge-clumpy-white" },
  { icon: "cloud-outline", label: "Gray", value: "discharge-gray" },
];

const nauseaOption: LogOption<string> = {
  icon: "warning-outline",
  label: "Nausea",
  value: "nausea",
};

const pregnancyTestOptions: LogOption<string>[] = [
  { icon: "help-circle-outline", label: "Didn't take tests", value: "pregnancy-not-tested" },
  { icon: "add-circle-outline", label: "Positive", value: "pregnancy-positive" },
  { icon: "close-circle-outline", label: "Negative", value: "pregnancy-negative" },
  { icon: "contrast-outline", label: "Faint line", value: "pregnancy-faint-line" },
];

const digestionOptions: LogOption<NonNullable<DayEntry["digestion"]>>[] = [
  { icon: "checkmark-circle-outline", label: "Normal", value: "normal" },
  { icon: "swap-vertical-outline", label: "Constipation", value: "constipated" },
  { icon: "thunderstorm-outline", label: "Diarrhea", value: "diarrhea" },
  { icon: "water-outline", label: "Bloating", value: "bloated" },
];

const skinOptions: LogOption<NonNullable<DayEntry["skin"]>>[] = [
  { icon: "sunny-outline", label: "Clear", value: "clear" },
  { icon: "water-outline", label: "Oily", value: "oily" },
  { icon: "snow-outline", label: "Dry", value: "dry" },
  { icon: "sparkles-outline", label: "Acne", value: "acne" },
];

const dischargeOptions: LogOption<NonNullable<DayEntry["discharge"]>>[] = [
  { icon: "remove-circle-outline", label: "No discharge", value: "none" },
  { icon: "ellipse-outline", label: "Sticky", value: "sticky" },
  { icon: "water-outline", label: "Creamy", value: "creamy" },
  { icon: "rainy-outline", label: "Watery", value: "watery" },
  { icon: "egg-outline", label: "Egg white", value: "egg-white" },
];

const exerciseOptions: LogOption<string>[] = [
  { icon: "close-circle-outline", label: "Didn't exercise", value: "didnt-exercise" },
  { icon: "leaf-outline", label: "Yoga", value: "yoga" },
  { icon: "barbell-outline", label: "Gym", value: "gym" },
  { icon: "musical-notes-outline", label: "Aerobics & dancing", value: "aerobics-dancing" },
  { icon: "water-outline", label: "Swimming", value: "swimming" },
  { icon: "people-outline", label: "Team sports", value: "team-sports" },
  { icon: "walk-outline", label: "Running", value: "running" },
  { icon: "bicycle-outline", label: "Cycling", value: "cycling" },
];

const flowOptions: LogOption<NonNullable<DayEntry["flow"]>>[] = [
  { icon: "remove-circle-outline", label: "None", value: "none" },
  { icon: "ellipse-outline", label: "Spotting", value: "spotting" },
  { icon: "water-outline", label: "Light", value: "light" },
  { icon: "water", label: "Medium", value: "medium" },
  { icon: "rainy-outline", label: "Heavy", value: "heavy" },
];

const moodOptions: LogOption<NonNullable<DayEntry["mood"]>>[] = MOOD_OPTIONS;

const energyOptions: LogOption<NonNullable<DayEntry["energy"]>>[] = [
  { icon: "battery-charging-outline", label: "High", value: "high" },
  { icon: "battery-half-outline", label: "Steady", value: "steady" },
  { icon: "battery-half-outline", label: "Medium", value: "medium" },
  { icon: "battery-dead-outline", label: "Low", value: "low" },
];

export default function DayDetailsModal({
  visible,
  onClose,
  day,
  dateLabel,
  details,
  entry,
  phaseLabel,
  onSaveEntry,
  onSaveNote,
  onLogSymptom,
  onClearEntry,
  focusSection,
}: {
  visible: boolean;
  onClose: () => void;
  day?: number;
  dateLabel?: string;
  details?: string;
  entry?: DayEntry;
  phaseLabel?: string;
  onSaveEntry?: (entry: Omit<DayEntry, "updatedAt">) => Promise<void> | void;
  onSaveNote?: (note: string) => void;
  onLogSymptom?: (symptom: string) => void;
  /** Deletes this day's saved log. The option only shows when there is a saved entry. */
  onClearEntry?: () => Promise<void>;
  /** When set, the modal scrolls to this section on open (Home quick actions). */
  focusSection?: "symptoms" | "flow" | "mood";
}) {
  // Opened over Home too (quick actions), which isn't a protected screen.
  useSecureScreen("day-log", visible);
  const { colors, fonts, isDark } = useTheme();
  const tints = getLogCategoryTints(colors);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  // Y offset of each focusable section within the scroll content, recorded via
  // onLayout so a Home quick action can jump straight to Flow/Symptoms/Mood.
  const sectionY = useRef<Record<string, number>>({});
  const [noteText, setNoteText] = useState(details ?? "");
  const [selectedEnergy, setSelectedEnergy] = useState<DayEntry["energy"]>();
  const [selectedFlow, setSelectedFlow] = useState<DayEntry["flow"]>();
  // Mood/skin/digestion are multi-select (can co-occur in a day). The scalar
  // DayEntry field is still populated from the first choice on save.
  const [selectedMoods, setSelectedMoods] = useState<NonNullable<DayEntry["mood"]>[]>([]);
  // Every category without its own typed field (ovulation, sex & sex drive,
  // pregnancy test, blood clots, extra discharge descriptors, nausea, plus
  // the classic physical symptoms) lives together in this one tag array —
  // it maps straight onto DayEntry.symptoms, so none of it needs a backend
  // schema change.
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [sleepHours, setSleepHours] = useState<number | undefined>();
  const [waterIntake, setWaterIntake] = useState<number | undefined>();
  const [weightText, setWeightText] = useState("");
  const [tempText, setTempText] = useState("");
  const [stressLevel, setStressLevel] = useState<number | undefined>();
  const [medText, setMedText] = useState("");
  const [isIntimate, setIsIntimate] = useState(false);
  const [selectedDigestions, setSelectedDigestions] = useState<NonNullable<DayEntry["digestion"]>[]>([]);
  const [selectedSkins, setSelectedSkins] = useState<NonNullable<DayEntry["skin"]>[]>([]);
  const [selectedDischarge, setSelectedDischarge] = useState<DayEntry["discharge"]>();
  const [selectedExercise, setSelectedExercise] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  // Tracks whether anything has changed since this open's hydration, so an
  // accidental backdrop tap / close doesn't silently discard real edits.
  const [isDirty, setIsDirty] = useState(false);
  const isHydratingRef = useRef(true);

  useEffect(() => {
    if (!visible) return;

    isHydratingRef.current = true;
    setIsDirty(false);
    setNoteText(entry?.note ?? details ?? "");
    setSelectedEnergy(entry?.energy);
    setSelectedFlow(entry?.flow);
    // Prefer the plural array when present; fall back to the scalar so
    // previously-saved single values still hydrate.
    setSelectedMoods(entry?.moods ?? (entry?.mood ? [entry.mood] : []));
    setSelectedSymptoms(entry?.symptoms ?? []);
    setSleepHours(entry?.sleepHours);
    setWaterIntake(entry?.waterIntake);
    setWeightText(entry?.weight ? String(entry.weight) : "");
    setTempText(entry?.temperature ? String(entry.temperature) : "");
    setStressLevel(entry?.stressLevel);
    setMedText(entry?.medication ? entry.medication.join(", ") : "");
    setIsIntimate(entry?.isIntimate ?? false);
    // "normal" has no chip (an empty selection *means* normal — see the
    // filter in the render below), so strip it out here too; otherwise it
    // sits invisibly in the array and `handleSave`'s `selectedDigestions[0]`
    // can silently resave "normal" instead of whatever the user just picked.
    setSelectedDigestions(
      (entry?.digestions ?? (entry?.digestion ? [entry.digestion] : [])).filter(
        (digestion) => digestion !== "normal",
      ),
    );
    setSelectedSkins(entry?.skins ?? (entry?.skin ? [entry.skin] : []));
    setSelectedDischarge(entry?.discharge);
    // Drop any previously-saved values that no longer have a matching chip
    // (exerciseOptions was replaced wholesale) — otherwise a stale value like
    // "walking" sits invisibly selected with no chip to toggle it off, and
    // silently resaves on every future edit of that day.
    const knownExerciseValues = new Set(exerciseOptions.map((option) => option.value));
    setSelectedExercise((entry?.exercise ?? []).filter((value) => knownExerciseValues.has(value)));
  }, [visible, details, entry]);

  // Fires on every field change; the first pass after hydration (above) is
  // just the hydration itself re-rendering, not a real edit, so it's eaten
  // via isHydratingRef instead of marking the form dirty.
  useEffect(() => {
    if (!visible) return;
    if (isHydratingRef.current) {
      isHydratingRef.current = false;
      return;
    }
    setIsDirty(true);
  }, [
    visible,
    noteText,
    selectedEnergy,
    selectedFlow,
    selectedMoods,
    selectedSymptoms,
    sleepHours,
    waterIntake,
    weightText,
    tempText,
    stressLevel,
    medText,
    isIntimate,
    selectedDigestions,
    selectedSkins,
    selectedDischarge,
    selectedExercise,
  ]);

  // Section a Home / tracker quick action asked us to jump to, still pending a
  // scroll. Cleared once we've scrolled to it (see recordSection / the effect).
  const pendingFocus = useRef<typeof focusSection>(undefined);

  function scrollToSection(section: NonNullable<typeof focusSection>) {
    const y = sectionY.current[section];
    if (y == null) return false;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    return true;
  }

  // Records a section's Y offset; if it's the section we're waiting to focus,
  // scroll to it the moment it lays out (handles the very first open reliably).
  function recordSection(section: NonNullable<typeof focusSection>, y: number) {
    sectionY.current[section] = y;
    if (pendingFocus.current === section) {
      pendingFocus.current = undefined;
      scrollToSection(section);
    }
  }

  // On open, jump to the requested section. We both try immediately (with a few
  // retries for the layout race) and arm recordSection for the first-open case.
  useEffect(() => {
    if (!visible) {
      pendingFocus.current = undefined;
      return;
    }
    if (!focusSection) {
      // No focus target — reset to the top so the previous scroll doesn't stick.
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    pendingFocus.current = focusSection;
    let tries = 0;
    const attempt = () => {
      if (pendingFocus.current !== focusSection) return; // already handled by onLayout
      if (scrollToSection(focusSection)) {
        pendingFocus.current = undefined;
        return;
      }
      if (++tries < 8) timer = setTimeout(attempt, 60);
    };
    let timer = setTimeout(attempt, 60);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, focusSection]);

  // Whether any section besides the symptom tags Quick Log actually saves
  // has data in it — used to warn before Quick Log silently drops the rest.
  function hasUnsavedByQuickLog() {
    return (
      selectedEnergy !== undefined ||
      selectedFlow !== undefined ||
      selectedMoods.length > 0 ||
      selectedSymptoms.length > 1 ||
      selectedDigestions.length > 0 ||
      selectedSkins.length > 0 ||
      selectedDischarge !== undefined ||
      selectedExercise.length > 0 ||
      sleepHours !== undefined ||
      waterIntake !== undefined ||
      weightText.trim() !== "" ||
      tempText.trim() !== "" ||
      stressLevel !== undefined ||
      medText.trim() !== "" ||
      isIntimate ||
      noteText.trim() !== ""
    );
  }

  function confirmDiscardIfDirty(onConfirm: () => void) {
    if (!isDirty || isSaving) {
      onConfirm();
      return;
    }
    alert(
      "Discard changes?",
      "You have unsaved changes to this day's log. If you close now, they'll be lost.",
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: onConfirm },
      ],
    );
  }

  async function handleSave() {
    if (isSaving) return;

    if (!onSaveEntry) {
      if (onSaveNote) onSaveNote(noteText.trim());
      onClose();
      return;
    }

    const parsedWeight = parseFloat(weightText) || undefined;
    const parsedTemp = parseFloat(tempText) || undefined;
    const meds = medText
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);

    try {
      setIsSaving(true);
      await onSaveEntry({
        energy: selectedEnergy,
        flow: selectedFlow,
        // Scalar stays the primary (first) choice for backward-compat; the full
        // multi-select set is sent additively as the plural field.
        mood: selectedMoods[0],
        moods: selectedMoods.length > 0 ? selectedMoods : undefined,
        isIntimate,
        note: noteText.trim(),
        symptoms: selectedSymptoms,
        sleepHours,
        waterIntake,
        weight: parsedWeight,
        temperature: parsedTemp,
        stressLevel,
        medication: meds.length > 0 ? meds : undefined,
        digestion: selectedDigestions[0],
        digestions: selectedDigestions.length > 0 ? selectedDigestions : undefined,
        skin: selectedSkins[0],
        skins: selectedSkins.length > 0 ? selectedSkins : undefined,
        discharge: selectedDischarge,
        exercise: selectedExercise.length > 0 ? selectedExercise : undefined,
      });
      onClose();
    } catch (error) {
      alert(
        "Couldn't save",
        error instanceof Error
          ? error.message
          : "Unable to save this day's log right now. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  // Clears straight away, with no confirm step. The button only shows for a
  // day that already has a saved log.
  async function handleClear() {
    if (isSaving || !onClearEntry) return;
    try {
      setIsSaving(true);
      await onClearEntry();
      onClose();
    } catch (error) {
      alert(
        "Couldn't clear",
        error instanceof Error
          ? error.message
          : "Unable to clear this day's log right now. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function performQuickLog() {
    const symptom = selectedSymptoms[0] ?? "general";

    if (onLogSymptom) onLogSymptom(symptom);
    onClose();
  }

  function handleLog() {
    if (isSaving) return;

    if (hasUnsavedByQuickLog()) {
      alert(
        "Quick Log skips your other entries",
        "You've filled in other sections (mood, flow, sleep, etc.) that Quick Log won't save — only your symptom tags will be logged. Use \"Save Log\" instead to keep everything.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Quick Log anyway", style: "destructive", onPress: performQuickLog },
        ],
      );
      return;
    }

    performQuickLog();
  }

  function toggleSymptom(symptom: string) {
    setSelectedSymptoms((current) =>
      current.includes(symptom)
        ? current.filter((item) => item !== symptom)
        : [...current, symptom],
    );
  }

  function toggleExercise(activity: string) {
    setSelectedExercise((current) =>
      current.includes(activity)
        ? current.filter((item) => item !== activity)
        : [...current, activity],
    );
  }

  // Generic multi-select toggle for the array-backed option groups.
  function toggleInArray<T>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    value: T,
  ) {
    setter((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  function renderOption<Value extends string>({
    icon,
    isSelected,
    label,
    onPress,
    value,
    tint,
    // "single" groups (one choice replaces the last) get a radio-style dot;
    // "multi" groups (choices co-occur) get a checkmark — so it's visible at
    // a glance whether picking another option adds to or replaces the first.
    selectionMode = "multi",
  }: LogOption<Value> & {
    isSelected: boolean;
    onPress: () => void;
    tint: LogCategoryTint;
    selectionMode?: "multi" | "single";
  }) {
    return (
      <TouchableOpacity
        key={value}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        activeOpacity={0.85}
        onPress={onPress}
        style={{
          alignItems: "center",
          backgroundColor: isSelected ? tint.light : colors.input,
          borderColor: isSelected ? tint.color : colors.border,
          borderRadius: 30,
          borderWidth: isSelected ? 1.5 : 1,
          flexDirection: "row",
          gap: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
        }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: isSelected ? tint.fill : tint.light,
            borderRadius: 999,
            height: 28,
            justifyContent: "center",
            width: 28,
          }}
        >
          <Ionicons
            name={icon}
            size={14}
            color={isSelected ? colors.buttonText : tint.color}
          />
        </View>
        <Text
          style={{
            color: isSelected ? tint.color : colors.foreground,
            fontSize: 12.5,
            fontWeight: isSelected ? "800" : "700",
            fontFamily: fonts.body,
          }}
        >
          {label}
        </Text>
        {selectionMode === "single" ? (
          <View
            style={{
              alignItems: "center",
              borderColor: isSelected ? tint.color : colors.border,
              borderRadius: 7,
              borderWidth: 1.5,
              height: 14,
              justifyContent: "center",
              width: 14,
            }}
          >
            {isSelected && (
              <View
                style={{
                  backgroundColor: tint.color,
                  borderRadius: 3.5,
                  height: 7,
                  width: 7,
                }}
              />
            )}
          </View>
        ) : isSelected ? (
          <Ionicons name="checkmark-circle" size={15} color={tint.color} />
        ) : null}
      </TouchableOpacity>
    );
  }

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={() => confirmDiscardIfDirty(onClose)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Pressable
          accessibilityLabel="Close day details"
          onPress={() => confirmDiscardIfDirty(onClose)}
          style={{
            backgroundColor: colors.overlay,
            bottom: 0,
            left: 0,
            position: "absolute",
            right: 0,
            top: 0,
          }}
        />

        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1,
            maxHeight: "86%",
            overflow: "hidden",
            ...getShadow(colors, isDark),
          }}
        >
          <View style={{ alignItems: "center", paddingTop: 12 }}>
            <View
              style={{
                backgroundColor: colors.border,
                borderRadius: 3,
                height: 4,
                width: 44,
              }}
            />
          </View>

          <ScrollView
            ref={scrollRef}
            automaticallyAdjustKeyboardInsets
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              padding: 20,
              paddingBottom: 24,
            }}
          >
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  color: colors.foreground,
                  flex: 1,
                  fontSize: 18,
                  fontWeight: "700",
                  fontFamily: fonts.heading,
                }}
              >
                {dateLabel ?? `Day ${day}`}
              </Text>

              <TouchableOpacity
                onPress={() => confirmDiscardIfDirty(onClose)}
                accessibilityRole="button"
                accessibilityLabel="Close day details"
                hitSlop={8}
                style={{ padding: 8, margin: -8 }}
              >
                <Ionicons name="close" size={22} color={colors.mutedText} />
              </TouchableOpacity>
            </View>

            <Text
              style={{ color: colors.mutedText, marginTop: 8, lineHeight: 20, fontFamily: fonts.body }}
            >
              {phaseLabel
                ? `${phaseLabel} — log what changed today`
                : "Log what changed today"}
            </Text>

            {/* Menstrual flow */}
            <View onLayout={(e) => recordSection("flow", e.nativeEvent.layout.y)}>
              <SectionTitle title="Menstrual flow" icon="water" tint={tints.flow} />
              <View style={styles.optionWrap}>
                {flowOptions
                  .filter((flow) => flow.value !== "none")
                  .map((flow) =>
                    renderOption({
                      ...flow,
                      isSelected: selectedFlow === flow.value,
                      onPress: () =>
                        setSelectedFlow((current) =>
                          current === flow.value ? undefined : flow.value,
                        ),
                      selectionMode: "single",
                      tint: tints.flow,
                    }),
                  )}
                {renderOption({
                  ...bloodClotOption,
                  isSelected: selectedSymptoms.includes(bloodClotOption.value),
                  onPress: () => toggleSymptom(bloodClotOption.value),
                  tint: tints.flow,
                })}
              </View>
            </View>

            {/* Ovulation symptoms */}
            <SectionTitle title="Ovulation symptoms" icon="analytics-outline" tint={tints.ovulation} />
            <View style={styles.optionWrap}>
              {ovulationOptions.map((option) =>
                renderOption({
                  ...option,
                  isSelected: selectedSymptoms.includes(option.value),
                  onPress: () => toggleSymptom(option.value),
                  tint: tints.ovulation,
                }),
              )}
            </View>

            {/* Sex and sex drive */}
            <SectionTitle title="Sex and sex drive" icon="heart-outline" tint={tints.sex} />
            <View style={styles.optionWrap}>
              {sexOptions.map((option) =>
                renderOption({
                  ...option,
                  isSelected: selectedSymptoms.includes(option.value),
                  onPress: () => toggleSymptom(option.value),
                  tint: tints.sex,
                }),
              )}
            </View>

            {/* Mood */}
            <View onLayout={(e) => recordSection("mood", e.nativeEvent.layout.y)}>
              <SectionTitle title="Mood" icon="happy-outline" tint={tints.mood} />
              <View style={styles.optionWrap}>
                {moodOptions.map((mood) =>
                  renderOption({
                    ...mood,
                    isSelected: selectedMoods.includes(mood.value),
                    onPress: () => toggleInArray(setSelectedMoods, mood.value),
                    tint: tints.mood,
                  }),
                )}
              </View>
            </View>

            {/* Physical symptoms */}
            <View onLayout={(e) => recordSection("symptoms", e.nativeEvent.layout.y)}>
              <SectionTitle title="Physical symptoms" icon="pulse-outline" tint={tints.symptoms} />
              <View style={styles.optionWrap}>
                {symptomOptions.map((symptom) =>
                  renderOption({
                    ...symptom,
                    isSelected: selectedSymptoms.includes(symptom.value),
                    onPress: () => toggleSymptom(symptom.value),
                    tint: tints.symptoms,
                  }),
                )}
              </View>
            </View>

            {/* Vaginal discharge */}
            <SectionTitle title="Vaginal discharge" icon="water-outline" tint={tints.discharge} />
            <View style={styles.optionWrap}>
              {dischargeOptions.map((option) =>
                renderOption({
                  ...option,
                  isSelected: selectedDischarge === option.value,
                  onPress: () =>
                    setSelectedDischarge((current) =>
                      current === option.value ? undefined : option.value,
                    ),
                  selectionMode: "single",
                  tint: tints.discharge,
                }),
              )}
              {extraDischargeOptions.map((option) =>
                renderOption({
                  ...option,
                  isSelected: selectedSymptoms.includes(option.value),
                  onPress: () => toggleSymptom(option.value),
                  tint: tints.discharge,
                }),
              )}
            </View>

            {/* Digestion and stool */}
            <SectionTitle title="Digestion and stool" icon="nutrition-outline" tint={tints.digestion} />
            <View style={styles.optionWrap}>
              {renderOption({
                ...nauseaOption,
                isSelected: selectedSymptoms.includes(nauseaOption.value),
                onPress: () => toggleSymptom(nauseaOption.value),
                tint: tints.digestion,
              })}
              {digestionOptions
                .filter((option) => option.value !== "normal")
                .map((option) =>
                  renderOption({
                    ...option,
                    isSelected: selectedDigestions.includes(option.value),
                    onPress: () => toggleInArray(setSelectedDigestions, option.value),
                    tint: tints.digestion,
                  }),
                )}
            </View>

            {/* Pregnancy test */}
            <SectionTitle title="Pregnancy test" icon="flask-outline" tint={tints.pregnancy} />
            <View style={styles.optionWrap}>
              {pregnancyTestOptions.map((option) =>
                renderOption({
                  ...option,
                  isSelected: selectedSymptoms.includes(option.value),
                  onPress: () => toggleSymptom(option.value),
                  tint: tints.pregnancy,
                }),
              )}
            </View>

            {/* Physical activity */}
            <SectionTitle title="Physical activity" icon="fitness-outline" tint={tints.activity} />
            <View style={styles.optionWrap}>
              {exerciseOptions.map((option) =>
                renderOption({
                  ...option,
                  isSelected: selectedExercise.includes(option.value),
                  onPress: () => toggleExercise(option.value),
                  tint: tints.activity,
                }),
              )}
            </View>

            <SectionTitle title="Energy" icon="battery-half-outline" tint={tints.energy} />
            <View style={styles.optionWrap}>
              {energyOptions.map((energy) =>
                renderOption({
                  ...energy,
                  isSelected: selectedEnergy === energy.value,
                  onPress: () =>
                    setSelectedEnergy((current) =>
                      current === energy.value ? undefined : energy.value,
                    ),
                  selectionMode: "single",
                  tint: tints.energy,
                }),
              )}
            </View>

            <SectionTitle title="Skin" icon="sparkles-outline" tint={tints.skin} />
            <View style={styles.optionWrap}>
              {skinOptions.map((option) =>
                renderOption({
                  ...option,
                  isSelected: selectedSkins.includes(option.value),
                  onPress: () => toggleInArray(setSelectedSkins, option.value),
                  tint: tints.skin,
                }),
              )}
            </View>

            <SectionTitle title="Sleep Hours" icon="bed-outline" />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 }}>
              <TouchableOpacity
                onPress={() => setSleepHours((h) => Math.max(0, (h ?? 8) - 1))}
                accessibilityRole="button"
                accessibilityLabel="Decrease sleep hours"
                hitSlop={6}
                style={{
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 12,
                  width: 40,
                  height: 40,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold", fontFamily: fonts.body }}>-</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700", fontFamily: fonts.mono }}>
                {sleepHours !== undefined ? `${sleepHours} hrs` : "Not logged"}
              </Text>
              <TouchableOpacity
                onPress={() => setSleepHours((h) => Math.min(24, (h ?? 8) + 1))}
                accessibilityRole="button"
                accessibilityLabel="Increase sleep hours"
                hitSlop={6}
                style={{
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 12,
                  width: 40,
                  height: 40,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold", fontFamily: fonts.body }}>+</Text>
              </TouchableOpacity>
              {sleepHours !== undefined && (
                <TouchableOpacity onPress={() => setSleepHours(undefined)} style={{ marginLeft: "auto" }}>
                  <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            <SectionTitle title="Water Intake" icon="beaker-outline" />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 }}>
              <TouchableOpacity
                onPress={() => setWaterIntake((w) => Math.max(0, (w ?? 250) - 250))}
                accessibilityRole="button"
                accessibilityLabel="Decrease water intake"
                hitSlop={6}
                style={{
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 12,
                  width: 40,
                  height: 40,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold", fontFamily: fonts.body }}>-</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700", fontFamily: fonts.mono }}>
                {waterIntake !== undefined ? `${waterIntake} ml` : "Not logged"}
              </Text>
              <TouchableOpacity
                onPress={() => setWaterIntake((w) => Math.min(8000, (w ?? 0) + 250))}
                accessibilityRole="button"
                accessibilityLabel="Increase water intake"
                hitSlop={6}
                style={{
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 12,
                  width: 40,
                  height: 40,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "bold", fontFamily: fonts.body }}>+</Text>
              </TouchableOpacity>
              {waterIntake !== undefined && (
                <TouchableOpacity onPress={() => setWaterIntake(undefined)} style={{ marginLeft: "auto" }}>
                  <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={{ flexDirection: "row", gap: 16, marginTop: 18 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14, fontFamily: fonts.body }}>Weight (kg)</Text>
                <TextInput
                  value={weightText}
                  onChangeText={setWeightText}
                  keyboardType="numeric"
                  placeholder="e.g. 60.5"
                  placeholderTextColor={colors.mutedText}
                  style={{
                    backgroundColor: colors.input,
                    borderColor: colors.border,
                    borderRadius: 12,
                    borderWidth: 1,
                    color: colors.foreground,
                    marginTop: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 13,
                    fontFamily: fonts.body,
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14, fontFamily: fonts.body }}>BBT Temp (°C)</Text>
                <TextInput
                  value={tempText}
                  onChangeText={setTempText}
                  keyboardType="numeric"
                  placeholder="e.g. 36.6"
                  placeholderTextColor={colors.mutedText}
                  style={{
                    backgroundColor: colors.input,
                    borderColor: colors.border,
                    borderRadius: 12,
                    borderWidth: 1,
                    color: colors.foreground,
                    marginTop: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 13,
                    fontFamily: fonts.body,
                  }}
                />
              </View>
            </View>

            <SectionTitle title="Stress Level (1 - 10)" icon="pulse" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 10 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => {
                const isSelected = stressLevel === level;
                return (
                  <TouchableOpacity
                    key={level}
                    onPress={() => setStressLevel(isSelected ? undefined : level)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: isSelected ? "transparent" : colors.border,
                      backgroundColor: isSelected ? colors.primary : colors.input,
                    }}
                  >
                    <Text
                      style={{
                        color: isSelected ? colors.buttonText : colors.foreground,
                        fontSize: 12,
                        fontWeight: "bold",
                        fontFamily: fonts.mono,
                      }}
                    >
                      {level}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <SectionTitle title="Medications" icon="medkit-outline" />
            <TextInput
              value={medText}
              onChangeText={setMedText}
              placeholder="e.g. Ibuprofen, Vitamins (comma separated)"
              placeholderTextColor={colors.mutedText}
              style={{
                backgroundColor: colors.input,
                borderColor: colors.border,
                borderRadius: 12,
                borderWidth: 1,
                color: colors.foreground,
                marginTop: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 13,
                fontFamily: fonts.body,
              }}
            />

            <SectionTitle title="Intimate day" icon="heart-outline" />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 10,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.input,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  color: colors.mutedText,
                  fontSize: 12.5,
                  lineHeight: 16,
                  marginRight: 12,
                  fontFamily: fonts.body,
                }}
              >
                Tag today as intimate. Only this tag (not your other notes) is
                ever shown to a partner, and only if you&apos;ve turned on
                Intimacy Notes sharing.
              </Text>
              <Switch
                value={isIntimate}
                onValueChange={setIsIntimate}
                trackColor={{ true: colors.primary }}
              />
            </View>

            <SectionTitle title="Notes" icon="document-text-outline" />
            <TextInput
              value={noteText}
              onChangeText={setNoteText}
              multiline
              numberOfLines={4}
              placeholder="Describe symptoms, mood, medicine, or anything you noticed..."
              placeholderTextColor={colors.mutedText}
              style={{
                backgroundColor: colors.input,
                borderColor: colors.border,
                borderRadius: 12,
                borderWidth: 1,
                color: colors.foreground,
                marginTop: 10,
                minHeight: 96,
                padding: 12,
                textAlignVertical: "top",
                fontFamily: fonts.body,
              }}
            />
          </ScrollView>

          <View
            style={{
              borderTopColor: colors.border,
              borderTopWidth: 1,
              flexDirection: "row",
              gap: 8,
              padding: 16,
              paddingBottom: entry && onClearEntry ? 16 : Math.max(16, insets.bottom + 10),
            }}
          >
            <TouchableOpacity
              onPress={handleSave}
              activeOpacity={0.8}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityState={{ disabled: isSaving, busy: isSaving }}
              style={{
                flex: 1,
                borderRadius: 12,
                overflow: "hidden",
                backgroundColor: colors.primary,
                opacity: isSaving ? 0.75 : 1,
                paddingHorizontal: 16,
                paddingVertical: 13,
              }}
            >
              {isSaving ? (
                <ActivityIndicator color={colors.buttonText} />
              ) : (
                <Text
                  style={{
                    color: colors.buttonText,
                    fontWeight: "700",
                    textAlign: "center",
                    fontFamily: fonts.body,
                  }}
                >
                  Save Log
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleLog}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityState={{ disabled: isSaving }}
              style={{
                backgroundColor: colors.input,
                borderColor: colors.border,
                borderRadius: 12,
                borderWidth: 1,
                flex: 1,
                opacity: isSaving ? 0.6 : 1,
                paddingHorizontal: 16,
                paddingVertical: 13,
              }}
            >
              <Text
                style={{
                  color: colors.foreground,
                  fontWeight: "700",
                  textAlign: "center",
                  fontFamily: fonts.body,
                }}
              >
                Quick Log
              </Text>
            </TouchableOpacity>
          </View>

          {entry && onClearEntry ? (
            <TouchableOpacity
              onPress={handleClear}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel="Clear this day's log"
              hitSlop={6}
              style={{
                alignSelf: "center",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: -6,
                marginBottom: Math.max(12, insets.bottom),
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              <Ionicons name="trash-outline" size={15} color={colors.mutedText} />
              <Text style={{ color: colors.mutedText, fontSize: 13, fontWeight: "600", fontFamily: fonts.body }}>
                Clear this day&apos;s log
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </KeyboardAvoidingView>
      {/* Alerts raised while the sheet is open (discard, save errors) draw
          inside it; the root host's Modal would sit behind this one. Only
          while visible, so it never takes alerts from the rest of the app. */}
      {visible ? <AppModalHost inline /> : null}
    </Modal>
  );
}

function SectionTitle({
  title,
  icon,
  tint,
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Colors this section's header icon+dot to match its option chips below. */
  tint?: LogCategoryTint;
}) {
  const { colors, fonts } = useTheme();
  const accentColor = tint?.color ?? colors.primary;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18 }}>
      {icon ? <Ionicons name={icon} size={15} color={accentColor} /> : null}
      <Text
        style={{
          color: colors.foreground,
          fontWeight: "700",
          fontFamily: fonts.heading,
        }}
      >
        {title}
      </Text>
    </View>
  );
}

const styles = {
  optionWrap: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    marginTop: 10,
  },
};
