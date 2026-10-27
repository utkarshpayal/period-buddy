import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-context";
import { AppModalHost } from "../../components/modals/AppModalHost";
import { useTheme } from "../../components/theme";
import { SkeletonBlock } from "../../components/Skeleton";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { blogsApi, wellbeingApi, type ContentFeedItem, type MedicalReview, type WellbeingGameDeck, type WellbeingResource } from "../../lib/api";
import { ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import {
  ArticleListSkeleton,
  ArticleRow,
  ConsultNudge,
  DetailSection,
  DetailSheetHeader,
  getWellbeingTones,
  KeyPointList,
  MediaButtons,
  MetaPill,
  PrivacyNote,
  TONE_ROTATION,
  WellbeingCard,
  WellbeingEmpty,
} from "../../components/wellbeing/WellbeingUI";
import { MedicalReviewBadge } from "../../components/MedicalReviewBadge";
import { pickMedicalReview } from "../../lib/medicalReview";
import { computeAge } from "../../lib/chatTopics";
import { Icon } from "../../components/Icon";
import { GradientCard } from "../../components/GradientCard";
import { PressableScale } from "../../components/PressableScale";
import { MediaTile } from "../../components/content/MediaTile";
import { CardDeckPlayer, type DeckCard } from "../../components/wellbeing/CardDeckPlayer";
import { getHeroGradient } from "../../components/ui-tokens";
import { BUNDLED_COMFORT_CARDS, BUNDLED_SPARK_CARDS } from "../../components/wellbeing/coupleDecks";
import { useContentWidth } from "../../lib/layout";

// The couples decks (conversation "spark" cards and the comfort/position
// cards) are 18+. Same rule as the 18+ chat topic: an unknown birthday stays
// locked. STI, consent and contraception guides stay visible to everyone.
const ADULT_DECKS_MIN_AGE = 18;

// Articles for this page are blogs tagged this in the Content Studio; until
// any are, a title search for "sexual" stands in.
const BLOG_TAG = "sexual-wellbeing";
const BLOG_LIMIT = 6;

// Saturated in both themes: the deck cards and the game carry white text.
const DECK_GRADIENTS = {
  spark: ["#D94C82", "#A8357A", "#6E2C70"],
  positions: ["#8C6AD9", "#6346B8", "#3F3486"],
} as const;

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

// Bundled with the app, so the games work offline and never fall back to a
// near-empty deck; the server's decks win whenever they load.
const fallbackSparkCards = BUNDLED_SPARK_CARDS;
const fallbackPositionCards: PositionCard[] = BUNDLED_COMFORT_CARDS;

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
          : `Comfort card ${index + 1}`,
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
    name: `Comfort card ${index + 1}`,
    focus: "Comfort, consent, and communication",
    tip: normalizeTextCard(
      card,
      "Pause, check comfort, and choose what feels safe for both people.",
    ),
  };
}

