import React, { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { Consultation, Doctor } from "../../lib/api";
import { formatINR, formatSessionWhen } from "../../lib/consultationFormat";
import { doctorNameOf, doctorOf, pastStatusText, refundLabel } from "../../lib/consultationModel";
import { DoctorPhoto } from "../DoctorPhoto";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";
import { Icon } from "../Icon";

/** A finished or refunded session: opens its read-only chat, and Book again. */
export const PastSessionCard = memo(function PastSessionCard({
  session,
  listedDoctor,
  onOpenChat,
  onBookAgain,
}: {
  session: Consultation;
  /** The doctor as listed now, when they can still be booked. */
  listedDoctor: Doctor | undefined;
  onOpenChat: (session: Consultation) => void;
  onBookAgain: (doctor: Doctor) => void;
}) {
  const { colors, isDark, fonts } = useTheme();
  const doc = doctorOf(session);
  const name = doctorNameOf(session, "Your doctor");
  const when = session.scheduledFor ?? session.completedAt ?? session.createdAt;
  const refund = refundLabel(session);
  const statusText = pastStatusText(session);
  const completed = session.status === "completed";

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 18, borderCurve: "continuous", ...getShadow(colors, isDark) }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => onOpenChat(session)}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${statusText}${when ? `, ${formatSessionWhen(when)}` : ""}`}
        accessibilityHint="Opens the chat history"
        className="flex-row items-start gap-3 p-3.5"
      >
        <DoctorPhoto
          name={name}
          uri={doc?.avatarUrl}
          size={40}
          backgroundColor={colors.primaryLight}
          textColor={colors.primary}
          fontFamily={fonts.heading}
        />
        <View className="flex-1">
          <Text className="text-[13.5px] font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
            {name}
          </Text>
          {when ? (
            <Text className="text-xs mt-0.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              {formatSessionWhen(when, { withZone: true })}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap items-center gap-1.5 mt-1.5">
            <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: completed ? colors.successLight : colors.surfaceSoft }}>
              <Text className="text-[11px] font-bold" style={{ color: completed ? colors.success : colors.mutedText, fontFamily: fonts.body }}>
                {statusText}
              </Text>
            </View>
            {refund ? (
              <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: colors.surfaceSoft }}>
                <Text className="text-[11px] font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                  {refund}
                </Text>
              </View>
            ) : null}
            {session.prescription ? (
              <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: colors.primaryLight }}>
                <Icon set="feather" name="file-text" size={11} color={colors.primary} />
                <Text className="text-[11px] font-bold" style={{ color: colors.primary, fontFamily: fonts.body }}>
                  Prescription
                </Text>
              </View>
            ) : null}
          </View>
          {session.cancelReason ? (
            <Text className="text-xs mt-1.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              {session.cancelReason}
            </Text>
          ) : null}
        </View>
        <Icon set="feather" name="chevron-right" size={16} color={colors.mutedText} />
      </TouchableOpacity>
      {listedDoctor && formatINR(listedDoctor.pricePerSession) && (
        <TouchableOpacity
          onPress={() => onBookAgain(listedDoctor)}
          accessibilityRole="button"
          accessibilityLabel={`Book again with ${name}`}
          className="flex-row items-center justify-center py-3 border-t"
          style={{ gap: 6, borderColor: colors.border }}
        >
          <Icon set="feather" name="refresh-cw" size={13} color={colors.primary} />
          <Text style={{ fontSize: 13, fontWeight: "800", color: colors.primary, fontFamily: fonts.body }}>Book again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});
