import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AuthUser } from "../../lib/api";
import { ageFromDateOfBirth } from "../../lib/onboarding";
import { canonicalStateName } from "../../lib/schemeHelpers";
import { AppModalHost } from "../modals/AppModalHost";
import { useTheme } from "../theme";
import { StatePicker } from "./StatePicker";
import { Icon } from "../Icon";

export type EligibilityAnswers = { age?: number; isPregnant?: boolean; state?: string };

/**
 * "Check if you may be eligible": age, pregnant, state. Each open seeds the
 * age and state from the profile; the screen runs the check in `onSubmit`
 * and closes the sheet when it succeeds.
 */
export function EligibilityCheckerSheet({
  visible,
  onClose,
  user,
  checking,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  user: AuthUser | null;
  checking: boolean;
  onSubmit: (answers: EligibilityAnswers) => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors, fonts } = useTheme();
  const [ageInput, setAgeInput] = useState("");
  const [pregnantInput, setPregnantInput] = useState<boolean | null>(null);
  const [stateInput, setStateInput] = useState("");
  const [statePickerOpen, setStatePickerOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStatePickerOpen(false);
    // Calendar-exact, so it's never a year off around a birthday.
    const age = ageFromDateOfBirth(user?.dateOfBirth);
    if (age !== null && age > 0) setAgeInput(String(age));
    if (user?.state) setStateInput(canonicalStateName(user.state));
    // Only on open: the profile changing mid-check must not wipe answers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const submit = () => {
    const parsedAge = Number(ageInput);
    onSubmit({
      age: ageInput && Number.isFinite(parsedAge) ? parsedAge : undefined,
      isPregnant: pregnantInput ?? undefined,
      state: stateInput.trim() || undefined,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-end"
        style={{ backgroundColor: colors.overlay }}
      >
        <View
          style={{
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 24,
            paddingTop: 16,
            maxHeight: "92%",
            backgroundColor: colors.background,
            paddingBottom: Math.max(insets.bottom, 12) + 16,
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
              <Text
                accessibilityRole="header"
                style={{ flexShrink: 1, fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}
              >
                Check if you may be eligible
              </Text>
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                className="items-center justify-center"
                style={{ width: 44, height: 44, borderRadius: 22, marginRight: -10 }}
              >
                <Icon set="ion" name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <Text style={{ marginBottom: 18, fontSize: 14, lineHeight: 20, fontWeight: "400", color: colors.foreground, fontFamily: fonts.body }}>
              Answer a few questions for a better guess. Only the scheme office can confirm it.
            </Text>

            {/* Age */}
            <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
              Your age
            </Text>
            <TextInput
              value={ageInput}
              onChangeText={(t) => setAgeInput(t.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              placeholder="e.g. 24"
              placeholderTextColor={colors.mutedText}
              accessibilityLabel="Your age"
              maxLength={3}
              maxFontSizeMultiplier={1.4}
              style={{
                height: 48,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 14,
                marginBottom: 18,
                fontSize: 15,
                backgroundColor: colors.surface,
                color: colors.foreground,
                fontFamily: fonts.body,
              }}
            />

            {/* Pregnant */}
            <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
              Are you pregnant right now?
            </Text>
            <View className="flex-row" style={{ gap: 10, marginBottom: 18 }}>
              {[
                { label: "Yes", value: true },
                { label: "No", value: false },
              ].map((opt) => {
                const active = pregnantInput === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    activeOpacity={0.8}
                    onPress={() => setPregnantInput(active ? null : opt.value)}
                    accessibilityRole="button"
                    accessibilityLabel={opt.label}
                    accessibilityState={{ selected: active }}
                    className="flex-1 items-center justify-center"
                    style={{
                      height: 48,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : colors.surface,
                    }}
                  >
                    <Text
                      maxFontSizeMultiplier={1.3}
                      style={{ fontSize: 15, fontWeight: "700", color: active ? colors.buttonText : colors.foreground, fontFamily: fonts.body }}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* State picker */}
            <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
              Your state or UT
            </Text>
            <StatePicker value={stateInput} onChange={setStateInput} open={statePickerOpen} onOpenChange={setStatePickerOpen} />

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={submit}
              disabled={checking}
              accessibilityRole="button"
              accessibilityLabel="See my result"
              accessibilityState={{ disabled: checking, busy: checking }}
              className="items-center justify-center"
              style={{ marginTop: 22, height: 48, borderRadius: 16, backgroundColor: colors.primary }}
            >
              {checking ? (
                <ActivityIndicator size="small" color={colors.buttonText} />
              ) : (
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={{ fontSize: 15, fontWeight: "700", color: colors.buttonText, fontFamily: fonts.heading }}
                >
                  See my result
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      {/* The checker's alerts draw on top of the sheet, not behind it. */}
      {visible ? <AppModalHost inline /> : null}
    </Modal>
  );
}
