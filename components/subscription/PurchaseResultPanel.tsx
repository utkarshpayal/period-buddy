import React, { useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../theme";
import { getSoftTints } from "../ui-tokens";
import type { PurchaseResult } from "../../hooks/usePaymentCheckout";
import { Icon } from "../Icon";
import { Button } from "../Button";

/**
 * In-app success/failure/pending state rendered in place of a native OS
 * Alert (docs/fixes.md 6.6) — also resolves 4.1's "payment pending" dead end via
 * `onRecheckPending`'s manual retry.
 */
export function PurchaseResultPanel({
  result,
  itemLabel,
  onDone,
  onDismissFailure,
  onRecheckPending,
  onViewHistory,
}: {
  result: PurchaseResult;
  itemLabel?: string;
  onDone: () => void;
  onDismissFailure: () => void;
  onRecheckPending: () => Promise<void>;
  onViewHistory?: () => void;
}) {
  const { colors, fonts } = useTheme();
  const softTints = getSoftTints(colors);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);

  const handleRecheck = async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      await onRecheckPending();
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  };

  if (result.type === "success") {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: softTints.emerald }}>
          <Icon set="mci" name="check-circle" size={34} color={colors.success} />
        </View>
        <Text className="mt-5 text-lg font-bold text-center" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
          Unlocked!
        </Text>
        <Text className="mt-1.5 text-sm text-center" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
          {itemLabel ? `${itemLabel} is active on your account.` : "Your purchase is active."}
        </Text>

        <Button label="Great, continue" onPress={onDone} fullWidth style={{ marginTop: 28 }} />

        {onViewHistory ? (
          <TouchableOpacity onPress={onViewHistory} activeOpacity={0.7} className="mt-3 py-1">
            <Text className="text-xs font-bold" style={{ color: colors.primary, fontFamily: fonts.body }}>
              View receipt in Purchase history
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (result.type === "pending") {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: softTints.gold ?? softTints.amber }}>
          <Icon set="mci" name="clock-outline" size={32} color={colors.gold ?? colors.warning} />
        </View>
        <Text className="mt-5 text-lg font-bold text-center" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
          Almost there
        </Text>
        <Text className="mt-1.5 text-sm text-center" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
          {result.message ?? "Payment is still processing. Tap below to check again."}
        </Text>

        <Button label="Check payment status" onPress={handleRecheck} loading={checking} fullWidth style={{ marginTop: 28 }} />

        {onViewHistory ? (
          <TouchableOpacity onPress={onViewHistory} activeOpacity={0.7} className="mt-3 py-1">
            <Text className="text-xs font-bold" style={{ color: colors.primary, fontFamily: fonts.body }}>
              Check My Subscription instead
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: softTints.rose }}>
        <Icon set="mci" name="close-circle" size={32} color={colors.danger} />
      </View>
      <Text className="mt-5 text-lg font-bold text-center" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
        Payment failed
      </Text>
      <Text className="mt-1.5 text-sm text-center" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
        {result.message}
      </Text>

      <Button label="Try again" onPress={onDismissFailure} fullWidth style={{ marginTop: 28 }} />
    </View>
  );
}
