import { Feather, Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { ScreenHeader } from "../../components/ScreenHeader";
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
  SCHEME_ACTION_CTA,
  governmentHospitalMapsUrl,
} from "../../lib/schemeHelpers";

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  const { colors, fonts, isDark } = useTheme();
  return (
    <View
      className="rounded-2xl p-4 mb-3"
      style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
    >
      <View className="flex-row items-center mb-2.5">
        <Ionicons name={icon} size={16} color={colors.primary} />
        <Text
          className="text-sm font-black ml-2"
          style={{ color: colors.foreground, fontFamily: fonts.heading }}
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
    <View className="flex-row mb-1.5">
      <Text style={{ color: colors.primary }}>•</Text>
      <Text
        className="text-xs ml-2 flex-1"
        style={{ color: colors.mutedText, fontFamily: fonts.body }}
      >
        {text}
      </Text>
    </View>
  );
}

export default function GovernmentSchemeDetail() {
  const insets = useSafeAreaInsets();
  const { colors, fonts, isDark } = useTheme();
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const softTints = getSoftTints(colors);
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, loading, error, offline, reload } = useAsyncLoad(
    () => schemesApi.getById(String(id)),
    [id],
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
  // Whole-screen gate, same key the Apply action already uses — reached
  // directly via a deep link (share, notification) can otherwise bypass the
  // list screen's own gate, so this screen re-checks independently.
  const locked = !subscriptionLoading && !hasAccess("government_scheme_applications");
  // Distinguishes "paywall opened just because the screen is locked" (do
  // nothing extra once purchased — the screen unlocks on its own once
  // useSubscriptionAccess refreshes) from "paywall opened because Apply was
  // tapped" (retry the apply once purchased, same as before this screen was
  // gated on entry too).
  const [unlockShouldApply, setUnlockShouldApply] = useState(false);

  useEffect(() => {
    if (locked) setPaywallVisible(true);
  }, [locked]);

  // Interactive eligibility checker inputs (seeded from the user's profile).
  const [checkerOpen, setCheckerOpen] = useState(false);
  const [ageInput, setAgeInput] = useState("");
  const [pregnantInput, setPregnantInput] = useState<boolean | null>(null);
  const [stateInput, setStateInput] = useState("");

  // Detect whether this scheme is already tracked in My Applications —
  // re-checked when applications change (e.g. one removed on the My
  // Applications screen pushed from here).
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
    if (!user) return setCheckerOpen(true);
    if (user.dateOfBirth) {
      const age = Math.floor(
        (Date.now() - new Date(user.dateOfBirth).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000),
      );
      if (Number.isFinite(age) && age > 0) setAgeInput(String(age));
    }
    if (user.state) setStateInput(user.state);
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
        res.alreadyExists ? "Already saved" : "Saved to My Applications",
        res.alreadyExists
          ? "This scheme is already in My Applications, where you can track it."
          : "We've saved this so you can track it. Complete the official steps to finish.",
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

  const handleApply = () => {
    if (!hasAccess("government_scheme_applications")) {
      setUnlockShouldApply(true);
      setPaywallVisible(true);
      return;
    }
    submitApplication();
  };

  const handlePrimaryAction = () => {
    if (!scheme) return;
    switch (scheme.actionType) {
      case "APPLY":
        handleApply();
        break;
      case "CHECK_ELIGIBILITY":
        openChecker();
        break;
      case "FIND_FACILITY":
        // Open a maps search for nearby government hospitals (scoped to the
        // user's state when known). The scheme's `officialUrl` is an info page,
        // not a facility locator, so it stays on the "Official Website" button.
        openUrl(governmentHospitalMapsUrl(user?.state));
        break;
      case "EXTERNAL_APPLICATION":
      case "LEARN_MORE":
      default:
        openUrl(scheme.officialUrl);
        break;
    }
  };

  const actionConfig = scheme ? SCHEME_ACTION_CTA[scheme.actionType] : null;

  // Deep links back to this screen ("government-scheme-detail?id=<slug>");
  // a recipient without access still lands here and sees the paywall above.
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

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScreenHeader
        title="Scheme Details"
        right={
          scheme ? (
            <TouchableOpacity
              onPress={handleShare}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Share scheme"
              className="w-9 h-9 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
            >
              <Feather name="share-2" size={17} color={colors.foreground} />
            </TouchableOpacity>
          ) : null
        }
      />
      <LoadingErrorState
        // Also wait on the subscription check — otherwise the real scheme
        // content can render for a frame before `locked` flips true and
        // swaps it for the paywall, flashing paid data at a locked user.
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
            <SkeletonBlock width="100%" height={52} radius={16} />
          </View>
        }
      >
        {scheme ? (
          locked ? (
            <View className="flex-1 items-center justify-center px-6">
              <LockedFeatureCard
                title={scheme.name}
                description="Unlock to see details and apply."
                onPress={() => setPaywallVisible(true)}
              />
            </View>
          ) : (
          <>
            <ScrollView
              className="flex-1 mt-4"
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
            >
              {/* Title block */}
              <View className="flex-row items-center flex-wrap gap-1.5 mb-2">
                <View
                  className="px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: softTints.lavender }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{ color: colors.accentText, fontFamily: fonts.body }}
                  >
                    {scheme.governmentLevel === "central"
                      ? "Central Government"
                      : `${scheme.state} Government`}
                  </Text>
                </View>
                {scheme.shortName ? (
                  <View
                    className="px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: softTints.amber }}
                  >
                    <Text
                      className="text-xs font-bold"
                      style={{ color: colors.warning, fontFamily: fonts.mono }}
                    >
                      {scheme.shortName}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text
                className="text-xl font-black"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                {scheme.name}
              </Text>
              <Text
                className="text-sm mt-2 mb-4"
                style={{ color: colors.mutedText, fontFamily: fonts.body }}
              >
                {scheme.description}
              </Text>

              {scheme.benefits?.length ? (
                <Section title="Benefits" icon="gift-outline">
                  {scheme.benefits.map((b, i) => (
                    <Bullet key={i} text={b} />
                  ))}
                </Section>
              ) : null}

              {/* Eligibility + checker */}
              <Section title="Eligibility" icon="people-outline">
                {scheme.eligibility.map((e, i) => (
                  <Bullet key={i} text={e.text} />
                ))}

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={openChecker}
                  disabled={checking}
                  className="mt-2 flex-row items-center justify-center rounded-xl py-2.5"
                  style={{ backgroundColor: softTints.pink }}
                >
                  {checking ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Ionicons
                        name="sparkles-outline"
                        size={15}
                        color={colors.primary}
                      />
                      <Text
                        className="text-xs font-bold ml-1.5"
                        style={{ color: colors.primary, fontFamily: fonts.body }}
                      >
                        Check if I may be eligible
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {eligibility ? (
                  <View
                    className="mt-3 rounded-xl p-3"
                    style={{
                      backgroundColor:
                        eligibility.status === "may_be_eligible"
                          ? softTints.emerald
                          : softTints.danger,
                    }}
                  >
                    <View className="flex-row items-center mb-1">
                      <Ionicons
                        name={
                          eligibility.status === "may_be_eligible"
                            ? "checkmark-circle"
                            : "information-circle"
                        }
                        size={16}
                        color={
                          eligibility.status === "may_be_eligible"
                            ? colors.success
                            : colors.danger
                        }
                      />
                      <Text
                        className="text-xs font-black ml-1.5"
                        style={{
                          color:
                            eligibility.status === "may_be_eligible"
                              ? colors.success
                              : colors.danger,
                          fontFamily: fonts.heading,
                        }}
                      >
                        {eligibility.status === "may_be_eligible"
                          ? "You may be eligible"
                          : "You may not meet all criteria"}
                      </Text>
                    </View>
                    <Text
                      className="text-xs"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                    >
                      {eligibility.message}
                    </Text>
                  </View>
                ) : null}
              </Section>

              {scheme.documents?.length ? (
                <Section title="Documents Required" icon="document-text-outline">
                  {scheme.documents.map((d, i) => (
                    <Bullet key={i} text={d} />
                  ))}
                </Section>
              ) : null}

              {scheme.applicationMethod ? (
                <Section title="How to Apply / Access" icon="clipboard-outline">
                  <Text
                    className="text-xs mb-2"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    {scheme.applicationMethod}
                  </Text>
                  {scheme.applicationSteps?.map((s, i) => (
                    <View key={i} className="flex-row mb-2">
                      <View
                        className="w-5 h-5 rounded-full items-center justify-center mr-2"
                        style={{ backgroundColor: softTints.pink }}
                      >
                        <Text
                          className="text-[11.5px] font-bold"
                          style={{ color: colors.primary, fontFamily: fonts.mono }}
                        >
                          {i + 1}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text
                          className="text-xs font-bold"
                          style={{
                            color: colors.foreground,
                            fontFamily: fonts.body,
                          }}
                        >
                          {s.title}
                        </Text>
                        {s.detail ? (
                          <Text
                            className="text-xs"
                            style={{
                              color: colors.mutedText,
                              fontFamily: fonts.body,
                            }}
                          >
                            {s.detail}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </Section>
              ) : null}

              {scheme.whereToGet ? (
                <Section title="Where to Get It" icon="navigate-outline">
                  <Text
                    className="text-xs"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    {scheme.whereToGet}
                  </Text>
                </Section>
              ) : null}

              {/* Save/track for schemes whose primary CTA isn't already Apply */}
              {scheme.actionType !== "APPLY" ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => (saved ? router.push("/scheme-applications") : handleApply())}
                  disabled={applying}
                  className="flex-row items-center justify-center rounded-xl py-2.5 mb-3"
                  style={{ backgroundColor: softTints.pink }}
                >
                  {applying ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Ionicons
                        name={saved ? "checkmark-circle" : "bookmark-outline"}
                        size={15}
                        color={colors.primary}
                      />
                      <Text
                        className="text-xs font-bold ml-1.5"
                        style={{ color: colors.primary, fontFamily: fonts.body }}
                      >
                        {saved ? "Saved — View in My Applications" : "Save to My Applications"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}

              {/* Secondary actions */}
              <View className="flex-row gap-2 mb-3">
                {scheme.helpline ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() =>
                      Linking.openURL(
                        `tel:${scheme.helpline?.split(/[/ ]/)[0]}`,
                      ).catch(() => {})
                    }
                    className="flex-1 flex-row items-center justify-center rounded-xl py-2.5"
                    style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
                  >
                    <Ionicons name="call-outline" size={14} color={colors.primary} />
                    <Text
                      className="text-xs font-bold ml-1.5"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                    >
                      Helpline
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {scheme.officialUrl ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => openUrl(scheme.officialUrl)}
                    className="flex-1 flex-row items-center justify-center rounded-xl py-2.5"
                    style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
                  >
                    <Ionicons name="globe-outline" size={14} color={colors.primary} />
                    <Text
                      className="text-xs font-bold ml-1.5"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                    >
                      Official Website
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Source + verification */}
              <View className="flex-row items-start mt-1 mb-2">
                <Ionicons
                  name="shield-checkmark-outline"
                  size={13}
                  color={colors.mutedText}
                  style={{ marginTop: 1 }}
                />
                <Text
                  className="text-xs ml-1.5 flex-1"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  Source: {scheme.source || "Government of India"}
                  {scheme.lastVerifiedAt
                    ? ` · Verified ${formatShortDate(scheme.lastVerifiedAt)}`
                    : ""}
                </Text>
              </View>
            </ScrollView>

            {/* Sticky primary action */}
            {actionConfig ? (
              <View
                className="px-6 pt-3 pb-5 border-t"
                style={{ borderColor: colors.border, backgroundColor: colors.background }}
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handlePrimaryAction}
                  disabled={applying}
                  className="flex-row items-center justify-center rounded-2xl py-3.5"
                  style={{ backgroundColor: colors.primary }}
                >
                  {applying ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons
                        name={actionConfig.icon as keyof typeof Ionicons.glyphMap}
                        size={18}
                        color="#fff"
                      />
                      <Text
                        className="text-sm font-black ml-2"
                        style={{ color: "#fff", fontFamily: fonts.heading }}
                      >
                        {actionConfig.label}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
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
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
        >
          <View
            className="rounded-t-3xl px-6 pt-5"
            style={{ backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 12) + 20 }}
          >
            <View className="flex-row items-center justify-between mb-1">
              <Text
                className="text-lg font-black"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                Check eligibility
              </Text>
              <TouchableOpacity onPress={() => setCheckerOpen(false)}>
                <Ionicons name="close" size={22} color={colors.mutedText} />
              </TouchableOpacity>
            </View>
            <Text
              className="text-xs mb-4"
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              Answer a few questions for a better estimate. This is only guidance — the
              official authority confirms eligibility.
            </Text>

            {/* Age */}
            <Text
              className="text-xs font-bold mb-1.5"
              style={{ color: colors.foreground, fontFamily: fonts.body }}
            >
              Your age
            </Text>
            <TextInput
              value={ageInput}
              onChangeText={(t) => setAgeInput(t.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              placeholder="e.g. 24"
              placeholderTextColor={colors.mutedText}
              className="rounded-xl px-3.5 h-11 text-sm mb-4"
              style={{
                backgroundColor: colors.surface,
                color: colors.foreground,
                fontFamily: fonts.body,
                ...getShadow(colors, isDark),
              }}
            />

            {/* Pregnant */}
            <Text
              className="text-xs font-bold mb-1.5"
              style={{ color: colors.foreground, fontFamily: fonts.body }}
            >
              Are you currently pregnant?
            </Text>
            <View className="flex-row gap-2 mb-4">
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
                    className="flex-1 items-center rounded-xl py-2.5"
                    style={{
                      backgroundColor: active ? colors.primary : colors.surface,
                      ...getShadow(colors, isDark),
                    }}
                  >
                    <Text
                      className="text-xs font-bold"
                      style={{
                        color: active ? "#fff" : colors.mutedText,
                        fontFamily: fonts.body,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* State */}
            <Text
              className="text-xs font-bold mb-1.5"
              style={{ color: colors.foreground, fontFamily: fonts.body }}
            >
              Your state / UT
            </Text>
            <TextInput
              value={stateInput}
              onChangeText={setStateInput}
              placeholder="e.g. Rajasthan"
              placeholderTextColor={colors.mutedText}
              className="rounded-xl px-3.5 h-11 text-sm mb-5"
              style={{
                backgroundColor: colors.surface,
                color: colors.foreground,
                fontFamily: fonts.body,
                ...getShadow(colors, isDark),
              }}
            />

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={submitEligibility}
              disabled={checking}
              className="items-center justify-center rounded-2xl py-3.5"
              style={{ backgroundColor: colors.primary }}
            >
              {checking ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text
                  className="text-sm font-black"
                  style={{ color: "#fff", fontFamily: fonts.heading }}
                >
                  See my result
                </Text>
              )}
            </TouchableOpacity>
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
