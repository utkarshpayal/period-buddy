import React from "react";
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Doctor, DoctorAvailability } from "../lib/api";
import { formatINR, shortZoneName, to12Hour } from "../lib/consultationFormat";
import { DoctorPhoto } from "./DoctorPhoto";
import { useTheme } from "./theme";
import { AppLockCover } from "./AppLockScreen";
import { Icon } from "./Icon";
import { Button } from "./Button";

function doctorDisplayName(doctor: Doctor): string {
  return doctor.name || [doctor.firstName, doctor.lastName].filter(Boolean).join(" ") || "Clinical specialist";
}

/**
 * A gynecologist's full profile (everything they fill in on the clinician
 * portal's My profile, plus their weekly hours), opened by tapping them in
 * the consultation list. Booking itself stays on the consultation screen,
 * which owns the date/slot picker and payment: the main button hands back
 * to it via `onPrimary`.
 */
/** "4.8 (12 ratings)", or "New" before anyone has rated this doctor. */
export function ratingLabel(doctor: Doctor, short = false): string {
  const count = doctor.ratingCount ?? 0;
  if (!count) return "New";
  const value = doctor.rating.toFixed(1);
  return short ? `${value} (${count})` : `${value} (${count} rating${count === 1 ? "" : "s"})`;
}

export function DoctorProfileSheet({
  doctor,
  availability,
  loadingAvailability,
  hasActiveSession,
  onPrimary,
  onClose,
}: {
  doctor: Doctor | null;
  /** This doctor's weekly hours, or null while loading / when there are none. */
  availability: DoctorAvailability | null;
  loadingAvailability: boolean;
  /** A paid/active consultation with this doctor already exists. */
  hasActiveSession: boolean;
  onPrimary: () => void;
  onClose: () => void;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  if (!doctor) return null;

  const name = doctorDisplayName(doctor);
  const price = formatINR(doctor.pricePerSession);
  const days = (availability?.days ?? []).filter((d) => d.slots?.length);
  // Weekly hours are wall-clock times in the doctor's own zone, so say which.
  const hoursZone = availability?.timezone ? shortZoneName(new Date(), availability.timezone) : "";
  const facts = [
    doctor.experience ? { icon: "award" as const, text: `${doctor.experience} experience` } : null,
    doctor.hospital ? { icon: "home" as const, text: doctor.hospital } : null,
    doctor.languages?.length ? { icon: "globe" as const, text: doctor.languages.join(", ") } : null,
  ].filter(Boolean) as { icon: "award" | "home" | "globe"; text: string }[];

  const sectionTitle = (title: string) => (
    <Text
      className="text-[11.5px] font-black uppercase tracking-widest mb-2"
      style={{ color: colors.mutedText, fontFamily: fonts.heading }}
    >
      {title}
    </Text>
  );

  const list = (items: string[]) =>
    items.map((item, i) => (
      <View key={`${item}-${i}`} className="flex-row items-start gap-2 mb-1.5">
        <View className="h-1.5 w-1.5 rounded-full mt-2" style={{ backgroundColor: colors.primary }} />
        <Text className="flex-1 text-sm leading-5" style={{ color: colors.foreground, fontFamily: fonts.body }}>
          {item}
        </Text>
      </View>
    ));

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row justify-end px-4" style={{ paddingTop: Math.max(12, insets.top) }}>
          <TouchableOpacity
            hitSlop={6}
            onPress={onClose}
            accessibilityLabel="Close profile"
            className="h-9 w-9 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.surfaceSoft }}
          >
            <Icon set="feather" name="x" size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          {/* Identity */}
          <View className="items-center">
            <DoctorPhoto
              name={name}
              uri={doctor.avatarUrl}
              size={112}
              backgroundColor={colors.primaryLight}
              textColor={colors.primary}
              fontFamily={fonts.heading}
            />
            <Text
              className="text-xl font-extrabold mt-4 text-center"
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              {name}
            </Text>
            <Text className="text-sm font-semibold mt-1 text-center" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              {doctor.specialty}
            </Text>
            <View className="flex-row items-center gap-3 mt-3">
              <View className="flex-row items-center gap-1 rounded-full px-3 py-1" style={{ backgroundColor: colors.surface }}>
                <Icon set="feather" name="star" size={13} color={colors.primary} />
                <Text className="text-xs font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                  {ratingLabel(doctor)}
                </Text>
              </View>
              {doctor.totalConsultations ? (
                <View className="rounded-full px-3 py-1" style={{ backgroundColor: colors.surface }}>
                  <Text className="text-xs font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    {doctor.totalConsultations} consultations
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Quick facts */}
          {facts.length > 0 && (
            <View className="mt-6 rounded-2xl p-4 gap-3" style={{ backgroundColor: colors.surface }}>
              {facts.map((f) => (
                <View key={f.icon} className="flex-row items-center gap-3">
                  <Icon set="feather" name={f.icon} size={16} color={colors.primary} />
                  <Text className="flex-1 text-sm" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    {f.text}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {doctor.bio ? (
            <View className="mt-6">
              {sectionTitle("About")}
              <Text className="text-sm leading-6" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                {doctor.bio}
              </Text>
            </View>
          ) : null}

          {doctor.education?.length ? (
            <View className="mt-6">
              {sectionTitle("Education")}
              {list(doctor.education)}
            </View>
          ) : null}

          {doctor.licenses?.length ? (
            <View className="mt-6">
              {sectionTitle("Registrations")}
              {list(doctor.licenses)}
            </View>
          ) : null}

          {/* Weekly hours */}
          <View className="mt-6">
            {sectionTitle("Consultation hours")}
            {loadingAvailability ? (
              <ActivityIndicator color={colors.primary} style={{ alignSelf: "flex-start" }} />
            ) : days.length === 0 ? (
              <Text className="text-sm" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                No hours published yet.
              </Text>
            ) : (
              <View className="rounded-2xl px-4 py-2" style={{ backgroundColor: colors.surface }}>
                {days.map((d, i) => (
                  <View
                    key={d.dayOfWeek}
                    className="flex-row justify-between py-2.5"
                    style={i > 0 ? { borderTopWidth: 1, borderColor: colors.border } : undefined}
                  >
                    <Text className="text-sm font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                      {d.day}
                    </Text>
                    <Text className="text-sm text-right flex-1 ml-4" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                      {d.slots
                        .map((s) => `${to12Hour(s.startTime)} – ${to12Hour(s.endTime)}${hoursZone ? ` (${hoursZone})` : ""}`)
                        .join(", ")}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Fee + action */}
        <View
          className="flex-row items-center gap-4 px-6 pt-4 border-t"
          style={{ borderColor: colors.border, backgroundColor: colors.surface, paddingBottom: Math.max(16, insets.bottom + 8) }}
        >
          <View>
            <Text className="text-[11px] font-bold uppercase tracking-widest" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              Per session
            </Text>
            <Text className="text-lg font-extrabold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
              {price ?? "Not set"}
            </Text>
          </View>
          <Button label={hasActiveSession ? "Open consultation chat" : "Book slot"} onPress={onPrimary} style={{ flex: 1 }} />
        </View>
      </View>
      <AppLockCover />
    </Modal>
  );
}
