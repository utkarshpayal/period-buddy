import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CalendarModal } from "./CalendarModal";
import { alert } from "../lib/alert";
import { uploadApi } from "../lib/api";
import { useTheme } from "./theme";
import { getShadow } from "./ui-tokens";

const onboardingSteps = [
  {
    icon: "calendar-outline",
    id: "dateOfBirth",
    subtitle: "This helps customize your cycle predictions and health logs.",
    title: "What is your date of birth?",
  },
  {
    icon: "call-outline",
    id: "phone",
    subtitle: "We will only use this for clinical consult notifications.",
    title: "What is your phone number?",
  },
  {
    icon: "image-outline",
    id: "profilePicture",
    subtitle: "Add a picture to personalize your dashboard profile.",
    title: "Add a profile picture",
  },
  {
    icon: "water-outline",
    id: "lastPeriodStartDate",
    subtitle: "This is the anchor date we use to predict your next cycle.",
    title: "When did your last period start?",
  },
  {
    icon: "sync-outline",
    id: "cycleDetails",
    subtitle: "Rough averages are fine — we'll refine these as you log more.",
    title: "How long are your period and cycle?",
  },
  {
    icon: "flag-outline",
    id: "trackingGoal",
    subtitle: "Pick all that apply — this helps us tailor insights and reminders for you.",
    title: "What brings you to Period Buddy?",
  },
] as const;

const trackingGoalOptions: { label: string; value: string }[] = [
  { label: "Track my period", value: "track_period" },
  { label: "Trying to conceive", value: "achieve_pregnancy" },
  { label: "Avoid pregnancy", value: "avoid_pregnancy" },
  { label: "Manage symptoms", value: "manage_symptoms" },
  { label: "General health", value: "general_health" },
];

type OnboardingStepId = (typeof onboardingSteps)[number]["id"];

export type ProfileOnboardingValues = {
  cycleLength: number;
  dateOfBirth: string;
  // No longer collected from the user (the gender onboarding step was
  // removed); still sent to the backend since POST /api/auth/onboarding
  // requires a non-empty value.
  gender: string;
  lastPeriodStartDate: string;
  periodLength: number;
  phone: string;
  profilePicture: string;
  trackingGoal: string;
  trackingGoals: string[];
};

type ProfileOnboardingProps = {
  onSubmit?: (values: ProfileOnboardingValues) => Promise<void> | void;
};

