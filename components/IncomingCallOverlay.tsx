import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Modal, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRealtimeSocket, type RealtimeMessage } from "../hooks/useRealtimeSocket";
import { consultationApi } from "../lib/api";
import { getOpenVideoCall } from "../lib/consultationPresence";
import { guardRoute } from "../lib/launchGuard";
import { startRingTone } from "../lib/ringTone";
import { DoctorPhoto } from "./DoctorPhoto";
import { useTheme } from "./theme";
import { Icon } from "./Icon";

/** The doctor is already in the video room (self-hosted Jitsi), waiting for us. */
type IncomingCall = {
  kind: "consultation";
  consultationId: string;
  callerName: string;
  callerAvatarUrl?: string | null;
};

// Stop ringing on our own if the doctor neither connects nor hangs up.
const RING_TIMEOUT_MS = 45_000;

/**
 * App-wide "your doctor is waiting in the video call" screen. Calls run on the
 * self-hosted Jitsi server; the API rings the patient on their personal socket
 * room (`incoming_call`, `kind: "consultation"`, plus a push) when the doctor
 * gets a join token. Accept opens the call (`/consultation?id=…&call=1`);
 * Decline tells the doctor. Buddy calls don't ring here: they need both
 * buddies in the chat, which shows its own Join prompt.
 * Mounted in app/_layout.tsx's AppShell; `enabled` only while signed in.
 */
export function IncomingCallOverlay({
  userId,
  enabled,
  hidden,
}: {
  userId?: string | null;
  enabled: boolean;
  /** e.g. while the app lock covers the screen: keep ringing state, show nothing. */
  hidden?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [call, setCall] = useState<IncomingCall | null>(null);
  const room = userId ? `user_${userId}` : "";

  const onMessage = useCallback(
    (data: RealtimeMessage) => {
      if (data?.type !== "message" || data.room !== room) return;
      const callerName = typeof data.callerName === "string" && data.callerName ? data.callerName : "";
      // Buddy calls only happen with both buddies in the chat, which shows its own prompt.
      if (data.kind === "buddy") return;
      const consultationId = typeof data.consultationId === "string" ? data.consultationId : "";
      if (!consultationId) return;
      if (data.event === "incoming_call") {
        if (data.callerRole && data.callerRole !== "doctor") return;
        // Already in this call.
        if (getOpenVideoCall() === consultationId) return;
        setCall({
          kind: "consultation",
          consultationId,
          callerName: callerName || "Your doctor",
          callerAvatarUrl: typeof data.callerAvatarUrl === "string" ? data.callerAvatarUrl : null,
        });
      } else if (
        data.event === "call_cancelled" ||
        data.event === "consultation_cancelled" ||
        data.event === "consultation_completed"
      ) {
        setCall((current) =>
          current?.kind === "consultation" && current.consultationId === consultationId ? null : current,
        );
      }
    },
    [room],
  );

  useRealtimeSocket({ enabled: enabled && Boolean(room), rooms: room ? [room] : [], onMessage });

  // Signed out (or switched account): drop any ring.
  useEffect(() => {
    if (!enabled) setCall(null);
  }, [enabled, userId]);

  const visible = Boolean(call) && !hidden;

  useEffect(() => {
    if (!call) return;
    const timer = setTimeout(() => setCall(null), RING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [call]);

  useEffect(() => {
    if (!visible) return;
    return startRingTone();
  }, [visible]);

  const accept = () => {
    if (!call) return;
    const target = `/(app)/consultation?id=${call.consultationId}&call=1`;
    setCall(null);
    if (guardRoute(target)) return;
    // navigate, not push: reuses an open screen (it reacts to the new params).
    router.navigate(target as Parameters<typeof router.navigate>[0]);
  };

  const decline = () => {
    if (!call) return;
    setCall(null);
    // The doctor is told the patient declined.
    consultationApi.declineCall(call.consultationId).catch(() => undefined);
  };

  if (!call) return null;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={decline} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View
        className="flex-1 items-center justify-between px-8"
        style={{
          backgroundColor: "#17212E",
          paddingTop: insets.top + 72,
          paddingBottom: insets.bottom + 56,
        }}
        accessibilityViewIsModal
      >
        <View className="items-center">
          <DoctorPhoto
            name={call.callerName}
            uri={call.callerAvatarUrl}
            size={128}
            backgroundColor="rgba(255,255,255,0.14)"
            textColor="#FFFFFF"
            fontFamily={fonts.heading}
          />
          <Text
            className="text-2xl font-extrabold mt-6 text-center"
            style={{ color: "#FFFFFF", fontFamily: fonts.heading }}
            accessibilityRole="header"
          >
            {call.callerName}
          </Text>
          <Text
            className="text-sm font-semibold mt-2 text-center"
            style={{ color: "rgba(255,255,255,0.75)", fontFamily: fonts.body }}
          >
            Is in your video consultation
          </Text>
        </View>

        <View className="flex-row w-full justify-around">
          <View className="items-center">
            <TouchableOpacity
              onPress={decline}
              accessibilityRole="button"
              accessibilityLabel={`Decline call from ${call.callerName}`}
              className="h-[72px] w-[72px] rounded-full items-center justify-center"
              style={{ backgroundColor: colors.danger }}
            >
              <Icon set="feather" name="phone-off" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Text className="text-xs font-bold mt-2" style={{ color: "#FFFFFF", fontFamily: fonts.body }}>
              Decline
            </Text>
          </View>
          <View className="items-center">
            <TouchableOpacity
              onPress={accept}
              accessibilityRole="button"
              accessibilityLabel={`Accept call from ${call.callerName}`}
              className="h-[72px] w-[72px] rounded-full items-center justify-center"
              style={{ backgroundColor: colors.success }}
            >
              <Icon set="feather" name="video" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Text className="text-xs font-bold mt-2" style={{ color: "#FFFFFF", fontFamily: fonts.body }}>
              Accept
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
