import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DayEntry } from "./AppState";
import { flowOptions, symptomOptions, type LogOption } from "./logOptions";
import { useTheme } from "./theme";
import { getLogCategoryTints, MOOD_OPTIONS, type LogCategoryTint } from "./ui-tokens";
import { isPeriodFlow, type DayLogPatch } from "../hooks/useTodayLog";
import { useSecureScreen } from "../lib/screenPrivacy";

export type QuickLogKind = "flow" | "symptoms" | "mood";

const FINE = "everything-is-fine";
const SYMPTOM_VALUES = new Set(symptomOptions.map((o) => o.value));

const COPY: Record<QuickLogKind, { title: string; hint: string; icon: keyof typeof Ionicons.glyphMap }> = {
  flow: { title: "Log period", hint: "How heavy is your flow?", icon: "water" },
  symptoms: { title: "Symptoms", hint: "Pick everything you feel today", icon: "pulse-outline" },
  mood: { title: "Mood", hint: "Pick all that fit today", icon: "happy-outline" },
};

/** What the sheet starts with for `kind`, read from today's log. */
function initialPicks(kind: QuickLogKind, entry: DayEntry | null | undefined): string[] {
  if (!entry) return [];
  if (kind === "flow") return entry.flow ? [entry.flow] : [];
  if (kind === "mood") return entry.moods?.length ? [...entry.moods] : entry.mood ? [entry.mood] : [];
  return entry.symptoms.filter((s) => SYMPTOM_VALUES.has(s));
}

/**
 * Home's quick log: one category of today's log in a bottom sheet (flow,
 * symptoms or mood), saved with one tap. "All details" saves any unsaved
 * picks, closes the sheet, and opens the full day log at that section once
 * `onDismissed` reports the sheet is gone.
 */