export function ProfileOnboarding({ onSubmit }: ProfileOnboardingProps) {
  const { colors, isDark } = useTheme();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [phone, setPhone] = useState("");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [lastPeriodStartDate, setLastPeriodStartDate] = useState("");
  const [isPeriodDatePickerVisible, setIsPeriodDatePickerVisible] = useState(false);
  const [periodLength, setPeriodLength] = useState("5");
  const [cycleLength, setCycleLength] = useState("28");
  // Multi-select: users often have more than one reason for tracking. The
  // primary (first-selected) goal is still sent as the scalar `trackingGoal`
  // for backend backward-compat; the full set is sent additively as
  // `trackingGoals` for the backend to adopt.
  const [trackingGoals, setTrackingGoals] = useState<string[]>([]);
  function toggleTrackingGoal(value: string) {
    setErrorMessage("");
    setTrackingGoals((current) =>
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    );
  }

  const minAdultDate = new Date();
  minAdultDate.setFullYear(minAdultDate.getFullYear() - 13);
  const earliestDate = new Date(1900, 0, 1);

  function formatDisplayDate(dateKey: string) {
    const date = new Date(`${dateKey}T00:00:00`);
    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function handleSelectDate(dateKey: string) {
    setErrorMessage("");
    setDateOfBirth(dateKey);
    setIsDatePickerVisible(false);
  }

  const currentStep = onboardingSteps[currentStepIndex];
  const isLastOnboardingStep = currentStepIndex === onboardingSteps.length - 1;

  async function handlePickProfilePicture() {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      alert(
        "Permission required",
        "Photo library permission is required to choose a profile picture.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.8,
    });

    if (result.canceled) return;

    const localUri = result.assets[0].uri;
    setProfilePicture(localUri);
    setProfilePictureUrl(null);

    try {
      setIsUploadingPicture(true);
      const uploaded = await uploadApi.uploadImage(localUri, "profile-pictures");
      setProfilePictureUrl(uploaded.url);
    } catch (error) {
      alert(
        "Upload failed",
        error instanceof Error
          ? error.message
          : "Unable to upload your profile picture right now.",
      );
    } finally {
      setIsUploadingPicture(false);
    }
  }

  function handleBackStep() {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((index) => index - 1);
    }
  }

  function goToNextOnboardingStep() {
    if (isSubmitting) return;

    // Date of birth is required by the backend (POST /api/auth/onboarding
    // rejects an empty dateOfBirth with a 422), so it can't be skipped here.
    if (currentStep.id === "dateOfBirth" && !dateOfBirth.trim()) {
      setErrorMessage("Date of birth is required to continue.");
      return;
    }

    if (currentStep.id === "profilePicture" && isUploadingPicture) {
      setErrorMessage("Please wait for the photo upload to finish.");
      return;
    }

    if (currentStep.id === "lastPeriodStartDate" && !lastPeriodStartDate.trim()) {
      setErrorMessage("Please select the start date of your last period.");
      return;
    }

    if (currentStep.id === "cycleDetails") {
      const period = Number(periodLength);
      if (!period || period < 1 || period > 10) {
        setErrorMessage("Period length should be between 1 and 10 days.");
        return;
      }

      const cycle = Number(cycleLength);
      if (!cycle || cycle < 20 || cycle > 45) {
        setErrorMessage("Cycle length should be between 20 and 45 days.");
        return;
      }
    }

    if (currentStep.id === "trackingGoal" && trackingGoals.length === 0) {
      setErrorMessage("Please select at least one goal to continue.");
      return;
    }

    setErrorMessage("");

    if (isLastOnboardingStep) {
      handleSubmitOnboarding();
      return;
    }

    setCurrentStepIndex((index) => index + 1);
  }

  async function handleSubmitOnboarding() {
    const values = {
      cycleLength: Number(cycleLength) || 28,
      dateOfBirth: dateOfBirth.trim(),
      // Gender is no longer collected via onboarding; send the backend's
      // "prefer not to say" default so the required field is still satisfied.
      gender: "prefer_not_to_say",
      lastPeriodStartDate: lastPeriodStartDate.trim(),
      periodLength: Number(periodLength) || 5,
      phone: phone.trim(),
      profilePicture: profilePictureUrl ?? "",
      trackingGoal: trackingGoals[0] || "track_period",
      trackingGoals: trackingGoals.length ? trackingGoals : ["track_period"],
    };

    try {
      setErrorMessage("");
      setIsSubmitting(true);

      if (onSubmit) {
        await onSubmit(values);
        return;
      }

      alert(
        "Profile Setup",
        "Profile complete! Ready to save.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit your profile right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderOnboardingInput(stepId: OnboardingStepId) {
    if (stepId === "dateOfBirth") {
      return (
        <View className="mb-4">
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setIsDatePickerVisible(true)}
            className="flex-row items-center rounded-2xl border px-4 h-14"
            style={{
              backgroundColor: colors.input,
              borderColor: isDatePickerVisible ? colors.primary : colors.border,
              borderWidth: isDatePickerVisible ? 1.5 : 1,
            }}
          >
            <Ionicons
              name="calendar-outline"
              size={20}
              color={isDatePickerVisible ? colors.primary : colors.mutedText}
            />

            <Text
              className="ml-3 flex-1 text-base font-semibold"
              style={{ color: dateOfBirth ? colors.foreground : colors.mutedText }}
            >
              {dateOfBirth ? formatDisplayDate(dateOfBirth) : "Select your date of birth"}
            </Text>

            <Ionicons name="chevron-down" size={16} color={colors.mutedText} />
          </TouchableOpacity>

          <Text className="mt-2 text-xs font-semibold px-1" style={{ color: colors.mutedText }}>
            This helps us tailor cycle predictions to your age.
          </Text>

          <CalendarModal
            initialDateKey={dateOfBirth || undefined}
            maximumDate={minAdultDate}
            minimumDate={earliestDate}
            onClose={() => setIsDatePickerVisible(false)}
            onSelect={handleSelectDate}
            visible={isDatePickerVisible}
          />
        </View>
      );
    }

    if (stepId === "phone") {
      return (
        <View
          className="mb-4 flex-row items-center rounded-2xl border px-4 h-14"
          style={{
            backgroundColor: colors.input,
            borderColor: isFocused ? colors.primary : colors.border,
            borderWidth: isFocused ? 1.5 : 1,
          }}
        >
          <Ionicons
            name="call-outline"
            size={20}
            color={isFocused ? colors.primary : colors.mutedText}
          />

          <TextInput
            autoComplete="tel"
            keyboardType="phone-pad"
            onChangeText={(text) => {
              setErrorMessage("");
              setPhone(text);
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="+1 (555) 019-2834"
            placeholderTextColor={colors.mutedText}
            returnKeyType="done"
            className="ml-3 flex-1 text-base outline-none font-semibold"
            style={{ color: colors.foreground }}
            textContentType="telephoneNumber"
            value={phone}
          />
        </View>
      );
    }

    if (stepId === "lastPeriodStartDate") {
      return (
        <View className="mb-4">
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setIsPeriodDatePickerVisible(true)}
            className="flex-row items-center rounded-2xl border px-4 h-14"
            style={{
              backgroundColor: colors.input,
              borderColor: isPeriodDatePickerVisible ? colors.primary : colors.border,
              borderWidth: isPeriodDatePickerVisible ? 1.5 : 1,
            }}
          >
            <Ionicons
              name="water-outline"
              size={20}
              color={isPeriodDatePickerVisible ? colors.primary : colors.mutedText}
            />

            <Text
              className="ml-3 flex-1 text-base font-semibold"
              style={{ color: lastPeriodStartDate ? colors.foreground : colors.mutedText }}
            >
              {lastPeriodStartDate
                ? formatDisplayDate(lastPeriodStartDate)
                : "Select the start date"}
            </Text>

            <Ionicons name="chevron-down" size={16} color={colors.mutedText} />
          </TouchableOpacity>

          <CalendarModal
            initialDateKey={lastPeriodStartDate || undefined}
            maximumDate={new Date()}
            minimumDate={new Date(new Date().getFullYear() - 1, 0, 1)}
            onClose={() => setIsPeriodDatePickerVisible(false)}
            onSelect={(dateKey) => {
              setErrorMessage("");
              setLastPeriodStartDate(dateKey);
              setIsPeriodDatePickerVisible(false);
            }}
            visible={isPeriodDatePickerVisible}
          />
        </View>
      );
    }

    if (stepId === "cycleDetails") {
      return (
        <View className="mb-4 gap-4">
          <View>
            <Text className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: colors.mutedText }}>
              Period length (days)
            </Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={(text) => {
                setErrorMessage("");
                setPeriodLength(text.replace(/[^0-9]/g, ""));
              }}
              placeholder="5"
              placeholderTextColor={colors.mutedText}
              className="rounded-2xl border px-4 h-14 text-base font-semibold outline-none"
              style={{ backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }}
              value={periodLength}
            />
          </View>

          <View>
            <Text className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: colors.mutedText }}>
              Cycle length (days)
            </Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={(text) => {
                setErrorMessage("");
                setCycleLength(text.replace(/[^0-9]/g, ""));
              }}
              placeholder="28"
              placeholderTextColor={colors.mutedText}
              className="rounded-2xl border px-4 h-14 text-base font-semibold outline-none"
              style={{ backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }}
              value={cycleLength}
            />
          </View>
        </View>
      );
    }

    if (stepId === "trackingGoal") {
      return (
        <View className="mb-4 gap-3">
          {trackingGoalOptions.map((option) => {
            const isSelected = trackingGoals.includes(option.value);

            return (
              <TouchableOpacity
                activeOpacity={0.9}
                className="flex-row items-center justify-between rounded-2xl border px-5 py-4"
                key={option.value}
                onPress={() => toggleTrackingGoal(option.value)}
                style={{
                  backgroundColor: isSelected ? colors.primaryLight : colors.input,
                  borderColor: isSelected ? colors.primary : colors.border,
                  borderWidth: isSelected ? 1.5 : 1,
                }}
              >
                <Text
                  className="text-sm font-bold"
                  style={{ color: isSelected ? colors.primary : colors.foreground }}
                >
                  {option.label}
                </Text>

                {isSelected ? (
                  <View
                    className="h-5.5 w-5.5 rounded-full items-center justify-center"
                    style={{ backgroundColor: colors.primary }}
                  >
                    <Ionicons name="checkmark" size={12} color={colors.buttonText} />
                  </View>
                ) : (
                  <View className="h-5.5 w-5.5 rounded-full border" style={{ borderColor: colors.border }} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    return (
      <View className="mb-4 items-center">
        <TouchableOpacity
          activeOpacity={0.9}
          className="h-32 w-32 items-center justify-center overflow-hidden rounded-full border relative shadow-md"
          onPress={handlePickProfilePicture}
          style={{
            backgroundColor: colors.input,
            borderColor: colors.primary,
            borderWidth: profilePicture ? 1 : 2,
          }}
        >
          {profilePicture ? (
            <Image
              source={{ uri: profilePicture }}
              className="h-full w-full"
              resizeMode="cover"
            />
          ) : (
            <View className="items-center justify-center">
              <Ionicons
                name="camera-outline"
                size={36}
                color={colors.primary}
              />
              <Text className="text-[9px] font-extrabold mt-1 tracking-wider" style={{ color: colors.primary }}>
                CHOOSE PHOTO
              </Text>
            </View>
          )}

          {isUploadingPicture && (
            <View
              className="absolute inset-0 items-center justify-center"
              style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
            >
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </TouchableOpacity>

        {profilePicture && !isUploadingPicture && (
          <TouchableOpacity
            activeOpacity={0.8}
            className="mt-4 rounded-full border px-5 py-2.5"
            onPress={handlePickProfilePicture}
            style={{
              backgroundColor: colors.input,
              borderColor: colors.border,
            }}
          >
            <Text
              className="text-xs font-bold"
              style={{ color: colors.foreground }}
            >
              Change Photo
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View className="w-full">
      {/* Back Button & Progress indicators */}
      <View className="flex-row items-center justify-between mb-6 w-full">
        {currentStepIndex > 0 ? (
          <TouchableOpacity
            onPress={handleBackStep}
            className="w-10 h-10 rounded-full border items-center justify-center shadow-xs"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            <Ionicons name="arrow-back" size={16} color={colors.foreground} />
          </TouchableOpacity>
        ) : (
          <View className="w-10 h-10" />
        )}

        <Text className="text-xs font-black tracking-widest uppercase" style={{ color: colors.mutedText }}>
          Step {currentStepIndex + 1} of {onboardingSteps.length}
        </Text>

        <View className="w-10 h-10" />
      </View>

      {/* Progress Bar */}
      <View
        className="h-2 w-full rounded-full mb-8 overflow-hidden"
        style={{ backgroundColor: colors.border }}
      >
        <View
          className="h-full rounded-full"
          style={{
            backgroundColor: colors.primary,
            width: `${((currentStepIndex + 1) / onboardingSteps.length) * 100}%`,
          }}
        />
      </View>

      {/* Circle Icon Sphere */}
      <View className="mb-6 items-center">
        <View
          className="h-16 w-16 items-center justify-center rounded-[22px] border shadow-xs"
          style={{
            backgroundColor: colors.primaryLight,
            borderColor: colors.border,
          }}
        >
          <Ionicons
            name={currentStep.icon}
            size={24}
            color={colors.primary}
          />
        </View>
      </View>

      {/* Card Wrapper */}
      <View
        className="rounded-[32px] border p-6 shadow-sm"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          ...getShadow(colors, isDark),
        }}
      >
        <Text
          className="text-2xl font-extrabold tracking-tight"
          style={{ color: colors.foreground }}
        >
          {currentStep.title}
        </Text>

        <Text
          className="mt-2 text-sm font-semibold leading-relaxed"
          style={{ color: colors.mutedText }}
        >
          {currentStep.subtitle}
        </Text>

        {/* Input Slot */}
        <View className="mt-6">{renderOnboardingInput(currentStep.id)}</View>

        {/* Action Buttons */}
        <View className="flex-row gap-3 mt-4">
          {/* Skip is only offered for fields the backend treats as optional
              (phone, profilePicture) — dateOfBirth is required by
              POST /api/auth/onboarding and must be filled in to proceed. */}
          {(currentStep.id === "phone" || currentStep.id === "profilePicture") && (
            <TouchableOpacity
              activeOpacity={0.8}
              className="flex-1 rounded-full border py-4 items-center justify-center"
              disabled={isSubmitting}
              onPress={goToNextOnboardingStep}
              style={{
                backgroundColor: colors.input,
                borderColor: colors.border,
              }}
            >
              <Text
                className="text-center text-sm font-bold"
                style={{ color: colors.mutedText }}
              >
                Skip
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            activeOpacity={0.9}
            className="flex-1 rounded-full py-4 items-center justify-center"
            disabled={isSubmitting}
            onPress={goToNextOnboardingStep}
            style={{
              backgroundColor: colors.primary,
              opacity: isSubmitting ? 0.65 : 1,
            }}
          >
            <Text
              className="text-center text-sm font-bold"
              style={{ color: colors.buttonText }}
            >
              {isSubmitting
                ? "Saving..."
                : isLastOnboardingStep
                  ? "Finish Setup"
                  : "Next Step"}
            </Text>
          </TouchableOpacity>
        </View>

        {errorMessage ? (
          <View
            className="mt-4 rounded-2xl border px-4 py-3"
            style={{
              backgroundColor: colors.dangerLight,
              borderColor: colors.danger,
            }}
          >
            <Text
              className="text-center text-xs font-bold"
              style={{ color: colors.danger }}
            >
              {errorMessage}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
