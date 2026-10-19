import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { AppModalHost } from "../../components/modals/AppModalHost";
import { useTheme } from "../../components/theme";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { SkeletonBlock } from "../../components/Skeleton";
import { HEALTH_ISSUE_COLORS } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { healthIssuesApi, type HealthIssue as ApiHealthIssue, type MedicalReview } from "../../lib/api";
import { ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import { FilterChips } from "../../components/FilterChips";
import { SearchBar } from "../../components/SearchBar";
import {
  ArticleListSkeleton,
  ArticleRow,
  BulletList,
  ConsultNudge,
  DetailSection,
  DetailSheetHeader,
  DoctorCallout,
  getWellbeingTones,
  KeyPointList,
  PrivacyNote,
  WellbeingCard,
  WellbeingEmpty,
  WellbeingGlyph,
  WellbeingIntro,
  type WellbeingToneKey,
} from "../../components/wellbeing/WellbeingUI";
import { MedicalReviewBadge } from "../../components/MedicalReviewBadge";
import { pickMedicalReview } from "../../lib/medicalReview";
import { Icon } from "../../components/Icon";

// --- BACKEND API LAYER SCHEMAS & CONTRACTS ---
interface HealthIssue {
  id: string;
  title: string;
  category: string;
  icon: string;
  color: string;
  summary: string;
  guide: string;
  imageUrl: string; // CMS cover image; "" = none (the detail sheet shows a tinted icon header instead)
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
    category: "Hormones",
    icon: "female-outline",
    color: "#ef4444",
    summary:
      "PCOS/PCOD (a common hormone condition) can affect your periods, skin, hair growth, energy and how your body handles sugar. Tracking changes makes it easier to talk to a doctor.",
    guide:
      "1. Track gaps between periods and any missed periods.\n2. Note acne, extra hair growth, weight and tiredness.\n3. Eat regular, balanced meals, stay active and sleep well.\n4. See a gynaecologist or a hormone doctor (endocrinologist) to get checked.",
    imageUrl: "",
  },
  {
    id: "hi_2",
    title: "Endometriosis",
    category: "Uterus & ovaries",
    icon: "pulse-outline",
    color: "#f97316",
    summary:
      "Endometriosis (tissue like the womb lining growing outside the womb) can cause strong pelvic pain, painful periods, tiredness and pain between periods. Pain that keeps coming back needs a doctor.",
    guide:
      "1. Track how bad the pain is, during and between periods.\n2. Note heavy bleeding or pain during sex.\n3. A hot water bag and rest can help for a short time.\n4. Ask a gynaecologist about scans and treatment.",
    imageUrl: "",
  },
  {
    id: "hi_3",
    title: "Fibroids",
    category: "Uterus & ovaries",
    icon: "circle-multiple-outline",
    color: "#fbbf24",
    summary:
      "Fibroids are lumps in the womb that are usually not cancer. They can cause heavy bleeding, pressure low in the tummy, peeing often, or tiredness.",
    guide:
      "1. Log heavy flow or bleeding between periods.\n2. Track pressure low in your tummy and lower back pain.\n3. Ask your doctor about iron if your bleeding is heavy.\n4. A scan (ultrasound) shows their size and where they are.",
    imageUrl: "",
  },
  {
    id: "hi_4",
    title: "Pregnancy",
    category: "Pregnancy",
    icon: "human-pregnant",
    color: "#ec4899",
    summary:
      "Track early signs like a missed period, nausea, food changes and tiredness, and keep up with your check-ups.",
    guide:
      "1. Note missed periods and the dates you took a test.\n2. Track nausea, sore breasts and tiredness.\n3. Drink enough water and ask a doctor about folic acid.\n4. Go for regular pregnancy check-ups once it's confirmed.",
    imageUrl: "",
  },
  {
    id: "hi_5",
    title: "Irregular periods",
    category: "Periods & cycles",
    icon: "calendar-outline",
    color: "#8b5cf6",
    summary:
      "Periods can come early, late or not at all because of stress, sleep, travel, weight changes, hormones or a health condition.",
    guide:
      "1. Track your period start dates for at least 3 months.\n2. Compare changes with sleep, stress, travel or illness.\n3. Notice spotting, pain or very heavy flow.\n4. See a doctor if your cycles are often very short, very long, or stop.",
    imageUrl: "",
  },
  {
    id: "hi_6",
    title: "Menopause",
    category: "Menopause",
    icon: "thermometer-outline",
    color: "#06b6d4",
    summary:
      "Menopause and the years before it (perimenopause) can bring hot flashes, poor sleep, mood changes, vaginal dryness and weaker bones.",
    guide:
      "1. Track hot flashes and night sweats.\n2. Note changes in sleep, mood and energy.\n3. Ask about calcium, vitamin D and bone health.\n4. Ask a doctor about treatment if symptoms get in the way of daily life.",
    imageUrl: "",
  },
];

