import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { formatSessionWhen } from "../../lib/consultationFormat";
import { PaymentTrustFooter } from "../subscription/PaymentTrustFooter";
import { useTheme } from "../theme";
import { Button } from "../Button";

/** The sticky Book button under the time picker, with the payment-confirming note. */
export function BookingBar({
  fee,
  slotStart,
  booking,
  paymentNote,
  disabled,
  onBook,
}: {
  /** Formatted fee, or null when the doctor isn't bookable yet. */
  fee: string | null;
  slotStart: string | null;
  booking: boolean;
  paymentNote: string | null;
  disabled: boolean;
  onBook: () => void;
}) {
  const { colors, fonts } = useTheme();
  const canBook = !disabled && Boolean(fee && slotStart);
  const label = !fee
    ? "Booking isn't open for this specialist yet"
    : slotStart
      ? `Book ${formatSessionWhen(slotStart)} · ${fee}`
      : `Pick a time to book · ${fee}`;

  return (
    <View
      className="border-t px-6 py-4"
      // The screen's SafeAreaView already pads the home-indicator inset.
      style={{ backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: 16 }}
    >
      {paymentNote ? (
        <View className="flex-row items-center justify-center gap-2 mb-3">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text className="text-xs font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
            {paymentNote}
          </Text>
        </View>
      ) : null}
      <Button label={label} onPress={onBook} loading={booking} disabled={!canBook} fullWidth />
      {fee ? <PaymentTrustFooter compact /> : null}
    </View>
  );
}
