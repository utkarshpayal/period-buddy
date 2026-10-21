import React, { memo } from "react";
import { Text, View } from "react-native";
import type { Consultation, Doctor } from "../../lib/api";
import { formatINR } from "../../lib/consultationFormat";
import { experienceLabel, getDoctorDisplayName, languagesLabel } from "../../lib/consultationModel";
import { DoctorPhoto } from "../DoctorPhoto";
import { ratingLabel } from "../DoctorProfileSheet";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";
import { Icon } from "../Icon";
import { PressableScale } from "../PressableScale";
import { Button } from "../Button";

/**
 * One doctor in the list. The profile tap area and the action button are
 * siblings (not nested) so screen readers can reach both.
 */
export const DoctorCard = memo(function DoctorCard({
  doctor,
  index,
  selected,
  existing,
  disabled,
  onOpenProfile,
  onSeeTimes,
  onOpenChat,
}: {
  doctor: Doctor;
  /** Position in the list, for the rotating avatar colour. */
  index: number;
  selected: boolean;
  /** The user's live booking with this doctor, if any. */
  existing: Consultation | undefined;
  disabled: boolean;
  onOpenProfile: (doctor: Doctor) => void;
  onSeeTimes: (doctor: Doctor) => void;
  onOpenChat: (consultation: Consultation) => void;
}) {
  const { colors, isDark, fonts } = useTheme();
  const avatarBgOptions = [colors.primaryLight, colors.accentLight, colors.warningLight];
  const avatarTextOptions = [colors.primary, colors.foreground, colors.foreground];
  const fee = formatINR(doctor.pricePerSession);
  const name = getDoctorDisplayName(doctor);
  const experience = experienceLabel(doctor);
  const languages = languagesLabel(doctor);
  const meta = [doctor.ratingCount ? `★ ${ratingLabel(doctor, true)}` : "New", experience, languages].filter(Boolean).join(" · ");
  const actionDisabled = disabled || (!existing && !fee);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 22, borderCurve: "continuous",
        borderWidth: 1.5,
        borderColor: selected ? colors.primary : "transparent",
        ...getShadow(colors, isDark),
      }}
    >
      <PressableScale
        onPress={() => onOpenProfile(doctor)}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${doctor.specialty}. ${meta}`}
        accessibilityHint="Opens this doctor's full profile"
        accessibilityState={{ selected }}
        style={{ flexDirection: "row", alignItems: "flex-start", gap: 14, padding: 16, paddingBottom: 14 }}
      >
        <DoctorPhoto
          name={name}
          uri={doctor.avatarUrl}
          size={60}
          backgroundColor={avatarBgOptions[index % avatarBgOptions.length]}
          textColor={avatarTextOptions[index % avatarTextOptions.length]}
          fontFamily={fonts.heading}
        />
        <View className="flex-1" style={{ minWidth: 0, gap: 2 }}>
          <Text numberOfLines={2} style={{ fontSize: 16, lineHeight: 22, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>
            {name}
          </Text>
          <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 18, color: colors.mutedText, fontFamily: fonts.body }}>
            {doctor.specialty}
          </Text>
          {/* Rating (or New) and experience as small pills, then languages. */}
          <View className="flex-row flex-wrap items-center" style={{ gap: 6, marginTop: 6 }}>
            {doctor.ratingCount ? (
              <View className="flex-row items-center rounded-full" style={{ gap: 3, backgroundColor: colors.warningLight, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Icon set="mci" name="star" size={12} color={colors.warning} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.warning, fontFamily: fonts.body }}>{ratingLabel(doctor, true)}</Text>
              </View>
            ) : (
              <View className="rounded-full" style={{ backgroundColor: colors.successLight, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.success, fontFamily: fonts.body }}>New</Text>
              </View>
            )}
            {experience ? (
              <View className="rounded-full" style={{ backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground, fontFamily: fonts.body }}>{experience}</Text>
              </View>
            ) : null}
          </View>
          {languages ? (
            <View className="flex-row items-center" style={{ gap: 5, marginTop: 6 }}>
              <Icon set="feather" name="globe" size={12} color={colors.mutedText} />
              <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body }}>{languages}</Text>
            </View>
          ) : null}
        </View>
        <Icon set="feather" name="chevron-right" size={18} color={colors.mutedText} style={{ marginTop: 2 }} />
      </PressableScale>

      {/* Fee and the one action, on their own row so the name keeps its width. */}
      <View
        className="flex-row items-center justify-between"
        style={{ borderTopWidth: 1, borderTopColor: colors.track, gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}
      >
        {fee && !existing ? (
          <View style={{ flexShrink: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 18, lineHeight: 24, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>{fee}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12, color: colors.mutedText, fontFamily: fonts.body }}>per session</Text>
          </View>
        ) : (
          <Text numberOfLines={2} style={{ flexShrink: 1, fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>
            {existing ? "You have a booking" : "Not bookable yet"}
          </Text>
        )}
        <Button
          label={existing ? "Open chat" : "Available slots"}
          icon={existing ? "chatbubble-outline" : "calendar-outline"}
          size="md"
          onPress={() => (existing ? onOpenChat(existing) : onSeeTimes(doctor))}
          disabled={actionDisabled}
          accessibilityLabel={existing ? `Chat with ${name}` : fee ? `See available slots for ${name}` : `${name} isn't bookable yet`}
        />
      </View>
    </View>
  );
});