export default function SexualWellbeing() {
  const { colors, isDark, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  // Narrow phones get a tighter gutter, a smaller hero title and the two
  // games stacked as rows; the article row's tiles follow the screen width.
  const screenWidth = useContentWidth();
  const compact = screenWidth < 360;
  const gutter = compact ? 16 : 24;
  const articleWidth = Math.round(Math.min(260, Math.max(200, screenWidth * 0.66)));
  const router = useRouter();
  const tones = getWellbeingTones(colors);
  const { user } = useAuth();
  const age = computeAge(user?.dateOfBirth);
  const canSeeAdultDecks = age !== null && age >= ADULT_DECKS_MIN_AGE;

  // Which card game is open full screen, if any.
  const [activeGameMode, setActiveGameMode] = useState<"none" | "spark" | "positions">("none");

  const [selectedCategory, setSelectedCategory] = useState<ResourceCategory | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const openedAtRef = useRef<number | null>(null);

  const categories: ResourceCategory[] = [
    {
      id: "sw_1",
      title: "Intimacy during periods",
      icon: "heart-circle-outline",
      color: colors.primary,
      items: 8,
      summary: "Comfort, consent and clear boundaries when you're on your period.",
      extendedGuide: [
        "Talk about energy, flow, and comfort before intimacy.",
        "Protection still matters during periods because pregnancy and infection risks can remain.",
        "Use a towel, pause when needed, and never continue through pain.",
      ],
    },
    {
      id: "sw_2",
      title: "Preventing STIs",
      icon: "shield-checkmark-outline",
      color: colors.success,
      items: 12,
      summary: "Condoms, regular testing and talking about STIs (sexually transmitted infections) without shame.",
      extendedGuide: [
        "Use protection from the start of sex, not halfway through.",
        "Get tested for STIs at least once a year if you're sexually active and under 25, and whenever you have a new partner or symptoms.",
        "Many STIs can have no symptoms, so testing is part of care.",
      ],
    },
    {
      id: "sw_3",
      title: "Birth control options",
      icon: "pill",
      color: colors.accentText,
      items: 15,
      summary: "Compare the pill, condoms, emergency contraception (the morning-after pill) and what to ask a gynaecologist.",
      extendedGuide: [
        "Combining condoms with another method can improve protection.",
        "Emergency contraception works best as soon as possible after unprotected sex.",
        "Ask a doctor before starting or changing hormonal birth control, like the pill.",
      ],
    },
    {
      id: "sw_4",
      title: "Consent & safety",
      icon: "hand-left-outline",
      color: colors.warning,
      items: 6,
      summary: "Boundaries, talking openly, privacy, and a clear, happy yes.",
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
    error: loadError,
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

  // Related articles. Quiet: no articles just hides the row.
  const { data: articles } = useAsyncLoad<ContentFeedItem[]>(
    async () => {
      const tagged = await blogsApi.getFeed({ type: "blog", tag: BLOG_TAG, limit: BLOG_LIMIT });
      if (tagged.items.length > 0) return tagged.items;
      return (await blogsApi.getFeed({ type: "blog", search: "sexual", limit: BLOG_LIMIT })).items;
    },
    [],
    { cacheKey: `blogs:feed:tag=${BLOG_TAG}`, staleMs: 5 * 60_000, persist: true },
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

  // The decks as the game player's cards.
  const deckCards: Record<"spark" | "positions", DeckCard[]> = {
    spark: sparkCards.map((question) => ({ title: question })),
    positions: positionCards.map((card) => ({ title: card.name, kicker: card.focus, body: card.tip })),
  };

  function handleOpenArticleModal(category: ResourceCategory) {
    setSelectedCategory(category);
    setModalVisible(true);
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
      description: "Questions that bring you closer",
      icon: "chatbubbles-outline",
      gradient: DECK_GRADIENTS.spark,
      count: sparkCards.length,
    },
    {
      mode: "positions" as const,
      title: "Comfort cards",
      description: "Gentle ideas for tired or crampy days",
      icon: "heart-outline",
      gradient: DECK_GRADIENTS.positions,
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
        <ScreenHeader title="Sexual Wellbeing" />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 12, paddingBottom: insets.bottom + 48 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {loadError && !loadingWellbeing ? (
            <View
              className="flex-row items-center"
              style={{ gap: 8, marginBottom: 14, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, borderCurve: "continuous", backgroundColor: colors.surfaceSoft }}
            >
              <Icon set="ion" name="cloud-offline-outline" size={16} color={colors.mutedText} />
              <Text style={{ flex: 1, color: colors.mutedText, fontSize: 13, lineHeight: 18, fontWeight: "500", fontFamily: fonts.body }}>
                Showing saved guides. Pull down to refresh.
              </Text>
            </View>
          ) : null}

          {/* Hero */}
          <GradientCard colors={getHeroGradient(colors, isDark)} style={{ padding: 22, gap: 12 }}>
            <Icon set="ion" name="heart" size={170} color="#fff" style={{ position: "absolute", right: -36, bottom: -52, opacity: 0.1 }} />
            <Text style={{ color: "#fff", opacity: 0.85, fontSize: 12, fontWeight: "800", letterSpacing: 1.3, textTransform: "uppercase", fontFamily: fonts.body }}>
              Sexual wellbeing
            </Text>
            <Text maxFontSizeMultiplier={1.25} style={{ color: "#fff", fontSize: compact ? 23 : 26, lineHeight: compact ? 29 : 32, fontWeight: "800", letterSpacing: -0.6, fontFamily: fonts.heading }}>
              Intimacy, on your terms
            </Text>
            <Text maxFontSizeMultiplier={1.3} style={{ color: "#fff", opacity: 0.9, fontSize: 15, lineHeight: 22, fontFamily: fonts.body }}>
              Games for two, honest articles and clear guides on consent, protection and comfort.
            </Text>
            <View className="flex-row flex-wrap" style={{ gap: 8, marginTop: 2 }}>
              {[
                { icon: "lock-closed", label: "Private" },
                { icon: "heart", label: "No judgement" },
                { icon: "people", label: "Games for two" },
              ].map((chip) => (
                <View
                  key={chip.label}
                  className="flex-row items-center"
                  style={{ gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" }}
                >
                  <Icon set="ion" name={chip.icon as never} size={12} color="#fff" />
                  <Text maxFontSizeMultiplier={1.3} style={{ color: "#fff", fontSize: 13.5, fontWeight: "700", fontFamily: fonts.body }}>{chip.label}</Text>
                </View>
              ))}
            </View>
          </GradientCard>

          {/* Games first: the couples decks (18+ only) */}
          <SectionHeader title="Play together" subtitle="Card games for couples · 18+" style={{ marginTop: 30 }} />
          {!canSeeAdultDecks ? (
            <GradientCard colors={["#6E5A8C", "#4B3F6B"]} glow={false} style={{ padding: 18 }}>
              <View className="flex-row items-center" style={{ gap: 14 }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)" }}>
                  <Icon set="ion" name="lock-closed" size={20} color="#fff" />
                </View>
                <View className="flex-1">
                  <Text style={{ color: "#fff", fontSize: 16, lineHeight: 21, fontWeight: "800", fontFamily: fonts.heading }}>For 18 and over</Text>
                  <Text style={{ color: "#fff", opacity: 0.88, fontSize: 13.5, lineHeight: 19, fontFamily: fonts.body, marginTop: 3 }}>
                    {age === null
                      ? "The couples games open once your profile shows you're 18+. Add your date of birth in your profile. The articles and guides below are for everyone."
                      : "The couples games are for adults. The articles and guides below on consent, STIs and birth control are for everyone."}
                  </Text>
                </View>
              </View>
            </GradientCard>
          ) : loadingWellbeing ? (
            <View style={{ flexDirection: compact ? "column" : "row", gap: 12 }}>
              <SkeletonBlock width={compact ? "100%" : "48%"} height={compact ? 112 : 210} radius={26} />
              <SkeletonBlock width={compact ? "100%" : "48%"} height={compact ? 112 : 210} radius={26} />
            </View>
          ) : (
            <View style={{ flexDirection: compact ? "column" : "row", gap: 12 }}>
              {decks.map((deck) => {
                const fan = (
                  <View style={{ width: 62, height: 64 }}>
                    {[-10, 0].map((rotate, i) => (
                      <View
                        key={rotate}
                        style={{
                          position: "absolute",
                          left: i * 14,
                          top: i * 2,
                          width: 46,
                          height: 62,
                          borderRadius: 10,
                          backgroundColor: i === 1 ? "#fff" : "rgba(255,255,255,0.45)",
                          transform: [{ rotate: `${rotate}deg` }],
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {i === 1 ? <Icon set="ion" name={deck.icon as never} size={20} color={deck.gradient[1]} /> : null}
                      </View>
                    ))}
                  </View>
                );
                const playPill = (
                  <View className="flex-row items-center" style={{ gap: 4, backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Icon set="ion" name="play" size={12} color={deck.gradient[1]} />
                    <Text maxFontSizeMultiplier={1.2} style={{ color: deck.gradient[1], fontSize: 13, fontWeight: "800", fontFamily: fonts.body }}>Play</Text>
                  </View>
                );
                const countLabel = (
                  <Text maxFontSizeMultiplier={1.2} style={{ color: "#fff", opacity: 0.9, fontSize: 13.5, fontWeight: "700", fontFamily: fonts.body }}>
                    {deck.count > 0 ? `${deck.count} cards` : "Soon"}
                  </Text>
                );
                const titleText = (
                  <Text numberOfLines={2} maxFontSizeMultiplier={1.25} style={{ color: "#fff", fontSize: 16, lineHeight: 21, fontWeight: "800", fontFamily: fonts.heading }}>
                    {deck.title}
                  </Text>
                );
                const description = (
                  <Text numberOfLines={2} maxFontSizeMultiplier={1.25} style={{ color: "#fff", opacity: 0.85, fontSize: 13, lineHeight: 18, fontFamily: fonts.body, marginTop: 4 }}>
                    {deck.description}
                  </Text>
                );
                return (
                  <PressableScale
                    key={deck.mode}
                    disabled={deck.count === 0}
                    onPress={() => setActiveGameMode(deck.mode)}
                    accessibilityRole="button"
                    accessibilityLabel={`${deck.title}, ${deck.description}${deck.count > 0 ? `, ${deck.count} cards. Play` : ", no cards yet"}`}
                    accessibilityState={{ disabled: deck.count === 0 }}
                    style={{ flex: compact ? undefined : 1, opacity: deck.count === 0 ? 0.5 : 1 }}
                  >
                    {compact ? (
                      // Narrow phones: one full-width row per game.
                      <GradientCard colors={deck.gradient} radius={24} style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
                        {fan}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          {titleText}
                          {description}
                          <View style={{ marginTop: 8 }}>{countLabel}</View>
                        </View>
                        {playPill}
                      </GradientCard>
                    ) : (
                      <GradientCard colors={deck.gradient} radius={26} style={{ padding: 16, minHeight: 210 }}>
                        <View style={{ marginBottom: 14 }}>{fan}</View>
                        {titleText}
                        <View style={{ flexGrow: 1 }}>{description}</View>
                        <View className="flex-row items-center justify-between" style={{ marginTop: 14, gap: 8 }}>
                          {countLabel}
                          {playPill}
                        </View>
                      </GradientCard>
                    )}
                  </PressableScale>
                );
              })}
            </View>
          )}

          {/* Articles: blogs on this topic, as a swipeable row with covers */}
          {articles && articles.length > 0 ? (
            <>
              <SectionHeader title="Read" subtitle="Articles on intimacy and sexual health" style={{ marginTop: 30 }} />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                style={{ marginHorizontal: -gutter }}
                contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 4, paddingBottom: 14, gap: 12 }}
              >
                {articles.map((item) => (
                  <MediaTile
                    key={item.id}
                    width={articleWidth}
                    title={item.title}
                    imageUrl={item.imageUrl}
                    meta={[item.readTimeMinutes ? `${item.readTimeMinutes} min read` : "Article", item.author].filter(Boolean).join(" · ")}
                    tone={{ bg: colors.primaryLight, fg: colors.primaryDark, icon: "heart-outline" }}
                    onPress={() => item.slug && router.push({ pathname: "/(app)/blogs", params: { slug: item.slug } } as never)}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}

          {/* Guides, as a reading list: short articles with no cover art, so rows read better than tiles. */}
          <SectionHeader title="Guides" subtitle="Quick, clear answers for everyone" style={{ marginTop: articles && articles.length > 0 ? 16 : 30 }} />
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
            body="Pain, unusual discharge or a missed period: talk privately with a gynaecologist."
            onPress={() => router.push("/(app)/consultation" as any)}
          />

          <PrivacyNote
            style={{ marginTop: 22 }}
            text="Private to you. General guidance, not a diagnosis: for anything specific or worrying, talk to a doctor."
          />
        </ScrollView>

        {/* Card game, full screen */}
        <CardDeckPlayer
          visible={openDeck !== undefined}
          onClose={() => setActiveGameMode("none")}
          title={openDeck?.title ?? ""}
          icon={openDeck?.icon ?? "heart-outline"}
          gradient={openDeck?.gradient ?? DECK_GRADIENTS.spark}
          cards={openDeck ? deckCards[openDeck.mode] : []}
          onDraw={(index) => {
            if (openDeck) wellbeingApi.drawGameCard(openDeck.mode, index).catch(() => {});
          }}
        />

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
                <Text style={{ color: colors.foreground, fontSize: 16, lineHeight: 26, fontWeight: "400", fontFamily: fonts.body, marginTop: 14 }}>{selectedCategory.summary}</Text>

                <MediaButtons videoUrl={selectedCategory.videoUrl} audioUrl={selectedCategory.audioUrl} style={{ marginTop: 18 }} />

                <DetailSection icon="bulb-outline" tone={tones.amber} title="What to know">
                  <KeyPointList points={selectedCategory.extendedGuide} />
                </DetailSection>

                <PrivacyNote style={{ marginTop: 22 }} text="General guidance, not a diagnosis. A doctor can advise on your situation." />
              </ScrollView>
            </SafeAreaView>
          )}
          {modalVisible ? <AppModalHost inline /> : null}
        </Modal>
      </SafeAreaView>
    </>
  );
}
