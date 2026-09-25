import { Feather, Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/ScreenHeader";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { SkeletonBlock, SkeletonCard } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { useTheme } from "../../components/theme";
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import { CashfreeCheckoutModal } from "../../components/CashfreeCheckoutModal";
import { CashfreeUpiCollectModal } from "../../components/CashfreeUpiCollectModal";
import { PaymentTrustFooter } from "../../components/subscription/PaymentTrustFooter";
import { PurchaseConfirmSheet } from "../../components/subscription/PurchaseConfirmSheet";
import { PurchaseResultPanel } from "../../components/subscription/PurchaseResultPanel";
import { usePaymentCheckout } from "../../hooks/usePaymentCheckout";
import { useDataRefresh } from "../../hooks/useDataRefresh";
import { formatShortDate } from "../../lib/format";
import {
  getFriendlyErrorMessage,
  subscriptionApi,
  type BillingCycle,
  type CouponPreview,
  type Entitlement,
  type MySubscription,
  type SubscriptionFeature,
  type SubscriptionPlan,
} from "../../lib/api";

const CYCLE_SUFFIX: Record<BillingCycle, string> = {
  monthly: "/mo",
  yearly: "/yr",
  one_time: " once",
};

type ConfirmTarget = {
  key: string;
  payload: { source: "plan"; planId: string } | { source: "feature"; featureKey: string };
  label: string;
  description?: string;
  price: number;
  cycleSuffix: string;
};

/**
 * Profile → My Subscription. Shows what's currently active, and a full
 * pricing grid (plans + individual features) to browse/upgrade any time —
 * not just when a screen hits a lock (see components/subscription/
 * PaywallModal.tsx for that flow). Purchase mechanics are identical to it,
 * sharing hooks/usePaymentCheckout.ts's state machine.
 */
export default function SubscriptionScreen() {
  const { colors, isDark, fonts } = useTheme();
  const softTints = getSoftTints(colors);

  const [me, setMe] = useState<MySubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [features, setFeatures] = useState<SubscriptionFeature[]>([]);
  const [history, setHistory] = useState<Entitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [couponCode, setCouponCode] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [couponPreview, setCouponPreview] = useState<CouponPreview | null>(null);
  const [couponPreviewError, setCouponPreviewError] = useState<string | null>(null);
  const [previewingCoupon, setPreviewingCoupon] = useState(false);

  const {
    purchasingKey,
    checkout,
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

  const load = useCallback(async () => {
    setError(null);
    try {
      const [meResult, plansResult, featuresResult, historyResult] = await Promise.all([
        subscriptionApi.getMe(),
        subscriptionApi.getPlans(),
        subscriptionApi.getFeatures(),
        subscriptionApi.getHistory(),
      ]);
      setMe(meResult);
      setPlans(plansResult);
      setFeatures(featuresResult);
      setHistory(historyResult);
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Purchases made elsewhere (a PaywallModal) update plans/history here too.
  // Quiet: a failure keeps the current page instead of an error state.
  useDataRefresh(["subscription"], async () => {
    const [meResult, plansResult, featuresResult, historyResult] = await Promise.all([
      subscriptionApi.getMe(),
      subscriptionApi.getPlans(),
      subscriptionApi.getFeatures(),
      subscriptionApi.getHistory(),
    ]);
    setMe(meResult);
    setPlans(plansResult);
    setFeatures(featuresResult);
    setHistory(historyResult);
    setError(null);
  });

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  const isUnlocked = (key: string) =>
    !me || !me.subscriptionEnabled || me.unlockedFeatureKeys === "ALL" || me.unlockedFeatureKeys.includes(key);

  // Opening the confirm sheet previews the coupon (if one was typed) against
  // this specific item — the same preview-then-apply flow PaywallModal uses,
  // instead of blindly carrying an unvalidated code into checkout (fixes.md 6.3).
  async function openConfirm(target: ConfirmTarget) {
    setConfirmTarget(target);
    setCouponPreview(null);
    setCouponPreviewError(null);
    const code = couponCode.trim();
    if (!code) return;
    setPreviewingCoupon(true);
    try {
      const preview = await subscriptionApi.applyCoupon({ code, ...target.payload });
      setCouponPreview(preview);
    } catch (err) {
      setCouponPreviewError(getFriendlyErrorMessage(err));
    } finally {
      setPreviewingCoupon(false);
    }
  }

  async function handleConfirmPurchase(preferUpiCollect: boolean) {
    if (!confirmTarget) return;
    const outcome = await startPurchase(confirmTarget.key, confirmTarget.payload, {
      couponCode: couponPreview ? couponCode.trim() : undefined,
      preferUpiCollect,
    });
    setConfirmTarget(null);
    if (outcome?.free) {
      setCouponCode("");
      load();
    }
  }

  function handleResultDone() {
    setPurchaseResult(null);
    load();
  }

  const entitlementLabel = (e: Entitlement) => {
    if (e.source === "plan") return typeof e.plan === "object" && e.plan ? e.plan.name : "Plan";
    const feature = features.find((f) => f.key === e.featureKey);
    return feature?.name ?? e.featureKey ?? "Feature";
  };

  const activeEntitlements = (me?.entitlements ?? []).filter((e) => e.status === "active");

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="My Subscription" />

        <LoadingErrorState
          loading={loading}
          error={error}
          onRetry={load}
          loadingLabel="Loading your subscription…"
          skeleton={
            <View className="gap-4 px-6 pt-6">
              <SkeletonBlock width={60} height={12} />
              <SkeletonBlock width="100%" height={64} radius={16} />
              <SkeletonBlock width={90} height={12} style={{ marginTop: 8 }} />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          }
        >
          {purchaseResult ? (
            <PurchaseResultPanel
              result={purchaseResult}
              onDone={handleResultDone}
              onDismissFailure={() => setPurchaseResult(null)}
              onRecheckPending={recheckPending}
            />
          ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 48 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          >
            {me && !me.subscriptionEnabled ? (
              <View
                className="mx-6 mt-4 rounded-2xl px-4 py-3 flex-row items-center"
                style={{ backgroundColor: softTints.emerald }}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
                <Text
                  className="ml-2 flex-1 text-xs font-semibold"
                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                >
                  Everything is free right now — premium pricing isn&apos;t active.
                </Text>
              </View>
            ) : null}

            <Text
              className="mx-6 mt-6 mb-2 text-xs font-bold uppercase"
              style={{ color: colors.mutedText, fontFamily: fonts.body, letterSpacing: 0.5 }}
            >
              Active
            </Text>
            {activeEntitlements.length === 0 ? (
              <View className="mx-6">
                <EmptyState
                  icon="star-outline"
                  title="Nothing active yet"
                  message="Unlock a feature below, or bundle several into a plan."
                  compact
                />
              </View>
            ) : (
              <View className="mx-6" style={{ gap: 10 }}>
                {activeEntitlements.map((e) => (
                  <View
                    key={e._id}
                    className="rounded-2xl px-4 py-3 flex-row items-center justify-between"
                    style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    <View className="flex-1 pr-3">
                      <Text className="text-sm font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                        {entitlementLabel(e)}
                      </Text>
                      <Text className="text-xs mt-0.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                        {e.expiresAt ? `Renews/expires ${formatShortDate(e.expiresAt)}` : "Never expires"}
                      </Text>
                    </View>
                    <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: softTints.emerald }}>
                      <Text className="text-[10px] font-bold" style={{ color: colors.success, fontFamily: fonts.body }}>
                        Active
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Text
              className="mx-6 mt-8 mb-2 text-xs font-bold uppercase"
              style={{ color: colors.mutedText, fontFamily: fonts.body, letterSpacing: 0.5 }}
            >
              Coupon
            </Text>
            <View
              className="mx-6 flex-row items-center rounded-2xl px-3.5"
              style={{ backgroundColor: colors.input }}
            >
              <Feather name="tag" size={15} color={colors.mutedText} />
              <TextInput
                value={couponCode}
                onChangeText={(v) => setCouponCode(v.toUpperCase())}
                placeholder="Have a coupon code?"
                placeholderTextColor={colors.mutedText}
                autoCapitalize="characters"
                autoCorrect={false}
                className="flex-1 ml-2 py-3 text-sm"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
              />
            </View>
            {couponCode.trim() ? (
              <Text className="mx-6 mt-1.5 text-[11px] font-semibold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                We&apos;ll check this against whichever plan or feature you choose below.
              </Text>
            ) : null}

            {plans.length > 0 ? (
              <>
                <Text
                  className="mx-6 mt-8 mb-2 text-xs font-bold uppercase"
                  style={{ color: colors.mutedText, fontFamily: fonts.body, letterSpacing: 0.5 }}
                >
                  Plans
                </Text>
                <View className="mx-6" style={{ gap: 10 }}>
                  {plans.map((plan) => {
                    const unlocked = plan.features.every(isUnlocked) && plan.features.length > 0;
                    return (
                      <View
                        key={plan._id}
                        className="rounded-2xl px-5 py-4 flex-row items-center justify-between"
                        style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
                      >
                        <View className="flex-1 pr-3">
                          <View className="flex-row items-center" style={{ gap: 8 }}>
                            <Text className="text-sm font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                              {plan.name}
                            </Text>
                            {plan.badge ? (
                              <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: colors.primaryLight }}>
                                <Text className="text-[10px] font-bold" style={{ color: colors.primaryDark, fontFamily: fonts.body }}>
                                  {plan.badge}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          {plan.description ? (
                            <Text className="text-xs mt-1" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                              {plan.description}
                            </Text>
                          ) : null}
                          <Text className="text-xs mt-1 font-bold" style={{ color: colors.primary, fontFamily: fonts.body }}>
                            ₹{plan.price}
                            {CYCLE_SUFFIX[plan.billingCycle]}
                          </Text>
                        </View>
                        {unlocked ? (
                          <View className="rounded-full px-3 py-2" style={{ backgroundColor: softTints.emerald }}>
                            <Text className="text-xs font-bold" style={{ color: colors.success, fontFamily: fonts.body }}>
                              Active
                            </Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() =>
                              openConfirm({
                                key: plan._id,
                                payload: { source: "plan", planId: plan._id },
                                label: plan.name,
                                description: plan.description,
                                price: plan.price,
                                cycleSuffix: CYCLE_SUFFIX[plan.billingCycle],
                              })
                            }
                            activeOpacity={0.85}
                            className="rounded-full px-4 py-2.5"
                            style={{ backgroundColor: colors.primary }}
                          >
                            <Text className="text-xs font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                              Choose
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}

            {features.filter((f) => f.isPremium).length > 0 ? (
              <>
                <Text
                  className="mx-6 mt-8 mb-2 text-xs font-bold uppercase"
                  style={{ color: colors.mutedText, fontFamily: fonts.body, letterSpacing: 0.5 }}
                >
                  Individual features
                </Text>
                <View className="mx-6" style={{ gap: 10 }}>
                  {features
                    .filter((f) => f.isPremium)
                    .map((feature) => {
                      const unlocked = isUnlocked(feature.key);
                      return (
                        <View
                          key={feature.key}
                          className="rounded-2xl px-5 py-4 flex-row items-center justify-between"
                          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                        >
                          <View className="flex-1 pr-3">
                            <Text className="text-sm font-bold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                              {feature.name}
                            </Text>
                            {feature.description ? (
                              <Text className="text-xs mt-1" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                                {feature.description}
                              </Text>
                            ) : null}
                            <Text className="text-xs mt-1 font-bold" style={{ color: colors.gold, fontFamily: fonts.body }}>
                              ₹{feature.price}
                              {CYCLE_SUFFIX[feature.billingCycle]}
                            </Text>
                          </View>
                          {unlocked ? (
                            <View className="rounded-full px-3 py-2" style={{ backgroundColor: softTints.emerald }}>
                              <Text className="text-xs font-bold" style={{ color: colors.success, fontFamily: fonts.body }}>
                                Unlocked
                              </Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              onPress={() =>
                                openConfirm({
                                  key: feature.key,
                                  payload: { source: "feature", featureKey: feature.key },
                                  label: feature.name,
                                  description: feature.description,
                                  price: feature.price,
                                  cycleSuffix: CYCLE_SUFFIX[feature.billingCycle],
                                })
                              }
                              activeOpacity={0.85}
                              className="rounded-full px-4 py-2.5"
                              style={{ backgroundColor: colors.gold ?? colors.primary }}
                            >
                              <Text className="text-xs font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                                Unlock
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                </View>
              </>
            ) : null}

            {history.length > 0 ? (
              <>
                <Text
                  className="mx-6 mt-8 mb-2 text-xs font-bold uppercase"
                  style={{ color: colors.mutedText, fontFamily: fonts.body, letterSpacing: 0.5 }}
                >
                  Purchase history
                </Text>
                <View className="mx-6" style={{ gap: 8 }}>
                  {history.map((e) => (
                    <View key={e._id} className="flex-row items-center justify-between py-2 border-b" style={{ borderColor: colors.border }}>
                      <Text className="text-xs" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                        {entitlementLabel(e)} · {formatShortDate(e.createdAt)}
                      </Text>
                      <Text
                        className="text-xs font-bold capitalize"
                        style={{
                          color:
                            e.status === "active"
                              ? colors.success
                              : e.status === "failed"
                                ? colors.danger
                                : colors.mutedText,
                          fontFamily: fonts.body,
                        }}
                      >
                        {e.status}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <PaymentTrustFooter />
          </ScrollView>
          )}
        </LoadingErrorState>
      </SafeAreaView>

      <PurchaseConfirmSheet
        // Don't rely on handleConfirmPurchase's setConfirmTarget(null) alone
        // to prevent a stacked-Modal frame — hide the instant checkout/
        // purchaseResult exists too, regardless of render-batching timing.
        visible={confirmTarget !== null && !checkout && !purchaseResult}
        itemName={confirmTarget?.label ?? ""}
        itemDescription={confirmTarget?.description}
        originalAmount={confirmTarget?.price ?? 0}
        cycleSuffix={confirmTarget?.cycleSuffix ?? ""}
        couponPreview={couponPreview}
        couponNote={
          previewingCoupon
            ? "Checking your coupon…"
            : couponPreviewError
              ? couponPreviewError
              : undefined
        }
        confirming={confirmTarget !== null && purchasingKey === confirmTarget.key}
        onConfirm={handleConfirmPurchase}
        onClose={() => setConfirmTarget(null)}
      />

      {/* checkout is only ever set from startPurchase's non-free branch,
          which never reaches setCheckout without a real Cashfree order — so
          orderId/paymentSessionId (optional on SubscriptionOrder because a
          free order has neither) are always present here. Hosted checkout
          (cards/UPI apps/netbanking/wallets) is the default; native UPI-ID
          collect only opens when the confirm sheet's "pay with a UPI ID"
          link was used. */}
      {checkout && checkout.orderId && checkout.paymentSessionId && !useHostedCheckout && (
        <CashfreeUpiCollectModal
          visible
          mode={checkout.cashfreeMode ?? "production"}
          paymentSessionId={checkout.paymentSessionId}
          onVerify={() => verifyUpiOnce(checkout.orderId!)}
          onOutcome={handleUpiOutcome}
          onUseOtherMethod={() => setUseHostedCheckout(true)}
        />
      )}
      {checkout && checkout.orderId && checkout.paymentSessionId && useHostedCheckout && (
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
