import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Loader } from "./Loader";
import { useTheme } from "./theme";
import { getSoftTints } from "./ui-tokens";
import { PaymentTrustFooter } from "./subscription/PaymentTrustFooter";
import { isPlausibleUpiId, payWithUpiCollect, startUpiIntent } from "../lib/cashfreeUpi";
import { UPI_APPS, upiAppLaunchUrls, type UpiApp } from "../lib/upiIntent";
import { BottomSheet } from "./BottomSheet";
import { Icon } from "./Icon";
import { haptics } from "../lib/haptics";
import { Button } from "./Button";

export type PaymentSheetOutcome = { type: "success" } | { type: "failed"; message?: string } | { type: "dismiss" };

type Step = "choose" | "upiId" | "waiting" | "error";

const POLL_INTERVAL_MS = 3000;
// Long enough to switch apps, enter a UPI PIN and come back; the backend's
// verify stays the source of truth after this.
const POLL_TIMEOUT_MS = 180000;
const NOT_CHARGED = "The payment didn't go through. You haven't been charged.";

/**
 * Nura's own payment sheet, the default way to pay (consultations,
 * subscriptions, paywall). UPI apps installed on the phone are listed and
 * opened directly with Cashfree's UPI intent links (lib/cashfreeUpi.ts
 * startUpiIntent), so a tap on PhonePe opens PhonePe; "Pay with UPI ID"
 * sends a collect request; "Card, netbanking or wallet" hands over to
 * Cashfree's hosted checkout (`onUseOtherMethod` → CashfreeCheckoutModal).
 * After handing off it polls `onVerify` (and checks at once when the person
 * comes back to the app) until the order is paid or failed.
 */
