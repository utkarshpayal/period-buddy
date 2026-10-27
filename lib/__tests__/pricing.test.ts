import assert from "node:assert/strict";
import { test } from "node:test";
import type { SubscriptionFeature, SubscriptionPlan } from "../api/subscription";
import { addOnPrice, aiMessagesLeft, annualComparison, formatRupees, pricingFromCatalog, purchaseDisclosure, taxBreakdown, usageLines } from "../pricing";

test("yearly Premium: ₹799 vs 12 × ₹99 saves ₹389 (32.7%), about ₹66.58 a month", () => {
  assert.deepEqual(annualComparison(99, 799), { twelveMonthly: 1188, monthlyEquivalent: 66.58, saving: 389, savingPercent: 32.7 });
  assert.equal(annualComparison(10, 130).saving, null);
});

test("rupees show paise only when there are any", () => {
  assert.equal(formatRupees(99), "₹99");
  assert.equal(formatRupees(66.583), "₹66.58");
  assert.equal(formatRupees(15.1), "₹15.10");
});

test("GST is inside the price by default and added on top when set so", () => {
  assert.deepEqual(taxBreakdown(99), { base: 83.9, tax: 15.1, total: 99 });
  assert.equal(taxBreakdown(99, { ratePercent: 18, pricesIncludeTax: false }).total, 116.82);
});

test("disclosure says what's paid, for how long, the GST, and that nothing renews", () => {
  assert.deepEqual(purchaseDisclosure({ amount: 799, billingCycle: "yearly" }), [
    "You pay ₹799 once now, for 12 months.",
    "Includes 18% GST (₹121.88).",
    "It doesn't renew by itself, so there's nothing to cancel.",
  ]);
  const founding = purchaseDisclosure({ amount: 499, billingCycle: "yearly", renewalPrice: 799 });
  assert.match(founding.at(-1) ?? "", /After the first year, Premium is ₹799\/year if you choose to continue/);
  assert.ok(purchaseDisclosure({ amount: 99, billingCycle: "monthly", startsAt: "2026-11-20" }).includes("Starts when your current access ends."));
  assert.deepEqual(purchaseDisclosure({ amount: 0, billingCycle: "monthly" }), []);
  for (const line of purchaseDisclosure({ amount: 99, billingCycle: "monthly" })) {
    assert.doesNotMatch(line, /remind|refund|unlimited/i);
  }
});

test("an add-on falls back to monthly when it has no yearly price", () => {
  const addOn = { key: "x", name: "X", category: "c", price: 29, billingCycle: "monthly" as const, yearlyPrice: 290, includedInPremium: true };
  assert.deepEqual(addOnPrice(addOn, "yearly"), { price: 290, billingCycle: "yearly" });
  assert.deepEqual(addOnPrice({ ...addOn, yearlyPrice: null }, "yearly"), { price: 29, billingCycle: "monthly" });
  assert.deepEqual(addOnPrice(addOn, "monthly"), { price: 29, billingCycle: "monthly" });
});

test("summary from an old backend: Premium plans, add-ons, never a promo plan", () => {
  const plan = (over: Partial<SubscriptionPlan>): SubscriptionPlan => ({
    _id: over.slug ?? "p",
    name: "Nura Premium",
    slug: "p",
    price: 99,
    billingCycle: "monthly",
    features: ["ai_assistant"],
    isDefault: false,
    isActive: true,
    family: "premium",
    ...over,
  });
  const feature = (over: Partial<SubscriptionFeature>): SubscriptionFeature => ({
    _id: over.key ?? "f",
    key: "f",
    name: "F",
    category: "AI",
    isPremium: true,
    price: 29,
    billingCycle: "monthly",
    isActive: true,
    sortOrder: 0,
    ...over,
  });
  const summary = pricingFromCatalog(
    [
      plan({ slug: "premium-monthly" }),
      plan({ slug: "premium-yearly", price: 799, billingCycle: "yearly" }),
      plan({ slug: "premium-founding", price: 499, billingCycle: "yearly", promo: { kind: "founding" } }),
    ],
    [feature({ key: "ai_assistant", name: "Saved AI chats", yearlyPrice: 290 }), feature({ key: "free_thing", isPremium: false })],
  );
  assert.equal(summary.premium.monthly?.price, 99);
  assert.equal(summary.premium.yearly?.price, 799);
  assert.equal(summary.premium.yearly?.comparison?.saving, 389);
  assert.equal(summary.premium.founding, null);
  assert.deepEqual(summary.premium.features, [{ key: "ai_assistant", name: "Saved AI chats" }]);
  assert.deepEqual(summary.addOns.map((a) => [a.key, a.includedInPremium, a.yearlyPrice]), [["ai_assistant", true, 290]]);
});

test("usage lines show what's used of each allowance, only while fair use is on", () => {
  const usage = {
    tier: "free" as const,
    fairUseEnabled: true,
    items: [
      { key: "ai_message" as const, period: "day" as const, used: 17, limit: 20, remaining: 3, resetsAt: "2026-10-24T18:30:00.000Z" },
      { key: "document_upload" as const, period: "month" as const, used: 0, limit: 2, remaining: 2, resetsAt: "2026-10-31T18:30:00.000Z" },
      { key: "doctor_report" as const, period: "month" as const, used: 1, limit: null, remaining: null, resetsAt: "2026-10-31T18:30:00.000Z" },
    ],
  };
  const lines = usageLines(usage);
  assert.deepEqual(lines.map((l) => [l.key, l.text, l.low]), [
    ["ai_message", "17 of 20 used today", true],
    ["document_upload", "0 of 2 used this month", false],
  ]);
  assert.deepEqual(usageLines({ ...usage, fairUseEnabled: false }), []);
  assert.deepEqual(usageLines(undefined), []);
});

test("Nura AI's line counts down and says urgent questions still work at zero", () => {
  const base = { tier: "free" as const, fairUseEnabled: true };
  const at = (used: number) => ({ ...base, items: [{ key: "ai_message" as const, period: "day" as const, used, limit: 20, remaining: 20 - used, resetsAt: "x" }] });
  assert.deepEqual(aiMessagesLeft(at(3)), { text: "17 of 20 Nura AI messages left today", low: false, none: false });
  assert.equal(aiMessagesLeft(at(18))?.low, true);
  assert.match(aiMessagesLeft(at(20))?.text ?? "", /used all 20 .* Urgent questions still get an answer/);
  assert.equal(aiMessagesLeft({ ...base, fairUseEnabled: false, items: [] }), null);
});
