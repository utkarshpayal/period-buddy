import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../theme";
import { getSoftTints } from "../ui-tokens";
import type { PurchaseResult } from "../../hooks/usePaymentCheckout";

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

  const handleRecheck = async () => {
    setChecking(true);
    try {
      await onRecheckPending();
    } finally {
      setChecking(false);
    }
  };

  if (result.type === "success") {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: softTints.emerald }}>
          <MaterialCommunityIcons name="check-circle" size={34} color={colors.success} />
        </View>
        <Text className="mt-5 text-lg font-bold text-center" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
          Unlocked!
        </Text>
        <Text className="mt-1.5 text-sm text-center" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
          {itemLabel ? `${itemLabel} is active on your account.` : "Your purchase is active."}
        </Text>

        <TouchableOpacity
          onPress={onDone}
          activeOpacity={0.9}
          className="mt-7 w-full items-center rounded-full py-4"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-sm font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
            Great, continue
          </Text>
        </TouchableOpacity>

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
          <MaterialCommunityIcons name="clock-outline" size={32} color={colors.gold ?? colors.warning} />
        </View>
        <Text className="mt-5 text-lg font-bold text-center" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
          Almost there
        </Text>
        <Text className="mt-1.5 text-sm text-center" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
          Payment is still processing. Tap below to check again.
        </Text>

        <TouchableOpacity
          onPress={handleRecheck}
          activeOpacity={0.9}
          disabled={checking}
          className="mt-7 w-full flex-row items-center justify-center rounded-full py-4"
          style={{ backgroundColor: colors.primary, opacity: checking ? 0.7 : 1 }}
        >
          {checking ? (
            <ActivityIndicator color={colors.buttonText} />
          ) : (
            <Text className="text-sm font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
              Check payment status
            </Text>
          )}
        </TouchableOpacity>

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
        <MaterialCommunityIcons name="close-circle" size={32} color={colors.danger} />
      </View>
      <Text className="mt-5 text-lg font-bold text-center" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
        Payment failed
      </Text>
      <Text className="mt-1.5 text-sm text-center" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
        {result.message}
      </Text>

      <TouchableOpacity
        onPress={onDismissFailure}
        activeOpacity={0.9}
        className="mt-7 w-full items-center rounded-full py-4"
        style={{ backgroundColor: colors.primary }}
      >
        <Text className="text-sm font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
          Try again
        </Text>
      </TouchableOpacity>
    </View>
  );
}
