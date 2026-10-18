import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import { useTheme } from "../../components/theme";
import { SkeletonBlock } from "../../components/Skeleton";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { wellbeingApi, type MedicalReview, type WellbeingGameDeck, type WellbeingResource } from "../../lib/api";
import { ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import {
  ArticleListSkeleton,
  ArticleRow,
  ConsultNudge,
  DetailSection,
  DetailSheetHeader,
  getWellbeingTones,
  IconCircle,
  KeyPointList,
  MediaButtons,
  MetaPill,
  PrivacyNote,
  TONE_ROTATION,
  WellbeingCard,
  WellbeingEmpty,
  WellbeingIntro,
} from "../../components/wellbeing/WellbeingUI";
import { MedicalReviewBadge } from "../../components/MedicalReviewBadge";
import { pickMedicalReview } from "../../lib/medicalReview";

interface ResourceCategory {
  id: string;
  title: string;
  icon: string;
  color: string;
  items: number;
  summary: string;
  extendedGuide: string[]; // the "What to know" list in the detail sheet
  estimatedReadTime?: number;
  videoUrl?: string;
  audioUrl?: string;
  review?: MedicalReview;
}

type PositionCard = {
  focus: string;
  name: string;
  tip: string;
};

type PositionCardLike = Partial<PositionCard> & {
  question?: unknown;
  text?: unknown;
};

const fallbackSparkCards = [
  "What is one small, non-physical gesture that always makes you feel deeply loved or secure by me?",
  "If we could try any brand new couple's habit or routine together this month, what would it be?",
  "What's a clean or easy boundary you want to talk about regarding intimacy during heavy period flows?",
  "Describe your absolute favorite memory of a cozy, relaxed night spent together.",
];

const fallbackPositionCards: PositionCard[] = [
  {
    name: "The Mission Comfort",
    focus: "Comfort, closeness, and lower pressure",
    tip: "Use a soft pillow under the hips if it reduces pelvic pressure. Pause or change position if anything feels uncomfortable.",
  },
  {
    name: "The Lotus Variant",
    focus: "Closeness and easy pacing",
    tip: "A relaxed seated posture can make pacing easier and allow either partner to slow down whenever needed.",
  },
  {
    name: "The Side Spoon Wrap",
    focus: "Low pressure and low effort",
    tip: "Side-lying can feel easier on crampy or tired days because it reduces pressure and body weight.",
  },
];

function normalizeTextCard(card: unknown, fallback: string) {
  if (typeof card === "string") return card;
  if (card && typeof card === "object") {
    const objectCard = card as PositionCardLike;
    if (typeof objectCard.text === "string") return objectCard.text;
    if (typeof objectCard.question === "string") return objectCard.question;
    if (typeof objectCard.tip === "string") return objectCard.tip;
    if (typeof objectCard.name === "string") return objectCard.name;
  }
  return fallback;
}

function normalizePositionCard(card: unknown, index: number): PositionCard {
  if (card && typeof card === "object") {
    const objectCard = card as PositionCardLike;
    return {
      name:
        typeof objectCard.name === "string"
          ? objectCard.name
          : `Comfort Card ${index + 1}`,
      focus:
        typeof objectCard.focus === "string"
          ? objectCard.focus
          : "Comfort, consent, and communication",
      tip:
        typeof objectCard.tip === "string"
          ? objectCard.tip
          : normalizeTextCard(
            card,
            "Pause, check comfort, and choose what feels safe for both people.",
          ),
    };
  }

  return {
    name: `Comfort Card ${index + 1}`,
    focus: "Comfort, consent, and communication",
    tip: normalizeTextCard(
      card,
      "Pause, check comfort, and choose what feels safe for both people.",
    ),
  };
}

export default function SexualWellbeing() {
  const { colors, isDark, fonts } = useTheme();
  const { earnTokens } = useAppState();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tones = getWellbeingTones(colors);

  // Which card deck is open inline, if any.
  const [activeGameMode, setActiveGameMode] = useState<"none" | "spark" | "positions">("none");
  const [currentPromptIdx, setCurrentPromptIdx] = useState(0);
  const [currentPositionIdx, setCurrentPositionIdx] = useState(0);

  const [selectedCategory, setSelectedCategory] = useState<ResourceCategory | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const openedAtRef = useRef<number | null>(null);

  const categories: ResourceCategory[] = [
    {
      id: "sw_1",
      title: "Intimacy & Periods",
      icon: "heart-circle-outline",
      color: colors.primary,
      items: 8,
      summary: "Guidance on comfort, consent, and clear boundaries during periods.",
      extendedGuide: [
        "Talk about energy, flow, and comfort before intimacy.",
        "Protection still matters during periods because pregnancy and infection risks can remain.",
        "Use a towel, pause when needed, and never continue through pain.",
      ],
    },
    {
      id: "sw_2",
      title: "STI Prevention Guide",
      icon: "shield-checkmark-outline",
      color: colors.success,
      items: 12,
      summary: "Clear guidance on barrier protection, routine screening, and stigma-free conversations.",
      extendedGuide: [
        "Use protection from the start of sex, not halfway through.",
        "Consider routine testing every 6 months with active partners.",
        "Many STIs can have no symptoms, so testing is part of care.",
      ],
    },
    {
      id: "sw_3",
      title: "Contraception Matrix",
      icon: "pill",
      color: colors.accentText,
      items: 15,
      summary: "Compare hormonal options, barriers, emergency contraception, and what to discuss with an OBGYN.",
      extendedGuide: [
        "Combining condoms with another method can improve protection.",
        "Emergency contraception works best as soon as possible after unprotected sex.",
        "Ask a clinician before starting or changing hormonal contraception.",
      ],
    },
    {
      id: "sw_4",
      title: "Consent & Safety",
      icon: "hand-left-outline",
      color: colors.warning,
      items: 6,
      summary: "Boundaries, communication, privacy, and enthusiastic consent.",
      extendedGuide: [
        "Consent should be clear, conscious, and enthusiastic.",
        "Anyone can pause, change their mind, or stop at any point.",
        "Discuss privacy before sharing photos, messages, or intimate details.",
      ],
    },
  ];
  // Public CMS content: cached (and kept on the device) as the raw responses
  // so a revisit or cold start paints at once while it revalidates.
  const {
    data: wellbeingData,
    loading: loadingWellbeing,
    refreshing,
    reload,
  } = useAsyncLoad<{ resources: WellbeingResource[]; sparkDeck: WellbeingGameDeck; positionsDeck: WellbeingGameDeck }>(
    async () => {
      const [resources, sparkDeck, positionsDeck] = await Promise.all([
        wellbeingApi.getResources("sexual_wellbeing"),
        wellbeingApi.getGameDecks("spark"),
        wellbeingApi.getGameDecks("positions"),
      ]);
      return { resources, sparkDeck, positionsDeck };
    },
    [],
    { cacheKey: "wellbeing:sexual", staleMs: 5 * 60_000, persist: true },
  );

  const toneFor = (index: number) => tones[TONE_ROTATION[Math.max(0, index) % TONE_ROTATION.length]];
  const apiCategories = wellbeingData ? wellbeingData.resources.map(mapWellbeingResource) : [];
  const visibleCategories = apiCategories.length > 0 ? apiCategories : categories;
  // An empty deck from the server (or a failed load) falls back to the built-in
  // cards, so the decks are never dead buttons. Empty only while first loading.
  const sparkCards: typeof fallbackSparkCards = wellbeingData
    ? wellbeingData.sparkDeck.cards.length > 0
      ? wellbeingData.sparkDeck.cards.map((card, index) =>
          normalizeTextCard(card, fallbackSparkCards[index % fallbackSparkCards.length]),
        )
      : fallbackSparkCards
    : loadingWellbeing
      ? []
      : fallbackSparkCards;
  const positionCards: typeof fallbackPositionCards = wellbeingData
    ? wellbeingData.positionsDeck.cards.length > 0
      ? wellbeingData.positionsDeck.cards.map(normalizePositionCard)
      : fallbackPositionCards
    : loadingWellbeing
      ? []
      : fallbackPositionCards;

  const onRefresh = useCallback(() => reload(true), [reload]);

  function mapWellbeingResource(resource: WellbeingResource): ResourceCategory {
    return {
      id: resource._id ?? resource.id ?? resource.title,
      title: resource.title,
      icon: resource.icon,
      color: resource.color,
      items: resource.items,
      summary: resource.summary,
      extendedGuide: resource.extendedGuide.length > 0 ? resource.extendedGuide : [resource.summary],
      estimatedReadTime: resource.estimatedReadTime,
      videoUrl: resource.videoUrl,
      audioUrl: resource.audioUrl,
      review: pickMedicalReview(resource),
    };
  }

  // A refresh can return a shorter deck, so indexes are always read modulo its length.
  const sparkIndex = sparkCards.length ? currentPromptIdx % sparkCards.length : 0;
  const positionIndex = positionCards.length ? currentPositionIdx % positionCards.length : 0;
  const currentPosition = positionCards[positionIndex];

  async function handleNextSparkCard() {
    const nextIndex = (sparkIndex + 1) % sparkCards.length;
    setCurrentPromptIdx(nextIndex);
    earnTokens(1);
    try {
      await wellbeingApi.drawGameCard("spark", nextIndex);
    } catch {
      // The deck can still be used offline.
    }
  }

  async function handleNextPositionCard() {
    const nextIndex = (positionIndex + 1) % positionCards.length;
    setCurrentPositionIdx(nextIndex);
    earnTokens(2);
    try {
      await wellbeingApi.drawGameCard("positions", nextIndex);
    } catch {
      // The deck can still be used offline.
    }
  }

  function handleOpenArticleModal(category: ResourceCategory) {
    setSelectedCategory(category);
    setModalVisible(true);
    earnTokens(3);
    openedAtRef.current = Date.now();
  }

  function handleCloseArticleModal() {
    const openedAt = openedAtRef.current;
    openedAtRef.current = null;
    if (selectedCategory && openedAt) {
      const durationSeconds = Math.round((Date.now() - openedAt) / 1000);
      wellbeingApi.trackView(selectedCategory.id, durationSeconds).catch(() => {});
    }
    setModalVisible(false);
  }

  const decks = [
    {
      mode: "spark" as const,
      title: "Conversation cards",
      description: "Questions to feel closer",
      icon: "chatbubbles-outline",
      tone: tones.rose,
      count: sparkCards.length,
    },
    {
      mode: "positions" as const,
      title: "Comfort cards",
      description: "Gentle ideas for tired days",
      icon: "bed-outline",
      tone: tones.lavender,
      count: positionCards.length,
    },
  ];
  const openDeck = decks.find((d) => d.mode === activeGameMode);
  const selectedIndex = selectedCategory ? visibleCategories.findIndex((c) => c.id === selectedCategory.id) : 0;

  const metaFor = (category: ResourceCategory) =>
    [
      category.estimatedReadTime ? { icon: "time-outline", label: `${category.estimatedReadTime} min read` } : null,
      {
        icon: "list-outline",
        label: `${category.extendedGuide.length} key ${category.extendedGuide.length === 1 ? "point" : "points"}`,
      },
      category.videoUrl ? { icon: "play-circle-outline", label: "Video" } : null,
      category.audioUrl ? { icon: "headset-outline", label: "Audio" } : null,
    ].filter((m): m is { icon: string; label: string } => m !== null);

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Sexual Wellbeing" subtitle="Private, judgement-free guidance" />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: insets.bottom + 48 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          <WellbeingIntro
            icon="heart-circle-outline"
            tone={tones.rose}
            title="Intimacy, on your terms"
            body="Consent, protection and comfort, explained without judgement."
            chips={[
              { icon: "lock-closed-outline", label: "Private" },
              { icon: "shield-checkmark-outline", label: "Evidence-based" },
            ]}
          />

          {/* Partner card decks */}
          <SectionHeader title="Together" style={{ marginTop: 28 }} />
          {loadingWellbeing ? (
            <View className="flex-row" style={{ gap: 12 }}>
              <SkeletonBlock width="48%" height={150} radius={22} />
              <SkeletonBlock width="48%" height={150} radius={22} />
            </View>
          ) : openDeck ? (
            <WellbeingCard style={{ padding: 18 }}>
              <View className="flex-row items-center" style={{ gap: 12 }}>
                <IconCircle icon={openDeck.icon} tone={openDeck.tone} size={42} />
                <View className="flex-1">
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 15, fontWeight: "800", fontFamily: fonts.heading }}>{openDeck.title}</Text>
                  <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.mono, marginTop: 1 }}>
                    {`${(openDeck.mode === "spark" ? sparkIndex : positionIndex) + 1} of ${openDeck.count}`}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setActiveGameMode("none")}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Close cards"
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceSoft, alignItems: "center", justifyContent: "center" }}
                >
                  <Feather name="x" size={16} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              <View
                style={{ marginTop: 16, minHeight: 168, borderRadius: 20, backgroundColor: openDeck.tone.bg, paddingHorizontal: 22, paddingVertical: 24, justifyContent: "center" }}
              >
                <Ionicons
                  name={openDeck.mode === "spark" ? "chatbubble-ellipses-outline" : "sparkles-outline"}
                  size={20}
                  color={openDeck.tone.fg}
                  style={{ alignSelf: "center", marginBottom: 12, opacity: 0.8 }}
                />
                {openDeck.mode === "spark" ? (
                  <Text style={{ color: colors.foreground, fontSize: 17, lineHeight: 25, fontWeight: "700", fontFamily: fonts.heading, textAlign: "center" }}>
                    {sparkCards[sparkIndex]}
                  </Text>
                ) : currentPosition ? (
                  <View className="items-center">
                    <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800", fontFamily: fonts.heading, textAlign: "center" }}>
                      {currentPosition.name}
                    </Text>
                    <Text style={{ color: openDeck.tone.fg, fontSize: 13, fontWeight: "700", fontFamily: fonts.body, textAlign: "center", marginTop: 4 }}>
                      {currentPosition.focus}
                    </Text>
                    <Text style={{ color: colors.foreground, fontSize: 14.5, lineHeight: 22, fontFamily: fonts.body, textAlign: "center", marginTop: 12 }}>
                      {currentPosition.tip}
                    </Text>
                  </View>
                ) : null}
              </View>

              <TouchableOpacity
                onPress={openDeck.mode === "spark" ? handleNextSparkCard : handleNextPositionCard}
                activeOpacity={0.85}
                accessibilityRole="button"
                className="flex-row items-center justify-center"
                style={{ marginTop: 14, height: 48, borderRadius: 24, backgroundColor: colors.primary, gap: 8 }}
              >
                <Text style={{ color: colors.buttonText, fontSize: 14.5, fontWeight: "800", fontFamily: fonts.body }}>Next card</Text>
                <Feather name="arrow-right" size={16} color={colors.buttonText} />
              </TouchableOpacity>
            </WellbeingCard>
          ) : (
            <View className="flex-row" style={{ gap: 12 }}>
              {decks.map((deck) => (
                <TouchableOpacity
                  key={deck.mode}
                  activeOpacity={0.8}
                  disabled={deck.count === 0}
                  onPress={() => setActiveGameMode(deck.mode)}
                  accessibilityRole="button"
                  accessibilityLabel={`${deck.title}, ${deck.description}`}
                  style={{ flex: 1, opacity: deck.count === 0 ? 0.5 : 1 }}
                >
                  <WellbeingCard style={{ padding: 16, flex: 1 }}>
                    <IconCircle icon={deck.icon} tone={deck.tone} size={44} />
                    <Text
                      numberOfLines={2}
                      maxFontSizeMultiplier={1.3}
                      style={{ color: colors.foreground, fontSize: 15, lineHeight: 20, fontWeight: "700", fontFamily: fonts.heading, marginTop: 14 }}
                    >
                      {deck.title}
                    </Text>
                    <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ color: colors.mutedText, fontSize: 13, lineHeight: 18, marginTop: 3, fontFamily: fonts.body }}>
                      {deck.description}
                    </Text>
                    <View className="flex-row items-center" style={{ gap: 4, marginTop: 12 }}>
                      <Text style={{ color: deck.tone.fg, fontSize: 13, fontWeight: "800", fontFamily: fonts.body }}>
                        {deck.count > 0 ? `${deck.count} cards` : "No cards yet"}
                      </Text>
                      {deck.count > 0 ? <Ionicons name="arrow-forward" size={14} color={deck.tone.fg} /> : null}
                    </View>
                  </WellbeingCard>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Guides, as a reading list: short articles with no cover art, so rows read better than tiles. */}
          <SectionHeader title="Guides" style={{ marginTop: 28 }} />
          {loadingWellbeing ? (
            <ArticleListSkeleton rows={4} />
          ) : visibleCategories.length === 0 ? (
            <WellbeingEmpty icon="book-outline" title="No guides yet" message="New guides are on the way. Pull down to refresh." />
          ) : (
            <WellbeingCard>
              {visibleCategories.map((category, index) => (
                <ArticleRow
                  key={category.id}
                  first={index === 0}
                  icon={category.icon}
                  fallbackIcon="book-outline"
                  tone={toneFor(index)}
                  title={category.title}
                  summary={category.summary}
                  meta={metaFor(category)}
                  onPress={() => handleOpenArticleModal(category)}
                />
              ))}
            </WellbeingCard>
          )}

          <ConsultNudge
            style={{ marginTop: 28 }}
            title="Something doesn't feel right?"
            body="Pain, unusual discharge or a missed period: talk privately with a gynecologist."
            onPress={() => router.push("/(app)/consultation" as any)}
          />

          <PrivacyNote
            style={{ marginTop: 22 }}
            text="Private to you. General guidance, not a diagnosis: for anything specific or worrying, talk to a doctor."
          />
        </ScrollView>

        {/* Guide detail */}
        <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleCloseArticleModal}>
          {selectedCategory && (
            // Android ignores pageSheet and renders fullscreen, so SafeAreaView keeps the header clear.
            <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: colors.background }}>
              <DetailSheetHeader
                icon={selectedCategory.icon}
                tone={toneFor(selectedIndex)}
                eyebrow="Guide"
                title={selectedCategory.title}
                onClose={handleCloseArticleModal}
              />

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: insets.bottom + 32 }}>
                <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                  {metaFor(selectedCategory).map((m) => (
                    <MetaPill key={m.label} icon={m.icon} label={m.label} />
                  ))}
                </View>
                <MedicalReviewBadge item={selectedCategory.review} style={{ marginTop: 10 }} />
                <Text style={{ color: colors.foreground, fontSize: 16, lineHeight: 25, fontFamily: fonts.body, marginTop: 14 }}>{selectedCategory.summary}</Text>

                <MediaButtons videoUrl={selectedCategory.videoUrl} audioUrl={selectedCategory.audioUrl} style={{ marginTop: 18 }} />

                <DetailSection icon="bulb-outline" tone={tones.amber} title="What to know">
                  <KeyPointList points={selectedCategory.extendedGuide} />
                </DetailSection>

                <PrivacyNote style={{ marginTop: 22 }} text="General guidance, not a diagnosis. A doctor can advise on your situation." />
              </ScrollView>
            </SafeAreaView>
          )}
        </Modal>
      </SafeAreaView>
    </>
  );
}
