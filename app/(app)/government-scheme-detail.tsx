import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { SkeletonBlock, SkeletonCard } from "../../components/Skeleton";
import { HeaderIconButton, ScreenHeader } from "../../components/ScreenHeader";
import { useAuth } from "../../components/auth-context";
import { useTheme } from "../../components/theme";
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { useDataRefresh } from "../../hooks/useDataRefresh";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { LockedFeatureCard } from "../../components/subscription/LockedFeatureCard";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import { alert } from "../../lib/alert";
import { formatShortDate } from "../../lib/format";
import { shareWithAppLink } from "../../lib/share";
import {
  authApi,
  getFriendlyErrorMessage,
  isFeatureLockedError,
  schemeApplicationsApi,
  schemesApi,
  type GovernmentBenefit,
  type SchemeEligibilityResult,
} from "../../lib/api";
import {
  canonicalStateName,
  filterIndianStates,
  governmentHospitalMapsUrl,
  schemePrimaryAction,
  schemePrimaryCta,
  trackHelperText,
} from "../../lib/schemeHelpers";

type IconName = keyof typeof Ionicons.glyphMap;

const BODY = { fontSize: 15, lineHeight: 22, fontWeight: "400" } as const;

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  const { colors, fonts, isDark } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 24,
        padding: 18,
        marginBottom: 16,
        ...getShadow(colors, isDark),
      }}
    >
      <View className="flex-row items-center" style={{ gap: 8, marginBottom: 10 }}>
        <Ionicons name={icon} size={18} color={colors.primaryDark} />
        <Text
          accessibilityRole="header"
          style={{ flexShrink: 1, fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}
        >
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View className="flex-row" style={{ marginBottom: 8, gap: 10 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 8, backgroundColor: colors.primary }} />
      <Text style={{ ...BODY, flex: 1, color: colors.foreground, fontFamily: fonts.body }}>
        {text}
      </Text>
    </View>
  );
}

