import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { PaymentTrustFooter } from "./PaymentTrustFooter";
import type { CouponPreview } from "../../lib/api";
import { BottomSheet } from "../BottomSheet";
import { Icon } from "../Icon";
import { Button } from "../Button";

/**
 * "Confirm your purchase" step shown between tapping Buy and the checkout UI
 * opening (docs/fixes.md 6.2). How to pay is picked next, on PaymentSheet.
 */
export function PurchaseConfirmSheet({
  visible,
  itemName,
  itemDescription,
  originalAmount,
  cycleSuffix,
  couponPreview,
  couponNote,
  confirming,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  itemName: string;
  itemDescription?: string;
  originalAmount: number;
  cycleSuffix: string;
  /** Only set when the coupon was actually previewed against this exact item. */
  couponPreview: CouponPreview | null;
  /** Shown instead when a coupon code is entered but wasn't previewed against this item (e.g. a plan on PaywallModal). */
  couponNote?: string;
  confirming: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();

  const total = couponPreview ? couponPreview.finalAmount : originalAmount;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      avoidKeyboard
      style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: insets.bottom + 28 }}
    >
      <View className="flex-row items-center justify-between mb-5">
        <Text className="text-lg font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
          Confirm your purchase
        </Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} activeOpacity={0.7} className="p-1" disabled={confirming}>
          <Icon set="feather" name="x" size={20} color={colors.mutedText} />
        </TouchableOpacity>
      </View>

      <View className="rounded-2xl px-4 py-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
        <Text className="text-sm font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
          {itemName}
        </Text>
        {itemDescription ? (
          <Text className="text-xs mt-1" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
            {itemDescription}
          </Text>
        ) : null}

        <View className="mt-3 pt-3 border-t" style={{ borderColor: colors.border }}>
          {couponPreview && !couponPreview.free ? (
            <View className="flex-row items-center justify-between">
              <Text className="text-xs" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                Price
              </Text>
              <Text
                className="text-xs"
                style={{ color: colors.mutedText, fontFamily: fonts.body, textDecorationLine: "line-through" }}
              >
                ₹{couponPreview.originalAmount}
              </Text>
            </View>
          ) : null}
          {couponPreview ? (
            <View className="flex-row items-center justify-between mt-1">
              <Text className="text-xs font-semibold" style={{ color: colors.success, fontFamily: fonts.body }}>
                Coupon {couponPreview.code}
              </Text>
              <Text className="text-xs font-semibold" style={{ color: colors.success, fontFamily: fonts.body }}>
                {couponPreview.free ? "Free" : `-₹${couponPreview.discountAmount}`}
              </Text>
            </View>
          ) : couponNote ? (
            <Text className="text-xs mt-1" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              {couponNote}
            </Text>
          ) : null}
          <View className="flex-row items-center justify-between mt-2">
            <Text className="text-sm font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
              Total
            </Text>
            <Text className="text-sm font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
              {couponPreview?.free ? "₹0" : `₹${total}${cycleSuffix}`}
            </Text>
          </View>
        </View>
      </View>

      <Button label={couponPreview?.free ? "Unlock — free" : `Confirm & pay ₹${total}`} onPress={onConfirm} loading={confirming} fullWidth style={{ marginTop: 20 }} />

      <PaymentTrustFooter compact />
    </BottomSheet>
  );
}
