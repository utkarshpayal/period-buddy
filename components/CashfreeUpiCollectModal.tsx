import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Loader } from "./Loader";
import { useTheme } from "./theme";
import { getSoftTints } from "./ui-tokens";
import { isPlausibleUpiId, payWithUpiCollect } from "../lib/cashfreeUpi";

export type UpiCollectOutcome = { type: "success" } | { type: "failed"; message?: string } | { type: "dismiss" };

type Step = "enter" | "waiting" | "error";

// UPI Collect requests are typically approved within 30–60s; Cashfree
// expires the underlying request after a few minutes on their side, so
// this is a client-side safety net rather than the source of truth.
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120000;

/**
 * Fully native UPI-ID ("collect") payment — no Cashfree-hosted page or
 * WebView involved, since the Order Pay API (lib/cashfreeUpi.ts) takes only
 * the order's public payment_session_id and needs no client secret. This is
 * the one part of checkout where we can actually render in Nura's own UI
 * instead of Cashfree's; cards/netbanking/other UPI apps still go through
 * CashfreeCheckoutModal's hosted flow (offered as "More payment options").
 */
export function CashfreeUpiCollectModal({
  visible,
  mode,
  paymentSessionId,
  onVerify,
  onOutcome,
  onUseOtherMethod,
}: {
  visible: boolean;
  mode: "sandbox" | "production";
  paymentSessionId: string;
  /** Polled repeatedly while waiting for approval. Must resolve to "paid",
   * "pending" (Cashfree order still ACTIVE — keep polling), or "failed". */
  onVerify: () => Promise<"paid" | "pending" | "failed">;
  onOutcome: (result: UpiCollectOutcome) => void;
  /** "Pay another way" — falls back to the hosted CashfreeCheckoutModal. */
  onUseOtherMethod: () => void;
}) {
  const { colors, fonts } = useTheme();
  const softTints = getSoftTints(colors);
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>("enter");
  const [upiId, setUpiId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadline = useRef<number>(0);

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  useEffect(() => {
    if (!visible) {
      stopPolling();
      setStep("enter");
      setUpiId("");
      setSubmitting(false);
      setError(null);
    }
  }, [visible]);

  const startPolling = () => {
    pollDeadline.current = Date.now() + POLL_TIMEOUT_MS;
    pollTimer.current = setInterval(async () => {
      if (Date.now() > pollDeadline.current) {
        stopPolling();
        setStep("error");
        setError("This is taking longer than expected. If you approved the request, check My Subscription shortly — otherwise try again.");
        return;
      }
      const result = await onVerify();
      if (result === "paid") {
        stopPolling();
        onOutcome({ type: "success" });
      } else if (result === "failed") {
        stopPolling();
        setStep("error");
        setError("The payment wasn't approved. You haven't been charged.");
      }
      // "pending" — keep polling silently.
    }, POLL_INTERVAL_MS);
  };

  const handleSubmit = async () => {
    if (!isPlausibleUpiId(upiId)) {
      setError("Enter a valid UPI ID, like name@bank.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const result = await payWithUpiCollect({ mode, paymentSessionId, upiId });
    setSubmitting(false);
    if (result.type === "error") {
      setError(result.message);
      return;
    }
    setStep("waiting");
    startPolling();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => onOutcome({ type: "dismiss" })}>
      <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View
            className="rounded-t-3xl px-6 pt-6"
            style={{ backgroundColor: colors.background, paddingBottom: insets.bottom + 32 }}
          >
            <View className="flex-row items-center justify-between mb-5">
              <Text className="text-lg font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                Pay with UPI
              </Text>
              <TouchableOpacity onPress={() => onOutcome({ type: "dismiss" })} activeOpacity={0.7} className="p-1">
                <Feather name="x" size={20} color={colors.mutedText} />
              </TouchableOpacity>
            </View>

            {step === "enter" && (
              <>
                <Text className="text-sm font-semibold mb-2" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                  Enter your UPI ID
                </Text>
                <View
                  className="flex-row items-center rounded-2xl px-3.5"
                  style={{ backgroundColor: colors.input }}
                >
                  <Feather name="smartphone" size={15} color={colors.mutedText} />
                  <TextInput
                    value={upiId}
                    onChangeText={(v) => {
                      setUpiId(v);
                      if (error) setError(null);
                    }}
                    placeholder="name@bank"
                    placeholderTextColor={colors.mutedText}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    className="flex-1 ml-2 py-3.5 text-sm"
                    style={{ color: colors.foreground, fontFamily: fonts.body }}
                    onSubmitEditing={handleSubmit}
                  />
                </View>
                {error ? (
                  <Text className="text-[11px] font-semibold mt-1.5 ml-1" style={{ color: colors.danger, fontFamily: fonts.body }}>
                    {error}
                  </Text>
                ) : null}

                <TouchableOpacity
                  onPress={handleSubmit}
                  activeOpacity={0.85}
                  disabled={submitting || !upiId.trim()}
                  className="rounded-full py-4 items-center mt-5"
                  style={{ backgroundColor: upiId.trim() ? colors.primary : colors.border }}
                >
                  <Text className="text-sm font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                    {submitting ? "Sending request…" : "Pay via UPI"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={onUseOtherMethod} activeOpacity={0.7} className="items-center mt-4 py-1">
                  <Text className="text-xs font-bold" style={{ color: colors.primary, fontFamily: fonts.body }}>
                    Pay another way (card, netbanking…)
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {step === "waiting" && (
              <View className="items-center py-4">
                <Loader size={64} />
                <Text
                  className="text-sm font-bold mt-4 text-center"
                  style={{ color: colors.foreground, fontFamily: fonts.heading }}
                >
                  Approve the request in your UPI app
                </Text>
                <Text
                  className="text-xs font-semibold mt-1.5 text-center px-4"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  We&apos;ve sent a payment request to {upiId}. This screen will update automatically once you approve it.
                </Text>
              </View>
            )}

            {step === "error" && (
              <View className="items-center py-2">
                <View
                  className="w-14 h-14 rounded-full items-center justify-center mb-4"
                  style={{ backgroundColor: softTints.rose }}
                >
                  <Feather name="alert-circle" size={26} color={colors.danger} />
                </View>
                <Text
                  className="text-sm font-semibold text-center px-2 mb-5"
                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                >
                  {error}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setStep("enter");
                    setError(null);
                  }}
                  activeOpacity={0.85}
                  className="rounded-full px-6 py-3.5 items-center"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text className="text-sm font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                    Try again
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
