import React from "react";
import type { ConsultationOrder } from "../../lib/api";
import { CashfreeCheckoutModal, type CashfreeResult } from "../CashfreeCheckoutModal";
import { PaymentSheet, type PaymentSheetOutcome } from "../PaymentSheet";

/**
 * Paying for a booking: PaymentSheet (UPI apps, UPI ID) first; its "Card,
 * netbanking or wallet" switches to Cashfree's hosted checkout.
 */
export function ConsultationCheckout({
  order,
  hosted,
  title,
  onVerify,
  onUpiOutcome,
  onUseOtherMethod,
  onHostedResult,
}: {
  order: ConsultationOrder | null;
  hosted: boolean;
  title: string;
  onVerify: (orderId: string) => Promise<"paid" | "pending" | "failed">;
  onUpiOutcome: (result: PaymentSheetOutcome) => void;
  onUseOtherMethod: () => void;
  onHostedResult: (result: CashfreeResult) => void;
}) {
  if (!order) return null;
  if (!hosted) {
    return (
      <PaymentSheet
        visible
        mode={order.cashfreeMode ?? "production"}
        paymentSessionId={order.paymentSessionId!}
        amount={order.amount}
        title={title}
        onVerify={() => onVerify(order.orderId!)}
        onOutcome={onUpiOutcome}
        onUseOtherMethod={onUseOtherMethod}
      />
    );
  }
  return (
    <CashfreeCheckoutModal
      visible
      mode={order.cashfreeMode ?? "production"}
      orderId={order.orderId!}
      paymentSessionId={order.paymentSessionId!}
      onResult={onHostedResult}
    />
  );
}
