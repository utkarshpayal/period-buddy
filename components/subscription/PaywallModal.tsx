import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Modal, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../EmptyState";
import { SkeletonBlock } from "../Skeleton";
import { useTheme } from "../theme";
import { CouponField } from "./CouponField";
import { CYCLE_SUFFIX } from "./billing";
import { PaymentTrustFooter } from "./PaymentTrustFooter";
import { PurchaseConfirmSheet } from "./PurchaseConfirmSheet";
import { PurchaseResultPanel } from "./PurchaseResultPanel";
import { CashfreeCheckoutModal } from "../CashfreeCheckoutModal";
import { PaymentSheet } from "../PaymentSheet";
import { usePaymentCheckout } from "../../hooks/usePaymentCheckout";
import {
  getFriendlyErrorMessage,
  subscriptionApi,
  type BillingCycle,
  type CouponPreview,
  type FeatureLockInfo,
  type PricingSummary,
} from "../../lib/api";
import { formatRupees, type Period } from "../../lib/pricing";
import { GradientCard } from "../GradientCard";
import { SegmentedControl } from "../SegmentedControl";
import { getHeroGradient, getShadow } from "../ui-tokens";
import { AppLockCover } from "../AppLockScreen";
import { Icon } from "../Icon";
import { Button } from "../Button";

// How long to wait for iOS's onDismiss before presenting the next sheet anyway.
const DISMISS_FALLBACK_MS = 700;

type ConfirmTarget = {
  key: string;
  payload: { source: "plan"; planId: string } | { source: "feature"; featureKey: string; billingCycle?: "monthly" | "yearly" };
  label: string;
  description?: string;
  price: number;
  cycleSuffix: string;
  billingCycle: BillingCycle;
  /** Only set for the primary "buy this feature" purchase — the one thing this modal previews a coupon against. */
  couponPreview: CouponPreview | null;
  couponNote?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The feature the user just hit a lock on. */
  featureKey: string;
  /** Pass this when you already have it (e.g. straight from a caught
   * isFeatureLockedError) to skip an extra fetch; otherwise the modal loads
   * it itself from the public /api/subscriptions/plans + /features. */
  lock?: FeatureLockInfo;
  /** Called once a purchase is verified and active — typically to retry the
   * action that was originally blocked and to refresh useSubscriptionAccess. */
  onUnlocked?: () => void;
};

/**
 * The paywall: shows the specific locked feature's standalone price, plus
 * any plan that would also unlock it, so the user can buy either à la
 * carte or as a bundle. Purchase flow: confirm → create a Cashfree order →
 * hosted checkout (or, if the user opts in, native UPI-ID collect) → verify.
 */
