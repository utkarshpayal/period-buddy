// Display rules for prices on My Subscription and the paywall: rupee
// formatting, the yearly saving, GST, the "before you pay" disclosure and a
// pricing summary rebuilt from the old plans/features endpoints for backends
// without GET /api/subscriptions/pricing. Pure (types only from lib/api), so
// it's unit-tested in lib/__tests__/pricing.test.ts. The money rules
// themselves live in the backend's utils/pricing.js; keep the two in step.

import type {
  AnnualComparison,
  BillingCycle,
  PricingAddOn,
  PricingSummary,
  SubscriptionFeature,
  SubscriptionPlan,
  TaxSettings,
} from "./api/subscription";

export const DEFAULT_TAX: TaxSettings = { ratePercent: 18, pricesIncludeTax: true };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "₹99", "₹66.58": paise only when there are any. */
export function formatRupees(amount: number): string {
  const value = round2(amount);
  return `₹${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

/** Yearly vs twelve monthly payments; `saving` null when yearly isn't cheaper. */
export function annualComparison(monthlyPrice: number, yearlyPrice: number): AnnualComparison {
  const twelveMonthly = monthlyPrice * 12;
  const saving = twelveMonthly - yearlyPrice;
  return {
    twelveMonthly,
    monthlyEquivalent: round2(yearlyPrice / 12),
    saving: saving > 0 ? saving : null,
    savingPercent: saving > 0 ? Math.round((saving / twelveMonthly) * 1000) / 10 : null,
  };
}

/** What's charged for a listed price, and the GST inside (or on top of) it. */
export function taxBreakdown(price: number, tax: TaxSettings = DEFAULT_TAX) {
  const rate = (tax.ratePercent || 0) / 100;
  if (tax.pricesIncludeTax !== false) {
    const base = round2(price / (1 + rate));
    return { base, tax: round2(price - base), total: round2(price) };
  }
  const added = round2(price * rate);
  return { base: round2(price), tax: added, total: round2(price + added) };
}

export type Period = "monthly" | "yearly";

/** An add-on's price for the chosen period; monthly when it has no yearly price. */
export function addOnPrice(addOn: PricingAddOn, period: Period): { price: number; billingCycle: BillingCycle } {
  if (period === "yearly" && addOn.yearlyPrice) return { price: addOn.yearlyPrice, billingCycle: "yearly" };
  return { price: addOn.price, billingCycle: addOn.billingCycle };
}

const CYCLE_WORDS: Record<BillingCycle, string> = {
  monthly: "for 30 days",
  yearly: "for 12 months",
  one_time: "once, with no end date",
};

/**
 * The lines shown above "Confirm & pay": what's charged now, for how long,
 * the GST in it, that nothing renews by itself, and for the founding offer
 * the price after the first year. Never promises a reminder or a refund.
 */
export function purchaseDisclosure({
  amount,
  billingCycle,
  tax = DEFAULT_TAX,
  renewalPrice,
  startsAt,
}: {
  amount: number;
  billingCycle: BillingCycle;
  tax?: TaxSettings;
  /** Set for a promo plan: the normal yearly price after the first year. */
  renewalPrice?: number | null;
  /** When the buyer already has this, the new period starts after it ends. */
  startsAt?: string | null;
}): string[] {
  if (amount <= 0) return [];
  const t = taxBreakdown(amount, tax);
  const lines = [`You pay ${formatRupees(t.total)} once now, ${CYCLE_WORDS[billingCycle]}.`];
  if (t.tax > 0) {
    lines.push(
      tax.pricesIncludeTax !== false
        ? `Includes ${tax.ratePercent}% GST (${formatRupees(t.tax)}).`
        : `Plus ${tax.ratePercent}% GST (${formatRupees(t.tax)}).`,
    );
  }
  if (startsAt) lines.push(`Starts when your current access ends.`);
  if (billingCycle !== "one_time") {
    lines.push(
      renewalPrice
        ? `It doesn't renew by itself. After the first year, Premium is ${formatRupees(renewalPrice)}/year if you choose to continue.`
        : "It doesn't renew by itself, so there's nothing to cancel.",
    );
  }
  return lines;
}

const PREMIUM_FAMILY = "premium";

/**
 * A pricing summary from GET /plans and /features, for backends that don't
 * have /pricing yet. Premium = the plans in the "premium" family (or, on a
 * backend without families, any non-promo plan); promo plans are never
 * offered from here, since only /pricing checks eligibility.
 */
export function pricingFromCatalog(plans: SubscriptionPlan[], features: SubscriptionFeature[]): PricingSummary {
  const regular = plans.filter((p) => p.isActive !== false && !p.promo?.kind);
  const premiumPlans = regular.some((p) => p.family === PREMIUM_FAMILY)
    ? regular.filter((p) => p.family === PREMIUM_FAMILY)
    : regular;
  const monthly = premiumPlans.find((p) => p.billingCycle === "monthly") ?? null;
  const yearly = premiumPlans.find((p) => p.billingCycle === "yearly") ?? null;
  const card = (p: SubscriptionPlan) => ({
    planId: p._id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    price: p.price,
    billingCycle: p.billingCycle,
    badge: p.badge,
  });
  const premiumKeys = new Set((monthly ?? yearly)?.features ?? []);
  const nameOf = (key: string) => features.find((f) => f.key === key)?.name ?? key;
  return {
    currency: "INR",
    subscriptionEnabled: true,
    allowFeatureWisePurchase: true,
    tax: DEFAULT_TAX,
    premium: {
      features: [...premiumKeys].map((key) => ({ key, name: nameOf(key) })),
      monthly: monthly ? card(monthly) : null,
      yearly: yearly
        ? { ...card(yearly), comparison: monthly ? annualComparison(monthly.price, yearly.price) : null }
        : null,
      founding: null,
      autoRenews: false,
    },
    addOns: features
      .filter((f) => f.isPremium && f.price > 0)
      .map((f) => ({
        key: f.key,
        name: f.name,
        description: f.description,
        category: f.category,
        price: f.price,
        billingCycle: f.billingCycle,
        yearlyPrice: f.yearlyPrice ?? null,
        includedInPremium: premiumKeys.has(f.key),
      })),
    fairUse: { enabled: false },
  };
}
