  import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { SkeletonBlock } from "../../components/Skeleton";
import { wellbeingApi, type MedicalReview, type WellbeingResource } from "../../lib/api";
import { ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import {
  ArticleListSkeleton,
  ConsultNudge,
  DetailSection,
  getWellbeingTones,
  IconCircle,
  KeyPointList,
  MediaButtons,
  MetaPill,
  PrivacyNote,
  WellbeingEmpty,
  WellbeingIntro,
  type WellbeingToneKey,
} from "../../components/wellbeing/WellbeingUI";
import { MedicalReviewBadge } from "../../components/MedicalReviewBadge";
import { pickMedicalReview } from "../../lib/medicalReview";

// Each topic's label, default icon and colour (an API resource's own icon wins when it has one).
const TOPICS: Record<HygieneItem["category"], { label: string; icon: string; tone: WellbeingToneKey }> = {
  products: { label: "Products", icon: "water-outline", tone: "rose" },
  daily: { label: "Daily care", icon: "flower-outline", tone: "mint" },
  activities: { label: "Activities", icon: "swim", tone: "sky" },
  prevention: { label: "Prevention", icon: "shield-checkmark-outline", tone: "lavender" },
};

// --- BACKEND RESPONSE MODEL SCHEMAS ---
interface HygieneItem {
  id: string;
  title: string;
  icon: string;
  iconType: "ionicons" | "feather" | "material";
  description: string;
  category: "products" | "daily" | "activities" | "prevention";
  tips: string[];
  estimatedReadTime?: number;
  videoUrl?: string;
  audioUrl?: string;
  review?: MedicalReview;
}

function mapHygieneResource(resource: WellbeingResource, index: number): HygieneItem {
  return {
    id: resource._id ?? resource.id ?? resource.title,
    title: resource.title,
    icon: resource.icon,
    iconType: "ionicons",
    description: resource.summary,
    category: inferHygieneCategory(resource.title, index),
    tips:
      resource.extendedGuide.length > 0
        ? resource.extendedGuide
        : [resource.summary],
    estimatedReadTime: resource.estimatedReadTime,
    videoUrl: resource.videoUrl,
    audioUrl: resource.audioUrl,
    review: pickMedicalReview(resource),
  };
}

function inferHygieneCategory(
  title: string,
  index: number,
): HygieneItem["category"] {
  const normalized = title.toLowerCase();
  if (normalized.includes("product") || normalized.includes("pad")) {
    return "products";
  }
  if (
    normalized.includes("bath") ||
    normalized.includes("swim") ||
    normalized.includes("movement")
  ) {
    return "activities";
  }
  if (
    normalized.includes("infection") ||
    normalized.includes("uti") ||
    normalized.includes("odor")
  ) {
    return "prevention";
  }
  if (
    normalized.includes("daily") ||
    normalized.includes("wash") ||
    normalized.includes("vulva")
  ) {
    return "daily";
  }
  return (["products", "daily", "activities", "prevention"] as const)[
    index % 4
  ];
}

export default function Hygiene() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();

  // Tab controller to filter hygiene sections gracefully
  const [activeTab, setActiveTab] =
    useState<HygieneItem["category"]>("products");

  // Dynamic Array Payloads ready for easy backend mapping
  const hygieneTips: HygieneItem[] = [
    {
      id: "h1",
      title: "Menstrual Products Management",
      icon: "water-outline",
      iconType: "ionicons",
      description:
        "Choose and change period products based on your flow and comfort.",
      category: "products",
      tips: [
        "Change pads or tampons every 4-6 hours, or sooner if flow is heavy.",
        "Menstrual cups can often be worn up to 12 hours, depending on flow and product guidance.",
        "Use breathable period underwear for light days, spotting, or backup protection.",
      ],
    },
    {
      id: "h2",
      title: "Daily Biological Hygiene",
      icon: "flower-outline",
      iconType: "ionicons",
      description:
        "Simple daily care during periods without disrupting your natural balance.",
      category: "daily",
      tips: [
        "Clean only the external vulva with lukewarm water.",
        "Avoid douching or scented intimate washes because they can disrupt pH.",
        "Change into fresh, breathable underwear when damp or uncomfortable.",
      ],
    },
    {
      id: "h3",
      title: "Bathing & Aquatic Activities",
      icon: "swim",
      iconType: "material",
      description:
        "Clean, comfortable guidance for swimming, bathing, and movement.",
      category: "activities",
      tips: [
        "Use a fresh tampon or cup before swimming if that feels right for you.",
        "Warm baths can help ease cramps and lower body tension.",
        "Dry off and change products or underwear after swimming or workouts.",
      ],
    },
    {
      id: "h4",
      title: "Systemic Infection Prevention",
      icon: "shield-check-outline",
      iconType: "material",
      description:
        "Reduce irritation, odor, UTIs, and friction during sensitive days.",
      category: "prevention",
      tips: [
        "Wipe front to back to reduce infection risk.",
        "Stay hydrated, especially if you are prone to UTIs.",
        "Avoid tight synthetic underwear when skin feels irritated.",
      ],
    },
  ];
  // Public CMS content: cached (and kept on the device) so a revisit or cold
  // start paints at once; `loading` is only true with nothing cached yet, and
  // the topic grid waits for it so the bundled tips don't flash and then swap.
  const {
    data: hygieneResources,
    loading,
    refreshing,
    error,
    reload,
  } = useAsyncLoad<WellbeingResource[]>(() => wellbeingApi.getResources("hygiene"), [], {
    cacheKey: "wellbeing:resources:hygiene",
    staleMs: 5 * 60_000,
    persist: true,
  });
  const apiHygieneTips = useMemo(
    () => (hygieneResources ?? []).map(mapHygieneResource),
    [hygieneResources],
  );
  // Fetch failures fall back to the bundled static tips below (or the last
  // copy loaded) rather than blocking the screen — the content is still
  // useful, just not the latest — so this only drives a low-key notice.
  const usingOfflineTips = error !== null;
  const onRefresh = () => reload(true);

  const tones = getWellbeingTones(colors);

  // Merge per category rather than swapping the whole list: the live API can
  // return fewer resources than there are tabs, and a wholesale swap would
  // leave tabs with no matching category blank (worse than static fallback).
  const activeResources: HygieneItem[] = (
    ["products", "daily", "activities", "prevention"] as const
  ).map(
    (category) =>
      apiHygieneTips.find((item) => item.category === category) ??
      hygieneTips.find((item) => item.category === category)!,
  );

  const currentActiveData = activeResources.find(
    (item) => item.category === activeTab,
  );

  // Reports how long the reader actually had this tab's tip open, so the
  // backend can refine its read-time average instead of relying on a static
  // admin estimate. The cleanup (fired on tab change or unmount) reports the
  // duration for the tip that was active when the effect was set up.
  useEffect(() => {
    if (!currentActiveData) return;
    const id = currentActiveData.id;
    const openedAt = Date.now();
    return () => {
      const durationSeconds = Math.round((Date.now() - openedAt) / 1000);
      wellbeingApi.trackView(id, durationSeconds).catch(() => {});
    };
    // Deliberately keyed on id only — this reports dwell time for the tip
    // that was active when the effect ran, not on every object identity
    // change from re-renders of activeResources.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentActiveData?.id]);

  const topicOrder = ["products", "daily", "activities", "prevention"] as const;
  const topicRows = [topicOrder.slice(0, 2), topicOrder.slice(2, 4)];
  const activeMeta = currentActiveData
    ? [
        currentActiveData.estimatedReadTime ? { icon: "time-outline", label: `${currentActiveData.estimatedReadTime} min read` } : null,
        { icon: "list-outline", label: `${currentActiveData.tips.length} ${currentActiveData.tips.length === 1 ? "tip" : "tips"}` },
      ].filter((m): m is { icon: string; label: string } => m !== null)
    : [];

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
      >
        <ScreenHeader title="Hygiene & Care" subtitle="Gentle, practical period care" />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 48 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {usingOfflineTips && (
            <View
              className="flex-row items-center"
              style={{ gap: 8, marginBottom: 14, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: colors.surfaceSoft }}
            >
              <Ionicons name="cloud-offline-outline" size={16} color={colors.mutedText} />
              <Text style={{ flex: 1, color: colors.mutedText, fontSize: 13, lineHeight: 18, fontFamily: fonts.body }}>
                Showing saved tips. Pull down to get the latest.
              </Text>
            </View>
          )}

          <WellbeingIntro
            icon="water-outline"
            tone={tones.sky}
            title="Care that fits your flow"
            body="Pick a topic for simple, doctor-reviewed hygiene tips."
          />

          {/* 2x2 topic grid: tap a card to switch the active topic */}
          <SectionHeader title="Topics" style={{ marginTop: 28 }} />
          {loading ? (
            <View style={{ gap: 12 }}>
              {[0, 1].map((row) => (
                <View key={row} className="flex-row" style={{ gap: 12 }}>
                  <SkeletonBlock width="48%" height={138} radius={22} />
                  <SkeletonBlock width="48%" height={138} radius={22} />
                </View>
              ))}
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {topicRows.map((row, rowIndex) => (
                <View key={rowIndex} className="flex-row" style={{ gap: 12 }}>
                  {row.map((id) => {
                    const item = activeResources.find((r) => r.category === id);
                    if (!item) return <View key={id} style={{ flex: 1 }} />;
                    const topic = TOPICS[id];
                    const tone = tones[topic.tone];
                    const isSelected = activeTab === id;
                    return (
                      <TouchableOpacity
                        key={id}
                        onPress={() => setActiveTab(id)}
                        activeOpacity={0.85}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`${topic.label}: ${item.title}`}
                        style={{
                          flex: 1,
                          borderRadius: 22,
                          padding: 16,
                          backgroundColor: isSelected ? tone.bg : colors.surface,
                          borderWidth: 1.5,
                          borderColor: isSelected ? tone.fg : colors.border,
                          ...(isSelected ? null : getShadow(colors, isDark)),
                        }}
                      >
                        <View className="flex-row items-start justify-between">
                          <IconCircle icon={item.icon} fallback={topic.icon} tone={tone} size={42} solid={isSelected} />
                          {isSelected ? <Ionicons name="checkmark-circle" size={20} color={tone.fg} /> : null}
                        </View>
                        <Text
                          numberOfLines={1}
                          maxFontSizeMultiplier={1.3}
                          style={{ color: tone.fg, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", fontFamily: fonts.body, marginTop: 12 }}
                        >
                          {topic.label}
                        </Text>
                        <Text
                          numberOfLines={2}
                          maxFontSizeMultiplier={1.3}
                          style={{ flexShrink: 1, color: colors.foreground, fontSize: 14.5, lineHeight: 20, fontWeight: "700", fontFamily: fonts.heading, marginTop: 2 }}
                        >
                          {item.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          {/* The active topic, as a readable article */}
          {loading ? (
            <View style={{ marginTop: 28 }}>
              <ArticleListSkeleton rows={3} />
            </View>
          ) : currentActiveData ? (
            <View style={{ marginTop: 28 }}>
              <Text
                accessibilityRole="header"
                numberOfLines={2}
                style={{ color: colors.foreground, fontSize: 19, lineHeight: 25, fontWeight: "800", letterSpacing: -0.2, fontFamily: fonts.heading }}
              >
                {currentActiveData.title}
              </Text>
              <View className="flex-row flex-wrap" style={{ gap: 6, marginTop: 8 }}>
                {activeMeta.map((m) => (
                  <MetaPill key={m.label} icon={m.icon} label={m.label} />
                ))}
              </View>
              <MedicalReviewBadge item={currentActiveData.review} style={{ marginTop: 10 }} />
              <Text style={{ color: colors.foreground, opacity: 0.85, fontSize: 15, lineHeight: 23, fontFamily: fonts.body, marginTop: 12 }}>
                {currentActiveData.description}
              </Text>

              <MediaButtons videoUrl={currentActiveData.videoUrl} audioUrl={currentActiveData.audioUrl} style={{ marginTop: 16 }} />

              <DetailSection icon="checkmark-done-outline" tone={tones.green} title="Care checklist">
                {currentActiveData.tips.length > 0 ? (
                  <KeyPointList points={currentActiveData.tips} />
                ) : (
                  <WellbeingEmpty icon="list-outline" title="No tips here yet" message="Check back soon, or pick another topic." />
                )}
              </DetailSection>
            </View>
          ) : (
            <View style={{ marginTop: 28 }}>
              <WellbeingEmpty icon="water-outline" title="No hygiene guides yet" message="Pull down to refresh." />
            </View>
          )}

          <ConsultNudge
            style={{ marginTop: 28 }}
            title="Rash, itching or unusual odour?"
            body="Talk privately with a gynecologist if it lasts or gets worse."
            onPress={() => router.push("/(app)/consultation" as any)}
          />

          <PrivacyNote style={{ marginTop: 22 }} text="Gentle reminders, zero judgement. General guidance, not a diagnosis." />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
