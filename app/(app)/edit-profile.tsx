import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Avatar from "../../components/Avatar";
import { useAuth } from "../../components/auth-context";
import { PrimaryButton } from "../../components/onboarding/parts";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useTheme } from "../../components/theme";
import { BirthdayInput } from "../../components/BirthdayInput";
import { alert } from "../../lib/alert";
import { authApi, uploadApi } from "../../lib/api";
import { openAppSettings } from "../../lib/modal-host";
import { requestPhotoLibraryAccess } from "../../lib/photoAccess";
import { isPlausiblePhone, normalizePhone } from "../../lib/onboarding";

/**
 * Name, photo, phone and birthday. Phone and photo used to be onboarding
 * steps; they're optional, so they live here (reached from Profile) instead.
 */
export default function EditProfile() {
  const router = useRouter();
  const { colors, fonts, isDark } = useTheme();
  const { user, updateUser } = useAuth();

  const initialDob = user?.dateOfBirth ? String(user.dateOfBirth).slice(0, 10) : "";
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(initialDob);
  const [photoUrl, setPhotoUrl] = useState(user?.profilePicture ?? "");
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  // BirthdayInput reports "" while a typed date is incomplete; keep the saved
  // one until a new valid date is entered.
  const [dobIncomplete, setDobIncomplete] = useState(false);
  const onBirthdayChange = useCallback((dateKey: string) => {
    setDobIncomplete(!dateKey);
    if (dateKey) setDateOfBirth(dateKey);
  }, []);

  const phoneError = phoneTouched && !isPlausiblePhone(phone) ? "Enter a valid number with country code, e.g. +91 98765 43210." : "";
  const nameError = firstName.trim().length > 0 && firstName.trim().length < 2 ? "At least 2 characters." : "";
  const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || "Nura user";

  const isDirty =
    firstName.trim() !== (user?.firstName ?? "") ||
    lastName.trim() !== (user?.lastName ?? "") ||
    normalizePhone(phone) !== normalizePhone(user?.phone ?? "") ||
    dateOfBirth !== initialDob ||
    photoUrl !== (user?.profilePicture ?? "");
  const canSave = isDirty && firstName.trim().length >= 2 && isPlausiblePhone(phone) && !dobIncomplete && !isUploading;

  async function pickPhoto() {
    const permission = await requestPhotoLibraryAccess();
    if (!permission.granted) {
      if (!permission.canAskAgain) {
        alert("Allow photo access", "Turn on photo access for Nura in Settings to choose a picture.", [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => openAppSettings() },
        ]);
      }
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setLocalPhoto(uri);
    setIsUploading(true);
    try {
      const uploaded = await uploadApi.uploadImage(uri, "profile-pictures");
      setPhotoUrl(uploaded.url);
    } catch (error) {
      setLocalPhoto(null);
      alert("Upload failed", error instanceof Error ? error.message : "Couldn't upload that photo. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  async function save() {
    setPhoneTouched(true);
    if (!canSave) return;
    setIsSaving(true);
    try {
      const updated = await authApi.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: normalizePhone(phone),
        profilePicture: photoUrl || undefined,
        ...(dateOfBirth ? { dateOfBirth } : {}),
      });
      updateUser(updated);
      router.back();
    } catch (error) {
      alert("Couldn't save", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "bottom"]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <ScreenHeader title="Edit profile" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ alignItems: "center", marginBottom: 28 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={photoUrl ? "Change profile photo" : "Add profile photo"}
              onPress={pickPhoto}
              disabled={isUploading}
            >
              <Avatar
                uri={localPhoto ?? (photoUrl || undefined)}
                name={displayName}
                size={104}
                backgroundColor={colors.primaryLight}
                textColor={colors.primary}
                fontFamily={fonts.heading}
              />
              {isUploading ? (
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderRadius: 52,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(0,0,0,0.35)",
                  }}
                >
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : null}
              <View
                style={{
                  position: "absolute",
                  right: -2,
                  bottom: -2,
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.primary,
                  borderWidth: 3,
                  borderColor: colors.background,
                }}
              >
                <Ionicons name="camera" size={15} color={colors.buttonText} />
              </View>
            </Pressable>
            <Pressable onPress={pickPhoto} disabled={isUploading} hitSlop={8} style={{ marginTop: 12 }}>
              <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "800", fontFamily: fonts.body }}>
                {photoUrl ? "Change photo" : "Add a photo"}
              </Text>
            </Pressable>
          </View>

          <Field
            label="First name"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            error={nameError}
          />
          <Field
            label="Last name"
            optional
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            autoComplete="family-name"
            textContentType="familyName"
          />
          <Field
            label="Phone number"
            optional
            value={phone}
            onChangeText={setPhone}
            onBlur={() => setPhoneTouched(true)}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="+91 98765 43210"
            error={phoneError}
            hint="Only used for check-in calls."
          />

          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800", marginBottom: 8, fontFamily: fonts.body }}>
            Birthday
          </Text>
          <BirthdayInput value={dateOfBirth} onChange={onBirthdayChange} />
        </ScrollView>

        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 }}>
          <PrimaryButton label="Save changes" icon="checkmark" disabled={!canSave} loading={isSaving} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  optional?: boolean;
  error?: string;
  hint?: string;
};

function Field({ label, optional, error, hint, onFocus, onBlur, ...inputProps }: FieldProps) {
  const { colors, fonts } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800", fontFamily: fonts.body }}>{label}</Text>
        {optional ? <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }}>Optional</Text> : null}
      </View>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.mutedText}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={{
          height: 52,
          borderRadius: 14,
          borderWidth: focused || error ? 1.5 : 1,
          borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
          backgroundColor: colors.input,
          paddingHorizontal: 14,
          color: colors.foreground,
          fontSize: 15,
          fontWeight: "600",
          fontFamily: fonts.body,
        }}
        {...inputProps}
      />
      {error ? (
        <Text style={{ color: colors.danger, fontSize: 13, fontWeight: "700", marginTop: 6, fontFamily: fonts.body }}>{error}</Text>
      ) : hint ? (
        <Text style={{ color: colors.mutedText, fontSize: 13, marginTop: 6, fontFamily: fonts.body }}>{hint}</Text>
      ) : null}
    </View>
  );
}
