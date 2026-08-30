import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { CouponField } from "./CouponField";
import { RazorpayCheckoutModal, type RazorpayResult } from "../RazorpayCheckoutModal";
import { showAlert } from "../../lib/modal-host";
import {
  getFriendlyErrorMessage,
  subscriptionApi,
  type BillingCycle,
  type CouponPreview,
  type FeatureLockInfo,
  type SubscriptionOrder,
} from "../../lib/api";

const CYCLE_SUFFIX: Record<BillingCycle, string> = {
  monthly: "/mo",
  yearly: "/yr",
  one_time: " once",
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
 * carte or as a bundle. Purchase flow mirrors the doctor-consultation
 * booking screen exactly: create a Razorpay order, run
 * RazorpayCheckoutModal's hosted checkout, then verify the signature.
 */
export function PaywallModal({ visible, onClose, featureKey, lock, onUnlocked }: Props) {
  const { colors, fonts } = useTheme();
  const [info, setInfo] = useState<FeatureLockInfo | null>(lock ?? null);
  const [loadingInfo, setLoadingInfo] = useState(!lock);
  const [purchasingKey, setPurchasingKey] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<SubscriptionOrder | null>(null);

  // Coupon is previewed against the primary "buy just this feature" item —
  // the modal's clear default action — but the same code still rides along
  // on a plan purchase too (the server recomputes the discount against
  // whatever was actually bought; it just isn't previewed inline per-plan).
  const [couponCode, setCouponCode] = useState("");
  const [couponPreview, setCouponPreview] = useState<CouponPreview | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);

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
          plans: plans
            .filter((p) => p.features.includes(featureKey))
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
  }, [visible, featureKey, lock]);

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

  // Unlocked instantly by a 100%-off coupon — no Razorpay order exists to
  // check out with, so this skips straight to the same "purchase complete"
  // handling handleCheckoutResult does after a real payment.
  const finishFreeUnlock = () => {
    showAlert("Unlocked!", "Your coupon covered the full price — no payment needed.", undefined, {
      icon: "checkmark-circle",
    });
    onUnlocked?.();
    onClose();
  };

  const startPurchase = async (
    key: string,
    payload: { source: "plan"; planId: string } | { source: "feature"; featureKey: string },
  ) => {
    setPurchasingKey(key);
    try {
      const order = await subscriptionApi.createOrder({
        ...payload,
        couponCode: couponPreview ? couponCode.trim() : undefined,
      });
      if (order.free) {
        finishFreeUnlock();
        return;
      }
      setCheckout(order);
    } catch (err) {
      showAlert("Couldn't start checkout", getFriendlyErrorMessage(err));
    } finally {
      setPurchasingKey(null);
    }
  };

  const handleCheckoutResult = async (result: RazorpayResult) => {
    const order = checkout;
    setCheckout(null);
    if (!order) return;

    if (result.type === "dismiss") return;
    if (result.type === "failed") {
      showAlert("Payment failed", "The payment didn't go through. You haven't been charged.");
      return;
    }

    try {
      await subscriptionApi.verifyPayment({
        entitlementId: order.entitlementId,
        razorpay_order_id: result.razorpay_order_id,
        razorpay_payment_id: result.razorpay_payment_id,
        razorpay_signature: result.razorpay_signature,
      });
      showAlert("Unlocked!", "Your purchase is active.", undefined, { icon: "checkmark-circle" });
      onUnlocked?.();
      onClose();
    } catch (err) {
      showAlert("Couldn't confirm payment", getFriendlyErrorMessage(err));
    }
  };

  return (
    <Modal
      // Two native Modals presenting at once is unreliable (iOS/Android both
      // refuse to stack a second one on top cleanly) — hide this one the
      // instant a Razorpay order exists so RazorpayCheckoutModal's own
      // Modal is the only one on screen, instead of the checkout sheet
      // silently failing to appear behind this pageSheet.
      visible={visible && !checkout}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View className="flex-row items-center justify-between px-6 pt-4 pb-2">
          <Text className="text-lg font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
            Unlock Premium
          </Text>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            className="h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.surface }}
          >
            <MaterialCommunityIcons name="close" size={18} color={colors.mutedText} />
          </TouchableOpacity>
        </View>

        {loadingInfo || !info ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ScrollView className="px-6" contentContainerStyle={{ paddingBottom: 32 }}>
            <View
              className="items-center rounded-3xl px-6 py-8 mt-2"
              style={{ backgroundColor: colors.goldLight ?? colors.surfaceSoft }}
            >
              <View
                className="h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.gold ?? colors.primary }}
              >
                <MaterialCommunityIcons name="lock-outline" size={26} color={colors.buttonText} />
              </View>
              <Text
                className="mt-4 text-base font-bold text-center"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                {info.feature.name}
              </Text>
              {info.feature.description ? (
                <Text
                  className="mt-1.5 text-xs text-center leading-5"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  {info.feature.description}
                </Text>
              ) : null}

              <TouchableOpacity
                onPress={() => startPurchase("feature", { source: "feature", featureKey })}
                activeOpacity={0.85}
                disabled={purchasingKey !== null}
                className="mt-5 flex-row items-center rounded-full px-6 py-3"
                style={{ backgroundColor: colors.gold ?? colors.primary }}
              >
                {purchasingKey === "feature" ? (
                  <ActivityIndicator color={colors.buttonText} />
                ) : couponPreview ? (
                  <Text className="text-sm font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                    {couponPreview.free ? "Unlock — Free" : `Buy just this — ₹${couponPreview.finalAmount}`}
                  </Text>
                ) : (
                  <Text className="text-sm font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                    Buy just this — ₹{info.feature.price}
                    {CYCLE_SUFFIX[info.feature.billingCycle]}
                  </Text>
                )}
              </TouchableOpacity>

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
                                className="text-[10px] font-bold"
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
                      <TouchableOpacity
                        onPress={() => startPurchase(plan._id, { source: "plan", planId: plan._id })}
                        activeOpacity={0.85}
                        disabled={purchasingKey !== null}
                        className="rounded-full px-4 py-2.5"
                        style={{ backgroundColor: colors.primary }}
                      >
                        {purchasingKey === plan._id ? (
                          <ActivityIndicator color={colors.buttonText} size="small" />
                        ) : (
                          <Text
                            className="text-xs font-bold"
                            style={{ color: colors.buttonText, fontFamily: fonts.body }}
                          >
                            Choose
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      {/* checkout is only ever set from the non-free branch of startPurchase,
          which never reaches setCheckout without a real Razorpay order — so
          keyId/orderId (optional on SubscriptionOrder because a free order
          has neither) are always present here. */}
      {checkout && checkout.orderId && checkout.keyId && (
        <RazorpayCheckoutModal
          visible
          keyId={checkout.keyId}
          orderId={checkout.orderId}
          amount={checkout.amount}
          currency={checkout.currency}
          name="Nura Premium"
          description={info?.feature.name ?? "Premium access"}
          onResult={handleCheckoutResult}
        />
      )}
    </Modal>
  );
}
