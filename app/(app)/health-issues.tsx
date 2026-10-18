import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useTheme } from "../../components/theme";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { SkeletonBlock } from "../../components/Skeleton";
import { HEALTH_ISSUE_COLORS } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { healthIssuesApi, type HealthIssue as ApiHealthIssue, type MedicalReview } from "../../lib/api";
import { ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import {
  ArticleListSkeleton,
  ArticleRow,
  BulletList,
  ConsultNudge,
  DetailSection,
  DetailSheetHeader,
  getWellbeingTones,
  KeyPointList,
  PrivacyNote,
  WellbeingCard,
  WellbeingEmpty,
  WellbeingIntro,
  type WellbeingToneKey,
} from "../../components/wellbeing/WellbeingUI";
import { MedicalReviewBadge } from "../../components/MedicalReviewBadge";
import { pickMedicalReview } from "../../lib/medicalReview";

// --- BACKEND API LAYER SCHEMAS & CONTRACTS ---
interface HealthIssue {
  id: string;
  title: string;
  category: string;
  icon: string;
  color: string;
  summary: string;
  guide: string;
  imageUrl: string; // Remote CDN asset string for professional illustration renders
  symptoms?: string[];
  causes?: string[];
  treatment?: string;
  prevention?: string;
  whenToSeeDoctor?: string;
  review?: MedicalReview;
}

const fallbackIssues: HealthIssue[] = [
  {
    id: "hi_1",
    title: "PCOS / PCOD",
    category: "Hormonal Equilibrium",
    icon: "female-outline",
    color: "#ef4444",
    summary:
      "PCOS/PCOD can affect periods, skin, hair growth, insulin response, and energy. Tracking patterns makes it easier to discuss changes with a doctor.",
    guide:
      "1. Track cycle gaps and missed periods.\n2. Note acne, hair growth, weight, and fatigue changes.\n3. Prioritize balanced meals, movement, and sleep.\n4. Consult an endocrinologist or OBGYN for evaluation.",
    imageUrl:
      "https://images.unsplash.com/photo-1511556532299-8f662fc26c06?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: "hi_2",
    title: "Endometriosis",
    category: "Uterine & Pelvic Wellness",
    icon: "pulse-outline",
    color: "#f97316",
    summary:
      "Endometriosis can cause severe pelvic pain, painful periods, fatigue, and pain outside menstruation. Persistent pain deserves medical attention.",
    guide:
      "1. Track pain level during and outside periods.\n2. Record heavy bleeding or pain during intimacy.\n3. Use warmth and rest for short-term relief.\n4. Ask a gynecologist about imaging or treatment options.",
    imageUrl:
      "https://images.unsplash.com/photo-1551076805-e1869033e561?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: "hi_3",
    title: "Fibroids Tracker",
    category: "Structural Health",
    icon: "circle-multiple-outline",
    color: "#fbbf24",
    summary:
      "Fibroids are usually non-cancerous growths that can cause heavy bleeding, pelvic pressure, frequent urination, or fatigue.",
    guide:
      "1. Log heavy flow or bleeding between periods.\n2. Track pelvic pressure and lower back pain.\n3. Ask about iron if bleeding is heavy.\n4. Confirm size and location with medical imaging.",
    imageUrl:
      "https://images.unsplash.com/photo-1530026405186-ed1ea0ac7a63?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: "hi_4",
    title: "Pregnancy Wellness",
    category: "Maternal Milestone Care",
    icon: "human-pregnant",
    color: "#ec4899",
    summary:
      "Pregnancy support helps track early symptoms, missed periods, nausea, food changes, and care milestones.",
    guide:
      "1. Record missed periods and test dates.\n2. Track nausea, breast tenderness, and fatigue.\n3. Stay hydrated and discuss folate with a clinician.\n4. Schedule regular prenatal care if pregnancy is confirmed.",
    imageUrl:
      "https://images.unsplash.com/photo-1516627145497-ae6968895b74?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: "hi_5",
    title: "Irregular Cycle Maps",
    category: "Rhythm Diagnostics",
    icon: "calendar-outline",
    color: "#8b5cf6",
    summary:
      "Irregular cycles can be influenced by stress, sleep, travel, weight changes, hormones, or underlying conditions.",
    guide:
      "1. Track start dates for at least 3 months.\n2. Compare changes with sleep, stress, travel, or illness.\n3. Notice spotting, pain, or very heavy flow.\n4. Seek care if cycles are consistently very short, long, or absent.",
    imageUrl:
      "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: "hi_6",
    title: "Menopause Support",
    category: "Transition & Longevity",
    icon: "thermometer-outline",
    color: "#06b6d4",
    summary:
      "Menopause and perimenopause can bring hot flashes, sleep changes, mood shifts, vaginal dryness, and bone health changes.",
    guide:
      "1. Track hot flashes and night sweats.\n2. Note sleep, mood, and energy changes.\n3. Discuss calcium, vitamin D, and bone health.\n4. Ask a clinician about treatment options if symptoms disrupt daily life.",
    imageUrl:
      "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=600&auto=format&fit=crop",
  },
];

// Maps an issue's content hex tag to one of the shared wellbeing tones.
function issueToneKey(issue: Pick<HealthIssue, "color">): WellbeingToneKey {
  switch (issue.color) {
    case HEALTH_ISSUE_COLORS.red:
      return "rose";
    case HEALTH_ISSUE_COLORS.orange:
      return "amber";
    case HEALTH_ISSUE_COLORS.amber:
      return "gold";
    case HEALTH_ISSUE_COLORS.pink:
      return "rose";
    case HEALTH_ISSUE_COLORS.purple:
      return "lavender";
    default:
      return "mint";
  }
}

/** "1. Track…\n2. Note…" → ["Track…", "Note…"]; plain prose stays one item. */
function guideSteps(guide: string): string[] {
  return guide
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(\d+[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean);
}

function mapHealthIssue(issue: ApiHealthIssue): HealthIssue {
  return {
    id: issue.id ?? issue._id ?? issue.title,
    title: issue.title,
    category: issue.category,
    icon: issue.icon,
    color: issue.color,
    summary: issue.summary,
    guide: issue.guide,
    imageUrl:
      issue.imageUrl ||
      "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=600&auto=format&fit=crop",
    symptoms: issue.symptoms,
    causes: issue.causes,
    treatment: issue.treatment,
    prevention: issue.prevention,
    whenToSeeDoctor: issue.whenToSeeDoctor,
    review: pickMedicalReview(issue),
  };
}

export default function HealthIssues() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tones = getWellbeingTones(colors);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Public CMS content: cached (and kept on the device) as the raw response so a
  // revisit or cold start paints at once while it revalidates.
  const {
    data: issueResponse,
    loading: loadingIssues,
    refreshing,
    error,
    offline,
    reload,
  } = useAsyncLoad<ApiHealthIssue[]>(() => healthIssuesApi.getIssues(), [], {
    cacheKey: "healthIssues:list",
    staleMs: 5 * 60_000,
    persist: true,
  });

  const issues = useMemo(
    () =>
      !issueResponse
        ? []
        : issueResponse.length > 0
          ? issueResponse.map(mapHealthIssue)
          : fallbackIssues,
    [issueResponse],
  );

  const categoryOptions = [
    "all",
    ...Array.from(new Set(issues.map((issue) => issue.category).filter(Boolean))),
  ];
  const filteredIssues =
    selectedCategory === "all"
      ? issues
      : issues.filter((issue) => issue.category === selectedCategory);

  const selectedIssueData = issues.find(
    (issue) => issue.id === selectedIssueId,
  );
  const selectedTone = selectedIssueData ? tones[issueToneKey(selectedIssueData)] : tones.mint;

  function handleTriggerDetails(id: string) {
    setSelectedIssueId(id);
    setDetailModalVisible(true);
  }

  const metaFor = (issue: HealthIssue) =>
    [
      (issue.symptoms?.length ?? 0) > 0 ? { icon: "pulse-outline", label: `${issue.symptoms!.length} symptoms` } : null,
      { icon: "list-outline", label: `${guideSteps(issue.guide).length} care steps` },
    ].filter((m): m is { icon: string; label: string } => m !== null);

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
        <ScreenHeader title="Health Concerns" subtitle="Understand symptoms, know when to get help" />

        <LoadingErrorState
          loading={loadingIssues}
          error={error}
          offline={offline}
          onRetry={() => reload()}
          loadingLabel="Loading health concerns…"
          errorTitle="Couldn't load health concerns"
          skeleton={
            <View style={{ paddingHorizontal: 24, paddingTop: 12, gap: 16 }}>
              <SkeletonBlock width="100%" height={92} radius={24} />
              <View className="flex-row" style={{ gap: 8 }}>
                <SkeletonBlock width={56} height={34} radius={17} />
                <SkeletonBlock width={110} height={34} radius={17} />
                <SkeletonBlock width={96} height={34} radius={17} />
              </View>
              <ArticleListSkeleton rows={5} />
            </View>
          }
        >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 48 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />
          }
        >
          <View style={{ paddingHorizontal: 24 }}>
            <WellbeingIntro
              icon="medkit-outline"
              tone={tones.amber}
              title="Know your body"
              body="Plain-language guides to common conditions, and when to see a doctor."
            />
          </View>

          {/* Category filter */}
          {categoryOptions.length > 2 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
              style={{ marginTop: 20, flexGrow: 0 }}
            >
              {categoryOptions.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setSelectedCategory(cat)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    style={{
                      height: 36,
                      paddingHorizontal: 14,
                      borderRadius: 18,
                      justifyContent: "center",
                      backgroundColor: isSelected ? colors.primary : colors.surface,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.3}
                      style={{ color: isSelected ? colors.buttonText : colors.foreground, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}
                    >
                      {cat === "all" ? "All" : cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
            <SectionHeader
              title={selectedCategory === "all" ? "All topics" : selectedCategory}
              actionLabel={selectedCategory === "all" ? undefined : "Show all"}
              onAction={selectedCategory === "all" ? undefined : () => setSelectedCategory("all")}
            />
            {filteredIssues.length === 0 ? (
              <WellbeingEmpty
                icon="search-outline"
                title={issues.length === 0 ? "No guides yet" : "Nothing in this category yet"}
                message={issues.length === 0 ? "Pull down to refresh." : "Try another category."}
                actionLabel={selectedCategory === "all" ? undefined : "Show all topics"}
                onAction={selectedCategory === "all" ? undefined : () => setSelectedCategory("all")}
              />
            ) : (
              <WellbeingCard>
                {filteredIssues.map((issue, index) => (
                  <ArticleRow
                    key={issue.id}
                    first={index === 0}
                    icon={issue.icon}
                    fallbackIcon="medkit-outline"
                    tone={tones[issueToneKey(issue)]}
                    eyebrow={issue.category}
                    title={issue.title}
                    summary={issue.summary}
                    meta={metaFor(issue)}
                    onPress={() => handleTriggerDetails(issue.id)}
                  />
                ))}
              </WellbeingCard>
            )}

            <PrivacyNote
              style={{ marginTop: 22 }}
              text="General information, not a diagnosis. If something worries you, talk to a doctor."
            />
          </View>
        </ScrollView>
        </LoadingErrorState>

        {/* Issue detail */}
        <Modal
          visible={detailModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setDetailModalVisible(false)}
        >
          {selectedIssueData && (
            // Android ignores pageSheet and renders fullscreen, so SafeAreaView keeps the header clear.
            <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: colors.background }}>
              <DetailSheetHeader
                icon={selectedIssueData.icon}
                tone={selectedTone}
                eyebrow={selectedIssueData.category}
                title={selectedIssueData.title}
                onClose={() => setDetailModalVisible(false)}
              />

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: insets.bottom + 40 }}
              >
                {selectedIssueData.imageUrl ? (
                  <View style={{ height: 180, borderRadius: 22, overflow: "hidden", backgroundColor: selectedTone.bg }}>
                    <Image
                      source={{ uri: selectedIssueData.imageUrl }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                      accessibilityIgnoresInvertColors
                    />
                  </View>
                ) : null}

                <MedicalReviewBadge item={selectedIssueData.review} style={{ marginTop: selectedIssueData.imageUrl ? 14 : 0 }} />

                <Text style={{ color: colors.foreground, fontSize: 16, lineHeight: 25, fontFamily: fonts.body, marginTop: 18 }}>
                  {selectedIssueData.summary}
                </Text>

                {(selectedIssueData.symptoms?.length ?? 0) > 0 ? (
                  <DetailSection icon="pulse-outline" tone={tones.amber} title="Common symptoms">
                    <WellbeingCard style={{ padding: 16 }}>
                      <BulletList items={selectedIssueData.symptoms!} color={tones.amber.fg} />
                    </WellbeingCard>
                  </DetailSection>
                ) : null}

                {(selectedIssueData.causes?.length ?? 0) > 0 ? (
                  <DetailSection icon="git-branch-outline" tone={tones.lavender} title="Possible causes">
                    <WellbeingCard style={{ padding: 16 }}>
                      <BulletList items={selectedIssueData.causes!} color={tones.lavender.fg} />
                    </WellbeingCard>
                  </DetailSection>
                ) : null}

                {guideSteps(selectedIssueData.guide).length > 0 ? (
                  <DetailSection icon="checkmark-done-outline" tone={tones.green} title="Care guidance">
                    <KeyPointList points={guideSteps(selectedIssueData.guide)} />
                  </DetailSection>
                ) : null}

                {[
                  { label: "Treatment", icon: "medical-outline", tone: tones.sky, value: selectedIssueData.treatment },
                  { label: "Prevention", icon: "shield-checkmark-outline", tone: tones.mint, value: selectedIssueData.prevention },
                  { label: "When to see a doctor", icon: "alert-circle-outline", tone: tones.red, value: selectedIssueData.whenToSeeDoctor },
                ]
                  .filter((section) => !!section.value)
                  .map((section) => (
                    <DetailSection key={section.label} icon={section.icon} tone={section.tone} title={section.label}>
                      <WellbeingCard style={{ padding: 16 }}>
                        <Text style={{ color: colors.foreground, fontSize: 14.5, lineHeight: 22, fontFamily: fonts.body }}>{section.value}</Text>
                      </WellbeingCard>
                    </DetailSection>
                  ))}

                <ConsultNudge
                  style={{ marginTop: 28 }}
                  title="Persistent symptoms?"
                  body="Connect privately with a gynecologist who can help."
                  onPress={() => {
                    setDetailModalVisible(false);
                    router.push("/(app)/consultation" as any);
                  }}
                />
              </ScrollView>
            </SafeAreaView>
          )}
        </Modal>
      </SafeAreaView>
    </>
  );
}