/** Secondary button: primaryLight fill, primaryDark text, 48px tall. */
function SecondaryButton({
  icon,
  label,
  onPress,
  loading,
  disabled,
  accessibilityLabel,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: object;
}) {
  const { colors, fonts } = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      className="flex-row items-center justify-center"
      style={[{ minHeight: 48, borderRadius: 16, paddingHorizontal: 14, gap: 8, backgroundColor: colors.primaryLight }, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.primaryDark} />
      ) : (
        <>
          <Ionicons name={icon} size={18} color={colors.primaryDark} />
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={{ flexShrink: 1, fontSize: 15, fontWeight: "700", color: colors.primaryDark, fontFamily: fonts.body }}
          >
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export default function GovernmentSchemeDetail() {
  const insets = useSafeAreaInsets();
  const { colors, fonts } = useTheme();
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const softTints = getSoftTints(colors);
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, loading, error, offline, reload } = useAsyncLoad(
    () => schemesApi.getById(String(id)),
    [id],
    { cacheKey: `schemes:detail:${id}`, staleMs: 5 * 60_000 },
  );
  const scheme: GovernmentBenefit | undefined = data?.scheme;

  const [eligibility, setEligibility] = useState<SchemeEligibilityResult | null>(
    null,
  );
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [saved, setSaved] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const {
    hasAccess,
    isLoading: subscriptionLoading,
    refresh: refreshSubscriptionAccess,
  } = useSubscriptionAccess();
  // Whole-screen gate, same key the Track action already uses — reached
  // directly via a deep link (share, notification) can otherwise bypass the
  // list screen's own gate, so this screen re-checks independently. A locked
  // user sees the locked card; the paywall opens only when they tap it.
  const locked = !subscriptionLoading && !hasAccess("government_scheme_applications");
  // Distinguishes "paywall opened from the locked card" (do nothing extra
  // once purchased — the screen unlocks on its own once useSubscriptionAccess
  // refreshes) from "paywall opened because Track was tapped" (retry the save
  // once purchased).
  const [unlockShouldApply, setUnlockShouldApply] = useState(false);

  // Interactive eligibility checker inputs (seeded from the user's profile).
  const [checkerOpen, setCheckerOpen] = useState(false);
  const [ageInput, setAgeInput] = useState("");
  const [pregnantInput, setPregnantInput] = useState<boolean | null>(null);
  const [stateInput, setStateInput] = useState("");
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [stateQuery, setStateQuery] = useState("");
  const stateMatches = useMemo(() => filterIndianStates(stateQuery), [stateQuery]);

  // Detect whether this scheme is already tracked in My applications —
  // re-checked when applications change (e.g. one removed on the My
  // applications screen pushed from here).
  const [applicationsVersion, setApplicationsVersion] = useState(0);
  useDataRefresh(["schemeApplications"], () => setApplicationsVersion((v) => v + 1));
  useEffect(() => {
    let mounted = true;
    if (!scheme) return;
    schemeApplicationsApi
      .list({ limit: 50 })
      .then((res) => {
        if (!mounted) return;
        const exists = res.applications.some((a) => {
          const sid = typeof a.schemeId === "object" ? a.schemeId?._id : a.schemeId;
          return sid === scheme._id;
        });
        setSaved(exists);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [scheme, applicationsVersion]);

  const openUrl = (url?: string) => {
    if (!url) {
      alert("Not available", "No official link is available for this scheme.");
      return;
    }
    Linking.openURL(url).catch(() =>
      alert("Couldn't open link", "Please try again later."),
    );
  };

  // Open the interactive checker, seeding fields from the user's profile.
  const openChecker = () => {
    setStatePickerOpen(false);
    setStateQuery("");
    if (!user) return setCheckerOpen(true);
    if (user.dateOfBirth) {
      const age = Math.floor(
        (Date.now() - new Date(user.dateOfBirth).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000),
      );
      if (Number.isFinite(age) && age > 0) setAgeInput(String(age));
    }
    if (user.state) setStateInput(canonicalStateName(user.state));
    setCheckerOpen(true);
  };

  const submitEligibility = async () => {
    if (!scheme) return;
    try {
      setChecking(true);
      const parsedAge = Number(ageInput);
      // Uses the signed-in user's own Nura profile on the backend; the answers
      // collected here override/augment it. We never claim guaranteed eligibility.
      const result = await schemesApi.checkEligibility(scheme.slug, {
        gender: user?.gender,
        age: ageInput && Number.isFinite(parsedAge) ? parsedAge : undefined,
        isPregnant: pregnantInput ?? undefined,
        state: stateInput.trim() || undefined,
      });
      setEligibility(result);
      setCheckerOpen(false);

      // Persist the state to the profile so location-aware recommendations
      // work next time (best-effort — never blocks the eligibility result).
      const nextState = stateInput.trim();
      if (nextState && nextState !== user?.state) {
        authApi
          .updateProfile({ state: nextState })
          .then((updated) => updateUser(updated))
          .catch(() => {});
      }
    } catch (err) {
      alert("Couldn't check eligibility", getFriendlyErrorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const submitApplication = async () => {
    if (!scheme) return;
    try {
      setApplying(true);
      const res = await schemeApplicationsApi.create({ schemeId: scheme._id });
      setSaved(true);
      alert(
        res.alreadyExists ? "Already tracking" : "Saved to My applications",
        res.alreadyExists
          ? "This scheme is already in My applications, where you can follow up."
          : "You can follow up from My applications. To apply, finish the official steps.",
        [
          { text: "View", onPress: () => router.push("/scheme-applications") },
          { text: "Done", style: "cancel" },
        ],
      );
    } catch (err) {
      if (isFeatureLockedError(err)) {
        setUnlockShouldApply(true);
        setPaywallVisible(true);
      } else {
        alert("Couldn't save", getFriendlyErrorMessage(err));
      }
    } finally {
      setApplying(false);
    }
  };

  // Subscription gate on the save/track action (the server can still 402).
  const handleApply = () => {
    if (!hasAccess("government_scheme_applications")) {
      setUnlockShouldApply(true);
      setPaywallVisible(true);
      return;
    }
    submitApplication();
  };

  const handleTrack = () => (saved ? router.push("/scheme-applications") : handleApply());

  const primaryAction = scheme
    ? schemePrimaryAction(scheme.actionType, Boolean(scheme.officialUrl))
    : null;

  const handlePrimaryAction = () => {
    if (!scheme) return;
    switch (primaryAction) {
      case "track":
        handleTrack();
        break;
      case "checker":
        openChecker();
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

  const mayBeEligible = eligibility?.status === "may_be_eligible";
  const levelLabel = scheme
    ? scheme.governmentLevel === "central"
      ? "Central government"
      : `${scheme.state || "State"} government`
    : "";

  const pillText = {
    fontSize: 13,
    fontWeight: "700",
    color: colors.foreground,
    fontFamily: fonts.body,
  } as const;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScreenHeader
        title="Scheme details"
        right={
          scheme && !locked ? (
            <HeaderIconButton
              icon="share-social-outline"
              accessibilityLabel="Share scheme"
              onPress={handleShare}
            />
          ) : null
        }
      />
      <LoadingErrorState
        // Also wait on the subscription check — otherwise the real scheme
        // content can render for a frame before `locked` flips true and
        // swaps it for the locked card, flashing paid data at a locked user.
        loading={loading || subscriptionLoading}
        error={error}
        offline={offline}
        onRetry={reload}
        loadingLabel="Loading scheme…"
        skeleton={
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
        }
      >
        {scheme ? (
          locked ? (
            <View className="flex-1 items-center justify-center px-6">
              <LockedFeatureCard
                title={scheme.name}
                description="Unlock to see the details and track this scheme."
                onPress={() => setPaywallVisible(true)}
              />
            </View>
          ) : (
          <>
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28 }}
            >
              {/* Title block */}
              <View className="flex-row items-center flex-wrap" style={{ gap: 6, marginBottom: 10 }}>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: softTints.lavender }}>
                  <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={pillText}>
                    {levelLabel}
                  </Text>
                </View>
                {scheme.shortName ? (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: softTints.amber }}>
                    <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={pillText}>
                      {scheme.shortName}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text
                accessibilityRole="header"
                style={{ fontSize: 22, lineHeight: 29, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}
              >
                {scheme.name}
              </Text>
              <Text style={{ ...BODY, marginTop: 8, marginBottom: 20, color: colors.foreground, fontFamily: fonts.body }}>
                {scheme.description}
              </Text>

              {scheme.benefits?.length ? (
                <Section title="What you get" icon="gift-outline">
                  {scheme.benefits.map((b, i) => (
                    <Bullet key={i} text={b} />
                  ))}
                </Section>
              ) : null}

              {/* Eligibility + checker */}
              <Section title="Who can get it" icon="people-outline">
                {scheme.eligibility.map((e, i) => (
                  <Bullet key={i} text={e.text} />
                ))}

                {primaryAction !== "checker" ? (
                  <SecondaryButton
                    icon="checkbox-outline"
                    label="Check if I may be eligible"
                    onPress={openChecker}
                    loading={checking}
                    style={{ marginTop: 6 }}
                  />
                ) : null}

                {eligibility ? (
                  <View
                    accessibilityLiveRegion="polite"
                    style={{
                      marginTop: 12,
                      borderRadius: 16,
                      padding: 14,
                      backgroundColor: mayBeEligible ? softTints.emerald : softTints.amber,
                    }}
                  >
                    <View className="flex-row items-center" style={{ gap: 8, marginBottom: 4 }}>
                      <Ionicons
                        name={mayBeEligible ? "checkmark-circle" : "information-circle"}
                        size={18}
                        color={mayBeEligible ? colors.success : colors.warning}
                      />
                      <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>
                        {mayBeEligible ? "You may be eligible" : "You may not meet all the rules"}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "400", color: colors.foreground, fontFamily: fonts.body }}>
                      {eligibility.message}
                    </Text>
                    {!mayBeEligible && eligibility.unmetCriteria?.length ? (
                      <View style={{ marginTop: 8 }}>
                        {eligibility.unmetCriteria.map((c, i) => (
                          <Text
                            key={i}
                            style={{ fontSize: 14, lineHeight: 20, fontWeight: "400", color: colors.foreground, fontFamily: fonts.body }}
                          >
                            • {c}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    <Text style={{ marginTop: 8, fontSize: 13, lineHeight: 18, fontWeight: "400", color: colors.mutedText, fontFamily: fonts.body }}>
                      Only the scheme office can confirm if you qualify.
                    </Text>
                  </View>
                ) : null}
              </Section>

              {scheme.documents?.length ? (
                <Section title="Documents you need" icon="document-text-outline">
                  {scheme.documents.map((d, i) => (
                    <Bullet key={i} text={d} />
                  ))}
                </Section>
              ) : null}

              {scheme.applicationMethod || scheme.applicationSteps?.length ? (
                <Section title="How to apply or get it" icon="clipboard-outline">
                  {scheme.applicationMethod ? (
                    <Text style={{ ...BODY, marginBottom: 12, color: colors.foreground, fontFamily: fonts.body }}>
                      {scheme.applicationMethod}
                    </Text>
                  ) : null}
                  {scheme.applicationSteps?.map((s, i) => (
                    <View key={i} className="flex-row" style={{ gap: 12, marginBottom: 12 }}>
                      <View
                        className="items-center justify-center"
                        style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: softTints.pink }}
                      >
                        <Text
                          maxFontSizeMultiplier={1.3}
                          style={{ fontSize: 13, fontWeight: "700", color: colors.primaryDark, fontFamily: fonts.mono }}
                        >
                          {i + 1}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                          {s.title}
                        </Text>
                        {s.detail ? (
                          <Text style={{ ...BODY, color: colors.foreground, fontFamily: fonts.body }}>
                            {s.detail}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </Section>
              ) : null}

              {scheme.whereToGet ? (
                <Section title="Where to get it" icon="navigate-outline">
                  <Text style={{ ...BODY, color: colors.foreground, fontFamily: fonts.body }}>
                    {scheme.whereToGet}
                  </Text>
                </Section>
              ) : null}

              {/* Track in My applications — secondary unless it's the primary action */}
              {primaryAction !== "track" ? (
                <View style={{ marginBottom: 16 }}>
                  <SecondaryButton
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
              {(() => {
                const showOfficial = Boolean(scheme.officialUrl) && primaryAction !== "official";
                if (!scheme.helpline && !showOfficial) return null;
                return (
                  <View className="flex-row" style={{ gap: 10, marginBottom: 16 }}>
                    {scheme.helpline ? (
                      <SecondaryButton
                        icon="call-outline"
                        label="Helpline"
                        accessibilityLabel={`Call helpline ${scheme.helpline}`}
                        onPress={() =>
                          Linking.openURL(`tel:${scheme.helpline?.split(/[/ ]/)[0]}`).catch(() => {})
                        }
                        style={{ flex: 1 }}
                      />
                    ) : null}
                    {showOfficial ? (
                      <SecondaryButton
                        icon="globe-outline"
                        label="Official website"
                        onPress={() => openUrl(scheme.officialUrl)}
                        style={{ flex: 1 }}
                      />
                    ) : null}
                  </View>
                );
              })()}

              {/* Source + last checked + one calm disclaimer */}
              <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: "400", color: colors.mutedText, fontFamily: fonts.body }}>
                Source: {scheme.source || "Government of India"}
                {scheme.lastVerifiedAt
                  ? ` · Last checked ${formatShortDate(scheme.lastVerifiedAt)}`
                  : ""}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: "400", color: colors.mutedText, fontFamily: fonts.body }}>
                Scheme rules can change. The scheme office makes the final decision.
              </Text>
            </ScrollView>

            {/* Sticky primary action */}
            {primaryCta ? (
              <View
                style={{
                  paddingHorizontal: 24,
                  paddingTop: 12,
                  paddingBottom: 16,
                  borderTopWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                }}
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handlePrimaryAction}
                  disabled={applying || checking}
                  accessibilityRole="button"
                  accessibilityLabel={primaryCta.label}
                  accessibilityState={{ disabled: applying || checking, busy: applying }}
                  className="flex-row items-center justify-center"
                  style={{ height: 48, borderRadius: 16, gap: 8, paddingHorizontal: 16, backgroundColor: colors.primary }}
                >
                  {applying && primaryAction === "track" ? (
                    <ActivityIndicator size="small" color={colors.buttonText} />
                  ) : (
                    <>
                      <Ionicons name={primaryCta.icon as IconName} size={18} color={colors.buttonText} />
                      <Text
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.3}
                        style={{ flexShrink: 1, fontSize: 15, fontWeight: "700", color: colors.buttonText, fontFamily: fonts.heading }}
                      >
                        {primaryCta.label}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                {primaryAction === "track" && !saved ? (
                  <Text
                    style={{ marginTop: 6, textAlign: "center", fontSize: 13, lineHeight: 18, fontWeight: "400", color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    {trackHelperText(scheme.actionType)}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </>
          )
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

      {/* Interactive eligibility checker */}
      <Modal
        visible={checkerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCheckerOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 justify-end"
          style={{ backgroundColor: colors.overlay }}
        >
          <View
            style={{
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: 24,
              paddingTop: 16,
              maxHeight: "92%",
              backgroundColor: colors.background,
              paddingBottom: Math.max(insets.bottom, 12) + 16,
            }}
          >
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
                <Text
                  accessibilityRole="header"
                  style={{ flexShrink: 1, fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}
                >
                  Check if you may be eligible
                </Text>
                <TouchableOpacity
                  onPress={() => setCheckerOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  className="items-center justify-center"
                  style={{ width: 44, height: 44, borderRadius: 22, marginRight: -10 }}
                >
                  <Ionicons name="close" size={24} color={colors.foreground} />
                </TouchableOpacity>
              </View>
              <Text style={{ marginBottom: 18, fontSize: 14, lineHeight: 20, fontWeight: "400", color: colors.foreground, fontFamily: fonts.body }}>
                Answer a few questions for a better guess. Only the scheme office can confirm it.
              </Text>

              {/* Age */}
              <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                Your age
              </Text>
              <TextInput
                value={ageInput}
                onChangeText={(t) => setAgeInput(t.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                placeholder="e.g. 24"
                placeholderTextColor={colors.mutedText}
                accessibilityLabel="Your age"
                maxLength={3}
                maxFontSizeMultiplier={1.4}
                style={{
                  height: 48,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: 14,
                  marginBottom: 18,
                  fontSize: 15,
                  backgroundColor: colors.surface,
                  color: colors.foreground,
                  fontFamily: fonts.body,
                }}
              />

              {/* Pregnant */}
              <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                Are you pregnant right now?
              </Text>
              <View className="flex-row" style={{ gap: 10, marginBottom: 18 }}>
                {[
                  { label: "Yes", value: true },
                  { label: "No", value: false },
                ].map((opt) => {
                  const active = pregnantInput === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      activeOpacity={0.8}
                      onPress={() => setPregnantInput(active ? null : opt.value)}
                      accessibilityRole="button"
                      accessibilityLabel={opt.label}
                      accessibilityState={{ selected: active }}
                      className="flex-1 items-center justify-center"
                      style={{
                        height: 48,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary : colors.surface,
                      }}
                    >
                      <Text
                        maxFontSizeMultiplier={1.3}
                        style={{ fontSize: 15, fontWeight: "700", color: active ? colors.buttonText : colors.foreground, fontFamily: fonts.body }}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* State picker */}
              <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                Your state or UT
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setStatePickerOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={stateInput ? `Your state: ${stateInput}. Change` : "Choose your state"}
                accessibilityState={{ expanded: statePickerOpen }}
                className="flex-row items-center"
                style={{
                  height: 48,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: statePickerOpen ? colors.primary : colors.border,
                  paddingHorizontal: 14,
                  gap: 8,
                  backgroundColor: colors.surface,
                }}
              >
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.4}
                  style={{ flex: 1, fontSize: 15, fontWeight: "400", color: stateInput ? colors.foreground : colors.mutedText, fontFamily: fonts.body }}
                >
                  {stateInput || "Choose your state"}
                </Text>
                <Ionicons name={statePickerOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedText} />
              </TouchableOpacity>
              {statePickerOpen ? (
                <View
                  style={{
                    marginTop: 8,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    overflow: "hidden",
                  }}
                >
                  <TextInput
                    value={stateQuery}
                    onChangeText={setStateQuery}
                    placeholder="Search states"
                    placeholderTextColor={colors.mutedText}
                    accessibilityLabel="Search states"
                    autoCorrect={false}
                    maxFontSizeMultiplier={1.4}
                    style={{
                      height: 44,
                      paddingHorizontal: 14,
                      fontSize: 15,
                      borderBottomWidth: 1,
                      borderColor: colors.border,
                      color: colors.foreground,
                      fontFamily: fonts.body,
                    }}
                  />
                  <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {stateMatches.length === 0 ? (
                      <Text style={{ padding: 14, fontSize: 14, fontWeight: "400", color: colors.mutedText, fontFamily: fonts.body }}>
                        No state matches “{stateQuery.trim()}”.
                      </Text>
                    ) : (
                      stateMatches.map((name) => {
                        const selected = name === stateInput;
                        return (
                          <TouchableOpacity
                            key={name}
                            activeOpacity={0.7}
                            onPress={() => {
                              setStateInput(name);
                              setStatePickerOpen(false);
                              setStateQuery("");
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={name}
                            accessibilityState={{ selected }}
                            className="flex-row items-center"
                            style={{
                              minHeight: 44,
                              paddingHorizontal: 14,
                              gap: 8,
                              backgroundColor: selected ? colors.primaryLight : "transparent",
                            }}
                          >
                            <Text
                              numberOfLines={2}
                              style={{ flex: 1, fontSize: 15, fontWeight: selected ? "700" : "400", color: selected ? colors.primaryDark : colors.foreground, fontFamily: fonts.body }}
                            >
                              {name}
                            </Text>
                            {selected ? <Ionicons name="checkmark" size={18} color={colors.primaryDark} /> : null}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={submitEligibility}
                disabled={checking}
                accessibilityRole="button"
                accessibilityLabel="See my result"
                accessibilityState={{ disabled: checking, busy: checking }}
                className="items-center justify-center"
                style={{ marginTop: 22, height: 48, borderRadius: 16, backgroundColor: colors.primary }}
              >
                {checking ? (
                  <ActivityIndicator size="small" color={colors.buttonText} />
                ) : (
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={{ fontSize: 15, fontWeight: "700", color: colors.buttonText, fontFamily: fonts.heading }}
                  >
                    See my result
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => {
          setPaywallVisible(false);
          setUnlockShouldApply(false);
        }}
        featureKey="government_scheme_applications"
        onUnlocked={() => {
          refreshSubscriptionAccess();
          if (unlockShouldApply) {
            setUnlockShouldApply(false);
            submitApplication();
          }
        }}
      />
    </SafeAreaView>
  );
}
