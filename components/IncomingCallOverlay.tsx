import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Modal, StatusBar, Text, TouchableOpacity, Vibration, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRealtimeSocket, type RealtimeMessage } from "../hooks/useRealtimeSocket";
import { consultationApi } from "../lib/api";
import { getOpenConsultationChat } from "../lib/consultationPresence";
import { guardRoute } from "../lib/launchGuard";
import { DoctorPhoto } from "./DoctorPhoto";
import { useTheme } from "./theme";

type IncomingCall = {
  consultationId: string;
  callerName: string;
  callerAvatarUrl?: string | null;
};

// Stop ringing on our own if the doctor neither connects nor hangs up.
const RING_TIMEOUT_MS = 45_000;
// Buzz, pause, repeat — like a phone ringing.
const RING_PATTERN = [0, 900, 1100];

/**
 * App-wide "your doctor is calling" screen. The server rings the patient on
 * their personal socket room (`incoming_call`) when the doctor starts a call
 * and the patient isn't in that consultation's room. Accept opens the
 * consultation screen, which opens the chat and joins the call
 * (`?id=…&call=1`); Decline tells the server, which ends the doctor's call.
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
      const consultationId = typeof data.consultationId === "string" ? data.consultationId : "";
      if (!consultationId) return;
      if (data.event === "incoming_call") {
        if (data.callerRole && data.callerRole !== "doctor") return;
        // The open chat's own call UI shows this call already.
        if (getOpenConsultationChat() === consultationId) return;
        setCall({
          consultationId,
          callerName: typeof data.callerName === "string" && data.callerName ? data.callerName : "Your doctor",
          callerAvatarUrl: typeof data.callerAvatarUrl === "string" ? data.callerAvatarUrl : null,
        });
      } else if (
        data.event === "call_cancelled" ||
        data.event === "consultation_cancelled" ||
        data.event === "consultation_completed"
      ) {
        setCall((current) => (current?.consultationId === consultationId ? null : current));
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
    Vibration.vibrate(RING_PATTERN, true);
    return () => Vibration.cancel();
  }, [visible]);

  const accept = () => {
    if (!call) return;
    const target = `/(app)/consultation?id=${call.consultationId}&call=1`;
    setCall(null);
    if (guardRoute(target)) return;
    // navigate, not push: reuses an open consultation screen (it reacts to the new params).
    router.navigate(target as Parameters<typeof router.navigate>[0]);
  };

  const decline = () => {
    if (!call) return;
    const { consultationId } = call;
    setCall(null);
    consultationApi.declineCall(consultationId).catch(() => undefined);
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
            Video consultation · calling you…
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
              <Feather name="phone-off" size={28} color="#FFFFFF" />
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
              <Feather name="video" size={28} color="#FFFFFF" />
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
