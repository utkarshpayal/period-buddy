import React, { memo } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import type { Consultation } from "../../lib/api";
import { formatSessionWhen } from "../../lib/consultationFormat";
import { BOOKING_STATUS_TEXT, bookingStatus, doctorNameOf, doctorOf, videoJoinState } from "../../lib/consultationModel";
import { DoctorPhoto } from "../DoctorPhoto";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";
import { Icon } from "../Icon";

/** A live booking: status, when, and its actions (video, chat, cancel). */
export const BookingCard = memo(function BookingCard({
  session,
  clock,
  cancelling,
  onOpenChat,
  onJoinVideo,
  onCancel,
}: {
  session: Consultation;
  /** Re-checked every 30 s so the status and "Join" turn over by themselves. */
  clock: number;
  cancelling: boolean;
  onOpenChat: (session: Consultation) => void;
  onJoinVideo: (session: Consultation) => void;
  onCancel: (session: Consultation) => void;
}) {
  const { colors, isDark, fonts } = useTheme();
  const doc = doctorOf(session);
  const name = doctorNameOf(session, "Your doctor");
  const { status, canCancel } = bookingStatus(session, clock);
  const statusText = BOOKING_STATUS_TEXT[status];
  const pill =
    status === "inProgress" || status === "now"
      ? { fg: colors.success, bg: colors.successLight }
      : status === "over"
        ? { fg: colors.mutedText, bg: colors.surfaceSoft }
        : { fg: colors.primary, bg: colors.primaryLight };
  const video = videoJoinState(session, clock);

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderCurve: "continuous", ...getShadow(colors, isDark) }}>
      <TouchableOpacity
        onPress={() => onOpenChat(session)}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={`${statusText}. ${name}${session.scheduledFor ? `, ${formatSessionWhen(session.scheduledFor, { withZone: true })}` : ""}. Open chat`}
        className="flex-row items-center"
        style={{ gap: 12, padding: 16, paddingBottom: 12 }}
      >
        <DoctorPhoto
          name={name}
          uri={doc?.avatarUrl}
          size={52}
          backgroundColor={colors.primaryLight}
          textColor={colors.primary}
          fontFamily={fonts.heading}
        />
        <View className="flex-1" style={{ minWidth: 0, gap: 2 }}>
          <Text numberOfLines={2} style={{ fontSize: 16, lineHeight: 22, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>
            {name}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>
            {doc?.specialty ?? "Gynecologist"}
          </Text>
        </View>
        <View className="self-start rounded-full" style={{ backgroundColor: pill.bg, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "700", color: pill.fg, fontFamily: fonts.body }}>{statusText}</Text>
        </View>
      </TouchableOpacity>

      {/* When: its own soft box, so the time is the first thing you read. */}
      {session.scheduledFor ? (
        <View
          className="flex-row items-center mx-4 mb-3"
          style={{ gap: 10, backgroundColor: colors.background, borderRadius: 14, borderCurve: "continuous", paddingVertical: 10, paddingHorizontal: 12 }}
        >
          <View className="items-center justify-center" style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primaryLight }}>
            <Icon set="feather" name="calendar" size={15} color={colors.primary} />
          </View>
          <Text numberOfLines={2} style={{ flex: 1, fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.foreground, fontFamily: fonts.body }}>
            {formatSessionWhen(session.scheduledFor, { withZone: true })}
          </Text>
        </View>
      ) : null}

      {/* Actions: video (when the session has one) and chat, then cancel. */}
      <View className="px-4 pb-4" style={{ gap: 10 }}>
        <View className="flex-row" style={{ gap: 10 }}>
          {video ? (
            <TouchableOpacity
              onPress={() => onJoinVideo(session)}
              disabled={!video.open}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={video.open ? `Join video call with ${name}` : video.note ?? "Video not available"}
              accessibilityState={{ disabled: !video.open }}
              className="flex-1 flex-row items-center justify-center"
              style={{ gap: 8, height: 44, borderRadius: 14, borderCurve: "continuous", backgroundColor: video.open ? colors.success : colors.surfaceSoft }}
            >
              <Icon set="feather" name="video" size={16} color={video.open ? "#FFFFFF" : colors.mutedText} />
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "700", color: video.open ? "#FFFFFF" : colors.mutedText, fontFamily: fonts.body }}>
                {video.open ? "Join video call" : "Video call"}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => onOpenChat(session)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Chat with ${name}`}
            className="flex-1 flex-row items-center justify-center border"
            style={{ gap: 8, height: 44, borderRadius: 14, borderCurve: "continuous", borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <Icon set="feather" name="message-circle" size={16} color={colors.primary} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>Chat</Text>
          </TouchableOpacity>
        </View>
        {video && !video.open && video.note ? (
          <Text style={{ fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body, textAlign: "center" }}>{video.note}</Text>
        ) : null}
        {canCancel && (
          <TouchableOpacity
            onPress={() => onCancel(session)}
            disabled={cancelling}
            accessibilityRole="button"
            accessibilityLabel={`Cancel booking with ${name}`}
            className="self-center px-2 py-1"
            hitSlop={6}
          >
            {cancelling ? (
              <ActivityIndicator size="small" color={colors.mutedText} />
            ) : (
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.danger, fontFamily: fonts.body }}>Cancel booking</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});
