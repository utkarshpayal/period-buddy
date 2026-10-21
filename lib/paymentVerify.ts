/**
 * How a payment-verify call's answer maps to "paid / still pending / failed",
 * shared by hooks/usePaymentCheckout.ts (subscriptions, paywall) and the
 * consultation booking flow. Both verify endpoints answer `{ pending: true }`
 * while Cashfree's order is still open and 400 once it has definitely failed.
 *
 * The rule that matters: only a definite answer from the server ends the wait
 * as "failed". A 5xx, a timeout or a dropped connection says nothing about the
 * payment itself, and telling someone "You haven't been charged" after money
 * may have left their account is the worst outcome here.
 *
 * No React or api.ts import, so it stays unit-testable
 * (lib/__tests__/paymentVerify.test.ts).
 */

export type VerifyStatus = "paid" | "pending" | "failed";

export type PendingVerify = { pending: true };

export type VerifyOptions = {
  /** HTTP statuses that mean the payment definitely didn't go through. Default [400]. */
  failedStatuses?: readonly number[];
};

const DEFAULT_FAILED_STATUSES = [400] as const;

export function isPendingVerify(result: unknown): result is PendingVerify {
  return typeof result === "object" && result !== null && "pending" in result;
}

/** True when the error is the server saying the payment failed (not a transient problem). */
export function isPaymentDeclined(err: unknown, options: VerifyOptions = {}): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" && (options.failedStatuses ?? DEFAULT_FAILED_STATUSES).includes(status);
}

/** One verify call reduced to a status. Never throws. */
export async function verifyStatusOnce<V>(
  verify: () => Promise<V | PendingVerify>,
  options: VerifyOptions = {},
): Promise<VerifyStatus> {
  try {
    return isPendingVerify(await verify()) ? "pending" : "paid";
  } catch (err) {
    return isPaymentDeclined(err, options) ? "failed" : "pending";
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Verifies, retrying after each delay while the order is still pending or the
 * call failed transiently (a hosted-checkout "success" can race Cashfree's own
 * webhook). Resolves the verified record, or null if it's still not settled
 * after the last retry. Rethrows a declined payment so the caller can say so.
 */
export async function verifyWithRetries<V>(
  verify: () => Promise<V | PendingVerify>,
  delaysMs: readonly number[],
  options: VerifyOptions & { wait?: (ms: number) => Promise<void> } = {},
): Promise<V | null> {
  const wait = options.wait ?? sleep;
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      const result = await verify();
      if (!isPendingVerify(result)) return result;
    } catch (err) {
      if (isPaymentDeclined(err, options)) throw err;
      // Transient: treat like "still pending" and try again.
    }
    if (attempt < delaysMs.length) await wait(delaysMs[attempt]);
  }
  return null;
}