// Older CMS entries were seeded with the same jargon labels the bundled list
// used to have; show them in plain words. Anything else is shown as written.
const PLAIN_LABELS: Record<string, string> = {
  "Hormonal Equilibrium": "Hormones",
  "Uterine & Pelvic Wellness": "Uterus & ovaries",
  "Structural Health": "Uterus & ovaries",
  "Maternal Milestone Care": "Pregnancy",
  "Rhythm Diagnostics": "Periods & cycles",
  "Transition & Longevity": "Menopause",
  "Fibroids Tracker": "Fibroids",
  "Pregnancy Wellness": "Pregnancy",
  "Irregular Cycle Maps": "Irregular periods",
  "Menopause Support": "Menopause",
};
const plainLabel = (label: string) => PLAIN_LABELS[label?.trim()] ?? label;

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
    title: plainLabel(issue.title),
    category: plainLabel(issue.category),
    icon: issue.icon,
    color: issue.color,
    summary: issue.summary,
    guide: issue.guide,
    imageUrl: issue.imageUrl || "",
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
  const [query, setQuery] = useState("");

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
  // A failed pull-to-refresh with a list already on screen keeps the list and
  // shows a small notice; the full error state is only for "nothing to show".
  const showingSaved = !!error && !!issueResponse;

  const categoryOptions = useMemo(
    () => [
      { key: "all", label: "All" },
      ...Array.from(new Set(issues.map((issue) => issue.category).filter(Boolean))).map((cat) => ({ key: cat, label: cat })),
    ],
    [issues],
  );
  const activeCategory = categoryOptions.some((o) => o.key === selectedCategory) ? selectedCategory : "all";
  const needle = query.trim().toLowerCase();
  const filteredIssues = issues.filter(
    (issue) =>
      (activeCategory === "all" || issue.category === activeCategory) &&
      (!needle || issue.title.toLowerCase().includes(needle) || issue.summary.toLowerCase().includes(needle)),
  );

  const selectedIssueData = issues.find(
    (issue) => issue.id === selectedIssueId,
  );
  const selectedTone = selectedIssueData ? tones[issueToneKey(selectedIssueData)] : tones.mint;
  const selectedSteps = selectedIssueData ? guideSteps(selectedIssueData.guide) : [];

  function handleTriggerDetails(id: string) {
    setSelectedIssueId(id);
    setDetailModalVisible(true);
  }

  function resetFilters() {
    setQuery("");
    setSelectedCategory("all");
  }

  const metaFor = (issue: HealthIssue) =>
    [
      (issue.symptoms?.length ?? 0) > 0 ? { icon: "pulse-outline", label: `${issue.symptoms!.length} symptoms` } : null,
      { icon: "list-outline", label: `${guideSteps(issue.guide).length} care steps` },
    ].filter((m): m is { icon: string; label: string } => m !== null);

  const listTitle = needle ? "Search results" : activeCategory === "all" ? "All topics" : activeCategory;
  const listSubtitle = `${filteredIssues.length} ${filteredIssues.length === 1 ? "condition" : "conditions"}`;

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
          error={showingSaved ? null : error}
          offline={offline}
          onRetry={() => reload()}
          loadingLabel="Loading health concerns…"
          errorTitle="Couldn't load health concerns"
          skeleton={
            <View style={{ paddingHorizontal: 24, paddingTop: 12, gap: 16 }}>
              <SkeletonBlock width="100%" height={92} radius={24} />
              <SkeletonBlock width="100%" height={48} radius={16} />
              <View className="flex-row" style={{ gap: 8 }}>
                <SkeletonBlock width={56} height={36} radius={18} />
                <SkeletonBlock width={110} height={36} radius={18} />
                <SkeletonBlock width={96} height={36} radius={18} />
              </View>
              <ArticleListSkeleton rows={5} />
            </View>
          }
        >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 48 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />
          }
        >
          <View style={{ paddingHorizontal: 24 }}>
            {showingSaved ? (
              <View
                className="flex-row items-center"
                style={{ gap: 8, marginBottom: 14, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: colors.surfaceSoft }}
              >
                <Icon set="ion" name="cloud-offline-outline" size={16} color={colors.mutedText} />
                <Text style={{ flex: 1, color: colors.mutedText, fontSize: 13, lineHeight: 18, fontWeight: "500", fontFamily: fonts.body }}>
                  Showing saved guides. Pull down to refresh.
                </Text>
              </View>
            ) : null}

            <WellbeingIntro
              icon="medkit-outline"
              tone={tones.amber}
              title="Know your body"
              body="Plain-language guides to common conditions, and when to see a doctor."
            />

            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder="Search conditions or symptoms"
              style={{ marginTop: 20 }}
            />
          </View>

          {/* Category filter */}
          {categoryOptions.length > 2 ? (
            <FilterChips
              options={categoryOptions}
              value={activeCategory}
              onChange={setSelectedCategory}
              gutter={24}
              style={{ marginTop: 14, flexGrow: 0 }}
            />
          ) : null}

          <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
            <SectionHeader
              title={listTitle}
              subtitle={issues.length > 0 ? listSubtitle : undefined}
              actionLabel={activeCategory === "all" && !needle ? undefined : "Show all"}
              onAction={activeCategory === "all" && !needle ? undefined : resetFilters}
            />
            {filteredIssues.length === 0 ? (
              <WellbeingEmpty
                icon="search-outline"
                title={issues.length === 0 ? "No guides yet" : needle ? "No matching conditions" : "Nothing in this category yet"}
                message={issues.length === 0 ? "Pull down to refresh." : needle ? "Try a different word, like \"pain\" or \"periods\"." : "Try another category."}
                actionLabel={issues.length === 0 ? "Refresh" : "Show all topics"}
                onAction={issues.length === 0 ? () => reload(true) : resetFilters}
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
                {/* Hero: the CMS image when there is one, else a tinted header in the condition's tone (never a stock photo). */}
                {selectedIssueData.imageUrl ? (
                  <View style={{ aspectRatio: 16 / 9, borderRadius: 24, overflow: "hidden", backgroundColor: selectedTone.bg }}>
                    <Image
                      source={{ uri: selectedIssueData.imageUrl }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                      accessibilityIgnoresInvertColors
                    />
                  </View>
                ) : (
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={{ height: 112, borderRadius: 24, backgroundColor: selectedTone.bg, alignItems: "center", justifyContent: "center" }}
                  >
                    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
                      <WellbeingGlyph name={selectedIssueData.icon} size={30} color={selectedTone.fg} fallback="medkit-outline" />
                    </View>
                  </View>
                )}

                <MedicalReviewBadge item={selectedIssueData.review} style={{ marginTop: 14 }} />

                <Text style={{ color: colors.foreground, fontSize: 16, lineHeight: 26, fontWeight: "400", fontFamily: fonts.body, marginTop: 16 }}>
                  {selectedIssueData.summary}
                </Text>

                {selectedIssueData.whenToSeeDoctor ? (
                  <DoctorCallout body={selectedIssueData.whenToSeeDoctor} style={{ marginTop: 18 }} />
                ) : null}

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

                {selectedSteps.length > 0 ? (
                  <DetailSection icon="checkmark-done-outline" tone={tones.green} title="What you can do">
                    <KeyPointList points={selectedSteps} />
                  </DetailSection>
                ) : null}

                {[
                  { label: "Treatment", icon: "medical-outline", tone: tones.sky, value: selectedIssueData.treatment },
                  { label: "Prevention", icon: "shield-checkmark-outline", tone: tones.mint, value: selectedIssueData.prevention },
                ]
                  .filter((section) => !!section.value)
                  .map((section) => (
                    <DetailSection key={section.label} icon={section.icon} tone={section.tone} title={section.label}>
                      <WellbeingCard style={{ padding: 16 }}>
                        <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 23, fontWeight: "400", fontFamily: fonts.body }}>{section.value}</Text>
                      </WellbeingCard>
                    </DetailSection>
                  ))}

                <PrivacyNote style={{ marginTop: 24 }} text="General information, not a diagnosis. A doctor can advise on your situation." />

                <ConsultNudge
                  style={{ marginTop: 20 }}
                  title="Symptoms that won't go away?"
                  body="Talk privately with a gynaecologist who can help."
                  onPress={() => {
                    setDetailModalVisible(false);
                    router.push("/(app)/consultation" as any);
                  }}
                />
              </ScrollView>
            </SafeAreaView>
          )}
          {detailModalVisible ? <AppModalHost inline /> : null}
        </Modal>
      </SafeAreaView>
    </>
  );
}