export function PaywallModal({ visible, onClose, featureKey, lock, onUnlocked }: Props) {
  const { colors, fonts, isDark } = useTheme();
  const router = useRouter();
  // Premium monthly/yearly and add-on yearly prices (null on older backends:
  // the lock payload's plans are shown instead).
  const [pricing, setPricing] = useState<PricingSummary | null>(null);
  const [period, setPeriod] = useState<Period>("monthly");
  const [showCoupon, setShowCoupon] = useState(false);
  const [info, setInfo] = useState<FeatureLockInfo | null>(lock ?? null);
  const [loadingInfo, setLoadingInfo] = useState(!lock);
  // Bumped by the error state's Retry to re-run the pricing fetch below.
  const [infoReloadKey, setInfoReloadKey] = useState(0);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);

  const {
    purchasingKey,
    checkout,
    checkoutTitle,
    useHostedCheckout,
    setUseHostedCheckout,
    purchaseResult,
    setPurchaseResult,
    startPurchase,
    handleCheckoutResult,
    verifyUpiOnce,
    handleUpiOutcome,
    recheckPending,
  } = usePaymentCheckout();

  // Coupon is previewed against the primary "buy just this feature" item —
  // the modal's clear default action — but the same code still rides along
  // on a plan purchase too (the server recomputes the discount against
  // whatever was actually bought; it just isn't previewed inline per-plan).
  const [couponCode, setCouponCode] = useState("");
  const [couponPreview, setCouponPreview] = useState<CouponPreview | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  // Two native Modals presenting at once is unreliable (iOS/Android both
  // refuse to stack a second one on top cleanly), so the paywall hides
  // itself while the confirm/checkout sheets are up. Those sheets are
  // siblings of the paywall's Modal, not children: a hidden Modal unmounts
  // its children, which would take them down with it. On iOS they also wait
  // until the paywall has finished dismissing (onDismiss).
  const covered = !!checkout || !!confirmTarget;
  const [paywallGone, setPaywallGone] = useState(false);
  useEffect(() => {
    if (!covered) {
      setPaywallGone(false);
      return;
    }
    if (Platform.OS !== "ios") {
      setPaywallGone(true);
      return;
    }
    const fallback = setTimeout(() => setPaywallGone(true), DISMISS_FALLBACK_MS);
    return () => clearTimeout(fallback);
  }, [covered]);
  const sheetsReady = visible && paywallGone;

  useEffect(() => {
    if (!visible) return;
    let live = true;
    subscriptionApi
      .getPricing()
      .then((p) => live && setPricing(p))
      .catch(() => live && setPricing(null));
    return () => {
      live = false;
    };
  }, [visible]);

  useEffect(() => {
    if (lock) {
      setInfo(lock);
      setLoadingInfo(false);
      return;
    }
    if (!visible) return;
    let isMounted = true;
    setLoadingInfo(true);
    (async () => {
      try {
        const [features, plans] = await Promise.all([
          subscriptionApi.getFeatures(),
          subscriptionApi.getPlans(),
        ]);
        const feature = features.find((f) => f.key === featureKey);
        if (!isMounted) return;
        setInfo({
          feature: feature
            ? {
                key: feature.key,
                name: feature.name,
                description: feature.description,
                price: feature.price,
                billingCycle: feature.billingCycle,
              }
            : { key: featureKey, name: featureKey, price: 0, billingCycle: "monthly" },
          // Promo plans (the founding offer) are only offered on My
          // Subscription, where eligibility is checked.
          plans: plans
            .filter((p) => p.features.includes(featureKey) && !p.promo?.kind)
            .map((p) => ({
              _id: p._id,
              name: p.name,
              slug: p.slug,
              price: p.price,
              billingCycle: p.billingCycle,
              badge: p.badge,
            })),
        });
      } catch {
        if (isMounted) setInfo(null);
      } finally {
        if (isMounted) setLoadingInfo(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [visible, featureKey, lock, infoReloadKey]);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setApplyingCoupon(true);
    setCouponError(null);
    try {
      const preview = await subscriptionApi.applyCoupon({
        code: couponCode.trim(),
        source: "feature",
        featureKey,
        ...(featureOffer?.billingCycle === "yearly" ? { billingCycle: "yearly" as const } : {}),
      });
      setCouponPreview(preview);
    } catch (err) {
      setCouponPreview(null);
      setCouponError(getFriendlyErrorMessage(err));
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponCode("");
    setCouponPreview(null);
    setCouponError(null);
  };

  async function handleConfirmPurchase() {
    if (!confirmTarget) return;
    await startPurchase(confirmTarget.key, confirmTarget.payload, {
      couponCode: confirmTarget.couponPreview ? couponCode.trim() : undefined,
      title: confirmTarget.label,
    });
    setConfirmTarget(null);
  }

  function handleResultDone() {
    setPurchaseResult(null);
    onUnlocked?.();
    onClose();
  }

  function handleClose() {
    if (purchaseResult?.type === "success") onUnlocked?.();
    setPurchaseResult(null);
    onClose();
  }

  // Premium for the chosen period: from /pricing, else the lock payload's plans.
  const premiumMonthly = pricing?.premium.monthly ?? null;
  const premiumYearly = pricing?.premium.yearly ?? null;
  const fallbackPlan = info?.plans.find((p) => p.billingCycle === (period === "yearly" ? "yearly" : "monthly")) ?? info?.plans[0];
  const premiumOffer =
    (period === "yearly" ? premiumYearly ?? premiumMonthly : premiumMonthly ?? premiumYearly) ??
    (fallbackPlan ? { planId: fallbackPlan._id, name: fallbackPlan.name, price: fallbackPlan.price, billingCycle: fallbackPlan.billingCycle } : null);
  const showPeriodSwitch = Boolean(premiumMonthly && premiumYearly);
  const premiumFeatures = pricing?.premium.features ?? [];
  const comparison = premiumYearly?.comparison ?? null;

  // This feature on its own, for the chosen period when it's sold yearly.
  const addOn = pricing?.addOns.find((a) => a.key === featureKey);
  const featureOffer = info
    ? period === "yearly" && addOn?.yearlyPrice
      ? { price: addOn.yearlyPrice, billingCycle: "yearly" as BillingCycle }
      : { price: info.feature.price, billingCycle: info.feature.billingCycle }
    : null;
  const periodWords = (cycle: BillingCycle) => (cycle === "yearly" ? "for 12 months" : cycle === "monthly" ? "for 30 days" : "one-time");
  const taxLine = pricing?.tax
    ? pricing.tax.pricesIncludeTax
      ? `Prices include ${pricing.tax.ratePercent}% GST.`
      : `Plus ${pricing.tax.ratePercent}% GST at checkout.`
    : "Prices include GST.";
  const card = { backgroundColor: colors.surface, borderRadius: 24, borderCurve: "continuous" as const, ...getShadow(colors, isDark) };

  return (
    <>
    <Modal
      visible={visible && !covered}
      animationType="slide"
      onRequestClose={handleClose}
      onDismiss={() => {
        if (covered) setPaywallGone(true);
      }}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View className="flex-row items-center justify-end px-5 pt-3 pb-1">
          <TouchableOpacity hitSlop={6} accessibilityRole="button" accessibilityLabel="Close"
            onPress={handleClose}
            activeOpacity={0.7}
            className="h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
          >
            <Icon set="mci" name="close" size={18} color={colors.mutedText} />
          </TouchableOpacity>
        </View>

        {purchaseResult ? (
          <PurchaseResultPanel
            result={purchaseResult}
            itemLabel={info?.feature.name}
            onDone={handleResultDone}
            onDismissFailure={() => setPurchaseResult(null)}
            onRecheckPending={recheckPending}
            onViewHistory={() => {
              handleResultDone();
              router.push("/subscription");
            }}
          />
        ) : loadingInfo ? (
          <View className="px-6 gap-4 mt-2">
            <SkeletonBlock width="100%" height={180} radius={24} />
            <SkeletonBlock width="100%" height={56} radius={16} />
            <SkeletonBlock width="100%" height={72} radius={16} />
            <SkeletonBlock width="100%" height={72} radius={16} />
          </View>
        ) : !info ? (
          // The pricing fetch failed — previously this fell through to the
          // loading spinner forever, with no way out but closing the sheet.
          <EmptyState
            icon="wifi-off"
            title="Couldn't load pricing"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => setInfoReloadKey((k) => k + 1)}
          />
        ) : (
          <ScrollView
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 36 }}
          >
            {/* What's locked */}
            <GradientCard colors={getHeroGradient(colors, isDark)} style={{ padding: 22 }} containerStyle={{ marginBottom: 18 }}>
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.2)" }}>
                  <Icon set="mci" name="crown-outline" size={22} color="#FFFFFF" />
                </View>
                <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", fontFamily: fonts.body }}>
                  Nura Premium
                </Text>
              </View>
              <Text maxFontSizeMultiplier={1.3} style={{ color: "#FFFFFF", fontSize: 25, lineHeight: 31, fontWeight: "800", letterSpacing: -0.5, marginTop: 14, fontFamily: fonts.heading }}>
                {`Unlock ${info.feature.name}`}
              </Text>
              {info.feature.description ? (
                <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: 14, lineHeight: 20, marginTop: 6, fontFamily: fonts.body }}>
                  {info.feature.description}
                </Text>
              ) : null}
              <View className="flex-row flex-wrap" style={{ gap: 8, marginTop: 16 }}>
                {["Paid ahead", "No auto-renewal", "Tracking stays free"].map((chip) => (
                  <View key={chip} className="flex-row items-center" style={{ gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.16)" }}>
                    <Icon set="ion" name="checkmark" size={13} color="#FFFFFF" />
                    <Text style={{ color: "#FFFFFF", fontSize: 12.5, fontWeight: "700", fontFamily: fonts.body }}>{chip}</Text>
                  </View>
                ))}
              </View>
            </GradientCard>

            {/* Premium: the recommended option */}
            {premiumOffer ? (
              <View style={{ ...card, padding: 18, borderWidth: 2, borderColor: colors.primary, marginTop: 6 }}>
                <View style={{ position: "absolute", top: -12, left: 18, paddingHorizontal: 10, height: 24, borderRadius: 12, justifyContent: "center", backgroundColor: colors.primary }}>
                  <Text style={{ color: colors.buttonText, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase", fontFamily: fonts.body }}>Best value</Text>
                </View>
                <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "800", marginTop: 6, fontFamily: fonts.heading }}>Nura Premium</Text>
                <Text style={{ color: colors.mutedText, fontSize: 13.5, marginTop: 2, fontFamily: fonts.body }}>
                  {premiumFeatures.length ? `All ${premiumFeatures.length} Premium features, one price` : "Every Premium feature, one price"}
                </Text>

                {showPeriodSwitch && premiumMonthly && premiumYearly ? (
                  <SegmentedControl<Period>
                    segments={[
                      { key: "monthly", label: "Monthly", accessibilityLabel: `Monthly, ${formatRupees(premiumMonthly.price)} for 30 days` },
                      { key: "yearly", label: comparison?.saving ? `Yearly · save ${formatRupees(comparison.saving)}` : "Yearly", accessibilityLabel: `Yearly, ${formatRupees(premiumYearly.price)} for 12 months` },
                    ]}
                    value={period}
                    onChange={setPeriod}
                    style={{ marginTop: 14 }}
                  />
                ) : null}

                <View className="flex-row items-end flex-wrap" style={{ gap: 8, marginTop: 14 }}>
                  <Text style={{ color: colors.foreground, fontSize: 34, lineHeight: 38, fontFamily: fonts.monoSemiBold }}>{formatRupees(premiumOffer.price)}</Text>
                  <Text style={{ color: colors.mutedText, fontSize: 14, marginBottom: 5, fontFamily: fonts.body }}>{periodWords(premiumOffer.billingCycle)}</Text>
                </View>
                {premiumOffer.billingCycle === "yearly" && comparison ? (
                  <Text style={{ color: colors.success, fontSize: 13.5, fontWeight: "700", marginTop: 2, fontFamily: fonts.body }}>
                    {`About ${formatRupees(comparison.monthlyEquivalent)} a month, paid once`}
                  </Text>
                ) : null}

                {premiumFeatures.length ? (
                  <View style={{ marginTop: 14, gap: 4 }}>
                    {premiumFeatures.map((f) => {
                      const current = f.key === featureKey;
                      return (
                        <View
                          key={f.key}
                          className="flex-row items-center"
                          style={{ gap: 10, paddingVertical: 6, paddingHorizontal: current ? 10 : 0, marginHorizontal: current ? -10 : 0, borderRadius: 12, backgroundColor: current ? colors.primaryLight : "transparent" }}
                        >
                          <Icon set="ion" name="checkmark-circle" size={18} color={colors.success} />
                          <Text numberOfLines={2} style={{ flex: 1, color: colors.foreground, fontSize: 14, fontWeight: current ? "700" : "400", fontFamily: fonts.body }}>{f.name}</Text>
                          {current ? <Text style={{ color: colors.primaryDark, fontSize: 12, fontWeight: "800", fontFamily: fonts.body }}>Unlocks this</Text> : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                <Button
                  label={`Get Premium · ${formatRupees(premiumOffer.price)}`}
                  fullWidth
                  style={{ marginTop: 16 }}
                  onPress={() =>
                    setConfirmTarget({
                      key: premiumOffer.planId,
                      payload: { source: "plan", planId: premiumOffer.planId },
                      label: premiumOffer.name,
                      price: premiumOffer.price,
                      cycleSuffix: CYCLE_SUFFIX[premiumOffer.billingCycle],
                      billingCycle: premiumOffer.billingCycle,
                      couponPreview: null,
                      couponNote: couponCode.trim() ? `Coupon "${couponCode.trim().toUpperCase()}" will be checked at checkout.` : undefined,
                    })
                  }
                />
              </View>
            ) : null}

            {/* Just this feature */}
            {featureOffer && featureOffer.price > 0 ? (
              <>
                {premiumOffer ? (
                  <View className="flex-row items-center" style={{ gap: 12, marginVertical: 18 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                    <Text style={{ color: colors.mutedText, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>or</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                  </View>
                ) : null}
                <View style={{ ...card, padding: 16 }}>
                  <View className="flex-row items-center" style={{ gap: 12 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 14, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.goldLight }}>
                      <Icon set="mci" name="lock-open-variant-outline" size={20} color={colors.gold} />
                    </View>
                    <View className="flex-1" style={{ minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", fontFamily: fonts.heading }}>Just this feature</Text>
                      <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 13, marginTop: 1, fontFamily: fonts.body }}>{info.feature.name}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: colors.foreground, fontSize: 17, fontFamily: fonts.monoSemiBold }}>
                        {couponPreview && !couponPreview.free ? formatRupees(couponPreview.finalAmount) : couponPreview?.free ? "₹0" : formatRupees(featureOffer.price)}
                      </Text>
                      <Text style={{ color: colors.mutedText, fontSize: 12.5, fontFamily: fonts.body }}>{periodWords(featureOffer.billingCycle)}</Text>
                    </View>
                  </View>
                  <Button
                    label={couponPreview?.free ? "Unlock for free" : "Buy just this"}
                    variant={premiumOffer ? "tonal" : "primary"}
                    fullWidth
                    style={{ marginTop: 14 }}
                    onPress={() =>
                      setConfirmTarget({
                        key: "feature",
                        payload: { source: "feature", featureKey, ...(featureOffer.billingCycle === "yearly" ? { billingCycle: "yearly" as const } : {}) },
                        label: info.feature.name,
                        description: info.feature.description,
                        price: featureOffer.price,
                        cycleSuffix: CYCLE_SUFFIX[featureOffer.billingCycle],
                        billingCycle: featureOffer.billingCycle,
                        couponPreview,
                      })
                    }
                  />
                </View>
              </>
            ) : null}

            {/* Coupon, out of the way until asked for */}
            {showCoupon || couponPreview ? (
              <View style={{ marginTop: 14 }}>
                <CouponField
                  code={couponCode}
                  onChangeCode={(v) => {
                    setCouponCode(v);
                    if (couponError) setCouponError(null);
                  }}
                  onApply={handleApplyCoupon}
                  applying={applyingCoupon}
                  preview={couponPreview}
                  error={couponError}
                  onRemove={handleRemoveCoupon}
                />
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setShowCoupon(true)}
                accessibilityRole="button"
                hitSlop={{ top: 12, bottom: 12 }}
                style={{ alignSelf: "center", marginTop: 16 }}
              >
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "700", fontFamily: fonts.body }}>Have a coupon?</Text>
              </TouchableOpacity>
            )}

            <Text style={{ color: colors.mutedText, fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: 18, fontFamily: fonts.body }}>
              {`${taxLine} Nothing renews by itself. Doctor consultations are paid separately.`}
            </Text>
            <PaymentTrustFooter />
          </ScrollView>
        )}
      </SafeAreaView>
      <AppLockCover />
    </Modal>

      <PurchaseConfirmSheet
        // Don't rely on handleConfirmPurchase's setConfirmTarget(null) alone
        // to prevent a stacked-Modal frame — hide the instant checkout/
        // purchaseResult exists too, regardless of render-batching timing.
        visible={sheetsReady && confirmTarget !== null && !checkout && !purchaseResult}
        itemName={confirmTarget?.label ?? ""}
        itemDescription={confirmTarget?.description}
        originalAmount={confirmTarget?.price ?? 0}
        cycleSuffix={confirmTarget?.cycleSuffix ?? ""}
        billingCycle={confirmTarget?.billingCycle}
        couponPreview={confirmTarget?.couponPreview ?? null}
        couponNote={confirmTarget?.couponNote}
        confirming={confirmTarget !== null && purchasingKey === confirmTarget.key}
        onConfirm={handleConfirmPurchase}
        onClose={() => setConfirmTarget(null)}
      />

      {/* checkout is only ever set from the non-free branch of startPurchase,
          which never reaches setCheckout without a real Cashfree order — so
          orderId/paymentSessionId (optional on SubscriptionOrder because a
          free order has neither) are always present here. PaymentSheet
          (UPI apps, UPI ID) is the default; its "Card, netbanking or wallet"
          option switches to Cashfree's hosted checkout. */}
      {sheetsReady && checkout && checkout.orderId && checkout.paymentSessionId && !useHostedCheckout && (
        <PaymentSheet
          visible
          mode={checkout.cashfreeMode ?? "production"}
          paymentSessionId={checkout.paymentSessionId}
          amount={checkout.amount}
          title={checkoutTitle}
          onVerify={() => verifyUpiOnce(checkout.orderId!)}
          onOutcome={handleUpiOutcome}
          onUseOtherMethod={() => setUseHostedCheckout(true)}
        />
      )}
      {sheetsReady && checkout && checkout.orderId && checkout.paymentSessionId && useHostedCheckout && (
        <CashfreeCheckoutModal
          visible
          mode={checkout.cashfreeMode ?? "production"}
          orderId={checkout.orderId}
          paymentSessionId={checkout.paymentSessionId}
          onResult={handleCheckoutResult}
        />
      )}
    </>
  );
}
