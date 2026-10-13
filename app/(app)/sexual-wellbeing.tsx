import { Feather, Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Linking,
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
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import { wellbeingApi, type WellbeingResource } from "../../lib/api";
import { HeaderIconButton, ScreenHeader, SectionHeader } from "../../components/ScreenHeader";

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
      icon: "heart-outline",
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
      icon: "apps-outline",
      color: colors.accent,
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
      icon: "checkmark-circle-outline",
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
  const [apiCategories, setApiCategories] = useState<ResourceCategory[]>([]);
  const [sparkCards, setSparkCards] = useState<typeof fallbackSparkCards>([]);
  const [positionCards, setPositionCards] = useState<typeof fallbackPositionCards>([]);
  const [loadingWellbeing, setLoadingWellbeing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const softTints = getSoftTints(colors);
  const categoryTints = [softTints.pink, softTints.emerald, softTints.lavender, softTints.amber];
  const visibleCategories = apiCategories.length > 0 ? apiCategories : categories;

  const loadWellbeing = useCallback(async () => {
    try {
      const [resources, sparkDeck, positionsDeck] = await Promise.all([
        wellbeingApi.getResources("sexual_wellbeing"),
        wellbeingApi.getGameDecks("spark"),
        wellbeingApi.getGameDecks("positions"),
      ]);

      if (resources.length > 0) {
        setApiCategories(resources.map(mapWellbeingResource));
      }
      // An empty deck from the server falls back to the built-in cards, so the decks are never dead buttons.
      setSparkCards(
        sparkDeck.cards.length > 0
          ? sparkDeck.cards.map((card, index) =>
              normalizeTextCard(card, fallbackSparkCards[index % fallbackSparkCards.length]),
            )
          : fallbackSparkCards,
      );
      setPositionCards(
        positionsDeck.cards.length > 0 ? positionsDeck.cards.map(normalizePositionCard) : fallbackPositionCards,
      );
    } catch {
      setApiCategories([]);
      setSparkCards(fallbackSparkCards);
      setPositionCards(fallbackPositionCards);
    } finally {
      setLoadingWellbeing(false);
    }
  }, []);

  useEffect(() => {
    loadWellbeing();
  }, [loadWellbeing]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadWellbeing();
    } finally {
      setRefreshing(false);
    }
  }, [loadWellbeing]);

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

  // White card with a tinted icon square, like the app's list rows.
  const tileStyle = {
    width: "48%" as const,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    ...getShadow(colors, isDark),
  };

  const iconSquare = (icon: string, color: string, bg: string) => (
    <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon as any} size={18} color={color} />
    </View>
  );

  const decks = [
    {
      mode: "spark" as const,
      title: "Conversation cards",
      description: "Questions to feel closer",
      icon: "chatbubbles-outline",
      color: colors.primary,
      bg: colors.primaryLight,
      count: sparkCards.length,
    },
    {
      mode: "positions" as const,
      title: "Comfort cards",
      description: "Gentle ideas for tired days",
      icon: "leaf-outline",
      color: colors.accent,
      bg: colors.accentLight,
      count: positionCards.length,
    },
  ];
  const openDeck = decks.find((d) => d.mode === activeGameMode);

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Sexual Wellbeing" subtitle="Private, judgement-free guidance" />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* Partner card decks */}
          <SectionHeader title="Together" />
          {loadingWellbeing ? (
            <View className="flex-row" style={{ gap: 10 }}>
              <SkeletonBlock width="48%" height={124} radius={20} />
              <SkeletonBlock width="48%" height={124} radius={20} />
            </View>
          ) : openDeck ? (
            <View style={{ ...tileStyle, width: "100%", padding: 18 }}>
              <View className="flex-row items-center" style={{ gap: 12 }}>
                {iconSquare(openDeck.icon, openDeck.color, openDeck.bg)}
                <View className="flex-1">
                  <Text style={{ color: colors.foreground, fontSize: 14.5, fontWeight: "800", fontFamily: fonts.heading }}>{openDeck.title}</Text>
                  <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.mono, marginTop: 1 }}>
                    {`${(openDeck.mode === "spark" ? sparkIndex : positionIndex) + 1} of ${openDeck.count}`}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setActiveGameMode("none")}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Close cards"
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceSoft, alignItems: "center", justifyContent: "center" }}
                >
                  <Feather name="x" size={16} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              <View
                style={{ marginTop: 16, minHeight: 150, borderRadius: 18, backgroundColor: openDeck.bg, paddingHorizontal: 20, paddingVertical: 22, justifyContent: "center" }}
              >
                {openDeck.mode === "spark" ? (
                  <Text style={{ color: colors.foreground, fontSize: 17, lineHeight: 25, fontWeight: "700", fontFamily: fonts.heading, textAlign: "center" }}>
                    {sparkCards[sparkIndex]}
                  </Text>
                ) : currentPosition ? (
                  <View className="items-center">
                    <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800", fontFamily: fonts.heading, textAlign: "center" }}>
                      {currentPosition.name}
                    </Text>
                    <Text style={{ color: colors.mutedText, fontSize: 13, fontWeight: "700", fontFamily: fonts.body, textAlign: "center", marginTop: 4 }}>
                      {currentPosition.focus}
                    </Text>
                    <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 21, fontFamily: fonts.body, textAlign: "center", marginTop: 12 }}>
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
            </View>
          ) : (
            <View className="flex-row" style={{ gap: 10 }}>
              {decks.map((deck) => (
                <TouchableOpacity
                  key={deck.mode}
                  activeOpacity={0.8}
                  disabled={deck.count === 0}
                  onPress={() => setActiveGameMode(deck.mode)}
                  accessibilityRole="button"
                  accessibilityLabel={`${deck.title}, ${deck.description}`}
                  style={{ ...tileStyle, flex: 1, opacity: deck.count === 0 ? 0.5 : 1 }}
                >
                  <View style={{ marginBottom: 12 }}>{iconSquare(deck.icon, deck.color, deck.bg)}</View>
                  <Text style={{ color: colors.foreground, fontSize: 13.5, fontWeight: "800", fontFamily: fonts.body }}>{deck.title}</Text>
                  <Text style={{ color: colors.mutedText, fontSize: 12.5, marginTop: 3, fontFamily: fonts.body }} numberOfLines={2}>
                    {deck.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Guides, as a reading list: they're short articles with no cover art, so rows read better than tiles. */}
          <SectionHeader title="Read" style={{ marginTop: 26 }} />
          <View style={{ ...tileStyle, width: "100%", padding: 0 }}>
            {visibleCategories.map((category, index) => {
              const meta = [
                category.estimatedReadTime ? `${category.estimatedReadTime} min read` : null,
                `${category.extendedGuide.length} key ${category.extendedGuide.length === 1 ? "point" : "points"}`,
              ].filter(Boolean).join("  ·  ");
              return (
                <TouchableOpacity
                  key={category.id}
                  activeOpacity={0.7}
                  onPress={() => handleOpenArticleModal(category)}
                  accessibilityRole="button"
                  accessibilityLabel={`${category.title}. ${category.summary}. ${meta}`}
                  className="flex-row"
                  style={{
                    gap: 14,
                    paddingHorizontal: 16,
                    paddingVertical: 16,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 16,
                      backgroundColor: categoryTints[index % categoryTints.length],
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name={category.icon as any} size={24} color={category.color} />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 20, fontWeight: "800", letterSpacing: -0.2, fontFamily: fonts.heading }} numberOfLines={2}>
                      {category.title}
                    </Text>
                    <Text style={{ color: colors.mutedText, fontSize: 13, lineHeight: 18, marginTop: 3, fontFamily: fonts.body }} numberOfLines={2}>
                      {category.summary}
                    </Text>
                    <View className="flex-row items-center" style={{ gap: 8, marginTop: 8 }}>
                      <Text style={{ color: colors.mutedText, fontSize: 12, fontFamily: fonts.mono }}>{meta}</Text>
                      {category.videoUrl ? <Ionicons name="play-circle" size={14} color={colors.mutedText} accessibilityLabel="Has video" /> : null}
                      {category.audioUrl ? <Ionicons name="headset" size={13} color={colors.mutedText} accessibilityLabel="Has audio" /> : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Honest scope note */}
          <View className="flex-row items-start" style={{ gap: 10, marginTop: 22, paddingHorizontal: 4 }}>
            <Ionicons name="lock-closed-outline" size={15} color={colors.mutedText} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, color: colors.mutedText, fontSize: 13, lineHeight: 19, fontFamily: fonts.body }}>
              Private to you. General guidance, not a diagnosis: for anything specific or worrying, talk to a doctor.
            </Text>
          </View>
        </ScrollView>

        {/* Guide detail */}
        <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleCloseArticleModal}>
          {selectedCategory && (
            // Android ignores pageSheet and renders fullscreen, so SafeAreaView keeps the header clear.
            <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: colors.background }}>
              <View className="flex-row items-center" style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12, gap: 12 }}>
                {iconSquare(
                  selectedCategory.icon,
                  selectedCategory.color,
                  categoryTints[Math.max(0, visibleCategories.findIndex((c) => c.id === selectedCategory.id)) % categoryTints.length],
                )}
                <Text
                  accessibilityRole="header"
                  numberOfLines={2}
                  style={{ flex: 1, color: colors.foreground, fontSize: 20, fontWeight: "800", letterSpacing: -0.3, fontFamily: fonts.heading }}
                >
                  {selectedCategory.title}
                </Text>
                <HeaderIconButton icon="close" onPress={handleCloseArticleModal} accessibilityLabel="Close" />
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: insets.bottom + 32 }}>
                <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 23, fontFamily: fonts.body }}>{selectedCategory.summary}</Text>
                {!!selectedCategory.estimatedReadTime && (
                  <View className="flex-row items-center" style={{ gap: 5, marginTop: 8 }}>
                    <Feather name="clock" size={12} color={colors.mutedText} />
                    <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }}>{`${selectedCategory.estimatedReadTime} min read`}</Text>
                  </View>
                )}

                {(selectedCategory.videoUrl || selectedCategory.audioUrl) && (
                  <View className="flex-row" style={{ gap: 10, marginTop: 18 }}>
                    {!!selectedCategory.videoUrl && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => Linking.openURL(selectedCategory.videoUrl!)}
                        className="flex-1 flex-row items-center justify-center"
                        style={{ height: 46, borderRadius: 23, gap: 8, backgroundColor: colors.primaryLight }}
                      >
                        <Ionicons name="play-circle-outline" size={18} color={colors.primary} />
                        <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "800", fontFamily: fonts.body }}>Watch</Text>
                      </TouchableOpacity>
                    )}
                    {!!selectedCategory.audioUrl && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => Linking.openURL(selectedCategory.audioUrl!)}
                        className="flex-1 flex-row items-center justify-center"
                        style={{ height: 46, borderRadius: 23, gap: 8, backgroundColor: colors.primaryLight }}
                      >
                        <Ionicons name="headset-outline" size={18} color={colors.primary} />
                        <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "800", fontFamily: fonts.body }}>Listen</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                <SectionHeader title="What to know" style={{ marginTop: 26 }} />
                <View style={{ ...tileStyle, width: "100%", paddingVertical: 4 }}>
                  {selectedCategory.extendedGuide.map((line, idx) => (
                    <View
                      key={idx}
                      className="flex-row items-start"
                      style={{
                        gap: 12,
                        paddingVertical: 14,
                        borderTopWidth: idx === 0 ? 0 : 1,
                        borderTopColor: colors.border,
                      }}
                    >
                      <Ionicons name="checkmark-circle" size={18} color={colors.success} style={{ marginTop: 1 }} />
                      <Text style={{ flex: 1, color: colors.foreground, fontSize: 14, lineHeight: 21, fontFamily: fonts.body }}>{line}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </SafeAreaView>
          )}
        </Modal>
      </SafeAreaView>
    </>
  );
}
