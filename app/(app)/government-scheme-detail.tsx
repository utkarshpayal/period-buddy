import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { SkeletonBlock, SkeletonCard } from "../../components/Skeleton";
import { HeaderIconButton, ScreenHeader } from "../../components/ScreenHeader";
import { useAuth } from "../../components/auth-context";
import { ApplicationSteps } from "../../components/schemes/ApplicationSteps";
import { EligibilityCheckerSheet, type EligibilityAnswers } from "../../components/schemes/EligibilityCheckerSheet";
import { EligibilityResultCard } from "../../components/schemes/EligibilityResultCard";
import { SchemePills } from "../../components/schemes/SchemePills";
import { SchemePrimaryBar } from "../../components/schemes/SchemePrimaryBar";
import {
  SCHEME_BODY,
  SchemeBullet,
  SchemeSecondaryButton,
  SchemeSection,
} from "../../components/schemes/SchemeSection";
import { LockedFeatureCard } from "../../components/subscription/LockedFeatureCard";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import { useTheme } from "../../components/theme";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { SCHEME_TRACKING_FEATURE_KEY, useSchemeTracking } from "../../hooks/useSchemeTracking";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { alert } from "../../lib/alert";
import {
  authApi,
  getFriendlyErrorMessage,
  schemesApi,
  type GovernmentBenefit,
  type SchemeEligibilityResult,
} from "../../lib/api";
import { formatShortDate } from "../../lib/format";
import { shareWithAppLink } from "../../lib/share";
import {
  governmentHospitalMapsUrl,
  schemePrimaryAction,
  schemePrimaryCta,
  trackHelperText,
} from "../../lib/schemeHelpers";

const detailSkeleton = (
  <View className="gap-4 px-6 pt-4">
    <View className="flex-row gap-2">
      <SkeletonBlock width={72} height={22} radius={11} />
      <SkeletonBlock width={96} height={22} radius={11} />
    </View>
    <SkeletonBlock width="80%" height={24} />
    <SkeletonBlock width="60%" height={14} />
    <SkeletonCard />
    <SkeletonCard />
    <SkeletonBlock width="100%" height={48} radius={16} />
  </View>
);

const openUrl = (url?: string) => {
  if (!url) {
    alert("Not available", "No official link is available for this scheme.");
    return;
  }
  Linking.openURL(url).catch(() => alert("Couldn't open link", "Please try again later."));
};

/**
 * Whole-screen gate on the same key the Track action uses: a deep link
 * (share, notification) can skip the list screen's own gate. While locked the
 * scheme isn't even fetched; the paywall opens only when the card is tapped.
 */
export default function GovernmentSchemeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { hasAccess, isLoading: subscriptionLoading, refresh: refreshSubscriptionAccess } = useSubscriptionAccess();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const locked = !subscriptionLoading && !hasAccess(SCHEME_TRACKING_FEATURE_KEY);

  if (subscriptionLoading || !locked) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        {subscriptionLoading ? (
          <>
            <ScreenHeader title="Scheme details" />
            {detailSkeleton}
          </>
        ) : (
          <SchemeDetailContent id={String(id)} />
        )}
      </SafeAreaView>
    );
  }

  return (
    <LockedSchemeScreen
      paywallVisible={paywallVisible}
      onOpenPaywall={() => setPaywallVisible(true)}
      onClosePaywall={() => setPaywallVisible(false)}
      onUnlocked={() => {
        setPaywallVisible(false);
        refreshSubscriptionAccess();
      }}
    />
  );
}

function LockedSchemeScreen({
  paywallVisible,
  onOpenPaywall,
  onClosePaywall,
  onUnlocked,
}: {
  paywallVisible: boolean;
  onOpenPaywall: () => void;
  onClosePaywall: () => void;
  onUnlocked: () => void;
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScreenHeader title="Scheme details" />
      <View className="flex-1 items-center justify-center px-6">
        <LockedFeatureCard
          title="Government schemes"
          description="Unlock to see the details and track this scheme."
          onPress={onOpenPaywall}
        />
      </View>
      <PaywallModal
        visible={paywallVisible}
        onClose={onClosePaywall}
        featureKey={SCHEME_TRACKING_FEATURE_KEY}
        onUnlocked={onUnlocked}
      />
    </SafeAreaView>
  );
}

