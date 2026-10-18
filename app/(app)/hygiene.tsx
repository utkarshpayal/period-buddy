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
  ArticleRow,
  ConsultNudge,
  DetailSection,
  getWellbeingTones,
  IconCircle,
  KeyPointList,
  MediaButtons,
  MetaPill,
  PrivacyNote,
  WellbeingCard,
  WellbeingEmpty,
  WellbeingIntro,
  type WellbeingToneKey,
} from "../../components/wellbeing/WellbeingUI";
import { MedicalReviewBadge } from "../../components/MedicalReviewBadge";
import { pickMedicalReview } from "../../lib/medicalReview";

type HygieneCategory = "products" | "daily" | "activities" | "prevention" | "more";

// Each topic's label, default icon and colour (an API resource's own icon wins when it has one).
// "more" holds CMS tips whose title doesn't clearly belong to one of the four topics.
const TOPICS: Record<HygieneCategory, { label: string; icon: string; tone: WellbeingToneKey }> = {
  products: { label: "Products", icon: "water-outline", tone: "rose" },
  daily: { label: "Daily care", icon: "flower-outline", tone: "mint" },
  activities: { label: "Activities", icon: "swim", tone: "sky" },
  prevention: { label: "Prevention", icon: "shield-checkmark-outline", tone: "lavender" },
  more: { label: "More tips", icon: "sparkles-outline", tone: "amber" },
};

const MAIN_TOPICS = ["products", "daily", "activities", "prevention"] as const;
const TOPIC_ROWS = [MAIN_TOPICS.slice(0, 2), MAIN_TOPICS.slice(2, 4)];

// --- BACKEND RESPONSE MODEL SCHEMAS ---
interface HygieneItem {
  id: string;
  title: string;
  icon: string;
  iconType: "ionicons" | "feather" | "material";
  description: string;
  category: HygieneCategory;
  tips: string[];
  estimatedReadTime?: number;
  videoUrl?: string;
  audioUrl?: string;
  review?: MedicalReview;
}

function mapHygieneResource(resource: WellbeingResource): HygieneItem {
  return {
    id: resource._id ?? resource.id ?? resource.title,
    title: resource.title,
    icon: resource.icon,
    iconType: "ionicons",
    description: resource.summary,
    category: inferHygieneCategory(resource.title),
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

// Whole-word starts (\b), so "uti" can't match "routine" or "pad" "spade".
const CATEGORY_KEYWORDS: [Exclude<HygieneCategory, "more">, RegExp][] = [
  ["products", /\b(products?|pads?|tampons?|(menstrual )?cups?|sanitary|period underwear|disposal)\b/],
  ["activities", /\b(bath\w*|swim\w*|movement|exercis\w*|workouts?|sports?|travel\w*)\b/],
  ["prevention", /\b(infections?|utis?|odou?rs?|itch\w*|rash\w*|yeast|prevent\w*)\b/],
  ["daily", /\b(daily|everyday|wash\w*|vulva|underwear|clean\w*)\b/],
];

/**
 * Topic from the CMS title's keywords. No confident match → "more", never a
 * guessed topic (a mislabelled tip under the wrong card reads as an error).
 */
function inferHygieneCategory(title: string): HygieneCategory {
  const normalized = title.toLowerCase();
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(normalized)) return category;
  }
  return "more";
}

