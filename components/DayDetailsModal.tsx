import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
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
import { useTheme } from "./theme";
import { getShadow, MOOD_OPTIONS } from "./ui-tokens";

type LogOption<Value extends string> = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: Value;
};

const symptomOptions: LogOption<string>[] = [
  { icon: "pulse-outline", label: "Cramps", value: "cramps" },
  { icon: "water-outline", label: "Bloating", value: "bloating" },
  { icon: "flash-outline", label: "Headache", value: "headache" },
  { icon: "bed-outline", label: "Fatigue", value: "fatigue" },
  { icon: "restaurant-outline", label: "Cravings", value: "cravings" },
  { icon: "happy-outline", label: "Mood swing", value: "mood-swing" },
  { icon: "warning-outline", label: "Nausea", value: "nausea" },
  { icon: "body-outline", label: "Backache", value: "backache" },
  { icon: "sparkles-outline", label: "Acne", value: "acne" },
  { icon: "heart-half-outline", label: "Tender breasts", value: "tender-breasts" },
  { icon: "flag-outline", label: "Constipation", value: "constipation" },
  { icon: "moon-outline", label: "Insomnia", value: "insomnia" },
];

const digestionOptions: LogOption<NonNullable<DayEntry["digestion"]>>[] = [
  { icon: "checkmark-circle-outline", label: "Normal", value: "normal" },
  { icon: "swap-vertical-outline", label: "Constipated", value: "constipated" },
  { icon: "thunderstorm-outline", label: "Diarrhea", value: "diarrhea" },
  { icon: "water-outline", label: "Bloated", value: "bloated" },
];

const skinOptions: LogOption<NonNullable<DayEntry["skin"]>>[] = [
  { icon: "sunny-outline", label: "Clear", value: "clear" },
  { icon: "water-outline", label: "Oily", value: "oily" },
  { icon: "snow-outline", label: "Dry", value: "dry" },
  { icon: "sparkles-outline", label: "Acne", value: "acne" },
];

const dischargeOptions: LogOption<NonNullable<DayEntry["discharge"]>>[] = [
  { icon: "remove-circle-outline", label: "None", value: "none" },
  { icon: "ellipse-outline", label: "Sticky", value: "sticky" },
  { icon: "water-outline", label: "Creamy", value: "creamy" },
  { icon: "rainy-outline", label: "Watery", value: "watery" },
  { icon: "egg-outline", label: "Egg-white", value: "egg-white" },
];

