import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
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
import { SegmentedControl } from "../../components/SegmentedControl";
import { PaymentTrustFooter } from "../../components/subscription/PaymentTrustFooter";
import { PurchaseConfirmSheet } from "../../components/subscription/PurchaseConfirmSheet";
import { PurchaseResultPanel } from "../../components/subscription/PurchaseResultPanel";
import { usePaymentCheckout } from "../../hooks/usePaymentCheckout";
import { useDataRefresh } from "../../hooks/useDataRefresh";
import { alert } from "../../lib/alert";
import { formatShortDate } from "../../lib/format";
import {
  ApiError,
  getFriendlyErrorMessage,
  subscriptionApi,
  type BillingCycle,
  type CouponPreview,
  type Entitlement,
  type MySubscription,
  type PricingSummary,
  type SubscriptionFeature,
} from "../../lib/api";
import { addOnPrice, formatRupees, pricingFromCatalog, type Period } from "../../lib/pricing";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Button";

const PERIOD_LABEL: Record<BillingCycle, string> = {
  monthly: "per month",
  yearly: "per year",
  one_time: "one-time",
};

type ConfirmTarget = {
  key: string;
  payload:
    | { source: "plan"; planId: string }
    | { source: "feature"; featureKey: string; billingCycle?: "monthly" | "yearly" };
  label: string;
  description?: string;
  price: number;
  cycleSuffix: string;
  billingCycle: BillingCycle;
  renewalPrice?: number | null;
  startsAt?: string | null;
};

/**
 * Profile → My Subscription. Shows what's currently active, then the
 * pricing from GET /api/subscriptions/pricing (one summary shared with the
 * website): Nura Premium with a Monthly / Yearly switch, the founding offer
 * only while it's live and this account is eligible, single features
 * (hidden behind "In Premium" for members, who never pay twice) and a short
 * "Good to know". Purchase mechanics are identical to PaywallModal, sharing
 * hooks/usePaymentCheckout.ts's state machine.
 */