// Bundled tips: shown for any topic the CMS has nothing for (and offline on a
// first launch). Plain words, no review stamp: these aren't doctor-reviewed.
const BUNDLED_TIPS: HygieneItem[] = [
  {
    id: "h1",
    title: "Period products",
    icon: "water-outline",
    iconType: "ionicons",
    description:
      "Choose and change period products based on your flow and comfort.",
    category: "products",
    tips: [
      "Change pads every 4–6 hours, or sooner if full.",
      "Use the lowest-absorbency tampon you need. Change it every 4–8 hours and never leave one in more than 8 hours.",
      "Empty menstrual cups at least every 12 hours.",
      "Sudden high fever, rash, vomiting or dizziness while using a tampon or cup? Remove it and get medical help right away.",
      "Use breathable period underwear for light days, spotting, or backup protection.",
    ],
  },
  {
    id: "h2",
    title: "Everyday care",
    icon: "flower-outline",
    iconType: "ionicons",
    description:
      "Simple daily care during your period that keeps your body's natural balance.",
    category: "daily",
    tips: [
      "Wash only the outside (the vulva) with lukewarm water. The vagina cleans itself.",
      "Skip douching and scented intimate washes. They can upset your natural balance (pH) and cause itching.",
      "Change into fresh cotton underwear when it feels damp or uncomfortable.",
    ],
  },
  {
    id: "h3",
    title: "Bathing & swimming",
    icon: "swim",
    iconType: "material",
    description:
      "Staying clean and comfortable when you bathe, swim or exercise.",
    category: "activities",
    tips: [
      "Use a fresh tampon or cup before swimming if that feels right for you.",
      "A warm bath can help ease cramps and relax your body.",
      "Dry off and change your product or underwear after swimming or a workout.",
    ],
  },
  {
    id: "h4",
    title: "Avoiding infections",
    icon: "shield-check-outline",
    iconType: "material",
    description:
      "Lower the chance of itching, odour and UTIs (urine infections) on sensitive days.",
    category: "prevention",
    tips: [
      "Wipe from front to back after using the toilet.",
      "Drink plenty of water, especially if you get UTIs often.",
      "Choose loose cotton underwear when your skin feels irritated.",
    ],
  },
];

