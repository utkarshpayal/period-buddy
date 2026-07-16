import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "./theme";
import { getActionGradient, getShadow } from "./ui-tokens";

const onboardingSteps = [
  {
    icon: "calendar-outline",
    id: "dateOfBirth",
    subtitle: "This helps customize your cycle predictions and health logs.",
    title: "What is your date of birth?",
  },
  {
    icon: "people-outline",
    id: "gender",
    subtitle: "Choose the identity that feels right to you.",
    title: "What is your gender?",
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
] as const;

const genderOptions: { label: string; value: string }[] = [
  { label: "Female", value: "female" },
  { label: "Male", value: "male" },
  { label: "Other / Non-binary", value: "other" },
  { label: "Prefer not to say", value: "prefer_not_to_say" },
];

type OnboardingStepId = (typeof onboardingSteps)[number]["id"];

export type ProfileOnboardingValues = {
  dateOfBirth: string;
  gender: string;
  phone: string;
  profilePicture: string;
};

type ProfileOnboardingProps = {
  onSubmit?: (values: ProfileOnboardingValues) => Promise<void> | void;
};

export function ProfileOnboarding({ onSubmit }: ProfileOnboardingProps) {
  const { colors, isDark } = useTheme();
  const actionGradient = getActionGradient(colors) as [string, string];
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const currentStep = onboardingSteps[currentStepIndex];
  const isLastOnboardingStep = currentStepIndex === onboardingSteps.length - 1;

  async function handlePickProfilePicture() {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(
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

    if (!result.canceled) {
      setProfilePicture(result.assets[0].uri);
    }
  }

  function handleBackStep() {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((index) => index - 1);
    }
  }

  function goToNextOnboardingStep() {
    if (isSubmitting) return;

    // Date of birth and gender are required by the backend (POST /api/auth/onboarding
    // rejects an empty dateOfBirth/gender with a 422), so they can't be skipped here.
    if (currentStep.id === "dateOfBirth") {
      if (!dateOfBirth.trim()) {
        setErrorMessage("Date of birth is required to continue.");
        return;
      }
      const dobPattern = /^\d{4}-\d{2}-\d{2}$/;
      if (!dobPattern.test(dateOfBirth.trim())) {
        setErrorMessage("Please enter date of birth in YYYY-MM-DD format.");
        return;
      }
    }

    if (currentStep.id === "gender" && !gender) {
      setErrorMessage("Please select a gender to continue.");
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
      dateOfBirth: dateOfBirth.trim(),
      gender: gender || "prefer_not_to_say",
      phone: phone.trim(),
      profilePicture: profilePicture ?? "",
    };

    try {
      setErrorMessage("");
      setIsSubmitting(true);

      if (onSubmit) {
        await onSubmit(values);
        return;
      }

      Alert.alert(
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
          <View
            className="flex-row items-center rounded-2xl border px-4 py-4.5"
            style={{
              backgroundColor: colors.input,
              borderColor: isFocused ? colors.primary : colors.border,
              borderWidth: isFocused ? 1.5 : 1,
            }}
          >
            <Ionicons
              name="calendar-outline"
              size={20}
              color={isFocused ? colors.primary : colors.mutedText}
            />

            <TextInput
              autoComplete="birthdate-full"
              keyboardType="numbers-and-punctuation"
              onChangeText={(text) => {
                setErrorMessage("");
                setDateOfBirth(text);
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedText}
              returnKeyType="next"
              className="ml-3 flex-1 text-base outline-none font-semibold"
              style={{ color: colors.foreground }}
              textContentType="birthdate"
              value={dateOfBirth}
            />
          </View>
          <Text className="mt-2 text-xs font-semibold px-1" style={{ color: colors.mutedText }}>
            Format: YYYY-MM-DD (e.g. 1998-05-24)
          </Text>
        </View>
      );
    }

    if (stepId === "gender") {
      return (
        <View className="mb-4 gap-3">
          {genderOptions.map((option) => {
            const isSelected = gender === option.value;

            return (
              <TouchableOpacity
                activeOpacity={0.9}
                className="flex-row items-center justify-between rounded-2xl border px-5 py-4"
                key={option.value}
                onPress={() => setGender(option.value)}
                style={{
                  backgroundColor: isSelected ? colors.primaryLight : colors.input,
                  borderColor: isSelected ? colors.primary : colors.border,
                  borderWidth: isSelected ? 1.5 : 1,
                }}
              >
                <Text
                  className="text-sm font-bold"
                  style={{
                    color: isSelected ? colors.primary : colors.foreground,
                  }}
                >
                  {option.label}
                </Text>

                {isSelected ? (
                  <View
                    className="h-5.5 w-5.5 rounded-full items-center justify-center"
                    style={{ backgroundColor: colors.primary }}
                  >
                    <Ionicons
                      name="checkmark"
                      size={12}
                      color={colors.buttonText}
                    />
                  </View>
                ) : (
                  <View
                    className="h-5.5 w-5.5 rounded-full border"
                    style={{ borderColor: colors.border }}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    if (stepId === "phone") {
      return (
        <View
          className="mb-4 flex-row items-center rounded-2xl border px-4 py-4.5"
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
        </TouchableOpacity>

        {profilePicture && (
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
              (phone, profilePicture) — dateOfBirth and gender are required by
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
            className="flex-1 rounded-full overflow-hidden"
            disabled={isSubmitting}
            onPress={goToNextOnboardingStep}
            style={{
              opacity: isSubmitting ? 0.65 : 1,
            }}
          >
            <LinearGradient
              colors={actionGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className="py-4 items-center justify-center"
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
            </LinearGradient>
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
