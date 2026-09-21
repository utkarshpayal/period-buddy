import { Feather } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme";

/**
 * Small reassurance line for real-money screens (fixes.md 6.4) — no policy
 * page exists in-app to link to yet, so this stays text-only rather than
 * inventing one.
 */
export function PaymentTrustFooter({ compact = false }: { compact?: boolean }) {
  const { colors, fonts } = useTheme();

  return (
    <View className={`flex-row items-center justify-center ${compact ? "mt-3" : "mt-6"}`} style={{ gap: 6 }}>
      <Feather name="lock" size={11} color={colors.mutedText} />
      <Text className="text-[11px] font-semibold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
        Payments secured by Cashfree · cards, UPI &amp; netbanking supported
      </Text>
    </View>
  );
}
