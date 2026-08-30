import { Feather, Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/ScreenHeader";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { EmptyState } from "../../components/EmptyState";
import { useTheme } from "../../components/theme";
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import { RazorpayCheckoutModal, type RazorpayResult } from "../../components/RazorpayCheckoutModal";
import { showAlert } from "../../lib/modal-host";
import { formatShortDate } from "../../lib/format";
import {
  getFriendlyErrorMessage,
  subscriptionApi,
  type BillingCycle,
  type Entitlement,
  type MySubscription,
  type SubscriptionFeature,
  type SubscriptionOrder,
  type SubscriptionPlan,
} from "../../lib/api";

const CYCLE_SUFFIX: Record<BillingCycle, string> = {
  monthly: "/mo",
  yearly: "/yr",
  one_time: " once",
};

/**
 * Profile → My Subscription. Shows what's currently active, and a full
 * pricing grid (plans + individual features) to browse/upgrade any time —
 * not just when a screen hits a lock (see components/subscription/
 * PaywallModal.tsx for that flow). Purchase mechanics are identical to it.
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

  const [purchasingKey, setPurchasingKey] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<SubscriptionOrder | null>(null);
  const [checkoutLabel, setCheckoutLabel] = useState("");

  // This screen lists many purchasable items (several plans + features), so
  // unlike PaywallModal's single-item paywall there's no one thing to
  // preview a discount against up front. The code is just carried along on
  // whichever purchase the user actually taps — the server (createOrder)
  // validates and prices it against that specific item, same guarantees as
  // the preview endpoint, just without a preview step here.
  const [couponCode, setCouponCode] = useState("");

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

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  const isUnlocked = (key: string) =>
    !me || !me.subscriptionEnabled || me.unlockedFeatureKeys === "ALL" || me.unlockedFeatureKeys.includes(key);

  const startPurchase = async (
    key: string,
    label: string,
    payload: { source: "plan"; planId: string } | { source: "feature"; featureKey: string },
  ) => {
    setPurchasingKey(key);
    try {
      const order = await subscriptionApi.createOrder({
        ...payload,
        couponCode: couponCode.trim() || undefined,
      });
      if (order.free) {
        showAlert("Unlocked!", "Your coupon covered the full price — no payment needed.", undefined, {
          icon: "checkmark-circle",
        });
        setCouponCode("");
        load();
        return;
      }
      setCheckoutLabel(label);
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
    if (!order || result.type === "dismiss") return;
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
      load();
    } catch (err) {
      showAlert("Couldn't confirm payment", getFriendlyErrorMessage(err));
    }
  };

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

        <LoadingErrorState loading={loading} error={error} onRetry={load} loadingLabel="Loading your subscription…">
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
                Applied automatically to whichever plan or feature you buy below.
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
                            onPress={() => startPurchase(plan._id, plan.name, { source: "plan", planId: plan._id })}
                            activeOpacity={0.85}
                            disabled={purchasingKey !== null}
                            className="rounded-full px-4 py-2.5"
                            style={{ backgroundColor: colors.primary }}
                          >
                            {purchasingKey === plan._id ? (
                              <ActivityIndicator color={colors.buttonText} size="small" />
                            ) : (
                              <Text className="text-xs font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                                Choose
                              </Text>
                            )}
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
                                startPurchase(feature.key, feature.name, { source: "feature", featureKey: feature.key })
                              }
                              activeOpacity={0.85}
                              disabled={purchasingKey !== null}
                              className="rounded-full px-4 py-2.5"
                              style={{ backgroundColor: colors.gold ?? colors.primary }}
                            >
                              {purchasingKey === feature.key ? (
                                <ActivityIndicator color={colors.buttonText} size="small" />
                              ) : (
                                <Text className="text-xs font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                                  Unlock
                                </Text>
                              )}
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
          </ScrollView>
        </LoadingErrorState>
      </SafeAreaView>

      {/* checkout is only ever set from startPurchase's non-free branch,
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
          description={checkoutLabel}
          onResult={handleCheckoutResult}
        />
      )}
    </>
  );
}
