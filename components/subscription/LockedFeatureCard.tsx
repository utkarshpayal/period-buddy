import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../theme";
import type { BillingCycle } from "../../lib/api";

const CYCLE_SUFFIX: Record<BillingCycle, string> = {
  monthly: "/mo",
  yearly: "/yr",
  one_time: " once",
};

/**
 * Friendly "this is a premium feature" placeholder — swap this in wherever
 * `useSubscriptionAccess().hasAccess('key')` is false, instead of hiding the
 * feature outright or letting the request fail. Tapping it should open
 * PaywallModal (pass that as `onPress`), pre-populated with the same
 * feature's pricing shown here.
 */
export function LockedFeatureCard({
  title,
  description,
  price,
  billingCycle = "monthly",
  onPress,
  compact = false,
}: {
  title: string;
  description?: string;
  price?: number;
  billingCycle?: BillingCycle;
  onPress: () => void;
  /** Tighter, inline variant for embedding inside an existing list/section
   * rather than replacing a whole screen. */
  compact?: boolean;
}) {
  const { colors, fonts } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className={`items-center rounded-3xl ${compact ? "px-5 py-6" : "px-6 py-10"}`}
      style={{
        backgroundColor: colors.goldLight ?? colors.surfaceSoft,
        borderWidth: 1,
        borderColor: colors.gold ?? colors.border,
        borderStyle: "dashed",
      }}
    >
      <View
        className="h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.gold ?? colors.primary }}
      >
        <MaterialCommunityIcons name="lock-outline" size={26} color={colors.buttonText} />
      </View>

      <Text
        className="mt-4 text-base font-bold text-center"
        style={{ color: colors.foreground, fontFamily: fonts.heading }}
      >
        {title}
      </Text>

      {description ? (
        <Text
          className="mt-1.5 text-xs text-center leading-5"
          style={{ color: colors.mutedText, fontFamily: fonts.body }}
        >
          {description}
        </Text>
      ) : null}

      <View
        className="mt-5 flex-row items-center rounded-full px-5 py-2.5"
        style={{ backgroundColor: colors.gold ?? colors.primary }}
      >
        <Text className="text-sm font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
          {price !== undefined
            ? `Unlock — ₹${price}${CYCLE_SUFFIX[billingCycle]}`
            : "Unlock this feature"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