export function PaymentSheet({
  visible,
  mode,
  paymentSessionId,
  amount,
  title,
  onVerify,
  onOutcome,
  onUseOtherMethod,
}: {
  visible: boolean;
  mode: "sandbox" | "production";
  paymentSessionId: string;
  /** Rupees, shown in the header and the waiting step. */
  amount?: number;
  /** What is being paid for, e.g. the doctor or plan name. */
  title?: string;
  /** Must resolve to "paid", "pending" (keep waiting) or "failed". */
  onVerify: () => Promise<"paid" | "pending" | "failed">;
  onOutcome: (result: PaymentSheetOutcome) => void;
  onUseOtherMethod: () => void;
}) {
  const { colors, fonts } = useTheme();
  const softTints = getSoftTints(colors);
  const insets = useSafeAreaInsets();
  const native = Platform.OS !== "web";

  const [step, setStep] = useState<Step>("choose");
  const [installed, setInstalled] = useState<UpiApp[] | null>(native ? null : []);
  const [opening, setOpening] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [waitingFor, setWaitingFor] = useState("your UPI app");
  const [error, setError] = useState<string | null>(null);
  const [upiId, setUpiId] = useState("");
  const [upiError, setUpiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(POLL_TIMEOUT_MS / 1000);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadline = useRef(0);
  const lastPoll = useRef(0);
  /** The verify in flight, shared so a close can wait for a poll's answer instead of dropping it. */
  const inflight = useRef<Promise<"paid" | "pending" | "failed" | null> | null>(null);
  const settled = useRef(false);
  const mounted = useRef(true);
  const closing = useRef(false);
  const submittingRef = useRef(false);
  const openingRef = useRef(false);
  const stepRef = useRef(step);
  stepRef.current = step;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const onOutcomeRef = useRef(onOutcome);
  onOutcomeRef.current = onOutcome;

  const stopPolling = () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
  };

  const finish = (result: PaymentSheetOutcome) => {
    if (settled.current) return;
    settled.current = true;
    stopPolling();
    onOutcomeRef.current(result);
  };

  /** True once the sheet has settled or gone: nothing more may open an app or start polling. */
  const gone = () => settled.current || !mounted.current || !visibleRef.current;

  /**
   * One verify; settles on paid/failed. Resolves the status it saw, or null
   * once settled. A check already in flight is shared rather than skipped.
   */
  const checkOnce = (): Promise<"paid" | "pending" | "failed" | null> => {
    if (settled.current) return Promise.resolve(null);
    if (inflight.current) return inflight.current;
    const run = (async () => {
      let status: "paid" | "pending" | "failed";
      try {
        status = await onVerifyRef.current();
      } catch {
        // A throwing verify says nothing about the payment: keep waiting.
        status = "pending";
      }
      if (settled.current) return null;
      if (status === "paid") {
        haptics.success();
        finish({ type: "success" });
      }
      else if (status === "failed" && stepRef.current === "waiting") {
        stopPolling();
        setError(NOT_CHARGED);
        setStep("error");
      }
      return status;
    })();
    inflight.current = run;
    void run.finally(() => {
      if (inflight.current === run) inflight.current = null;
    });
    return run;
  };

  const startWaiting = (label: string) => {
    stopPolling();
    setWaitingFor(label);
    setStep("waiting");
    deadline.current = Date.now() + POLL_TIMEOUT_MS;
    setSecondsLeft(POLL_TIMEOUT_MS / 1000);
    lastPoll.current = Date.now();
    pollTimer.current = setInterval(() => {
      const left = Math.max(0, Math.round((deadline.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        stopPolling();
        setError(
          "We haven't received the payment yet. If money left your account, it will be confirmed or refunded automatically — otherwise try again.",
        );
        setStep("error");
        return;
      }
      if (Date.now() - lastPoll.current >= POLL_INTERVAL_MS) {
        lastPoll.current = Date.now();
        void checkOnce();
      }
    }, 1000);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopPolling();
    };
  }, []);

  // Fresh state each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    settled.current = false;
    closing.current = false;
    setStep("choose");
    setNotice(null);
    setError(null);
    setUpiId("");
    setUpiError(null);
    return stopPolling;
  }, [visible, paymentSessionId]);

  // Only offer apps this phone can open (Android <queries> / iOS LSApplicationQueriesSchemes).
  useEffect(() => {
    if (!visible || !native) return;
    let cancelled = false;
    Promise.all(UPI_APPS.map((app) => Linking.canOpenURL(app.probe).catch(() => false))).then((found) => {
      if (!cancelled) setInstalled(UPI_APPS.filter((_, i) => found[i]));
    });
    return () => {
      cancelled = true;
    };
  }, [visible, native]);

  // Coming back from the UPI app: check straight away instead of waiting for the next poll.
  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && stepRef.current === "waiting") void checkOnce();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const payWithApp = async (app: UpiApp | null) => {
    if (openingRef.current) return;
    openingRef.current = true;
    try {
      await openUpiApp(app);
    } finally {
      openingRef.current = false;
      if (mounted.current) setOpening(null);
    }
  };

  const openUpiApp = async (app: UpiApp | null) => {
    setOpening(app?.id ?? "other");
    setNotice(null);
    // A fresh payment attempt per tap: a link the person cancelled in one app can't be reused.
    const result = await startUpiIntent({ mode, paymentSessionId });
    // Closed while the link was being made: don't send them off to pay for nothing.
    if (gone()) return;
    if (result.type === "error") {
      setNotice(result.message);
      return;
    }
    let opened = false;
    for (const url of upiAppLaunchUrls(app, result.links)) {
      try {
        await Linking.openURL(url);
        opened = true;
        break;
      } catch {
        /* try the next link */
      }
    }
    if (gone()) return;
    if (!opened) {
      setNotice(`Couldn't open ${app?.name ?? "a UPI app"}. Try another app or pay with your UPI ID.`);
      return;
    }
    startWaiting(app?.name ?? "your UPI app");
  };

  const submitUpiId = async () => {
    // The keyboard's Go key skips the button's `disabled`, so guard here: two
    // taps would send two collect requests to the person's UPI app.
    if (submittingRef.current) return;
    if (!isPlausibleUpiId(upiId)) {
      setUpiError("Enter a valid UPI ID, like name@bank.");
      return;
    }
    setUpiError(null);
    submittingRef.current = true;
    setSubmitting(true);
    let result: Awaited<ReturnType<typeof payWithUpiCollect>>;
    try {
      result = await payWithUpiCollect({ mode, paymentSessionId, upiId });
    } finally {
      submittingRef.current = false;
      if (mounted.current) setSubmitting(false);
    }
    if (gone()) return;
    if (result.type === "error") {
      setUpiError(result.message);
      return;
    }
    startWaiting(upiId.trim());
  };

  const checkNow = async () => {
    setChecking(true);
    const status = await checkOnce();
    if (!mounted.current) return;
    setChecking(false);
    if (status === "pending") {
      setNotice("Not received yet. If you've paid, give it a few seconds — this updates on its own.");
    }
  };

  /**
   * Close (X / back). While waiting, one last check so a payment made just
   * now still counts; if a poll is already asking, its answer is the one
   * that counts (dismissing over it would drop a payment that just landed).
   */
  const close = async () => {
    if (closing.current || openingRef.current || submittingRef.current) return;
    if (stepRef.current === "upiId") {
      setStep("choose");
      return;
    }
    if (stepRef.current === "waiting") {
      closing.current = true;
      stopPolling();
      setChecking(true);
      try {
        const status = await checkOnce();
        if (status !== "pending") return;
      } finally {
        closing.current = false;
        if (mounted.current) setChecking(false);
      }
    }
    finish({ type: "dismiss" });
  };

  const backToChoose = () => {
    stopPolling();
    setNotice(null);
    setError(null);
    setStep("choose");
  };

  const amountText = amount != null ? `₹${amount.toLocaleString("en-IN")}` : null;
  const headerTitle =
    step === "upiId" ? "Pay with UPI ID" : step === "waiting" ? "Waiting for payment" : amountText ? `Pay ${amountText}` : "Payment";
  const minutesLeft = Math.max(1, Math.ceil(secondsLeft / 60));

  const appTile = (key: string, label: string, color: string, onPress: () => void, icon?: React.ReactNode) => {
    const busy = opening === key;
    return (
      <TouchableOpacity
        key={key}
        onPress={onPress}
        disabled={opening !== null}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Pay with ${label}`}
        className="items-center"
        style={{ width: "25%", paddingVertical: 8, opacity: opening && !busy ? 0.5 : 1 }}
      >
        <View className="w-14 h-14 rounded-2xl items-center justify-center" style={{ backgroundColor: color }}>
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            icon ?? (
              <Text style={{ color: "#FFFFFF", fontFamily: fonts.heading, fontSize: 20, fontWeight: "800" }}>
                {label.charAt(0)}
              </Text>
            )
          )}
        </View>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          className="text-xs font-semibold mt-1.5"
          style={{ color: colors.foreground, fontFamily: fonts.body }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const optionRow = (icon: React.ComponentProps<typeof Feather>["name"], label: string, detail: string, onPress: () => void) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={opening !== null}
      activeOpacity={0.8}
      accessibilityRole="button"
      className="flex-row items-center px-4 py-3.5"
      style={{ minHeight: 56 }}
    >
      <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: softTints.rose }}>
        <Icon set="feather" name={icon} size={18} color={colors.primary} />
      </View>
      <View className="flex-1 ml-3">
        <Text className="text-sm font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
          {label}
        </Text>
        <Text numberOfLines={1} className="text-xs mt-0.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
          {detail}
        </Text>
      </View>
      <Icon set="feather" name="chevron-right" size={18} color={colors.mutedText} />
    </TouchableOpacity>
  );

  return (
    <BottomSheet
      visible={visible}
      // close() may step back or keep waiting on a payment instead of closing.
      onClose={() => void close()}
      animateOutBeforeClose={false}
      avoidKeyboard
      style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row items-center mb-4">
        {step === "upiId" ? (
          <TouchableOpacity
            onPress={() => setStep("choose")}
            accessibilityLabel="Back"
            hitSlop={10}
            className="mr-2 p-1"
          >
            <Icon set="feather" name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
        ) : null}
        <View className="flex-1">
          <Text className="text-lg font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
            {headerTitle}
          </Text>
          {title && step === "choose" ? (
            <Text numberOfLines={1} className="text-xs mt-0.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              {title}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => void close()}
          disabled={checking || opening !== null || submitting}
          accessibilityLabel="Close"
          hitSlop={10}
          className="p-1"
        >
          <Icon set="feather" name="x" size={20} color={colors.mutedText} />
        </TouchableOpacity>
      </View>

      {step === "choose" && (
        <>
          {native && (
            <>
              <Text className="text-xs font-bold mb-1" style={{ color: colors.mutedText, fontFamily: fonts.body, letterSpacing: 0.4 }}>
                PAY WITH A UPI APP
              </Text>
              {installed === null ? (
                <View className="py-6 items-center">
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : installed.length === 0 && Platform.OS === "ios" ? (
                <Text className="text-sm py-3" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                  No UPI app found on this phone. Pay with your UPI ID or a card below.
                </Text>
              ) : (
                <View className="flex-row flex-wrap -mx-1">
                  {installed.map((app) => appTile(app.id, app.name, app.color, () => void payWithApp(app)))}
                  {Platform.OS === "android" &&
                    appTile(
                      "other",
                      installed.length ? "Other app" : "UPI app",
                      colors.primary,
                      () => void payWithApp(null),
                      <Icon set="feather" name="grid" size={22} color="#FFFFFF" />,
                    )}
                </View>
              )}
            </>
          )}

          {notice ? (
            <View className="flex-row items-start rounded-2xl px-3.5 py-3 mt-2" style={{ backgroundColor: softTints.rose }}>
              <Icon set="feather" name="alert-circle" size={15} color={colors.danger} style={{ marginTop: 1 }} />
              <Text className="flex-1 text-xs font-semibold ml-2" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                {notice}
              </Text>
            </View>
          ) : null}

          <View
            className="rounded-2xl mt-4 overflow-hidden"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            {optionRow("at-sign", "Pay with UPI ID", "Approve a request in your UPI app", () => {
              setNotice(null);
              setStep("upiId");
            })}
            <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 68 }} />
            {optionRow("credit-card", "Card, netbanking or wallet", "Secure Cashfree checkout", onUseOtherMethod)}
          </View>

          <PaymentTrustFooter compact />
        </>
      )}

      {step === "upiId" && (
        <>
          <View className="flex-row items-center rounded-2xl px-3.5" style={{ backgroundColor: colors.input }}>
            <Icon set="feather" name="at-sign" size={15} color={colors.mutedText} />
            <TextInput
              value={upiId}
              onChangeText={(v) => {
                setUpiId(v);
                if (upiError) setUpiError(null);
              }}
              placeholder="name@bank"
              placeholderTextColor={colors.mutedText}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              keyboardType="email-address"
              returnKeyType="go"
              accessibilityLabel="UPI ID"
              className="flex-1 ml-2 py-3.5 text-sm"
              style={{ color: colors.foreground, fontFamily: fonts.body }}
              onSubmitEditing={submitUpiId}
            />
          </View>
          {upiError ? (
            <Text className="text-xs font-semibold mt-1.5 ml-1" style={{ color: colors.danger, fontFamily: fonts.body }}>
              {upiError}
            </Text>
          ) : (
            <Text className="text-xs mt-1.5 ml-1" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              We&apos;ll send a payment request to this UPI ID.
            </Text>
          )}
          <Button
            label={amountText ? `Send request for ${amountText}` : "Send payment request"}
            onPress={submitUpiId}
            disabled={!upiId.trim()}
            loading={submitting}
            fullWidth
            style={{ marginTop: 20 }}
          />
          <PaymentTrustFooter compact />
        </>
      )}

      {step === "waiting" && (
        <View className="items-center pb-2">
          <Loader size={64} />
          <Text className="text-base font-bold mt-4 text-center" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
            {waitingFor.includes("@") ? "Approve the request in your UPI app" : `Complete the payment in ${waitingFor}`}
          </Text>
          <Text className="text-xs mt-1.5 text-center px-4" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
            {waitingFor.includes("@")
              ? `We've sent ${amountText ?? "a payment"} request to ${waitingFor}.`
              : `Pay${amountText ? ` ${amountText}` : ""} there, then come back.`}{" "}
            This screen updates on its own.
          </Text>
          <View className="rounded-full px-3.5 py-1.5 mt-3" style={{ backgroundColor: colors.input }}>
            <Text className="text-xs font-bold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              Waiting · up to {minutesLeft} min
            </Text>
          </View>
          {notice ? (
            <Text className="text-xs font-semibold mt-3 text-center px-2" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              {notice}
            </Text>
          ) : null}
          <Button label="I've paid · check status" onPress={checkNow} loading={checking} fullWidth style={{ marginTop: 20 }} />
          <TouchableOpacity onPress={backToChoose} disabled={checking} accessibilityRole="button" className="items-center mt-3 py-2">
            <Text className="text-sm font-bold" style={{ color: colors.primary, fontFamily: fonts.body }}>
              Try another way to pay
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {step === "error" && (
        <View className="items-center py-2">
          <View className="w-14 h-14 rounded-full items-center justify-center mb-4" style={{ backgroundColor: softTints.rose }}>
            <Icon set="feather" name="alert-circle" size={26} color={colors.danger} />
          </View>
          <Text className="text-sm font-semibold text-center px-2 mb-5" style={{ color: colors.foreground, fontFamily: fonts.body }}>
            {error}
          </Text>
          <Button label="Try again" size="md" onPress={backToChoose} />
        </View>
      )}
    </BottomSheet>
  );
}