export default function Hygiene() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();

  // Which topic is open, and which of its tips (null = the first one).
  const [activeTab, setActiveTab] = useState<HygieneCategory>("products");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  // Every CMS tip shows under its topic. A topic the CMS has nothing for falls
  // back to its bundled tip, so no topic card is ever empty; "more" only
  // exists when the CMS has tips that match no topic.
  const itemsByTopic = useMemo(() => {
    const map = {} as Record<HygieneCategory, HygieneItem[]>;
    (Object.keys(TOPICS) as HygieneCategory[]).forEach((topic) => {
      const fromCms = apiHygieneTips.filter((item) => item.category === topic);
      map[topic] = fromCms.length > 0 ? fromCms : BUNDLED_TIPS.filter((item) => item.category === topic);
    });
    return map;
  }, [apiHygieneTips]);
  const hasMoreTips = itemsByTopic.more.length > 0;
  const currentTab: HygieneCategory = activeTab === "more" && !hasMoreTips ? "products" : activeTab;
  const topicItems = itemsByTopic[currentTab];
  const currentActiveData = topicItems.find((item) => item.id === selectedId) ?? topicItems[0];

  function selectTopic(topic: HygieneCategory) {
    setActiveTab(topic);
    setSelectedId(null);
  }

  // Reports how long the reader actually had this tip open, so the backend
  // can refine its read-time average instead of relying on a static admin
  // estimate. The cleanup (fired on tip/tab change or unmount) reports the
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
    // change from re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentActiveData?.id]);

  const metaFor = (item: HygieneItem) =>
    [
      item.estimatedReadTime ? { icon: "time-outline", label: `${item.estimatedReadTime} min read` } : null,
      { icon: "list-outline", label: `${item.tips.length} ${item.tips.length === 1 ? "tip" : "tips"}` },
      item.videoUrl ? { icon: "play-circle-outline", label: "Video" } : null,
    ].filter((m): m is { icon: string; label: string } => m !== null);
  const activeTopic = TOPICS[currentTab];
  const activeTone = tones[activeTopic.tone];

  const renderTopicCard = (id: HygieneCategory) => {
    const items = itemsByTopic[id];
    const topic = TOPICS[id];
    const tone = tones[topic.tone];
    const isSelected = currentTab === id;
    const subtitle = items.length > 1 ? `${items.length} guides` : items[0]?.title ?? "";
    return (
      <TouchableOpacity
        key={id}
        onPress={() => selectTopic(id)}
        activeOpacity={0.85}
        accessibilityRole="tab"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={`${topic.label}: ${subtitle}`}
        style={{
          flex: 1,
          borderRadius: 24,
          padding: 16,
          backgroundColor: isSelected ? tone.bg : colors.surface,
          borderWidth: isSelected ? 1.5 : 1,
          borderColor: isSelected ? tone.fg : colors.border,
          ...(isSelected ? null : getShadow(colors, isDark)),
        }}
      >
        <View className="flex-row items-start justify-between">
          <IconCircle icon={items[0]?.icon} fallback={topic.icon} tone={tone} size={42} solid={isSelected} />
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
          style={{ flexShrink: 1, color: colors.foreground, fontSize: 15, lineHeight: 21, fontWeight: "700", fontFamily: fonts.heading, marginTop: 2 }}
        >
          {subtitle}
        </Text>
      </TouchableOpacity>
    );
  };

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
          {usingOfflineTips && !loading && (
            <View
              className="flex-row items-center"
              style={{ gap: 8, marginBottom: 14, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: colors.surfaceSoft }}
            >
              <Ionicons name="cloud-offline-outline" size={16} color={colors.mutedText} />
              <Text style={{ flex: 1, color: colors.mutedText, fontSize: 13, lineHeight: 18, fontWeight: "500", fontFamily: fonts.body }}>
                Showing saved tips. Pull down to refresh.
              </Text>
            </View>
          )}

          <WellbeingIntro
            icon="water-outline"
            tone={tones.sky}
            title="Care that fits your flow"
            body="Pick a topic for simple, safe hygiene tips."
          />

          {/* 2x2 topic grid (+ a full-width "More tips" card when the CMS has unmatched tips) */}
          <SectionHeader title="Topics" style={{ marginTop: 28 }} />
          {loading ? (
            <View style={{ gap: 12 }}>
              {[0, 1].map((row) => (
                <View key={row} className="flex-row" style={{ gap: 12 }}>
                  <SkeletonBlock width="48%" height={138} radius={24} />
                  <SkeletonBlock width="48%" height={138} radius={24} />
                </View>
              ))}
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {TOPIC_ROWS.map((row, rowIndex) => (
                <View key={rowIndex} className="flex-row" style={{ gap: 12 }}>
                  {row.map(renderTopicCard)}
                </View>
              ))}
              {hasMoreTips ? <View className="flex-row">{renderTopicCard("more")}</View> : null}
            </View>
          )}

          {/* The active topic: its tips as rows (when there are several), then the open one as a readable article */}
          {loading ? (
            <View style={{ marginTop: 28 }}>
              <ArticleListSkeleton rows={3} />
            </View>
          ) : currentActiveData ? (
            <View style={{ marginTop: 28 }}>
              {topicItems.length > 1 ? (
                <>
                  <SectionHeader title={activeTopic.label} subtitle={`${topicItems.length} guides · tap one to read it`} />
                  <WellbeingCard style={{ padding: 4, marginBottom: 24 }}>
                    {topicItems.map((item, index) => (
                      <ArticleRow
                        key={item.id}
                        first={index === 0}
                        icon={item.icon}
                        fallbackIcon={activeTopic.icon}
                        tone={activeTone}
                        title={item.title}
                        summary={item.description}
                        selected={item.id === currentActiveData.id}
                        onPress={() => setSelectedId(item.id)}
                      />
                    ))}
                  </WellbeingCard>
                </>
              ) : null}

              <Text
                accessibilityRole="header"
                numberOfLines={3}
                maxFontSizeMultiplier={1.4}
                style={{ color: colors.foreground, fontSize: 22, lineHeight: 28, fontWeight: "800", letterSpacing: -0.2, fontFamily: fonts.heading }}
              >
                {currentActiveData.title}
              </Text>
              <View className="flex-row flex-wrap" style={{ gap: 6, marginTop: 8 }}>
                {metaFor(currentActiveData).map((m) => (
                  <MetaPill key={m.label} icon={m.icon} label={m.label} />
                ))}
              </View>
              <MedicalReviewBadge item={currentActiveData.review} style={{ marginTop: 10 }} />
              <Text style={{ color: colors.foreground, fontSize: 16, lineHeight: 26, fontWeight: "400", fontFamily: fonts.body, marginTop: 12 }}>
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
              <WellbeingEmpty
                icon="water-outline"
                title="No tips in this topic yet"
                message="Try another topic."
                actionLabel="Show period products"
                onAction={() => selectTopic("products")}
              />
            </View>
          )}

          <ConsultNudge
            style={{ marginTop: 28 }}
            title="Rash, itching or unusual odour?"
            body="Talk privately with a gynaecologist if it lasts or gets worse."
            onPress={() => router.push("/(app)/consultation" as any)}
          />

          <PrivacyNote style={{ marginTop: 22 }} text="Gentle reminders, zero judgement. General guidance, not a diagnosis." />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
