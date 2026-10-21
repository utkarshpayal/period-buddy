import type { BillingCycle } from "../../lib/api";

/** Short price suffix: "₹199/mo", "₹999/yr", "₹49 once". */
export const CYCLE_SUFFIX: Record<BillingCycle, string> = {
  monthly: "/mo",
  yearly: "/yr",
  one_time: " once",
};
