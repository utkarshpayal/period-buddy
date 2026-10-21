import { fetchQuery } from "../queryCache";
import { apiRequest } from "./client";

export type BillingCycle = "monthly" | "yearly" | "one_time";

export type SubscriptionFeature = {
  _id: string;
  key: string;
  name: string;
  description?: string;
  category: string;
  icon?: string;
  isPremium: boolean;
  price: number;
  billingCycle: BillingCycle;
  isActive: boolean;
  sortOrder: number;
};

export type SubscriptionPlan = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  billingCycle: BillingCycle;
  features: string[];
  isDefault: boolean;
  isActive: boolean;
  badge?: string;
};

export type Entitlement = {
  _id: string;
  source: "plan" | "feature";
  plan?: SubscriptionPlan | string | null;
  featureKey?: string;
  status: "pending" | "active" | "expired" | "cancelled" | "failed";
  amount: number;
  currency: string;
  billingCycle: BillingCycle;
  startedAt?: string;
  expiresAt?: string | null;
  createdAt: string;
};

export type MySubscription = {
  subscriptionEnabled: boolean;
  currency: string;
  entitlements: Entitlement[];
  unlockedFeatureKeys: "ALL" | string[];
};

// `orderId`/`paymentSessionId` are absent when `free` is true — a 100%-off
// coupon activates the entitlement immediately server-side, with no
// Cashfree order created at all. Always check `free` before touching
// either field.
export type SubscriptionOrder = {
  entitlementId: string;
  free: boolean;
  orderId?: string;
  amount: number;
  currency: string;
  paymentSessionId?: string;
  cashfreeMode?: "sandbox" | "production";
};

export type DiscountType = "percentage" | "flat";

export type CouponPreview = {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  currency: string;
  /** True when this coupon brings the price to ₹0 — purchasing skips
   * Cashfree checkout entirely (see createOrder's `free` response field). */
  free: boolean;
};

export type PurchasePayload =
  | { source: "plan"; planId: string }
  | { source: "feature"; featureKey: string };

export const subscriptionApi = {
  getPlans: () => apiRequest<SubscriptionPlan[]>("/api/subscriptions/plans", { skipAuth: true }),

  getFeatures: () =>
    apiRequest<SubscriptionFeature[]>("/api/subscriptions/features", { skipAuth: true }),

  /** Shared through lib/queryCache (one request for every gate mounted at
   * once, dropped on sign-out); a purchase marks it stale via "subscription". */
  getMe: (opts: { force?: boolean } = {}) =>
    fetchQuery("subscription:me", () => apiRequest<MySubscription>("/api/subscriptions/me"), {
      staleMs: 60_000,
      topics: ["subscription"],
      force: opts.force,
    }),

  getHistory: () => apiRequest<Entitlement[]>("/api/subscriptions/history"),

  /** Preview a coupon's discount against a specific plan/feature before
   * buying — creates nothing. The actual purchase (createOrder below) still
   * re-validates the code itself, so this is just for showing the
   * discounted price / "Free!" state before the user commits. */
  applyCoupon: (payload: { code: string } & PurchasePayload) =>
    apiRequest<CouponPreview>("/api/subscriptions/coupons/apply", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  createOrder: (payload: PurchasePayload & { couponCode?: string }) =>
    apiRequest<SubscriptionOrder>("/api/subscriptions/order", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  // See consultationApi.verifyPayment's note — a still-open Cashfree order
  // (e.g. an unapproved UPI collect request) comes back as { pending: true }.
  verifyPayment: (payload: { entitlementId: string; orderId: string }) =>
    apiRequest<Entitlement | { pending: true }>("/api/subscriptions/verify", {
      body: JSON.stringify(payload),
      method: "POST",
    }),
};
