import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTheme } from "../theme";
import { getSoftTints } from "../ui-tokens";
import type { CouponPreview } from "../../lib/api";
import { Icon } from "../Icon";
import { Button } from "../Button";

/**
 * Coupon code input, shared by PaywallModal and the My Subscription pricing
 * screen. Purely presentational — the parent owns the applied/preview state
 * and does the actual subscriptionApi.applyCoupon() call, since what the
 * code gets previewed against differs between the two screens (PaywallModal
 * has one clear primary item; the pricing screen has many).
 */
export function CouponField({
  code,
  onChangeCode,
  onApply,
  applying,
  preview,
  error,
  onRemove,
}: {
  code: string;
  onChangeCode: (value: string) => void;
  onApply: () => void;
  applying: boolean;
  preview: CouponPreview | null;
  error: string | null;
  onRemove: () => void;
}) {
  const { colors, fonts } = useTheme();
  const softTints = getSoftTints(colors);

  if (preview) {
    return (
      <View
        className="flex-row items-center rounded-2xl px-4 py-3"
        style={{ backgroundColor: softTints.emerald }}
      >
        <Icon set="feather" name="tag" size={16} color={colors.success} />
        <View className="flex-1 ml-2.5">
          <Text className="text-xs font-black" style={{ color: colors.success, fontFamily: fonts.heading }}>
            {preview.code} applied
          </Text>
          <Text className="text-xs mt-0.5 font-semibold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
            {preview.free
              ? "Fully covered — unlock for free"
              : `₹${preview.discountAmount} off — now ₹${preview.finalAmount}`}
          </Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Remove coupon" onPress={onRemove} activeOpacity={0.7} className="p-1.5">
          <Icon set="feather" name="x" size={16} color={colors.mutedText} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <View
        className="flex-row items-center rounded-2xl px-3.5"
        style={{ backgroundColor: colors.input }}
      >
        <Icon set="feather" name="tag" size={15} color={colors.mutedText} />
        <TextInput
          value={code}
          onChangeText={(v) => onChangeCode(v.toUpperCase())}
          accessibilityLabel="Coupon code"
          placeholder="Have a coupon code?"
          placeholderTextColor={colors.mutedText}
          autoCapitalize="characters"
          autoCorrect={false}
          className="flex-1 ml-2 py-3 text-sm"
          style={{ color: colors.foreground, fontFamily: fonts.body }}
          onSubmitEditing={onApply}
        />
        <Button label="Apply" size="sm" onPress={onApply} disabled={!code.trim()} loading={applying} style={{ marginLeft: 4 }} />
      </View>
      {error ? (
        <Text className="text-xs font-semibold mt-1.5 ml-1" style={{ color: colors.danger, fontFamily: fonts.body }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