function SchemeDetailContent({ id }: { id: string }) {
  const { colors, fonts } = useTheme();
  const router = useRouter();
  const { user, updateUser } = useAuth();

  const { data, loading, error, offline, reload } = useAsyncLoad(
    () => schemesApi.getById(id),
    [id],
    { cacheKey: `schemes:detail:${id}`, staleMs: 5 * 60_000 },
  );
  const scheme: GovernmentBenefit | undefined = data?.scheme;

  const { saved, applying, handleTrack, paywall } = useSchemeTracking(scheme);
  const [eligibility, setEligibility] = useState<SchemeEligibilityResult | null>(null);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const [checkerOpen, setCheckerOpen] = useState(false);

  const submitEligibility = async (answers: EligibilityAnswers) => {
    if (!scheme || checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      // Uses the signed-in user's own Nura profile on the backend; the answers
      // collected here override/augment it. We never claim guaranteed eligibility.
      const result = await schemesApi.checkEligibility(scheme.slug, { gender: user?.gender, ...answers });
      setEligibility(result);
      setCheckerOpen(false);

      // Persist the state to the profile so location-aware recommendations
      // work next time (best-effort — never blocks the eligibility result).
      if (answers.state && answers.state !== user?.state) {
        authApi
          .updateProfile({ state: answers.state })
          .then((updated) => updateUser(updated))
          .catch(() => {});
      }
    } catch (err) {
      alert("Couldn't check eligibility", getFriendlyErrorMessage(err));
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  };

  const primaryAction = scheme ? schemePrimaryAction(scheme.actionType, Boolean(scheme.officialUrl)) : null;

  const handlePrimaryAction = () => {
    if (!scheme) return;
    switch (primaryAction) {
      case "track":
        handleTrack();
        break;
      case "checker":
        setCheckerOpen(true);
        break;
      case "maps":
        // Open a maps search for nearby government hospitals (scoped to the
        // user's state when known). The scheme's `officialUrl` is an info page,
        // not a facility locator, so it stays on the "Official website" button.
        openUrl(governmentHospitalMapsUrl(user?.state));
        break;
      case "official":
      default:
        openUrl(scheme.officialUrl);
        break;
    }
  };

  const primaryCta = scheme
    ? primaryAction === "track" && saved
      ? { label: "Tracking · View in My applications", icon: "checkmark-circle" }
      : schemePrimaryCta(scheme.actionType, Boolean(scheme.officialUrl))
    : null;

  // Deep links back to this screen ("government-scheme-detail?id=<slug>");
  // a recipient without access still lands here and sees the locked card.
  const handleShare = async () => {
    if (!scheme) return;
    try {
      await shareWithAppLink(
        `Found this government health scheme on Nura: ${scheme.name}.`,
        `government-scheme-detail?id=${encodeURIComponent(scheme.slug || scheme._id)}`,
      );
    } catch {
      // user cancelled the share sheet — nothing to do
    }
  };

  const levelLabel = scheme
    ? scheme.governmentLevel === "central"
      ? "Central government"
      : `${scheme.state || "State"} government`
    : "";

  const showOfficial = Boolean(scheme?.officialUrl) && primaryAction !== "official";

  return (
    <>
      <ScreenHeader
        title="Scheme details"
        right={
          scheme ? (
            <HeaderIconButton icon="share-social-outline" accessibilityLabel="Share scheme" onPress={handleShare} />
          ) : null
        }
      />
      <LoadingErrorState
        loading={loading}
        error={error}
        offline={offline}
        onRetry={reload}
        loadingLabel="Loading scheme…"
        skeleton={detailSkeleton}
      >
        {scheme ? (
          <>
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28 }}
            >
              {/* Title block */}
              <SchemePills level={levelLabel} shortName={scheme.shortName} style={{ marginBottom: 10 }} />
              <Text
                accessibilityRole="header"
                style={{ fontSize: 22, lineHeight: 29, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}
              >
                {scheme.name}
              </Text>
              <Text style={{ ...SCHEME_BODY, marginTop: 8, marginBottom: 20, color: colors.foreground, fontFamily: fonts.body }}>
                {scheme.description}
              </Text>

              {scheme.benefits?.length ? (
                <SchemeSection title="What you get" icon="gift-outline">
                  {scheme.benefits.map((b, i) => (
                    <SchemeBullet key={i} text={b} />
                  ))}
                </SchemeSection>
              ) : null}

              {/* Eligibility + checker */}
              <SchemeSection title="Who can get it" icon="people-outline">
                {scheme.eligibility.map((e, i) => (
                  <SchemeBullet key={i} text={e.text} />
                ))}

                {primaryAction !== "checker" ? (
                  <SchemeSecondaryButton
                    icon="checkbox-outline"
                    label="Check if I may be eligible"
                    onPress={() => setCheckerOpen(true)}
                    loading={checking}
                    style={{ marginTop: 6 }}
                  />
                ) : null}

                {eligibility ? <EligibilityResultCard eligibility={eligibility} /> : null}
              </SchemeSection>

              {scheme.documents?.length ? (
                <SchemeSection title="Documents you need" icon="document-text-outline">
                  {scheme.documents.map((d, i) => (
                    <SchemeBullet key={i} text={d} />
                  ))}
                </SchemeSection>
              ) : null}

              <ApplicationSteps scheme={scheme} />

              {scheme.whereToGet ? (
                <SchemeSection title="Where to get it" icon="navigate-outline">
                  <Text style={{ ...SCHEME_BODY, color: colors.foreground, fontFamily: fonts.body }}>
                    {scheme.whereToGet}
                  </Text>
                </SchemeSection>
              ) : null}

              {/* Track in My applications — secondary unless it's the primary action */}
              {primaryAction !== "track" ? (
                <View style={{ marginBottom: 16 }}>
                  <SchemeSecondaryButton
                    icon={saved ? "checkmark-circle" : "bookmark-outline"}
                    label={saved ? "Tracking · View in My applications" : "Track this scheme"}
                    onPress={handleTrack}
                    loading={applying}
                  />
                  {!saved ? (
                    <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 18, fontWeight: "400", color: colors.mutedText, fontFamily: fonts.body }}>
                      {trackHelperText(scheme.actionType)}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Other ways to reach the scheme */}
              {scheme.helpline || showOfficial ? (
                <View className="flex-row" style={{ gap: 10, marginBottom: 16 }}>
                  {scheme.helpline ? (
                    <SchemeSecondaryButton
                      icon="call-outline"
                      label="Helpline"
                      accessibilityLabel={`Call helpline ${scheme.helpline}`}
                      onPress={() => Linking.openURL(`tel:${scheme.helpline?.split(/[/ ]/)[0]}`).catch(() => {})}
                      style={{ flex: 1 }}
                    />
                  ) : null}
                  {showOfficial ? (
                    <SchemeSecondaryButton
                      icon="globe-outline"
                      label="Official website"
                      onPress={() => openUrl(scheme.officialUrl)}
                      style={{ flex: 1 }}
                    />
                  ) : null}
                </View>
              ) : null}

              {/* Source + last checked + one calm disclaimer */}
              <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: "400", color: colors.mutedText, fontFamily: fonts.body }}>
                Source: {scheme.source || "Government of India"}
                {scheme.lastVerifiedAt ? ` · Last checked ${formatShortDate(scheme.lastVerifiedAt)}` : ""}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: "400", color: colors.mutedText, fontFamily: fonts.body }}>
                Scheme rules can change. The scheme office makes the final decision.
              </Text>
            </ScrollView>

            {/* Sticky primary action */}
            {primaryCta ? (
              <SchemePrimaryBar
                label={primaryCta.label}
                icon={primaryCta.icon}
                onPress={handlePrimaryAction}
                disabled={applying || checking}
                busy={applying && primaryAction === "track"}
                helperText={primaryAction === "track" && !saved ? trackHelperText(scheme.actionType) : undefined}
              />
            ) : null}
          </>
        ) : (
          <EmptyState
            icon="file-search-outline"
            title="Scheme not found"
            message="This scheme may have been removed or is no longer available."
            actionLabel="Browse schemes"
            onAction={() => router.replace("/government-schemes")}
          />
        )}
      </LoadingErrorState>

      <EligibilityCheckerSheet
        visible={checkerOpen}
        onClose={() => setCheckerOpen(false)}
        user={user}
        checking={checking}
        onSubmit={submitEligibility}
      />

      <PaywallModal {...paywall} />
    </>
  );
}
