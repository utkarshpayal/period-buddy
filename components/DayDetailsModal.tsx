import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DayEntry } from "./AppState";
import { flowOptions, symptomOptions, type LogOption } from "./logOptions";
import { alert } from "../lib/alert";
import { getFriendlyErrorMessage } from "../lib/api";
import { addedSymptoms, parseDecimal } from "../lib/dayLog";
import type { LogFocus } from "../lib/logFocus";
import { BottomSheet } from "./BottomSheet";
import { AppModalHost } from "./modals/AppModalHost";
import { useTheme } from "./theme";
import { useSecureScreen } from "../lib/screenPrivacy";
import {
  getLogCategoryTints,
  getShadow,
  MOOD_OPTIONS,
  type LogCategoryTint,
} from "./ui-tokens";
import { Icon } from "./Icon";
import { Button } from "./Button";

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
  { icon: "heart-circle-outline", label: "Orgasm", value: "sex-orgasm" },
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
  { icon: "radio-button-on-outline", label: "Acne", value: "acne" },
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

const moodOptions: LogOption<NonNullable<DayEntry["mood"]>>[] = MOOD_OPTIONS;

const energyOptions: LogOption<NonNullable<DayEntry["energy"]>>[] = [
  { icon: "battery-charging-outline", label: "High", value: "high" },
  { icon: "battery-half-outline", label: "Steady", value: "steady" },
  { icon: "battery-half-outline", label: "Medium", value: "medium" },
  { icon: "battery-dead-outline", label: "Low", value: "low" },
];

// Hydrated "normal" digestion and retired exercise values have no chip; see hydrate().
const knownExerciseValues = new Set(exerciseOptions.map((option) => option.value));

/** Everything the form edits, in one comparable shape (dirty check, Quick Log warning). */
type FormValues = {
  note: string;
  energy: DayEntry["energy"];
  flow: DayEntry["flow"];
  moods: NonNullable<DayEntry["mood"]>[];
  symptoms: string[];
  sleepHours?: number;
  waterIntake?: number;
  weightText: string;
  tempText: string;
  stressLevel?: number;
  medText: string;
  isIntimate: boolean;
  digestions: NonNullable<DayEntry["digestion"]>[];
  skins: NonNullable<DayEntry["skin"]>[];
  discharge: DayEntry["discharge"];
  exercise: string[];
};

function formFromEntry(entry: DayEntry | undefined, details: string | undefined): FormValues {
  return {
    note: entry?.note ?? details ?? "",
    energy: entry?.energy,
    flow: entry?.flow,
    // Prefer the plural array when present; fall back to the scalar so
    // previously-saved single values still hydrate.
    moods: entry?.moods ?? (entry?.mood ? [entry.mood] : []),
    symptoms: entry?.symptoms ?? [],
    sleepHours: entry?.sleepHours,
    waterIntake: entry?.waterIntake,
    weightText: entry?.weight ? String(entry.weight) : "",
    tempText: entry?.temperature ? String(entry.temperature) : "",
    stressLevel: entry?.stressLevel,
    medText: entry?.medication ? entry.medication.join(", ") : "",
    isIntimate: entry?.isIntimate ?? false,
    // "normal" has no chip (an empty selection *means* normal — see the
    // filter in the render below), so strip it out here too; otherwise it
    // sits invisibly in the array and `handleSave`'s `selectedDigestions[0]`
    // can silently resave "normal" instead of whatever the user just picked.
    digestions: (entry?.digestions ?? (entry?.digestion ? [entry.digestion] : [])).filter((digestion) => digestion !== "normal"),
    skins: entry?.skins ?? (entry?.skin ? [entry.skin] : []),
    discharge: entry?.discharge,
    // Drop any previously-saved values that no longer have a matching chip
    // (exerciseOptions was replaced wholesale) — otherwise a stale value like
    // "walking" sits invisibly selected with no chip to toggle it off, and
    // silently resaves on every future edit of that day.
    exercise: (entry?.exercise ?? []).filter((value) => knownExerciseValues.has(value)),
  };
}

/** Order-insensitive, so toggling a chip off and on again isn't an edit. */
function formKey(values: FormValues): string {
  const sorted = (list: string[]) => [...list].sort();
  return JSON.stringify({
    ...values,
    note: values.note.trim(),
    moods: sorted(values.moods),
    symptoms: sorted(values.symptoms),
    digestions: sorted(values.digestions),
    skins: sorted(values.skins),
    exercise: sorted(values.exercise),
  });
}

