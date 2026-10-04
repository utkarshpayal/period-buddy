import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { consultationApi, getFriendlyErrorMessage, type Consultation, type Doctor } from "../lib/api";
import { DoctorPhoto } from "./DoctorPhoto";
import { useTheme } from "./theme";

const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
const COMMENT_MAX = 500;

/** Whole-star rating of a finished session, once, with an optional comment. */
export function RateSessionSheet({
  consultation,
  doctorName,
  initialRating = 0,
  onClose,
  onRated,
}: {
  consultation: Consultation | null;
  doctorName: string;
  initialRating?: number;
  onClose: () => void;
  onRated: (updated: Consultation) => void;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRating(initialRating);
    setComment("");
    setError(null);
  }, [consultation?._id, initialRating]);

  if (!consultation) return null;
  const doctor = typeof consultation.doctorId === "object" ? (consultation.doctorId as Doctor) : null;

  const submit = async () => {
    if (!rating || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await consultationApi.rateConsultation(consultation._id, rating, comment.trim() || undefined);
      onRated(updated);
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      >
        <View
          className="rounded-t-3xl px-6 pt-5"
          style={{ backgroundColor: colors.background, paddingBottom: Math.max(20, insets.bottom + 12) }}
        >
          <View className="flex-row justify-end">
            <TouchableOpacity
              onPress={onClose}
              accessibilityLabel="Close"
              className="h-9 w-9 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.surfaceSoft }}
            >
              <Feather name="x" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <View className="items-center -mt-4">
            <DoctorPhoto
              name={doctorName}
              uri={doctor?.avatarUrl}
              size={72}
              backgroundColor={colors.primaryLight}
              textColor={colors.primary}
              fontFamily={fonts.heading}
            />
            <Text
              className="text-lg font-extrabold mt-3 text-center"
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              How was your session?
            </Text>
            <Text className="text-sm mt-1 text-center" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              with {doctorName}
            </Text>
          </View>

          {/* Stars */}
          <View className="flex-row justify-center gap-2 mt-5" accessibilityRole="adjustable" accessibilityValue={{ min: 0, max: 5, now: rating }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => setRating(n)}
                accessibilityLabel={`${n} star${n > 1 ? "s" : ""}`}
                hitSlop={6}
              >
                <MaterialCommunityIcons
                  name={n <= rating ? "star" : "star-outline"}
                  size={40}
                  color={n <= rating ? colors.primary : colors.mutedText}
                />
              </TouchableOpacity>
            ))}
          </View>
          <Text
            className="text-sm font-bold text-center mt-2"
            style={{ color: rating ? colors.foreground : colors.mutedText, fontFamily: fonts.body, minHeight: 20 }}
          >
            {rating ? LABELS[rating] : "Tap a star"}
          </Text>

          <TextInput
            value={comment}
            onChangeText={(t) => setComment(t.slice(0, COMMENT_MAX))}
            placeholder="Anything you'd like to share? (optional)"
            placeholderTextColor={colors.mutedText}
            multiline
            className="mt-4 rounded-2xl border px-4 py-3 text-sm"
            style={{
              borderColor: colors.border,
              backgroundColor: colors.surface,
              color: colors.foreground,
              fontFamily: fonts.body,
              minHeight: 88,
              textAlignVertical: "top",
            }}
          />
          <Text className="text-[11px] text-right mt-1" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
            {comment.length}/{COMMENT_MAX} · Your doctor can see this
          </Text>

          {error ? (
            <Text className="text-sm mt-2 text-center" style={{ color: colors.danger, fontFamily: fonts.body }}>
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={submit}
            disabled={!rating || saving}
            className="rounded-2xl py-4 items-center mt-4"
            style={{ backgroundColor: colors.primary, opacity: !rating || saving ? 0.5 : 1 }}
          >
            {saving ? (
              <ActivityIndicator color={colors.buttonText} />
            ) : (
              <Text className="text-sm font-extrabold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                Submit rating
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
