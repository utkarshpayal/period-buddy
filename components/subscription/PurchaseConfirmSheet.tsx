import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { PaymentTrustFooter } from "./PaymentTrustFooter";
import { subscriptionApi, type BillingCycle, type CouponPreview, type TaxSettings } from "../../lib/api";
import { DEFAULT_TAX, formatRupees, purchaseDisclosure, taxBreakdown } from "../../lib/pricing";
import { BottomSheet } from "../BottomSheet";
import { Icon } from "../Icon";
import { Button } from "../Button";

/**
 * "Confirm your purchase" step shown between tapping Buy and the checkout UI
 * opening (docs/fixes.md 6.2). How to pay is picked next, on PaymentSheet.
 * Before anyone pays it states the amount, how long it lasts, the GST and
 * that nothing renews by itself (lib/pricing.ts#purchaseDisclosure), using
 * the live tax settings from GET /api/subscriptions/pricing.
 */
export function PurchaseConfirmSheet({
  visible,
  itemName,
  itemDescription,
  originalAmount,
  cycleSuffix,
  billingCycle,
  renewalPrice,
  startsAt,
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
  /** How long it lasts, for the disclosure (absent = shown without it). */
  billingCycle?: BillingCycle;
  /** A promo plan's normal price after its first period. */
  renewalPrice?: number | null;
  /** Set when the buyer already has this: the new period follows it. */
  startsAt?: string | null;
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

  const [tax, setTax] = useState<TaxSettings>(DEFAULT_TAX);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    subscriptionApi
      .getPricing()
      .then((pricing) => live && setTax(pricing.tax))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [visible]);

  // The list price after any coupon; GST is worked out from it.
  const listAmount = couponPreview ? couponPreview.originalAmount - couponPreview.discountAmount : originalAmount;
  const total = taxBreakdown(listAmount, tax).total;
  const disclosure = billingCycle ? purchaseDisclosure({ amount: listAmount, billingCycle, tax, renewalPrice, startsAt }) : [];

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
              {couponPreview?.free ? "₹0" : `${formatRupees(total)}${cycleSuffix}`}
            </Text>
          </View>
          {!couponPreview?.free && disclosure.length > 0 ? (
            <View style={{ marginTop: 10, gap: 4 }} accessibilityRole="summary">
              {disclosure.map((line) => (
                <Text key={line} style={{ color: colors.mutedText, fontSize: 13, lineHeight: 18, fontFamily: fonts.body }}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <Button label={couponPreview?.free ? "Unlock — free" : `Confirm & pay ${formatRupees(total)}`} onPress={onConfirm} loading={confirming} fullWidth style={{ marginTop: 20 }} />

      <PaymentTrustFooter compact />
    </BottomSheet>
  );
}