export function QuickLogSheet({
  kind,
  entry,
  dateLabel,
  onClose,
  onSave,
  onOpenFullLog,
  onDismissed,
}: {
  kind: QuickLogKind | null;
  entry: DayEntry | null | undefined;
  dateLabel: string;
  onClose: () => void;
  onSave: (patch: DayLogPatch) => Promise<boolean>;
  onOpenFullLog: (kind: QuickLogKind) => void;
  /** The sheet has finished closing (after its slide-out on iOS). */
  onDismissed?: () => void;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const [picks, setPicks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useSecureScreen("quick-log", kind !== null);
  // The last opened kind, so the sheet keeps its content while it slides out.
  const [shownKind, setShownKind] = useState<QuickLogKind | null>(kind);
  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;

  useEffect(() => {
    if (kind) {
      setShownKind(kind);
      return;
    }
    // iOS reports the end of the slide-out through `onDismiss`; elsewhere the
    // next modal can open straight away.
    if (Platform.OS !== "ios") onDismissedRef.current?.();
  }, [kind]);

  useEffect(() => {
    if (kind) setPicks(initialPicks(kind, entry));
    // Reset only when the sheet opens, not when a background refresh updates `entry`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const tints = getLogCategoryTints(colors);
  const options: LogOption<string>[] = shownKind === "mood" ? MOOD_OPTIONS : symptomOptions;
  const tint: LogCategoryTint = shownKind === "flow" ? tints.flow : shownKind === "mood" ? tints.mood : tints.symptoms;
  const initial = useMemo(() => (shownKind ? initialPicks(shownKind, entry) : []), [shownKind, entry]);
  const changed = [...picks].sort().join() !== [...initial].sort().join();

  if (!shownKind) return null;
  // Narrowed for the handlers below; while closing it's the kind that was open.
  const sheetKind: QuickLogKind = shownKind;
  const copy = sheetKind === "flow" && isPeriodFlow(entry?.flow) ? { ...COPY.flow, title: "Period flow" } : COPY[sheetKind];

  // Flow is one question: tapping an answer saves it and closes the sheet.
  const saveFlow = async (value: NonNullable<DayEntry["flow"]>) => {
    if (saving) return;
    setPicks([value]);
    setSaving(true);
    const ok = await onSave({ flow: value });
    setSaving(false);
    if (ok) onClose();
    else setPicks(initialPicks("flow", entry));
  };

  const toggle = (value: string) => {
    setPicks((current) => {
      if (current.includes(value)) return current.filter((v) => v !== value);
      // "Everything is fine" can't sit next to a symptom.
      if (sheetKind === "symptoms") return value === FINE ? [FINE] : [...current.filter((v) => v !== FINE), value];
      return [...current, value];
    });
  };

  /** Saves the picks; resolves true when saved (or nothing to save). */
  const savePicks = async (): Promise<boolean> => {
    if (sheetKind === "flow" || !changed) return true;
    let patch: DayLogPatch;
    if (sheetKind === "mood") {
      const moods = picks as NonNullable<DayEntry["mood"]>[];
      patch = { mood: moods[0], moods };
    } else {
      // Keep the tags other sections store in `symptoms` (blood clots, sex, tests...).
      const others = (entry?.symptoms ?? []).filter((s) => !SYMPTOM_VALUES.has(s));
      patch = { symptoms: [...others, ...picks] };
    }
    setSaving(true);
    const ok = await onSave(patch);
    setSaving(false);
    return ok;
  };

  const save = async () => {
    if (saving) return;
    if (await savePicks()) onClose();
  };

  // Picks made here aren't dropped: they're saved before the full log opens.
  const openFullLog = async () => {
    if (saving) return;
    if (await savePicks()) onOpenFullLog(sheetKind);
  };

  return (
    <Modal
      visible={kind !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={() => onDismissedRef.current?.()}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close"
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.45)" }}
        />
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 10,
            paddingHorizontal: 24,
            paddingBottom: Math.max(20, insets.bottom + 12),
            maxHeight: "85%",
          }}
        >
          <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 }} />

          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: tint.light }}>
              <Ionicons name={copy.icon} size={20} color={tint.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>{copy.title}</Text>
              <Text style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body, marginTop: 1 }}>
                {dateLabel} · {copy.hint}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              accessibilityLabel="Close"
              hitSlop={8}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSoft }}
            >
              <Ionicons name="close" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {sheetKind === "flow" ? (
            <>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
                {flowOptions
                  .filter((o) => o.value !== "none")
                  .map((o) => {
                    const on = picks[0] === o.value;
                    return (
                      <TouchableOpacity
                        key={o.value}
                        onPress={() => saveFlow(o.value)}
                        disabled={saving}
                        activeOpacity={0.85}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on, disabled: saving }}
                        accessibilityLabel={`${o.label} flow`}
                        style={{
                          flex: 1,
                          alignItems: "center",
                          gap: 8,
                          paddingVertical: 14,
                          borderRadius: 18,
                          borderWidth: on ? 1.5 : 1,
                          borderColor: on ? tint.color : colors.border,
                          backgroundColor: on ? tint.light : colors.surface,
                        }}
                      >
                        <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: on ? tint.fill : tint.light }}>
                          {saving && on ? (
                            <ActivityIndicator size="small" color={colors.buttonText} />
                          ) : (
                            <Ionicons name={o.icon} size={19} color={on ? colors.buttonText : tint.color} />
                          )}
                        </View>
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                          maxFontSizeMultiplier={1.3}
                          style={{ fontSize: 13, fontWeight: "800", color: on ? tint.color : colors.foreground, fontFamily: fonts.body, paddingHorizontal: 4 }}
                        >
                          {o.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </View>
              {isPeriodFlow(entry?.flow) ? (
                <TouchableOpacity
                  onPress={() => saveFlow("none")}
                  disabled={saving}
                  accessibilityRole="button"
                  style={{ alignSelf: "center", paddingVertical: 12, marginTop: 8 }}
                >
                  <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body }}>Not on my period today</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ height: 12 }} />
              )}
            </>
          ) : (
            <>
              {/* Shrinks to fit so Save stays on screen on small phones. */}
              <ScrollView style={{ marginTop: 18, flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} showsVerticalScrollIndicator={false}>
                {options.map((o) => {
                  const on = picks.includes(o.value);
                  return (
                    <TouchableOpacity
                      key={o.value}
                      onPress={() => toggle(o.value)}
                      activeOpacity={0.85}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={o.label}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        paddingLeft: 6,
                        paddingRight: 12,
                        paddingVertical: 6,
                        borderRadius: 30,
                        borderWidth: on ? 1.5 : 1,
                        borderColor: on ? tint.color : colors.border,
                        backgroundColor: on ? tint.light : colors.input,
                      }}
                    >
                      <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: on ? tint.fill : tint.light }}>
                        <Ionicons name={on ? "checkmark" : o.icon} size={15} color={on ? colors.buttonText : tint.color} />
                      </View>
                      <Text style={{ fontSize: 13.5, fontWeight: on ? "800" : "700", color: on ? tint.color : colors.foreground, fontFamily: fonts.body }}>
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                onPress={save}
                disabled={!changed || saving}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ disabled: !changed || saving }}
                style={{
                  marginTop: 20,
                  height: 52,
                  borderRadius: 26,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.primary,
                  opacity: !changed || saving ? 0.5 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator color={colors.buttonText} />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: "800", color: colors.buttonText, fontFamily: fonts.body }}>Save</Text>
                )}
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            onPress={() => void openFullLog()}
            disabled={saving}
            accessibilityRole="button"
            accessibilityHint={changed && sheetKind !== "flow" ? "Saves your picks first" : undefined}
            style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 12, marginTop: 2 }}
          >
            <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.primary, fontFamily: fonts.body }}>All details for today</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
