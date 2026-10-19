import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { SkeletonBlock } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { useTheme } from "../../components/theme";
import { getHeroGradient, getShadow } from "../../components/ui-tokens";
import { IconCircle } from "../../components/wellbeing/WellbeingUI";
import { CashfreeCheckoutModal } from "../../components/CashfreeCheckoutModal";
import { PaymentSheet } from "../../components/PaymentSheet";
import { CYCLE_SUFFIX } from "../../components/subscription/billing";
import { PaymentTrustFooter } from "../../components/subscription/PaymentTrustFooter";
import { PurchaseConfirmSheet } from "../../components/subscription/PurchaseConfirmSheet";
import { PurchaseResultPanel } from "../../components/subscription/PurchaseResultPanel";
import { usePaymentCheckout } from "../../hooks/usePaymentCheckout";
import { useDataRefresh } from "../../hooks/useDataRefresh";
import { alert } from "../../lib/alert";
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
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Icon } from "../../components/Icon";

const PERIOD_LABEL: Record<BillingCycle, string> = {
  monthly: "per month",
  yearly: "per year",
  one_time: "one-time",
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

  const [me, setMe] = useState<MySubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [features, setFeatures] = useState<SubscriptionFeature[]>([]);
  const [history, setHistory] = useState<Entitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [couponCode, setCouponCode] = useState("");
  // The plan the sticky CTA buys; null = the recommended one.
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [couponPreview, setCouponPreview] = useState<CouponPreview | null>(null);
  const [couponPreviewError, setCouponPreviewError] = useState<string | null>(null);
  const [previewingCoupon, setPreviewingCoupon] = useState(false);

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

  const hasDataRef = useRef(false);
  // Only the newest load may write (pull-to-refresh, a purchase and a
  // background refresh can overlap).
  const loadSeq = useRef(0);

  /**
   * Fetches the whole page. `quiet`: a background refresh, so a failure keeps
   * what's on screen. Otherwise an error replaces the page only when there is
   * nothing to show yet; with data on screen it's an alert instead.
   */
  const load = useCallback(async (quiet = false) => {
    const seq = ++loadSeq.current;
    if (!quiet) setError(null);
    try {
      const [meResult, plansResult, featuresResult, historyResult] = await Promise.all([
        subscriptionApi.getMe(),
        subscriptionApi.getPlans(),
        subscriptionApi.getFeatures(),
        subscriptionApi.getHistory(),
      ]);
      if (seq !== loadSeq.current) return;
      hasDataRef.current = true;
      setMe(meResult);
      setPlans(plansResult);
      setFeatures(featuresResult);
      setHistory(historyResult);
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current || quiet) return;
      if (hasDataRef.current) alert("Couldn't refresh", getFriendlyErrorMessage(err));
      else setError(getFriendlyErrorMessage(err));
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Purchases made elsewhere (a PaywallModal) update plans/history here too.
  useDataRefresh(["subscription"], () => load(true));

  const handleRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const isUnlocked = (key: string) =>
    !me || !me.subscriptionEnabled || me.unlockedFeatureKeys === "ALL" || me.unlockedFeatureKeys.includes(key);

  // Opening the confirm sheet previews the coupon (if one was typed) against
  // this specific item — the same preview-then-apply flow PaywallModal uses,
  // instead of blindly carrying an unvalidated code into checkout (docs/fixes.md 6.3).
  // A preview for the sheet that's no longer open (closed, or another item
  // opened since) must not land on the current one and be sent with it.
  const previewSeq = useRef(0);

  async function openConfirm(target: ConfirmTarget) {
    const seq = ++previewSeq.current;
    setConfirmTarget(target);
    setCouponPreview(null);
    setCouponPreviewError(null);
    const code = couponCode.trim();
    if (!code) {
      setPreviewingCoupon(false);
      return;
    }
    setPreviewingCoupon(true);
    try {
      const preview = await subscriptionApi.applyCoupon({ code, ...target.payload });
      if (seq === previewSeq.current) setCouponPreview(preview);
    } catch (err) {
      if (seq === previewSeq.current) setCouponPreviewError(getFriendlyErrorMessage(err));
    } finally {
      if (seq === previewSeq.current) setPreviewingCoupon(false);
    }
  }

  function closeConfirm() {
    previewSeq.current += 1;
    setPreviewingCoupon(false);
    setConfirmTarget(null);
  }

  async function handleConfirmPurchase() {
    // Wait for the coupon check, or the purchase would go out without it.
    if (!confirmTarget || previewingCoupon) return;
    const outcome = await startPurchase(confirmTarget.key, confirmTarget.payload, {
      couponCode: couponPreview ? couponCode.trim() : undefined,
      title: confirmTarget.label,
    });
    closeConfirm();
    if (outcome?.free) {
      setCouponCode("");
      void load();
    }
  }

  function handleResultDone() {
    setPurchaseResult(null);
    void load();
  }

  const entitlementLabel = (e: Entitlement) => {
    if (e.source === "plan") return typeof e.plan === "object" && e.plan ? e.plan.name : "Plan";
    const feature = features.find((f) => f.key === e.featureKey);
    return feature?.name ?? e.featureKey ?? "Feature";
  };

  const activeEntitlements = (me?.entitlements ?? []).filter((e) => e.status === "active");
  const activePlanEntitlement = activeEntitlements.find((e) => e.source === "plan");
  const premiumFeatures = features.filter((f) => f.isPremium);
  const pricingOff = me !== null && !me.subscriptionEnabled;

  const featureName = (key: string) => features.find((f) => f.key === key)?.name ?? key;
  const planUnlocked = (plan: SubscriptionPlan) => plan.features.every(isUnlocked) && plan.features.length > 0;

  // What a plan is compared with for its "Save N%" badge: the same features
  // on a monthly plan (for a yearly one), else buying them one by one.
  const savingsFor = (plan: SubscriptionPlan): number | null => {
    if (plan.billingCycle === "one_time" || plan.price <= 0) return null;
    const sameSet = (p: SubscriptionPlan) =>
      p.features.length === plan.features.length && p.features.every((k) => plan.features.includes(k));
    let reference: number | null = null;
    if (plan.billingCycle === "yearly") {
      const monthly = plans.find((p) => p._id !== plan._id && p.billingCycle === "monthly" && sameSet(p));
      if (monthly) reference = monthly.price * 12;
    }
    if (reference === null && plan.features.length > 1) {
      let total = 0;
      for (const key of plan.features) {
        const f = features.find((x) => x.key === key);
        if (!f || !f.isPremium) return null;
        if (f.billingCycle === plan.billingCycle) total += f.price;
        else if (f.billingCycle === "monthly" && plan.billingCycle === "yearly") total += f.price * 12;
        else return null;
      }
      reference = total;
    }
    if (!reference || reference <= plan.price) return null;
    const pct = Math.round(((reference - plan.price) / reference) * 100);
    return pct >= 5 ? pct : null;
  };

  const buyablePlans = plans.filter((p) => !planUnlocked(p));
  const recommendedPlan =
    plans.find((p) => !!p.badge) ??
    [...plans].sort((a, b) => (savingsFor(b) ?? 0) - (savingsFor(a) ?? 0) || b.features.length - a.features.length)[0];
  const selectedPlan =
    buyablePlans.find((p) => p._id === selectedPlanId) ??
    (recommendedPlan && !planUnlocked(recommendedPlan) ? recommendedPlan : buyablePlans[0]);

  const confirmPlan = (plan: SubscriptionPlan) =>
    openConfirm({
      key: plan._id,
      payload: { source: "plan", planId: plan._id },
      label: plan.name,
      description: plan.description,
      price: plan.price,
      cycleSuffix: CYCLE_SUFFIX[plan.billingCycle],
    });

  const heroTitle = pricingOff
    ? "Everything is free right now"
    : activePlanEntitlement
      ? entitlementLabel(activePlanEntitlement)
      : activeEntitlements.length > 0
        ? `${activeEntitlements.length} ${activeEntitlements.length === 1 ? "feature" : "features"} unlocked`
        : "Free plan";
  const heroBody = pricingOff
    ? "Premium pricing isn't active, so every feature is open to you."
    : activePlanEntitlement
      ? activePlanEntitlement.expiresAt
        ? `Renews or expires ${formatShortDate(activePlanEntitlement.expiresAt)}`
        : "Active, never expires"
      : activeEntitlements.length > 0
        ? "Bundle more into a plan and save."
        : "Unlock premium care with a plan, or one feature at a time.";
  const heroGradient = getHeroGradient(colors, isDark) as [string, string, string];

  const historyStatus: Record<Entitlement["status"], { icon: string; tone: { fg: string; bg: string }; label: string }> = {
    active: { icon: "checkmark-circle-outline", tone: { fg: colors.success, bg: colors.successLight }, label: "Active" },
    pending: { icon: "time-outline", tone: { fg: colors.warning, bg: colors.warningLight }, label: "Pending" },
    failed: { icon: "close-circle-outline", tone: { fg: colors.danger, bg: colors.dangerLight }, label: "Failed" },
    expired: { icon: "hourglass-outline", tone: { fg: colors.mutedText, bg: colors.surfaceSoft }, label: "Expired" },
    cancelled: { icon: "remove-circle-outline", tone: { fg: colors.mutedText, bg: colors.surfaceSoft }, label: "Cancelled" },
  };

  const sectionGap = 32;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="My Subscription" />

        <LoadingErrorState
          loading={loading}
          error={error}
          onRetry={() => void load()}
          loadingLabel="Loading your subscription…"
          skeleton={
            <View style={{ paddingHorizontal: 24, paddingTop: 12, gap: 14 }}>
              <SkeletonBlock width="100%" height={150} radius={26} />
              <SkeletonBlock width={140} height={18} style={{ marginTop: 18 }} />
              <SkeletonBlock width="100%" height={190} radius={24} />
              <SkeletonBlock width="100%" height={150} radius={24} />
              <SkeletonBlock width="100%" height={52} radius={18} />
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
          <View className="flex-1">
          <KeyboardAwareScrollView
            bottomOffset={24}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: selectedPlan ? 140 : 48 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          >
            {/* Hero: current plan status */}
            <LinearGradient
              colors={heroGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 26, padding: 20, overflow: "hidden" }}
            >
              <View className="flex-row items-center" style={{ gap: 14 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}>
                  <Icon set="mci" name={pricingOff ? "gift-outline" : activeEntitlements.length > 0 ? "crown-outline" : "star-outline"} size={24} color="#FFFFFF" />
                </View>
                <View className="flex-1">
                  <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 11.5, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", fontFamily: fonts.body }}>
                    Your plan
                  </Text>
                  <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ color: "#FFFFFF", fontSize: 21, lineHeight: 27, fontWeight: "800", letterSpacing: -0.3, fontFamily: fonts.heading }}>
                    {heroTitle}
                  </Text>
                </View>
              </View>
              <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: 13.5, lineHeight: 19, marginTop: 12, fontFamily: fonts.body }}>{heroBody}</Text>

              {activeEntitlements.length > 0 && !pricingOff ? (
                <View style={{ marginTop: 14, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.16)", paddingHorizontal: 14, paddingVertical: 4 }}>
                  {activeEntitlements.map((e, i) => (
                    <View
                      key={e._id}
                      className="flex-row items-center"
                      style={{ gap: 10, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: "rgba(255,255,255,0.18)" }}
                    >
                      <Icon set="ion" name="checkmark-circle" size={17} color="#FFFFFF" />
                      <Text numberOfLines={1} style={{ flex: 1, color: "#FFFFFF", fontSize: 14, fontWeight: "700", fontFamily: fonts.body }}>
                        {entitlementLabel(e)}
                      </Text>
                      <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12.5, fontFamily: fonts.body }}>
                        {e.expiresAt ? `Until ${formatShortDate(e.expiresAt)}` : "Lifetime"}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </LinearGradient>

            {/* Plans */}
            {plans.length > 0 ? (
              <>
                <SectionHeader title="Choose a plan" style={{ marginTop: sectionGap }} />
                <View style={{ gap: 14 }}>
                  {plans.map((plan) => {
                    const unlocked = planUnlocked(plan);
                    const isSelected = selectedPlan?._id === plan._id;
                    const isRecommended = recommendedPlan?._id === plan._id && !unlocked;
                    const savings = savingsFor(plan);
                    const shown = plan.features.slice(0, 4);
                    const more = plan.features.length - shown.length;
                    return (
                      <TouchableOpacity
                        key={plan._id}
                        activeOpacity={0.85}
                        disabled={unlocked}
                        onPress={() => setSelectedPlanId(plan._id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected, disabled: unlocked }}
                        accessibilityLabel={`${plan.name}, ₹${plan.price} ${PERIOD_LABEL[plan.billingCycle]}${savings ? `, save ${savings}%` : ""}${unlocked ? ", current plan" : ""}`}
                        style={{
                          borderRadius: 24,
                          padding: 18,
                          paddingTop: isRecommended ? 26 : 18,
                          backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                          borderWidth: isSelected ? 2 : 1,
                          borderColor: isSelected ? colors.primary : colors.border,
                          ...getShadow(colors, isDark),
                        }}
                      >
                        {isRecommended ? (
                          <View
                            className="flex-row items-center"
                            style={{ position: "absolute", top: -11, left: 18, gap: 4, paddingHorizontal: 10, height: 22, borderRadius: 11, backgroundColor: colors.primary }}
                          >
                            <Icon set="ion" name="star" size={11} color={colors.buttonText} />
                            <Text numberOfLines={1} style={{ color: colors.buttonText, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase", fontFamily: fonts.body }}>
                              {plan.badge || "Recommended"}
                            </Text>
                          </View>
                        ) : null}

                        <View className="flex-row items-start" style={{ gap: 12 }}>
                          <View className="flex-1">
                            <View className="flex-row items-center flex-wrap" style={{ gap: 8 }}>
                              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ flexShrink: 1, color: colors.foreground, fontSize: 17, fontWeight: "800", fontFamily: fonts.heading }}>
                                {plan.name}
                              </Text>
                              {plan.badge && !isRecommended ? (
                                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.primaryLight }}>
                                  <Text style={{ color: colors.primaryDark, fontSize: 12, fontWeight: "800", fontFamily: fonts.body }}>{plan.badge}</Text>
                                </View>
                              ) : null}
                            </View>
                            {plan.description ? (
                              <Text numberOfLines={2} style={{ color: colors.mutedText, fontSize: 13, lineHeight: 18, marginTop: 3, fontFamily: fonts.body }}>
                                {plan.description}
                              </Text>
                            ) : null}
                          </View>
                          {unlocked ? (
                            <View className="flex-row items-center" style={{ gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.successLight }}>
                              <Icon set="ion" name="checkmark-circle" size={14} color={colors.success} />
                              <Text style={{ color: colors.success, fontSize: 12.5, fontWeight: "800", fontFamily: fonts.body }}>Current</Text>
                            </View>
                          ) : (
                            <Icon set="ion" name={isSelected ? "radio-button-on" : "radio-button-off"} size={24} color={isSelected ? colors.primary : colors.mutedText} />
                          )}
                        </View>

                        <View className="flex-row items-end flex-wrap" style={{ marginTop: 14, gap: 8 }}>
                          <Text style={{ color: colors.foreground, fontSize: 30, lineHeight: 34, fontFamily: fonts.monoSemiBold }}>₹{plan.price}</Text>
                          <Text style={{ color: colors.mutedText, fontSize: 13.5, marginBottom: 4, fontFamily: fonts.body }}>{PERIOD_LABEL[plan.billingCycle]}</Text>
                          {savings ? (
                            <View style={{ marginBottom: 5, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.successLight }}>
                              <Text style={{ color: colors.success, fontSize: 12, fontWeight: "800", fontFamily: fonts.body }}>Save {savings}%</Text>
                            </View>
                          ) : null}
                        </View>
                        {plan.billingCycle === "yearly" && plan.price > 0 ? (
                          <Text style={{ color: colors.mutedText, fontSize: 13, marginTop: 2, fontFamily: fonts.body }}>
                            {`That's about ₹${Math.round(plan.price / 12)} a month`}
                          </Text>
                        ) : null}

                        {shown.length > 0 ? (
                          <View style={{ marginTop: 14, gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
                            {shown.map((key) => (
                              <View key={key} className="flex-row items-center" style={{ gap: 10 }}>
                                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.successLight, alignItems: "center", justifyContent: "center" }}>
                                  <Icon set="ion" name="checkmark" size={13} color={colors.success} />
                                </View>
                                <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: 14, fontFamily: fonts.body }}>
                                  {featureName(key)}
                                </Text>
                              </View>
                            ))}
                            {more > 0 ? (
                              <Text style={{ color: colors.mutedText, fontSize: 13, marginLeft: 30, fontFamily: fonts.body }}>{`+ ${more} more`}</Text>
                            ) : null}
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            {/* Coupon */}
            {!pricingOff && (plans.length > 0 || premiumFeatures.length > 0) ? (
              <>
                <SectionHeader title="Coupon" style={{ marginTop: sectionGap }} />
                <View
                  className="flex-row items-center"
                  style={{
                    gap: 10,
                    paddingHorizontal: 14,
                    borderRadius: 18,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: couponCode.trim() ? colors.primary : colors.border,
                  }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.goldLight, alignItems: "center", justifyContent: "center" }}>
                    <Icon set="ion" name="pricetag-outline" size={16} color={colors.gold} />
                  </View>
                  <TextInput
                    value={couponCode}
                    onChangeText={(v) => setCouponCode(v.toUpperCase())}
                    placeholder="Have a coupon code?"
                    placeholderTextColor={colors.mutedText}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    accessibilityLabel="Coupon code"
                    style={{ flex: 1, paddingVertical: 14, fontSize: 15, letterSpacing: couponCode ? 1 : 0, color: colors.foreground, fontFamily: couponCode ? fonts.mono : fonts.body }}
                  />
                  {couponCode ? (
                    <TouchableOpacity onPress={() => setCouponCode("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear coupon">
                      <Icon set="ion" name="close-circle" size={18} color={colors.mutedText} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <Text style={{ marginTop: 6, color: colors.mutedText, fontSize: 13, lineHeight: 18, fontFamily: fonts.body }}>
                  {couponCode.trim()
                    ? "We'll check it against whatever you choose, before you pay."
                    : "Applied at checkout on any plan or feature."}
                </Text>
              </>
            ) : null}

            {/* Individual features */}
            {premiumFeatures.length > 0 ? (
              <>
                <SectionHeader title="Or unlock one feature" style={{ marginTop: sectionGap }} />
                <View style={{ backgroundColor: colors.surface, borderRadius: 22, paddingVertical: 4, ...getShadow(colors, isDark) }}>
                  {premiumFeatures.map((feature, index) => {
                    const unlocked = isUnlocked(feature.key);
                    return (
                      <View
                        key={feature.key}
                        className="flex-row items-center"
                        style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}
                      >
                        {index > 0 ? <View style={{ position: "absolute", top: 0, left: 70, right: 0, height: 1, backgroundColor: colors.track }} /> : null}
                        <IconCircle icon={feature.icon} fallback="star-outline" tone={{ fg: colors.gold, bg: colors.goldLight }} size={42} />
                        <View className="flex-1" style={{ minWidth: 0 }}>
                          <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", fontFamily: fonts.heading }}>
                            {feature.name}
                          </Text>
                          {feature.description ? (
                            <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ color: colors.mutedText, fontSize: 13, lineHeight: 18, marginTop: 1, fontFamily: fonts.body }}>
                              {feature.description}
                            </Text>
                          ) : null}
                          <Text style={{ color: colors.foreground, fontSize: 13.5, marginTop: 4, fontFamily: fonts.monoSemiBold }}>
                            ₹{feature.price}
                            <Text style={{ color: colors.mutedText, fontFamily: fonts.body, fontSize: 12.5 }}>{` ${PERIOD_LABEL[feature.billingCycle]}`}</Text>
                          </Text>
                        </View>
                        {unlocked ? (
                          <View className="flex-row items-center" style={{ gap: 4 }}>
                            <Icon set="ion" name="checkmark-circle" size={16} color={colors.success} />
                            <Text style={{ color: colors.success, fontSize: 13, fontWeight: "800", fontFamily: fonts.body }}>Unlocked</Text>
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
                            disabled={purchasingKey !== null}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel={`Unlock ${feature.name} for ₹${feature.price}`}
                            style={{ height: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: "center", backgroundColor: colors.primaryLight }}
                          >
                            <Text style={{ color: colors.primaryDark, fontSize: 13.5, fontWeight: "800", fontFamily: fonts.body }}>Unlock</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}

            {plans.length === 0 && premiumFeatures.length === 0 && !pricingOff ? (
              <View style={{ marginTop: sectionGap }}>
                <EmptyState icon="tag-outline" title="No plans available" message="Pricing will show here once it's set up. Pull down to refresh." compact />
              </View>
            ) : null}

            {/* Purchase history */}
            <SectionHeader title="Purchase history" style={{ marginTop: sectionGap }} />
            {history.length === 0 ? (
              <View style={{ backgroundColor: colors.surface, borderRadius: 22, ...getShadow(colors, isDark) }}>
                <EmptyState icon="receipt" title="No purchases yet" message="Your receipts will show up here." compact />
              </View>
            ) : (
              <View style={{ backgroundColor: colors.surface, borderRadius: 22, paddingVertical: 4, ...getShadow(colors, isDark) }}>
                {history.map((e, index) => {
                  const status = historyStatus[e.status] ?? historyStatus.pending;
                  return (
                    <View key={e._id} className="flex-row items-center" style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 13 }}>
                      {index > 0 ? <View style={{ position: "absolute", top: 0, left: 66, right: 0, height: 1, backgroundColor: colors.track }} /> : null}
                      <IconCircle icon={status.icon} tone={status.tone} size={38} />
                      <View className="flex-1" style={{ minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14.5, fontWeight: "700", fontFamily: fonts.body }}>
                          {entitlementLabel(e)}
                        </Text>
                        <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 13, marginTop: 1, fontFamily: fonts.body }}>
                          {`${formatShortDate(e.createdAt)} · ${status.label}`}
                        </Text>
                      </View>
                      <Text style={{ color: e.status === "failed" ? colors.mutedText : colors.foreground, fontSize: 14, fontFamily: fonts.monoSemiBold, textDecorationLine: e.status === "failed" ? "line-through" : "none" }}>
                        {`₹${e.amount}`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            <PaymentTrustFooter />
          </KeyboardAwareScrollView>

          {/* Sticky CTA for the selected plan */}
          {selectedPlan ? (
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                paddingHorizontal: 24,
                paddingTop: 12,
                paddingBottom: 12,
                backgroundColor: colors.background,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <TouchableOpacity
                onPress={() => confirmPlan(selectedPlan)}
                disabled={purchasingKey !== null}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Continue with ${selectedPlan.name}, ₹${selectedPlan.price} ${PERIOD_LABEL[selectedPlan.billingCycle]}`}
                className="flex-row items-center justify-center"
                style={{ height: 54, borderRadius: 27, gap: 8, backgroundColor: colors.primary, opacity: purchasingKey !== null ? 0.6 : 1 }}
              >
                {purchasingKey === selectedPlan._id ? (
                  <ActivityIndicator color={colors.buttonText} />
                ) : (
                  <>
                    <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.buttonText, fontSize: 15.5, fontWeight: "800", fontFamily: fonts.body }}>
                      {`Continue with ${selectedPlan.name}`}
                    </Text>
                    <Text style={{ color: colors.buttonText, fontSize: 15, fontFamily: fonts.monoSemiBold }}>
                      {`· ₹${selectedPlan.price}${CYCLE_SUFFIX[selectedPlan.billingCycle]}`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
          </View>
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
        onClose={closeConfirm}
      />

      {/* checkout is only ever set from startPurchase's non-free branch,
          which never reaches setCheckout without a real Cashfree order — so
          orderId/paymentSessionId (optional on SubscriptionOrder because a
          free order has neither) are always present here. PaymentSheet
          (UPI apps, UPI ID) is the default; its "Card, netbanking or wallet"
          option switches to Cashfree's hosted checkout. */}
      {checkout && checkout.orderId && checkout.paymentSessionId && !useHostedCheckout && (
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