export default function DayDetailsModal({
  visible,
  onClose,
  day,
  dateKey,
  loaded = true,
  loadFailed = false,
  onRetryLoad,
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
  /** The day being edited; the form loads from `entry` when this changes (not on every refetch). */
  dateKey?: string;
  /**
   * Whether the day's saved log is known yet. Until then Save and Quick Log
   * are off: a full save over a log that hasn't loaded would erase it.
   */
  loaded?: boolean;
  /** The day's saved log couldn't be loaded: Save turns into Try again. */
  loadFailed?: boolean;
  onRetryLoad?: () => void;
  dateLabel?: string;
  details?: string;
  entry?: DayEntry;
  phaseLabel?: string;
  /** Rejects when the save failed; the sheet then stays open with the error. */
  onSaveEntry?: (entry: Omit<DayEntry, "updatedAt">) => Promise<void>;
  onSaveNote?: (note: string) => void;
  /** Quick Log: the tags picked that the day's log doesn't have yet. */
  onLogSymptom?: (symptoms: string[]) => void;
  /** Deletes this day's saved log. The option only shows when there is a saved entry. */
  onClearEntry?: () => Promise<void>;
  /** When set, the modal scrolls to this section on open (Home quick actions). */
  focusSection?: LogFocus;
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
  // State can't block a second tap in the same frame; this can.
  const savingRef = useRef(false);
  // What this open's form started from; "dirty" is a difference from it.
  const [hydrated, setHydrated] = useState<FormValues>(() => formFromEntry(entry, details));
  // Read at hydration time only, so a refetch of the day while the sheet is
  // open (foreground, year reload) doesn't wipe the user's edits.
  const sourceRef = useRef({ entry, details });
  sourceRef.current = { entry, details };

  useEffect(() => {
    if (!visible) return;
    const values = formFromEntry(sourceRef.current.entry, sourceRef.current.details);
    setHydrated(values);
    setNoteText(values.note);
    setSelectedEnergy(values.energy);
    setSelectedFlow(values.flow);
    setSelectedMoods(values.moods);
    setSelectedSymptoms(values.symptoms);
    setSleepHours(values.sleepHours);
    setWaterIntake(values.waterIntake);
    setWeightText(values.weightText);
    setTempText(values.tempText);
    setStressLevel(values.stressLevel);
    setMedText(values.medText);
    setIsIntimate(values.isIntimate);
    setSelectedDigestions(values.digestions);
    setSelectedSkins(values.skins);
    setSelectedDischarge(values.discharge);
    setSelectedExercise(values.exercise);
    // `loaded` too: a sheet opened while the day was loading fills in once it arrives.
  }, [visible, dateKey, loaded]);

  const form: FormValues = {
    note: noteText,
    energy: selectedEnergy,
    flow: selectedFlow,
    moods: selectedMoods,
    symptoms: selectedSymptoms,
    sleepHours,
    waterIntake,
    weightText,
    tempText,
    stressLevel,
    medText,
    isIntimate,
    digestions: selectedDigestions,
    skins: selectedSkins,
    discharge: selectedDischarge,
    exercise: selectedExercise,
  };
  const formSignature = formKey(form);
  const hydratedSignature = useMemo(() => formKey(hydrated), [hydrated]);
  // Tracks whether anything has changed since this open's hydration, so an
  // accidental backdrop tap / close doesn't silently discard real edits.
  const isDirty = formSignature !== hydratedSignature;

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

  // Whether anything besides the symptom tags (which Quick Log saves) was
  // changed in the sheet; those edits would be dropped.
  function hasUnsavedByQuickLog() {
    return formSignature !== formKey({ ...hydrated, symptoms: selectedSymptoms });
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
    if (savingRef.current || !loaded) return;

    if (!onSaveEntry) {
      if (onSaveNote) onSaveNote(noteText.trim());
      onClose();
      return;
    }

    const parsedWeight = parseDecimal(weightText, 20, 300);
    const parsedTemp = parseDecimal(tempText, 30, 45);
    if (parsedWeight === null || parsedTemp === null) {
      alert(
        "Check your entry",
        parsedWeight === null
          ? "Weight should be a number in kg, like 58.5."
          : "Temperature should be in °C, like 36.6.",
      );
      return;
    }
    const meds = medText
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);

    try {
      savingRef.current = true;
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
      alert("Couldn't save", getFriendlyErrorMessage(error));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  // Clears straight away, with no confirm step. The button only shows for a
  // day that already has a saved log.
  async function handleClear() {
    if (savingRef.current || !onClearEntry) return;
    try {
      savingRef.current = true;
      setIsSaving(true);
      await onClearEntry();
      onClose();
    } catch (error) {
      alert("Couldn't clear", getFriendlyErrorMessage(error));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  function performQuickLog(symptoms: string[]) {
    if (savingRef.current) return;
    onLogSymptom?.(symptoms);
    onClose();
  }

  function handleLog() {
    if (savingRef.current || !loaded) return;
    // Only what's new for the day; tags already on the log are kept as they are.
    const added = addedSymptoms(selectedSymptoms, hydrated.symptoms);
    if (added.length === 0) {
      alert("Pick a symptom", "Quick Log saves the symptom tags you pick. Tap one first, or use \"Save Log\" for everything else.");
      return;
    }

    if (hasUnsavedByQuickLog()) {
      alert(
        "Quick Log skips your other entries",
        "You've filled in other sections (mood, flow, sleep, etc.) that Quick Log won't save — only your symptom tags will be logged. Use \"Save Log\" instead to keep everything.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Quick Log anyway", style: "destructive", onPress: () => performQuickLog(added) },
        ],
      );
      return;
    }

    performQuickLog(added);
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
          borderRadius: 30, borderCurve: "continuous",
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
          <Icon set="ion"
            name={icon}
            size={14}
            color={isSelected ? colors.buttonText : tint.color}
          />
        </View>
        <Text
          style={{
            color: isSelected ? tint.color : colors.foreground,
            fontSize: 13.5,
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
          <Icon set="ion" name="checkmark-circle" size={15} color={tint.color} />
        ) : null}
      </TouchableOpacity>
    );
  }

  return (
    <BottomSheet
      visible={visible}
      // May ask "discard changes?" first, so the sheet stays up behind the prompt.
      onClose={() => confirmDiscardIfDirty(onClose)}
      animateOutBeforeClose={false}
      avoidKeyboard
      androidKeyboardBehavior="height"
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      backdropLabel="Close day details"
      style={{ backgroundColor: colors.surface, borderWidth: 1, maxHeight: "86%", ...getShadow(colors, isDark) }}
      // Alerts raised while the sheet is open (discard, save errors) draw
      // inside it; the root host's Modal would sit behind this one. Only
      // while visible, so it never takes alerts from the rest of the app.
      overlay={visible ? <AppModalHost inline /> : null}
    >

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
            <Icon set="ion" name="close" size={22} color={colors.mutedText} />
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
        <SectionTitle title="Vaginal discharge" onY={(y) => recordSection("discharge", y)} icon="water-outline" tint={tints.discharge} />
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
        <SectionTitle title="Digestion and stool" onY={(y) => recordSection("digestion", y)} icon="nutrition-outline" tint={tints.digestion} />
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
        <SectionTitle title="Physical activity" onY={(y) => recordSection("activity", y)} icon="fitness-outline" tint={tints.activity} />
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

        <SectionTitle title="Energy" onY={(y) => recordSection("energy", y)} icon="battery-half-outline" tint={tints.energy} />
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

        <SectionTitle title="Skin" onY={(y) => recordSection("skin", y)} icon="happy-outline" tint={tints.skin} />
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

        <SectionTitle title="Sleep Hours" onY={(y) => recordSection("sleep", y)} icon="bed-outline" />
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

        <SectionTitle title="Water Intake" onY={(y) => recordSection("water", y)} icon="beaker-outline" />
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
              accessibilityLabel="Weight in kilograms"
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
              accessibilityLabel="Body temperature in degrees Celsius"
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

        <SectionTitle title="Stress Level (1 - 10)" onY={(y) => recordSection("stress", y)} icon="pulse" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 10 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => {
            const isSelected = stressLevel === level;
            return (
              <TouchableOpacity
                hitSlop={{ top: 7, bottom: 7 }}
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
                    fontSize: 13,
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

        <SectionTitle title="Medications" onY={(y) => recordSection("medications", y)} icon="medkit-outline" />
        <TextInput
          value={medText}
          onChangeText={setMedText}
          accessibilityLabel="Medicines taken"
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
              fontSize: 13.5,
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

        <SectionTitle title="Notes" onY={(y) => recordSection("notes", y)} icon="document-text-outline" />
        <TextInput
          value={noteText}
          onChangeText={setNoteText}
          multiline
          numberOfLines={4}
          accessibilityLabel="Notes for this day"
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
        {!loaded && loadFailed && onRetryLoad ? (
          // Saving over a log we couldn't read would erase it, so offer a retry, not an endless spinner.
          <Button label="Couldn't load · Try again" icon="refresh" variant="secondary" size="md" onPress={onRetryLoad} style={{ flex: 1 }} />
        ) : (
          <Button label="Save log" size="md" onPress={handleSave} loading={isSaving || !loaded} style={{ flex: 1 }} />
        )}

        <TouchableOpacity
          onPress={handleLog}
          disabled={isSaving || !loaded}
          accessibilityRole="button"
          accessibilityState={{ disabled: isSaving || !loaded }}
          style={{
            backgroundColor: colors.input,
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            flex: 1,
            opacity: isSaving || !loaded ? 0.6 : 1,
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
          <Icon set="ion" name="trash-outline" size={15} color={colors.mutedText} />
          <Text style={{ color: colors.mutedText, fontSize: 13, fontWeight: "600", fontFamily: fonts.body }}>
            Clear this day&apos;s log
          </Text>
        </TouchableOpacity>
      ) : null}
    </BottomSheet>
  );
}

function SectionTitle({
  title,
  icon,
  tint,
  onY,
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Reports this heading's top (margin included) so a quick action can scroll to it. */
  onY?: (y: number) => void;
  /** Colors this section's header icon+dot to match its option chips below. */
  tint?: LogCategoryTint;
}) {
  const { colors, fonts } = useTheme();
  const accentColor = tint?.color ?? colors.primary;

  return (
    <View
      onLayout={onY ? (e) => onY(e.nativeEvent.layout.y - 18) : undefined}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18 }}
    >
      {icon ? <Icon set="ion" name={icon} size={15} color={accentColor} /> : null}
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