export default function SubscriptionScreen() {
  const { colors, isDark, fonts } = useTheme();

  const [me, setMe] = useState<MySubscription | null>(null);
  const [features, setFeatures] = useState<SubscriptionFeature[]>([]);
  const [history, setHistory] = useState<Entitlement[]>([]);
  const [pricing, setPricing] = useState<PricingSummary | null>(null);
  const [period, setPeriod] = useState<Period>("monthly");
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
      const [meResult, plansResult, featuresResult, historyResult, pricingResult] = await Promise.all([
        subscriptionApi.getMe(),
        subscriptionApi.getPlans(),
        subscriptionApi.getFeatures(),
        subscriptionApi.getHistory(),
        // A backend before the 2026 pricing has no /pricing: rebuild it.
        subscriptionApi.getPricing({ force: !quiet }).catch((err) => {
          if (err instanceof ApiError && err.kind === "notFound") return null;
          throw err;
        }),
      ]);
      if (seq !== loadSeq.current) return;
      hasDataRef.current = true;
      setMe(meResult);
      setFeatures(featuresResult);
      setHistory(historyResult);
      setPricing(pricingResult ?? pricingFromCatalog(plansResult, featuresResult));
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
  const pricingOff = me !== null && !me.subscriptionEnabled;
  const premiumStatus = me?.premium?.active ? me.premium : null;

  const premium = pricing?.premium;
  const premiumCard = period === "yearly" ? (premium?.yearly ?? premium?.monthly) : (premium?.monthly ?? premium?.yearly);
  const comparison = premium?.yearly?.comparison ?? null;
  const founding = premium?.founding ?? null;
  const addOns = pricing?.allowFeatureWisePurchase === false ? [] : (pricing?.addOns ?? []);
  const hasYearly = Boolean(premium?.yearly) || addOns.some((a) => a.yearlyPrice);

  const confirmPremium = (card: NonNullable<typeof premiumCard>, extra: Partial<ConfirmTarget> = {}) =>
    openConfirm({
      key: card.planId,
      payload: { source: "plan", planId: card.planId },
      label: card.name,
      description: card.description,
      price: card.price,
      cycleSuffix: CYCLE_SUFFIX[card.billingCycle],
      billingCycle: card.billingCycle,
      // Buying again while Premium is live extends it (the server starts the
      // new period when the current one ends).
      startsAt: premiumStatus?.until ?? null,
      ...extra,
    });

  const foundingTerms = (offer: NonNullable<typeof founding>) => {
    const limit = offer.maxMembers ? `the first ${offer.maxMembers} members` : null;
    const until = offer.endsAt ? `until ${formatShortDate(offer.endsAt)}` : null;
    const window = limit && until ? ` Open to ${limit}, ${until}.` : limit ? ` Open to ${limit}.` : until ? ` Open ${until}.` : "";
    return `For new Premium members, once per person.${window}`;
  };

  const fairUse = pricing?.fairUse;
  const goodToKnow = [
    {
      icon: "calendar-outline",
      title: "Paid ahead, nothing to cancel",
      body: "Each purchase covers 30 days or 12 months and doesn't renew by itself. Buy again whenever you like.",
    },
    {
      icon: "medkit-outline",
      title: "Doctor consultations are separate",
      body: "Each consultation is paid on its own, at the doctor's fee shown before you book. Premium doesn't include them.",
    },
    ...(fairUse?.enabled
      ? [
          {
            icon: "speedometer-outline",
            title: "Fair use",
            body: `Premium includes up to ${fairUse.aiMessagesPerDay?.premium ?? "–"} Nura AI messages a day, ${fairUse.documentsPerMonth?.premium ?? "–"} documents a month (up to ${fairUse.maxPagesPerDocument?.premium ?? "–"} pages each) and ${fairUse.doctorReportsPerMonth?.premium ?? "–"} doctor report a month.`,
          },
        ]
      : []),
    {
      icon: "information-circle-outline",
      title: "Nura AI is not a doctor",
      body: "Its answers are general health information, not a diagnosis. For anything that worries you, talk to a doctor.",
    },
    {
      icon: "lock-closed-outline",
      title: "Your health data stays yours",
      body: "Paying doesn't change who can see your data. Help with a payment: Profile → Help & support.",
    },
  ];

  const heroTitle = pricingOff
    ? "Everything is free right now"
    : activePlanEntitlement
      ? entitlementLabel(activePlanEntitlement)
      : activeEntitlements.length > 0
        ? `${activeEntitlements.length} ${activeEntitlements.length === 1 ? "feature" : "features"} unlocked`
        : "Free plan";
  const premiumUntil = premiumStatus?.until ?? activePlanEntitlement?.expiresAt ?? null;
  const heroBody = pricingOff
    ? "Premium pricing isn't active, so every feature is open to you."
    : activePlanEntitlement
      ? premiumUntil
        ? `Active until ${formatShortDate(premiumUntil)}. It doesn't renew by itself.`
        : "Active, never expires"
      : activeEntitlements.length > 0
        ? "Get every Premium feature in one plan."
        : "Tracking, predictions and safety guidance are always free.";
  const heroGradient = getHeroGradient(colors, isDark) as [string, string, string];

  const historyStatus: Record<Entitlement["status"], { icon: string; tone: { fg: string; bg: string }; label: string }> = {
    active: { icon: "checkmark-circle-outline", tone: { fg: colors.success, bg: colors.successLight }, label: "Active" },
    pending: { icon: "time-outline", tone: { fg: colors.warning, bg: colors.warningLight }, label: "Pending" },
    failed: { icon: "close-circle-outline", tone: { fg: colors.danger, bg: colors.dangerLight }, label: "Failed" },
    expired: { icon: "hourglass-outline", tone: { fg: colors.mutedText, bg: colors.surfaceSoft }, label: "Expired" },
    cancelled: { icon: "remove-circle-outline", tone: { fg: colors.mutedText, bg: colors.surfaceSoft }, label: "Cancelled" },
    refunded: { icon: "return-down-back-outline", tone: { fg: colors.mutedText, bg: colors.surfaceSoft }, label: "Refunded" },
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
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 48 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          >
            {/* Hero: current plan status */}
            <LinearGradient
              colors={heroGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 26, borderCurve: "continuous", padding: 20, overflow: "hidden" }}
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
                <View style={{ marginTop: 14, borderRadius: 16, borderCurve: "continuous", backgroundColor: "rgba(255,255,255,0.16)", paddingHorizontal: 14, paddingVertical: 4 }}>
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

            {/* Nura Premium */}
            {!pricingOff && premiumCard ? (
              <>
                <SectionHeader title="Nura Premium" style={{ marginTop: sectionGap }} />
                <View style={{ borderRadius: 24, borderCurve: "continuous", padding: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...getShadow(colors, isDark) }}>
                  {premium?.monthly && premium?.yearly ? (
                    <SegmentedControl<Period>
                      segments={[
                        { key: "monthly", label: `Monthly ${formatRupees(premium.monthly.price)}`, accessibilityLabel: `Monthly, ${formatRupees(premium.monthly.price)} for 30 days` },
                        { key: "yearly", label: `Yearly ${formatRupees(premium.yearly.price)}`, accessibilityLabel: `Yearly, ${formatRupees(premium.yearly.price)} for 12 months` },
                      ]}
                      value={period}
                      onChange={setPeriod}
                      style={{ marginBottom: 16 }}
                    />
                  ) : null}

                  <View className="flex-row items-end flex-wrap" style={{ gap: 8 }}>
                    <Text style={{ color: colors.foreground, fontSize: 32, lineHeight: 36, fontFamily: fonts.monoSemiBold }}>{formatRupees(premiumCard.price)}</Text>
                    <Text style={{ color: colors.mutedText, fontSize: 14, marginBottom: 4, fontFamily: fonts.body }}>
                      {premiumCard.billingCycle === "yearly" ? "for 12 months" : "for 30 days"}
                    </Text>
                  </View>
                  {premiumCard.billingCycle === "yearly" && comparison ? (
                    <Text style={{ color: colors.mutedText, fontSize: 13.5, lineHeight: 19, marginTop: 4, fontFamily: fonts.body }}>
                      {`Billed once a year. About ${formatRupees(comparison.monthlyEquivalent)} a month${comparison.saving ? `, ${formatRupees(comparison.saving)} less than 12 monthly payments (${comparison.savingPercent}%)` : ""}.`}
                    </Text>
                  ) : null}

                  {(premium?.features.length ?? 0) > 0 ? (
                    <View style={{ marginTop: 14, gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
                      {premium!.features.map((f) => (
                        <View key={f.key} className="flex-row items-center" style={{ gap: 10 }}>
                          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.successLight, alignItems: "center", justifyContent: "center" }}>
                            <Icon set="ion" name="checkmark" size={13} color={colors.success} />
                          </View>
                          <Text numberOfLines={2} style={{ flex: 1, color: colors.foreground, fontSize: 14, fontFamily: fonts.body }}>
                            {f.name}
                          </Text>
                        </View>
                      ))}
                      <Text style={{ color: colors.mutedText, fontSize: 13, lineHeight: 18, marginTop: 2, fontFamily: fonts.body }}>
                        Cycle tracking, predictions, logging and safety guidance stay free for everyone.
                      </Text>
                    </View>
                  ) : null}

                  <Button
                    label={premiumStatus ? `Extend Premium · ${formatRupees(premiumCard.price)}` : `Get Premium · ${formatRupees(premiumCard.price)}${CYCLE_SUFFIX[premiumCard.billingCycle]}`}
                    onPress={() => confirmPremium(premiumCard)}
                    loading={purchasingKey === premiumCard.planId}
                    disabled={purchasingKey !== null && purchasingKey !== premiumCard.planId}
                    fullWidth
                    style={{ marginTop: 16 }}
                  />
                  {premiumStatus?.until ? (
                    <Text style={{ color: colors.mutedText, fontSize: 13, textAlign: "center", marginTop: 8, fontFamily: fonts.body }}>
                      {`You have Premium until ${formatShortDate(premiumStatus.until)}. Extending adds time after that.`}
                    </Text>
                  ) : null}
                </View>

                {founding ? (
                  <View style={{ marginTop: 14, borderRadius: 24, borderCurve: "continuous", padding: 18, backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary }}>
                    <Text style={{ color: colors.primaryDark, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", fontFamily: fonts.body }}>
                      Founding member offer
                    </Text>
                    <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800", marginTop: 4, fontFamily: fonts.heading }}>
                      {`${formatRupees(founding.price)} for your first year of Premium`}
                    </Text>
                    <Text style={{ color: colors.foreground, fontSize: 13.5, lineHeight: 19, marginTop: 6, fontFamily: fonts.body }}>
                      {foundingTerms(founding)}
                    </Text>
                    <Text style={{ color: colors.mutedText, fontSize: 13, lineHeight: 18, marginTop: 4, fontFamily: fonts.body }}>
                      {founding.renewalPrice
                        ? `After the first year, Premium is ${formatRupees(founding.renewalPrice)}/year if you choose to continue. Nothing renews by itself.`
                        : "Nothing renews by itself."}
                    </Text>
                    <Button
                      label={`Get the founding offer · ${formatRupees(founding.price)}`}
                      variant="secondary"
                      onPress={() =>
                        confirmPremium(founding, { renewalPrice: founding.renewalPrice, description: "Founding member offer, first year of Premium" })
                      }
                      loading={purchasingKey === founding.planId}
                      disabled={purchasingKey !== null && purchasingKey !== founding.planId}
                      fullWidth
                      style={{ marginTop: 14 }}
                    />
                  </View>
                ) : null}
              </>
            ) : null}

            {/* Coupon */}
            {!pricingOff && (premiumCard || addOns.length > 0) ? (
              <>
                <SectionHeader title="Coupon" style={{ marginTop: sectionGap }} />
                <View
                  className="flex-row items-center"
                  style={{
                    gap: 10,
                    paddingHorizontal: 14,
                    borderRadius: 18, borderCurve: "continuous",
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

            {/* Single features */}
            {!pricingOff && addOns.length > 0 ? (
              <>
                <SectionHeader
                  title="Or pick single features"
                  subtitle={hasYearly ? `Prices for ${period === "yearly" ? "12 months" : "30 days"}. Switch above.` : undefined}
                  style={{ marginTop: sectionGap }}
                />
                <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderCurve: "continuous", paddingVertical: 4, ...getShadow(colors, isDark) }}>
                  {addOns.map((addOn, index) => {
                    const feature = features.find((f) => f.key === addOn.key);
                    const { price, billingCycle } = addOnPrice(addOn, period);
                    const inPremium = Boolean(premiumStatus) && addOn.includedInPremium;
                    const unlocked = inPremium || isUnlocked(addOn.key);
                    return (
                      <View key={addOn.key} className="flex-row items-center" style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
                        {index > 0 ? <View style={{ position: "absolute", top: 0, left: 70, right: 0, height: 1, backgroundColor: colors.track }} /> : null}
                        <IconCircle icon={feature?.icon} fallback="star-outline" tone={{ fg: colors.gold, bg: colors.goldLight }} size={42} />
                        <View className="flex-1" style={{ minWidth: 0 }}>
                          <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", fontFamily: fonts.heading }}>
                            {addOn.name}
                          </Text>
                          {addOn.description ? (
                            <Text numberOfLines={2} maxFontSizeMultiplier={1.4} style={{ color: colors.mutedText, fontSize: 13, lineHeight: 18, marginTop: 1, fontFamily: fonts.body }}>
                              {addOn.description}
                            </Text>
                          ) : null}
                          <Text style={{ color: colors.foreground, fontSize: 13.5, marginTop: 4, fontFamily: fonts.monoSemiBold }}>
                            {formatRupees(price)}
                            <Text style={{ color: colors.mutedText, fontFamily: fonts.body, fontSize: 12.5 }}>{` ${PERIOD_LABEL[billingCycle]}`}</Text>
                          </Text>
                        </View>
                        {unlocked ? (
                          <View className="flex-row items-center" style={{ gap: 4 }}>
                            <Icon set="ion" name="checkmark-circle" size={16} color={colors.success} />
                            <Text style={{ color: colors.success, fontSize: 13, fontWeight: "800", fontFamily: fonts.body }}>{inPremium ? "In Premium" : "Unlocked"}</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            hitSlop={6}
                            onPress={() =>
                              openConfirm({
                                key: addOn.key,
                                payload: {
                                  source: "feature",
                                  featureKey: addOn.key,
                                  ...(billingCycle === "yearly" ? { billingCycle: "yearly" as const } : {}),
                                },
                                label: addOn.name,
                                description: addOn.description,
                                price,
                                cycleSuffix: CYCLE_SUFFIX[billingCycle],
                                billingCycle,
                              })
                            }
                            disabled={purchasingKey !== null}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel={`Unlock ${addOn.name} for ${formatRupees(price)} ${PERIOD_LABEL[billingCycle]}`}
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

            {!premiumCard && addOns.length === 0 && !pricingOff ? (
              <View style={{ marginTop: sectionGap }}>
                <EmptyState icon="tag-outline" title="No plans available" message="Pricing will show here once it's set up. Pull down to refresh." compact />
              </View>
            ) : null}

            {/* Good to know */}
            {!pricingOff ? (
              <>
                <SectionHeader title="Good to know" style={{ marginTop: sectionGap }} />
                <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderCurve: "continuous", paddingVertical: 4, ...getShadow(colors, isDark) }}>
                  {goodToKnow.map((item, index) => (
                    <View key={item.title} className="flex-row" style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 13 }}>
                      {index > 0 ? <View style={{ position: "absolute", top: 0, left: 58, right: 0, height: 1, backgroundColor: colors.track }} /> : null}
                      <Icon set="ion" name={item.icon} size={20} color={colors.primary} />
                      <View className="flex-1" style={{ minWidth: 0 }}>
                        <Text style={{ color: colors.foreground, fontSize: 14.5, fontWeight: "700", fontFamily: fonts.body }}>{item.title}</Text>
                        <Text style={{ color: colors.mutedText, fontSize: 13, lineHeight: 18, marginTop: 2, fontFamily: fonts.body }}>{item.body}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* Purchase history */}
            <SectionHeader title="Purchase history" style={{ marginTop: sectionGap }} />
            {history.length === 0 ? (
              <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderCurve: "continuous", ...getShadow(colors, isDark) }}>
                <EmptyState icon="receipt" title="No purchases yet" message="Your receipts will show up here." compact />
              </View>
            ) : (
              <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderCurve: "continuous", paddingVertical: 4, ...getShadow(colors, isDark) }}>
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
        billingCycle={confirmTarget?.billingCycle}
        renewalPrice={confirmTarget?.renewalPrice}
        startsAt={confirmTarget?.startsAt}
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
