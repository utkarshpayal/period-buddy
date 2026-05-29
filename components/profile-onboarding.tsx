import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
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

const onboardingSteps = [
  {
    icon: "calendar-outline",
    id: "dateOfBirth",
    subtitle: "This helps personalize your experience.",
    title: "What is your date of birth?",
  },
  {
    icon: "people-outline",
    id: "gender",
    subtitle: "Choose the option that feels right for you.",
    title: "What is your gender?",
  },
  {
    icon: "call-outline",
    id: "phone",
    subtitle: "You can add this now or skip it.",
    title: "What is your phone number?",
  },
  {
    icon: "image-outline",
    id: "profilePicture",
    subtitle: "Add a picture to make your profile yours.",
    title: "Add a profile picture",
  },
] as const;

const genderOptions = ["female", "male", "non-binary", "prefer not to say"];

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
  const { colors } = useTheme();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  function goToNextOnboardingStep() {
    if (isSubmitting) {
      return;
    }

    if (isLastOnboardingStep) {
      handleSubmitOnboarding();
      return;
    }

    setCurrentStepIndex((index) => index + 1);
  }

  async function handleSubmitOnboarding() {
    const values = {
      dateOfBirth: dateOfBirth.trim(),
      gender,
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
        "Profile submitted",
        "Profile details submit karne ke liye ready hain.",
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
        <View
          className="mb-6 flex-row items-center rounded-xl border px-4 py-4"
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
          }}
        >
          <Ionicons
            name="calendar-outline"
            size={20}
            color={colors.foreground}
          />

          <TextInput
            keyboardType="numbers-and-punctuation"
            onChangeText={setDateOfBirth}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.foreground}
            className="ml-3 flex-1 text-base outline-none"
            style={{ color: colors.foreground }}
            value={dateOfBirth}
          />
        </View>
      );
    }

    if (stepId === "gender") {
      return (
        <View className="mb-6 gap-3">
          {genderOptions.map((option) => {
            const isSelected = gender === option;

            return (
              <TouchableOpacity
                activeOpacity={0.85}
                className="flex-row items-center justify-between rounded-xl border px-4 py-4"
                key={option}
                onPress={() => setGender(option)}
                style={{
                  backgroundColor: isSelected ? colors.button : colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Text
                  className="text-base font-semibold"
                  style={{
                    color: isSelected ? colors.buttonText : colors.foreground,
                  }}
                >
                  {option}
                </Text>

                {isSelected ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={colors.buttonText}
                  />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    if (stepId === "phone") {
      return (
        <View
          className="mb-6 flex-row items-center rounded-xl border px-4 py-4"
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
          }}
        >
          <Ionicons name="call-outline" size={20} color={colors.foreground} />

          <TextInput
            keyboardType="phone-pad"
            onChangeText={setPhone}
            placeholder="Phone number"
            placeholderTextColor={colors.foreground}
            className="ml-3 flex-1 text-base outline-none"
            style={{ color: colors.foreground }}
            value={phone}
          />
        </View>
      );
    }

    return (
      <View className="mb-6 items-center">
        <TouchableOpacity
          activeOpacity={0.85}
          className="h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2"
          onPress={handlePickProfilePicture}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
          }}
        >
          {profilePicture ? (
            <Image
              source={{ uri: profilePicture }}
              className="h-full w-full"
              resizeMode="cover"
            />
          ) : (
            <Ionicons
              name="camera-outline"
              size={36}
              color={colors.foreground}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          className="mt-4 rounded-xl border px-5 py-3"
          onPress={handlePickProfilePicture}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
          }}
        >
          <Text
            className="text-base font-semibold"
            style={{ color: colors.foreground }}
          >
            {profilePicture ? "Change picture" : "Choose picture"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <View className="mb-10 items-center">
        <View
          className="mb-5 h-20 w-20 items-center justify-center rounded-full border-2"
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
          }}
        >
          <Ionicons
            name={currentStep.icon}
            size={34}
            color={colors.foreground}
          />
        </View>

        <Text
          className="text-center text-3xl font-bold"
          style={{ color: colors.foreground }}
        >
          Complete Profile
        </Text>

        <Text
          className="mt-3 text-center text-base leading-6"
          style={{ color: colors.foreground }}
        >
          Step {currentStepIndex + 1} of {onboardingSteps.length}
        </Text>
      </View>

      <View
        className="rounded-2xl border-2 p-6"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
        }}
      >
        <Text
          className="text-2xl font-bold leading-8"
          style={{ color: colors.foreground }}
        >
          {currentStep.title}
        </Text>

        <Text
          className="mt-2 text-base leading-6"
          style={{ color: colors.foreground }}
        >
          {currentStep.subtitle}
        </Text>

        <View className="mt-6">{renderOnboardingInput(currentStep.id)}</View>

        <View className="flex-row gap-3">
          <TouchableOpacity
            activeOpacity={0.85}
            className="flex-1 rounded-xl border py-4"
            disabled={isSubmitting}
            onPress={goToNextOnboardingStep}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <Text
              className="text-center text-lg font-bold"
              style={{ color: colors.foreground }}
            >
              Skip
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            className="flex-1 rounded-xl py-4"
            disabled={isSubmitting}
            onPress={goToNextOnboardingStep}
            style={{
              backgroundColor: colors.button,
              opacity: isSubmitting ? 0.65 : 1,
            }}
          >
            <Text
              className="text-center text-lg font-bold"
              style={{ color: colors.buttonText }}
            >
              {isSubmitting
                ? "Submitting..."
                : isLastOnboardingStep
                  ? "Submit"
                  : "Next"}
            </Text>
          </TouchableOpacity>
        </View>

        {errorMessage ? (
          <Text
            className="mt-4 text-center text-sm font-medium"
            style={{ color: colors.foreground }}
          >
            {errorMessage}
          </Text>
        ) : null}
      </View>
    </>
  );
}
