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
  /** Annual add-on price, bought with `billingCycle: "yearly"`; null = monthly only. */
  yearlyPrice?: number | null;
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
  /** Plans sold as one product share a family ("premium"). */
  family?: string | null;
  /** Set only on a promo plan such as the founding-member offer. */
  promo?: { kind: string | null; maxRedemptions?: number | null; endsAt?: string | null; renewalPlanSlug?: string | null } | null;
};

export type Entitlement = {
  _id: string;
  source: "plan" | "feature";
  plan?: SubscriptionPlan | string | null;
  featureKey?: string;
  status: "pending" | "active" | "expired" | "cancelled" | "failed" | "refunded";
  isFoundingOffer?: boolean;
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
  /** Absent from backends before the 2026 pricing. */
  premium?: PremiumStatus;
  usage?: { tier: "free" | "premium"; fairUseEnabled: boolean; items: UsageItem[] };
};

export type PremiumStatus =
  | { active: false }
  | {
      active: true;
      until: string | null;
      planSlug: string;
      billingCycle: BillingCycle;
      isFoundingOffer: boolean;
      /** Always false today: Premium is paid ahead and never charges again by itself. */
      autoRenews: boolean;
      renewalPlanSlug: string;
    };

export type UsageItem = {
  key: "ai_message" | "document_upload" | "doctor_report";
  period: "day" | "month";
  used: number;
  /** null = no limit. */
  limit: number | null;
  remaining: number | null;
  resetsAt: string;
};

export type TaxSettings = { ratePercent: number; pricesIncludeTax: boolean };

export type PlanCard = {
  planId: string;
  slug: string;
  name: string;
  description?: string;
  price: number;
  billingCycle: BillingCycle;
  badge?: string;
};

export type AnnualComparison = {
  twelveMonthly: number;
  monthlyEquivalent: number;
  saving: number | null;
  savingPercent: number | null;
};

export type PricingAddOn = {
  key: string;
  name: string;
  description?: string;
  category: string;
  price: number;
  billingCycle: BillingCycle;
  yearlyPrice: number | null;
  includedInPremium: boolean;
};

/** GET /api/subscriptions/pricing: one summary the app and website both draw. */
export type PricingSummary = {
  currency: string;
  subscriptionEnabled: boolean;
  allowFeatureWisePurchase: boolean;
  tax: TaxSettings;
  premium: {
    features: { key: string; name: string }[];
    monthly: PlanCard | null;
    yearly: (PlanCard & { comparison: AnnualComparison | null }) | null;
    /** Only while the offer is live and (signed in) the caller is eligible. */
    founding:
      | (PlanCard & {
          endsAt: string | null;
          maxMembers: number | null;
          renewalPrice: number | null;
          renewalBillingCycle: BillingCycle;
        })
      | null;
    autoRenews: boolean;
  };
  addOns: PricingAddOn[];
  fairUse: {
    enabled: boolean;
    aiMessagesPerDay?: { free: number; premium: number };
    documentsPerMonth?: { free: number; premium: number };
    maxPagesPerDocument?: { free: number; premium: number };
    doctorReportsPerMonth?: { free: number; premium: number };
  };
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
  tax?: { base: number; tax: number; total: number; inclusive: boolean; ratePercent: number };
  /** True when this coupon brings the price to ₹0 — purchasing skips
   * Cashfree checkout entirely (see createOrder's `free` response field). */
  free: boolean;
};

export type PurchasePayload =
  | { source: "plan"; planId: string }
  /** `billingCycle: "yearly"` buys the add-on's yearly price. */
  | { source: "feature"; featureKey: string; billingCycle?: "monthly" | "yearly" };

export const subscriptionApi = {
  getPlans: () => apiRequest<SubscriptionPlan[]>("/api/subscriptions/plans", { skipAuth: true }),

  getFeatures: () =>
    apiRequest<SubscriptionFeature[]>("/api/subscriptions/features", { skipAuth: true }),

  /** Premium monthly/yearly, the founding offer (only if live and this
   * account is eligible, so it's sent signed in), add-ons, tax and fair use.
   * 404 on backends before the 2026 pricing: see lib/pricing.ts#pricingFromCatalog. */
  getPricing: (opts: { force?: boolean } = {}) =>
    fetchQuery("subscription:pricing", () => apiRequest<PricingSummary>("/api/subscriptions/pricing"), {
      staleMs: 60_000,
      topics: ["subscription"],
      force: opts.force,
    }),

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
