import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Modal, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../EmptyState";
import { SkeletonBlock } from "../Skeleton";
import { useTheme } from "../theme";
import { CouponField } from "./CouponField";
import { CYCLE_SUFFIX } from "./billing";
import { LockedFeatureHeading } from "./LockedFeatureHeading";
import { PaymentTrustFooter } from "./PaymentTrustFooter";
import { PurchaseConfirmSheet } from "./PurchaseConfirmSheet";
import { PurchaseResultPanel } from "./PurchaseResultPanel";
import { CashfreeCheckoutModal } from "../CashfreeCheckoutModal";
import { PaymentSheet } from "../PaymentSheet";
import { usePaymentCheckout } from "../../hooks/usePaymentCheckout";
import { getFriendlyErrorMessage, subscriptionApi, type BillingCycle, type CouponPreview, type FeatureLockInfo } from "../../lib/api";
import { AppLockCover } from "../AppLockScreen";
import { Icon } from "../Icon";
import { Button } from "../Button";

// How long to wait for iOS's onDismiss before presenting the next sheet anyway.
const DISMISS_FALLBACK_MS = 700;

type ConfirmTarget = {
  key: string;
  payload: { source: "plan"; planId: string } | { source: "feature"; featureKey: string };
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
  const { colors, fonts } = useTheme();
  const router = useRouter();
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
        <View className="flex-row items-center justify-between px-6 pt-4 pb-2">
          <Text className="text-lg font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
            Unlock Premium
          </Text>
          <TouchableOpacity hitSlop={6} accessibilityRole="button" accessibilityLabel="Close"
            onPress={handleClose}
            activeOpacity={0.7}
            className="h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.surface }}
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
            className="px-6"
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 32 }}
          >
            <View
              className="items-center rounded-3xl px-6 py-8 mt-2"
              style={{ backgroundColor: colors.goldLight ?? colors.surfaceSoft }}
            >
              <LockedFeatureHeading title={info.feature.name} description={info.feature.description} />

              <Button
                label={
                  couponPreview
                    ? couponPreview.free
                      ? "Unlock — free"
                      : `Buy just this — ₹${couponPreview.finalAmount}`
                    : `Buy just this — ₹${info.feature.price}${CYCLE_SUFFIX[info.feature.billingCycle]}`
                }
                onPress={() =>
                  setConfirmTarget({
                    key: "feature",
                    payload: { source: "feature", featureKey },
                    label: info.feature.name,
                    description: info.feature.description,
                    price: info.feature.price,
                    cycleSuffix: CYCLE_SUFFIX[info.feature.billingCycle],
                    billingCycle: info.feature.billingCycle,
                    couponPreview,
                  })
                }
                size="md"
                style={{ marginTop: 20 }}
              />

              <View className="w-full mt-5">
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
            </View>

            {info.plans.length > 0 && (
              <>
                <Text
                  className="mt-8 mb-3 text-xs font-bold uppercase text-center"
                  style={{ color: colors.mutedText, fontFamily: fonts.body, letterSpacing: 0.5 }}
                >
                  Or get more with a plan
                </Text>
                <View style={{ gap: 12 }}>
                  {info.plans.map((plan) => (
                    <View
                      key={plan._id}
                      className="rounded-2xl px-5 py-4 flex-row items-center justify-between"
                      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                    >
                      <View className="flex-1 pr-3">
                        <View className="flex-row items-center" style={{ gap: 8 }}>
                          <Text
                            className="text-sm font-bold"
                            style={{ color: colors.foreground, fontFamily: fonts.heading }}
                          >
                            {plan.name}
                          </Text>
                          {plan.badge ? (
                            <View
                              className="rounded-full px-2 py-0.5"
                              style={{ backgroundColor: colors.primaryLight }}
                            >
                              <Text
                                className="text-xs font-bold"
                                style={{ color: colors.primaryDark, fontFamily: fonts.body }}
                              >
                                {plan.badge}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-xs mt-1" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                          ₹{plan.price}
                          {CYCLE_SUFFIX[plan.billingCycle]}
                        </Text>
                      </View>
                      <Button
                        label="Choose"
                        size="sm"
                        onPress={() =>
                          setConfirmTarget({
                            key: plan._id,
                            payload: { source: "plan", planId: plan._id },
                            label: plan.name,
                            price: plan.price,
                            cycleSuffix: CYCLE_SUFFIX[plan.billingCycle],
                            billingCycle: plan.billingCycle,
                            couponPreview: null,
                            couponNote: couponCode.trim()
                              ? `Coupon "${couponCode.trim().toUpperCase()}" will be validated at checkout.`
                              : undefined,
                          })
                        }
                      />
                    </View>
                  ))}
                </View>
              </>
            )}

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