const exerciseOptions: LogOption<string>[] = [
  { icon: "walk-outline", label: "Walking", value: "walking" },
  { icon: "bicycle-outline", label: "Cardio", value: "cardio" },
  { icon: "barbell-outline", label: "Strength", value: "strength" },
  { icon: "body-outline", label: "Yoga", value: "yoga" },
  { icon: "fitness-outline", label: "Stretching", value: "stretching" },
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
  focusSection,
}: {
  visible: boolean;
  onClose: () => void;
  day?: number;
  dateLabel?: string;
  details?: string;
  entry?: DayEntry;
  phaseLabel?: string;
  onSaveEntry?: (entry: Omit<DayEntry, "updatedAt">) => void;
  onSaveNote?: (note: string) => void;
  onLogSymptom?: (symptom: string) => void;
  /** When set, the modal scrolls to this section on open (Home quick actions). */
  focusSection?: "symptoms" | "flow" | "mood";
}) {
  const { colors, fonts, isDark } = useTheme();
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

  useEffect(() => {
    if (!visible) return;

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
    setSelectedDigestions(entry?.digestions ?? (entry?.digestion ? [entry.digestion] : []));
    setSelectedSkins(entry?.skins ?? (entry?.skin ? [entry.skin] : []));
    setSelectedDischarge(entry?.discharge);
    setSelectedExercise(entry?.exercise ?? []);
  }, [visible, details, entry]);

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

  function handleSave() {
    if (onSaveEntry) {
      const parsedWeight = parseFloat(weightText) || undefined;
      const parsedTemp = parseFloat(tempText) || undefined;
      const meds = medText
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean);

      onSaveEntry({
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
    } else if (onSaveNote) {
      onSaveNote(noteText.trim());
    }

    onClose();
  }

  function handleLog() {
    const symptom = selectedSymptoms[0] ?? "general";

    if (onLogSymptom) onLogSymptom(symptom);
    onClose();
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
  }: LogOption<Value> & {
    isSelected: boolean;
    onPress: () => void;
  }) {
    return (
      <TouchableOpacity
        key={value}
        accessibilityRole="button"
        activeOpacity={0.85}
        onPress={onPress}
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: isSelected ? "transparent" : colors.border,
          overflow: "hidden",
        }}
      >
        {isSelected ? (
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.primary,
              flexDirection: "row",
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Ionicons
              name={icon}
              size={16}
              color={colors.buttonText}
            />
            <Text
              style={{
                color: colors.buttonText,
                fontSize: 12,
                fontWeight: "700",
                fontFamily: fonts.body,
              }}
            >
              {label}
            </Text>
          </View>
        ) : (
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.input,
              flexDirection: "row",
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Ionicons
              name={icon}
              size={16}
              color={colors.foreground}
            />
            <Text
              style={{
                color: colors.foreground,
                fontSize: 12,
                fontWeight: "700",
                fontFamily: fonts.body,
              }}
            >
              {label}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Pressable
          accessibilityLabel="Close day details"
          onPress={onClose}
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
                onPress={onClose}
                accessibilityLabel="Close day details"
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

            <View onLayout={(e) => recordSection("symptoms", e.nativeEvent.layout.y)}>
              <SectionTitle title="Symptoms" icon="pulse-outline" />
              <View style={styles.optionWrap}>
                {symptomOptions.map((symptom) =>
                  renderOption({
                    ...symptom,
                    isSelected: selectedSymptoms.includes(symptom.value),
                    onPress: () => toggleSymptom(symptom.value),
                  }),
                )}
              </View>
            </View>

            <View onLayout={(e) => recordSection("flow", e.nativeEvent.layout.y)}>
              <SectionTitle title="Flow" icon="water" />
              <View style={styles.optionWrap}>
                {flowOptions.map((flow) =>
                  renderOption({
                    ...flow,
                    isSelected: selectedFlow === flow.value,
                    onPress: () =>
                      setSelectedFlow((current) =>
                        current === flow.value ? undefined : flow.value,
                      ),
                  }),
                )}
              </View>
            </View>

            <View onLayout={(e) => recordSection("mood", e.nativeEvent.layout.y)}>
            <SectionTitle title="Mood" icon="happy-outline" />
            <View style={styles.optionWrap}>
              {moodOptions.map((mood) =>
                renderOption({
                  ...mood,
                  isSelected: selectedMoods.includes(mood.value),
                  onPress: () => toggleInArray(setSelectedMoods, mood.value),
                }),
              )}
            </View>
            </View>

            <SectionTitle title="Energy" icon="battery-half-outline" />
            <View style={styles.optionWrap}>
              {energyOptions.map((energy) =>
                renderOption({
                  ...energy,
                  isSelected: selectedEnergy === energy.value,
                  onPress: () =>
                    setSelectedEnergy((current) =>
                      current === energy.value ? undefined : energy.value,
                    ),
                }),
              )}
            </View>

            <SectionTitle title="Digestion" icon="nutrition-outline" />
            <View style={styles.optionWrap}>
              {digestionOptions.map((option) =>
                renderOption({
                  ...option,
                  isSelected: selectedDigestions.includes(option.value),
                  onPress: () => toggleInArray(setSelectedDigestions, option.value),
                }),
              )}
            </View>

            <SectionTitle title="Skin" icon="sparkles-outline" />
            <View style={styles.optionWrap}>
              {skinOptions.map((option) =>
                renderOption({
                  ...option,
                  isSelected: selectedSkins.includes(option.value),
                  onPress: () => toggleInArray(setSelectedSkins, option.value),
                }),
              )}
            </View>

            <SectionTitle title="Discharge" icon="water-outline" />
            <View style={styles.optionWrap}>
              {dischargeOptions.map((option) =>
                renderOption({
                  ...option,
                  isSelected: selectedDischarge === option.value,
                  onPress: () =>
                    setSelectedDischarge((current) =>
                      current === option.value ? undefined : option.value,
                    ),
                }),
              )}
            </View>

            <SectionTitle title="Exercise" icon="fitness-outline" />
            <View style={styles.optionWrap}>
              {exerciseOptions.map((option) =>
                renderOption({
                  ...option,
                  isSelected: selectedExercise.includes(option.value),
                  onPress: () => toggleExercise(option.value),
                }),
              )}
            </View>

            <SectionTitle title="Sleep Hours" icon="bed-outline" />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 }}>
              <TouchableOpacity
                onPress={() => setSleepHours((h) => Math.max(0, (h ?? 8) - 1))}
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
                  <Text style={{ color: colors.mutedText, fontSize: 12, fontFamily: fonts.body }}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            <SectionTitle title="Water Intake" icon="beaker-outline" />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 }}>
              <TouchableOpacity
                onPress={() => setWaterIntake((w) => Math.max(0, (w ?? 250) - 250))}
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
                  <Text style={{ color: colors.mutedText, fontSize: 12, fontFamily: fonts.body }}>Clear</Text>
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
                  fontSize: 11.5,
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
              paddingBottom: Math.max(16, insets.bottom + 10),
            }}
          >
            <TouchableOpacity
              onPress={handleSave}
              activeOpacity={0.8}
              style={{
                flex: 1,
                borderRadius: 12,
                overflow: "hidden",
                backgroundColor: colors.primary,
                paddingHorizontal: 16,
                paddingVertical: 13,
              }}
            >
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
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleLog}
              style={{
                backgroundColor: colors.input,
                borderColor: colors.border,
                borderRadius: 12,
                borderWidth: 1,
                flex: 1,
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SectionTitle({ title, icon }: { title: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const { colors, fonts } = useTheme();

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18 }}>
      {icon ? <Ionicons name={icon} size={15} color={colors.primary} /> : null}
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
