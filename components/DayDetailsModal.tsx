import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import type { DayEntry } from "./AppState";
import { useTheme } from "./theme";
import { getActionGradient } from "./ui-tokens";

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
];

const flowOptions: LogOption<NonNullable<DayEntry["flow"]>>[] = [
  { icon: "remove-circle-outline", label: "None", value: "none" },
  { icon: "water-outline", label: "Light", value: "light" },
  { icon: "water", label: "Medium", value: "medium" },
  { icon: "rainy-outline", label: "Heavy", value: "heavy" },
];

const moodOptions: LogOption<NonNullable<DayEntry["mood"]>>[] = [
  { icon: "happy-outline", label: "Happy", value: "happy" },
  { icon: "leaf-outline", label: "Calm", value: "calm" },
  { icon: "cloud-outline", label: "Emotional", value: "emotional" },
  { icon: "moon-outline", label: "Tired", value: "tired" },
];

const energyOptions: LogOption<NonNullable<DayEntry["energy"]>>[] = [
  { icon: "battery-charging-outline", label: "High", value: "high" },
  { icon: "battery-half-outline", label: "Steady", value: "steady" },
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
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const actionGradient = getActionGradient(colors) as [string, string];
  const [noteText, setNoteText] = useState(details ?? "");
  const [selectedEnergy, setSelectedEnergy] = useState<DayEntry["energy"]>();
  const [selectedFlow, setSelectedFlow] = useState<DayEntry["flow"]>();
  const [selectedMood, setSelectedMood] = useState<DayEntry["mood"]>();
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;

    setNoteText(entry?.note ?? details ?? "");
    setSelectedEnergy(entry?.energy);
    setSelectedFlow(entry?.flow);
    setSelectedMood(entry?.mood);
    setSelectedSymptoms(entry?.symptoms ?? []);
  }, [visible, details, entry]);

  function handleSave() {
    if (onSaveEntry) {
      onSaveEntry({
        energy: selectedEnergy,
        flow: selectedFlow,
        mood: selectedMood,
        note: noteText.trim(),
        symptoms: selectedSymptoms,
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

  function renderOption<Value extends string>({
    icon,
    isSelected,
    label,
    onPress,
  }: LogOption<Value> & {
    isSelected: boolean;
    onPress: () => void;
  }) {
    return (
      <TouchableOpacity
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
          <LinearGradient
            colors={actionGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              alignItems: "center",
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
              }}
            >
              {label}
            </Text>
          </LinearGradient>
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
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            borderWidth: 1,
            maxHeight: "86%",
            overflow: "hidden",
          }}
        >
          <View style={{ alignItems: "center", paddingTop: 10 }}>
            <View
              style={{
                backgroundColor: colors.border,
                borderRadius: 2,
                height: 4,
                width: 44,
              }}
            />
          </View>

          <ScrollView
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
              style={{ color: colors.mutedText, marginTop: 8, lineHeight: 20 }}
            >
              {phaseLabel
                ? `${phaseLabel} - log what changed today`
                : "Log what changed today"}
            </Text>

            <SectionTitle title="Symptoms" />
            <View style={styles.optionWrap}>
              {symptomOptions.map((symptom) =>
                renderOption({
                  ...symptom,
                  isSelected: selectedSymptoms.includes(symptom.value),
                  onPress: () => toggleSymptom(symptom.value),
                }),
              )}
            </View>

            <SectionTitle title="Flow" />
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

            <SectionTitle title="Mood" />
            <View style={styles.optionWrap}>
              {moodOptions.map((mood) =>
                renderOption({
                  ...mood,
                  isSelected: selectedMood === mood.value,
                  onPress: () =>
                    setSelectedMood((current) =>
                      current === mood.value ? undefined : mood.value,
                    ),
                }),
              )}
            </View>

            <SectionTitle title="Energy" />
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

            <SectionTitle title="Notes" />
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
              }}
            >
              <LinearGradient
                colors={actionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 13,
                }}
              >
                <Text
                  style={{
                    color: colors.buttonText,
                    fontWeight: "700",
                    textAlign: "center",
                  }}
                >
                  Save Log
                </Text>
              </LinearGradient>
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

function SectionTitle({ title }: { title: string }) {
  const { colors } = useTheme();

  return (
    <Text
      style={{
        color: colors.foreground,
        fontWeight: "700",
        marginTop: 18,
      }}
    >
      {title}
    </Text>
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
