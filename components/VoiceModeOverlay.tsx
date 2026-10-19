import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
import { Dimensions, Modal, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ThemeColors } from "./theme";
import { VoiceOrb } from "./VoiceOrb";
import { AppLockCover } from "./AppLockScreen";
import { Icon } from "./Icon";

export type VoiceStatus = "idle" | "listening" | "processing" | "thinking" | "speaking";

interface VoiceModeOverlayProps {
  colors: ThemeColors;
  errorMessage?: string | null;
  fonts: { body: string; heading: string };
  languageLabel: string;
  level: number;
  onClose: () => void;
  onMicPress: () => void;
  status: VoiceStatus;
  /** What the person just said (live caption). */
  transcriptPreview?: string;
  /** What Nura is answering / just answered (live caption). */
  replyPreview?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// The voice overlay always uses this fixed dark maroon palette regardless of
// app theme (light/dark) — matches the always-immersive "voice mode" look.
const OVERLAY_BG: [string, string] = ["#2A0F1D", "#150910"];
const ORB_TINT = "#F0A8C4";
const TRANSCRIPT_TINT = "#E8A86B";
const ERROR_TINT = "#FF9B85";

const STATUS_COPY: Record<VoiceStatus, string> = {
  idle: "Tap the mic to speak",
  listening: "Listening...",
  processing: "Got it, one sec...",
  thinking: "Thinking...",
  speaking: "Speaking… tap to interrupt",
};

function SweepRing({ color, delay, size }: { color: string; delay: number; size: number }) {
  const rotate = useSharedValue(0);
  const fade = useSharedValue(0);

  useEffect(() => {
    rotate.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1, false);
    const timeout = setTimeout(() => {
      fade.value = withTiming(1, { duration: 900 });
    }, delay);
    return () => clearTimeout(timeout);
  }, [delay, fade, rotate]);

  const style = useAnimatedStyle(() => ({
    opacity: fade.value * 0.35,
    transform: [{ rotate: `${rotate.value * 360}deg` }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: color,
          borderStyle: "dashed",
        },
        style,
      ]}
    />
  );
}

export function VoiceModeOverlay({
  colors,
  errorMessage,
  fonts,
  languageLabel,
  level,
  onClose,
  onMicPress,
  status,
  transcriptPreview,
  replyPreview,
}: VoiceModeOverlayProps) {
  const breathe = useSharedValue(0);

  useEffect(() => {
    breathe.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [breathe]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.12 + breathe.value * 0.1 + level * 0.2,
    transform: [{ scale: 1 + breathe.value * 0.06 + level * 0.18 }],
  }));

  const isRecording = status === "listening";
  const orbSize = SCREEN_WIDTH * 0.34;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <LinearGradient colors={OVERLAY_BG} style={{ flex: 1 }}>
        <SafeAreaView className="flex-1">
          <View className="flex-row items-center justify-between px-5 pt-2">
            <View
              className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border"
              style={{ borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(255,255,255,0.06)" }}
            >
              <Icon set="feather" name="globe" size={12} color={ORB_TINT} />
              <Text className="text-xs font-black tracking-wide" style={{ color: ORB_TINT, fontFamily: fonts.body }}>
                {languageLabel}
              </Text>
            </View>
          </View>

          <View className="flex-1 items-center justify-center">
            <View style={{ width: orbSize * 2.6, height: orbSize * 2.6, alignItems: "center", justifyContent: "center" }}>
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: "absolute",
                    width: orbSize * 2.6,
                    height: orbSize * 2.6,
                    borderRadius: orbSize * 1.3,
                    backgroundColor: ORB_TINT,
                  },
                  haloStyle,
                ]}
              />
              <SweepRing color={ORB_TINT} delay={0} size={orbSize * 2.2} />
              <SweepRing color={ORB_TINT} delay={200} size={orbSize * 1.7} />

              <VoiceOrb
                colors={colors}
                isRecording={isRecording}
                isTranscribing={status === "processing"}
                level={level}
                onPress={onMicPress}
                size={orbSize}
              />
            </View>

            <Text
              className="mt-8 text-sm font-black tracking-wide"
              style={{ color: "#fff", fontFamily: fonts.heading }}
            >
              {STATUS_COPY[status]}
            </Text>

            {errorMessage ? (
              <View className="mt-3 flex-row items-center gap-1.5 px-10">
                <Icon set="feather" name="alert-circle" size={13} color={ERROR_TINT} />
                <Text
                  numberOfLines={2}
                  className="flex-1 text-center text-[13px] font-semibold leading-4"
                  style={{ color: ERROR_TINT, fontFamily: fonts.body }}
                >
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            {/* Live captions: the last thing said each way. */}
            {transcriptPreview ? (
              <Text
                numberOfLines={2}
                className="mt-4 px-10 text-center text-[13px] font-medium leading-5"
                style={{ color: TRANSCRIPT_TINT, fontFamily: fonts.body }}
              >
                “{transcriptPreview}”
              </Text>
            ) : null}
            {replyPreview && (status === "speaking" || status === "idle" || status === "listening") ? (
              <Text
                numberOfLines={4}
                className="mt-3 px-10 text-center text-[14px] font-semibold leading-5"
                style={{ color: "rgba(255,255,255,0.88)", fontFamily: fonts.body }}
              >
                {replyPreview}
              </Text>
            ) : null}
          </View>

          <View className="items-center pb-6 px-10">
            <Text
              className="text-center text-xs font-semibold leading-4 mb-6"
              style={{ color: "rgba(255,255,255,0.55)", fontFamily: fonts.body }}
            >
              Just talk. I reply out loud, and you can tap the orb to interrupt me.
            </Text>

            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="End voice mode"
              className="w-14 h-14 rounded-full items-center justify-center"
              style={{ backgroundColor: "#fff" }}
            >
              <Icon set="feather" name="x" size={22} color="#150910" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
      <AppLockCover />
    </Modal>
  );
}
