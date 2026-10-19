import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { resendOtp, verifyOtp } from "../lib/auth";
import { useTheme } from "./theme";
import { AppLockCover } from "./AppLockScreen";
import { getFriendlyErrorMessage } from "../lib/api";
import { Icon } from "./Icon";

const OTP_LENGTH = 6;
const OTP_VALIDITY_SECONDS = 10 * 60; // 10 minutes, mirrors backend OTP_EXPIRY_MINUTES
const RESEND_COOLDOWN_SECONDS = 30;

type OtpModalProps = {
  email: string;
  onClose: () => void;
  onVerified: (result: { token: string; user: Record<string, unknown> }) => void;
  visible: boolean;
};

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Whole seconds from now until `deadline` (ms), never negative. */
const secondsUntil = (deadline: number) => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));

export function OtpModal({ email, onClose, onVerified, visible }: OtpModalProps) {
  const { colors, fonts } = useTheme();
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [errorMessage, setErrorMessage] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  // Deadlines, not counters: JS timers stop while the app is in the
  // background (the user checking their mail), so a decrementing count would
  // still show a code as valid after the server has expired it.
  const [expiresAt, setExpiresAt] = useState(() => Date.now() + OTP_VALIDITY_SECONDS * 1000);
  const [resendAt, setResendAt] = useState(() => Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
  const [, setTick] = useState(0);
  const secondsLeft = secondsUntil(expiresAt);
  const resendCooldown = secondsUntil(resendAt);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  // A ref, so a double tap (or the last digit's submit) verifies once.
  const verifyingRef = useRef(false);

  const restartTimers = () => {
    setExpiresAt(Date.now() + OTP_VALIDITY_SECONDS * 1000);
    setResendAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
  };

  useEffect(() => {
    if (!visible) return;
    setDigits(Array(OTP_LENGTH).fill(""));
    setErrorMessage("");
    restartTimers();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [visible]);

  const isExpired = secondsLeft <= 0;

  function handleChangeDigit(text: string, index: number) {
    const clean = text.replace(/[^0-9]/g, "");
    setErrorMessage("");

    if (clean.length > 1) {
      // Handles pasting the full code into one box.
      const pasted = clean.slice(0, OTP_LENGTH).split("");
      const next = Array(OTP_LENGTH).fill("");
      pasted.forEach((digit, i) => {
        next[i] = digit;
      });
      setDigits(next);
      const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
      inputRefs.current[focusIndex]?.focus();
      return;
    }

    setDigits((prev) => {
      const next = [...prev];
      next[index] = clean;
      return next;
    });

    if (clean && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyPress(key: string, index: number) {
    if (key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleVerify() {
    if (verifyingRef.current) return;
    const code = digits.join("");
    if (code.length !== OTP_LENGTH) {
      setErrorMessage("Enter the full 6-digit code.");
      return;
    }
    if (isExpired) {
      setErrorMessage("This code has expired. Request a new one.");
      return;
    }

    verifyingRef.current = true;
    try {
      setIsVerifying(true);
      setErrorMessage("");
      const response = await verifyOtp({ email, otp: code });
      if (!response.token || !response.data) {
        setErrorMessage("Verification succeeded but no session was returned.");
        return;
      }
      onVerified({ token: response.token, user: response.data });
    } catch (error) {
      setErrorMessage(
        getFriendlyErrorMessage(error),
      );
    } finally {
      verifyingRef.current = false;
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || isResending) return;

    try {
      setIsResending(true);
      setErrorMessage("");
      await resendOtp({ email });
      setDigits(Array(OTP_LENGTH).fill(""));
      restartTimers();
      inputRefs.current[0]?.focus();
    } catch (error) {
      setErrorMessage(
        getFriendlyErrorMessage(error),
      );
    } finally {
      setIsResending(false);
    }
  }

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      {/* Lifts the card above the keyboard so Verify stays reachable on small phones. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: colors.overlay }}
      >
        <View
          className="w-full rounded-[28px] border p-6"
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            maxWidth: 380,
          }}
        >
          <View className="flex-row items-start justify-between mb-2">
            <View className="flex-1 pr-2">
              <Text
                className="text-xl font-black"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                Verify your email
              </Text>
              <Text
                className="mt-1 text-xs font-semibold"
                style={{ color: colors.mutedText, fontFamily: fonts.body }}
              >
                We sent a 6-digit code to{"\n"}
                <Text style={{ color: colors.foreground }}>{email}</Text>
              </Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="p-1">
              <Icon set="ion" name="close" size={20} color={colors.mutedText} />
            </TouchableOpacity>
          </View>

          <View className="flex-row justify-between mt-6 mb-2">
            {digits.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => {
                  inputRefs.current[index] = ref;
                }}
                keyboardType="number-pad"
                maxLength={OTP_LENGTH}
                onChangeText={(text) => handleChangeDigit(text, index)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                value={digit}
                className="text-center text-lg font-black rounded-2xl border"
                style={{
                  width: 46,
                  height: 54,
                  backgroundColor: colors.input,
                  borderColor: digit ? colors.primary : colors.border,
                  borderWidth: digit ? 1.5 : 1,
                  color: colors.foreground,
                  fontFamily: fonts.mono,
                }}
              />
            ))}
          </View>

          <Text
            className="text-center text-xs font-bold mt-3"
            style={{ color: isExpired ? colors.danger : colors.mutedText, fontFamily: fonts.mono }}
          >
            {isExpired ? "Code expired" : `Expires in ${formatTime(secondsLeft)}`}
          </Text>

          {errorMessage ? (
            <View
              className="mt-4 rounded-2xl border px-4 py-3"
              style={{ backgroundColor: colors.dangerLight, borderColor: colors.danger }}
            >
              <Text
                className="text-center text-xs font-bold"
                style={{ color: colors.danger }}
              >
                {errorMessage}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.9}
            className="mt-5 rounded-full items-center justify-center py-4"
            disabled={isVerifying}
            onPress={handleVerify}
            style={{
              backgroundColor: colors.primary,
              opacity: isVerifying ? 0.7 : 1,
            }}
          >
            <Text
              className="text-sm font-bold"
              style={{ color: colors.buttonText, fontFamily: fonts.body }}
            >
              {isVerifying ? "Verifying..." : "Verify & Continue"}
            </Text>
          </TouchableOpacity>

          <View className="flex-row justify-center items-center mt-5 gap-1">
            <Text
              className="text-xs font-semibold"
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              Didn&apos;t get the code?
            </Text>
            <TouchableOpacity onPress={handleResend} disabled={resendCooldown > 0 || isResending}>
              <Text
                className="text-xs font-black"
                style={{
                  color: resendCooldown > 0 ? colors.mutedText : colors.primary,
                  fontFamily: fonts.body,
                }}
              >
                {isResending
                  ? " Sending..."
                  : resendCooldown > 0
                    ? ` Resend in ${resendCooldown}s`
                    : " Resend code"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
      <AppLockCover />
    </Modal>
  );
}
