import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import { useTheme } from "../../components/theme";
import { SkeletonBlock } from "../../components/Skeleton";
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import { wellbeingApi, type WellbeingResource } from "../../lib/api";

// --- STRUCTURAL BACKEND API CONTRACTS ---
interface ResourceCategory {
  id: string;
  title: string;
  icon: string;
  color: string;
  items: number;
  summary: string;
  extendedGuide: string[]; // Dynamic checklist nodes inside the detail modal sheet
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
  const router = useRouter();
  const { earnTokens } = useAppState();

  // Dual Game Modules Core Switching Engine States
  const [activeGameMode, setActiveGameMode] = useState<
    "none" | "spark" | "positions"
  >("none");
  const [currentPromptIdx, setCurrentPromptIdx] = useState(0);
  const [currentPositionIdx, setCurrentPositionIdx] = useState(0);

  // Bottom Sheet Modal Controller States
  const [selectedCategory, setSelectedCategory] =
    useState<ResourceCategory | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const openedAtRef = useRef<number | null>(null);

  const categories: ResourceCategory[] = [
    {
      id: "sw_1",
      title: "Intimacy & Periods",
      icon: "heart-outline",
      color: colors.primary,
      items: 8,
      summary:
        "Guidance on comfort, consent, and clear boundaries during periods.",
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
      summary:
        "Clear guidance on barrier protection, routine screening, and stigma-free conversations.",
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
      summary:
        "Compare hormonal options, barriers, emergency contraception, and what to discuss with an OBGYN.",
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
      summary:
        "Boundaries, communication, privacy, and enthusiastic consent.",
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
  const visibleCategories =
    apiCategories.length > 0 ? apiCategories : categories;

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
      if (sparkDeck.cards.length > 0) {
        setSparkCards(
          sparkDeck.cards.map((card, index) =>
            normalizeTextCard(
              card,
              fallbackSparkCards[index % fallbackSparkCards.length],
            ),
          ),
        );
      }
      if (positionsDeck.cards.length > 0) {
        setPositionCards(positionsDeck.cards.map(normalizePositionCard));
      }
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
      extendedGuide:
        resource.extendedGuide.length > 0
          ? resource.extendedGuide
          : [resource.summary],
      estimatedReadTime: resource.estimatedReadTime,
      videoUrl: resource.videoUrl,
      audioUrl: resource.audioUrl,
    };
  }

  // Deck Shuffle Controller Mechanics
  async function handleNextSparkCard() {
    const nextIndex = (currentPromptIdx + 1) % sparkCards.length;
    setCurrentPromptIdx(nextIndex);
    earnTokens(1);
    try {
      await wellbeingApi.drawGameCard("spark", nextIndex);
    } catch {
      // The deck can still be used offline.
    }
  }

  async function handleNextPositionCard() {
    const nextIndex = (currentPositionIdx + 1) % positionCards.length;
    setCurrentPositionIdx(nextIndex);
    earnTokens(2);
    try {
      await wellbeingApi.drawGameCard("positions", nextIndex);
    } catch {
      // The deck can still be used offline.
    }
  }

  // MODAL TRIGGER ACTION INSTEAD OF REDIRECT HOOKS
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
        {/* Navigation Action Header */}
        <View className="flex-row items-center gap-3 px-[22px] pt-6 pb-1.5">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="w-9 h-9 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <Text
            className="text-xl font-black tracking-tight"
            style={{ color: colors.foreground, fontFamily: fonts.heading }}
          >
            Wellbeing
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          <View style={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 14 }}>
            <Text
              className="text-[12.5px] font-semibold"
              style={{ color: colors.mutedText, fontFamily: fonts.body, lineHeight: 18.75 }}
            >
              Consent-centered intimacy guidance, safety resources, and private
              partner conversation tools.
            </Text>
          </View>

          {/* DYNAMIC MULTI-MODE PARTNER INTERACTIVE GAME DECKS */}
          <View
            className="rounded-3xl relative overflow-hidden"
            style={{
              backgroundColor: colors.surface,
              marginHorizontal: 22,
              marginBottom: 16,
              padding: 20,
              ...getShadow(colors, isDark),
            }}
          >
              {activeGameMode === "none" && (
                <View className="items-center">
                  <MaterialCommunityIcons
                    name="gamepad-variant-outline"
                    size={30}
                    color={colors.primary}
                  />
                  <Text
                    className="text-[15px] font-black tracking-tight text-center"
                    style={{ color: colors.foreground, fontFamily: fonts.heading, marginTop: 12 }}
                  >
                    Partner Intimacy Game Center
                  </Text>
                  <Text
                    className="text-[11.5px] text-center leading-4"
                    style={{ color: colors.mutedText, fontFamily: fonts.body, marginTop: 6 }}
                  >
                    Choose a specialized conversational or physical card deck to
                    explore comfort, boundaries, and communication together.
                  </Text>

                  {loadingWellbeing ? (
                    <View className="flex-row w-full" style={{ gap: 10, marginTop: 14 }}>
                      <SkeletonBlock width="48%" height={120} radius={16} />
                      <SkeletonBlock width="48%" height={120} radius={16} />
                    </View>
                  ) : (
                  <View className="flex-row w-full" style={{ gap: 10, marginTop: 14 }}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      disabled={sparkCards.length === 0}
                      onPress={() => setActiveGameMode("spark")}
                      className="flex-1 items-center justify-center"
                      style={{
                        backgroundColor: colors.primaryLight,
                        borderRadius: 13,
                        padding: 11,
                        opacity: sparkCards.length === 0 ? 0.5 : 1,
                      }}
                    >
                      <Text
                        className="text-[12.5px] font-bold"
                        style={{ color: colors.primary, fontFamily: fonts.body }}
                      >
                        Play Spark
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      disabled={positionCards.length === 0}
                      onPress={() => setActiveGameMode("positions")}
                      className="flex-1 items-center justify-center"
                      style={{
                        backgroundColor: colors.accent,
                        borderRadius: 13,
                        padding: 11,
                        opacity: positionCards.length === 0 ? 0.5 : 1,
                      }}
                    >
                      <Text
                        className="text-[12.5px] font-bold"
                        style={{ color: colors.buttonText, fontFamily: fonts.body }}
                      >
                        Comfort Cards
                      </Text>
                    </TouchableOpacity>
                  </View>
                  )}
                </View>
              )}

              {activeGameMode === "spark" && (
                <View className="py-1">
                  <View className="flex-row justify-between items-center mb-4 pb-2" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <View className="flex-row items-center gap-2">
                      <Ionicons
                        name="chatbubbles-outline"
                        size={15}
                        color={colors.primary}
                      />
                      <Text
                        className="text-xs font-black tracking-widest uppercase"
                        style={{ color: colors.foreground, fontFamily: fonts.heading }}
                      >
                        Spark Deck Active
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setActiveGameMode("none")}>
                      <Feather
                        name="minimize-2"
                        size={14}
                        color={colors.mutedText}
                      />
                    </TouchableOpacity>
                  </View>

                  <View className="p-5 rounded-2xl min-h-[90px] justify-center" style={{ backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.border }}>
                    <Text
                      className="text-xs font-bold text-center leading-5 italic"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                    >
                      {sparkCards[currentPromptIdx]}
                    </Text>
                  </View>

                  <View className="mt-4 flex-row justify-end">
                    <TouchableOpacity
                      onPress={handleNextSparkCard}
                      className="flex-row items-center gap-1.5 px-4 py-2 rounded-xl border"
                      style={{
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      }}
                    >
                      <Feather
                        name="arrow-right"
                        size={12}
                        color={colors.foreground}
                      />
                      <Text
                        className="text-xs font-bold"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        Next Card
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {activeGameMode === "positions" && (
                <View className="py-1">
                  <View className="flex-row justify-between items-center mb-4 pb-2" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <View className="flex-row items-center gap-2">
                      <MaterialCommunityIcons
                        name="fire"
                        size={16}
                        color={colors.danger}
                      />
                      <Text
                        className="text-xs font-black tracking-widest uppercase"
                        style={{ color: colors.foreground, fontFamily: fonts.heading }}
                      >
                        Positions Deck
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setActiveGameMode("none")}>
                      <Feather
                        name="minimize-2"
                        size={14}
                        color={colors.mutedText}
                      />
                    </TouchableOpacity>
                  </View>

                  <View className="p-6 rounded-2xl" style={{ backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.border }}>
                    <Text className="text-sm font-black tracking-tight text-center" style={{ color: colors.primary, fontFamily: fonts.heading }}>
                      {positionCards[currentPositionIdx].name}
                    </Text>
                    <View className="my-2.5 px-3 py-1  self-center rounded-md">
                      <Text
                        className="text-[10px] font-bold uppercase tracking-wider text-center"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        Focus: {positionCards[currentPositionIdx].focus}
                      </Text>
                    </View>
                    <Text
                      className="text-xs font-medium text-center leading-4 mt-1"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      {positionCards[currentPositionIdx].tip}
                    </Text>
                  </View>

                  <View className="mt-4 flex-row justify-end">
                    <TouchableOpacity
                      onPress={handleNextPositionCard}
                      className="flex-row items-center gap-1.5 px-4 py-2 rounded-xl border"
                      style={{
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      }}
                    >
                      <Feather
                        name="shuffle"
                        size={12}
                        color={colors.foreground}
                      />
                      <Text
                        className="text-xs font-bold"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        Shuffle Deck
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
          </View>

          {/* DYNAMIC SCROLLABLE CLICKABLE RESOURCE HUB */}
          <Text
            className="text-[11px] font-black uppercase"
            style={{
              color: colors.primary,
              fontFamily: fonts.heading,
              letterSpacing: 1,
              marginBottom: 10,
              paddingHorizontal: 22,
            }}
          >
            Clinical Resource Hub
          </Text>

          <View
            className="flex-row flex-wrap"
            style={{ paddingHorizontal: 22, gap: 10 }}
          >
            {visibleCategories.map((category, index) => {
              const categoryTints = [
                softTints.pink,
                softTints.emerald,
                softTints.lavender,
                softTints.amber,
              ];
              const currentTint = categoryTints[index % categoryTints.length];

              return (
                <TouchableOpacity
                  key={category.id}
                  activeOpacity={0.85}
                  onPress={() => handleOpenArticleModal(category)} // MODAL HOOK APPLIED INSTEAD OF ROUTER REDIRECTS
                  style={{
                    width: "47%",
                    backgroundColor: colors.surface,
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 10,
                    ...getShadow(colors, isDark),
                  }}
                >
                  <View className="flex-row justify-between items-start">
                    <View
                      className="items-center justify-center"
                      style={{ width: 34, height: 34, borderRadius: 13, backgroundColor: currentTint }}
                    >
                      <Ionicons
                        name={category.icon as any}
                        size={17}
                        color={category.color}
                      />
                    </View>
                    <View className="px-2 py-1 rounded-md" style={{ backgroundColor: colors.surfaceSoft }}>
                      <Text
                        className="text-[9px] font-bold tracking-wide"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
                      >
                        {category.items} Hubs
                      </Text>
                    </View>
                  </View>

                  <Text
                    className="text-xs font-black tracking-tight"
                    style={{ color: colors.foreground, fontFamily: fonts.heading, marginTop: 10 }}
                  >
                    {category.title}
                  </Text>
                  <Text
                    className="text-[11px] font-medium leading-4 mt-1.5"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                    numberOfLines={2}
                  >
                    {category.summary}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* VERIFICATION STATEMENT BADGE FOOTER BAR PANEL */}
          <View
            className="flex-row items-center"
            style={{
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 14,
              gap: 12,
              marginHorizontal: 22,
              marginTop: 16,
              ...getShadow(colors, isDark),
            }}
          >
            <View
              className="items-center justify-center rounded-xl"
              style={{ width: 36, height: 36, backgroundColor: softTints.emerald }}
            >
              <MaterialCommunityIcons
                name="shield-account-outline"
                size={18}
                color={colors.success}
              />
            </View>
            <Text
              className="flex-1 text-[11.5px] leading-4"
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              <Text
                className="font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                Verified Guidance —{" "}
              </Text>
              every resource is continuously mapped alongside board-certified
              health specialists to eliminate misinformation.
            </Text>
          </View>
        </ScrollView>

        {/* --- DYNAMIC THREADS STYLE SLIDING IN-SCREEN ARTICLE DETAIL BOTTOM SHEET MODAL --- */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={handleCloseArticleModal}
        >
          {selectedCategory && (
            <SafeAreaView
              className="flex-1"
              style={{ backgroundColor: colors.background }}
            >
              {/* Sheet Control Header section.
                  Android ignores presentationStyle="pageSheet" and renders
                  this Modal truly fullscreen under the status bar, so
                  SafeAreaView (not a plain View) is required to keep this
                  header — and the content below it — on screen. */}
              <View
                className="px-6 py-4 flex-row justify-between items-center"
                style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}
              >
                <View className="flex-row items-center gap-3">
                  <View className="p-2 rounded-xl" style={{ backgroundColor: colors.surfaceSoft }}>
                    <Ionicons
                      name={selectedCategory.icon as any}
                      size={18}
                      color={selectedCategory.color}
                    />
                  </View>
                  <Text
                    className="text-base font-black tracking-tight"
                    style={{ color: colors.foreground, fontFamily: fonts.heading }}
                  >
                    {selectedCategory.title}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleCloseArticleModal}
                  className="p-1.5 rounded-full"
                  style={{ backgroundColor: colors.surfaceSoft }}
                >
                  <Feather name="x" size={16} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              {/* Scrollable Document Content details area */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 24, gap: 20 }}
              >
                {/* Intro summary header block */}
                <View>
                  <Text
                    className="text-xs font-bold tracking-widest uppercase mb-1.5"
                    style={{ color: colors.primary, fontFamily: fonts.heading }}
                  >
                    Overview Summary
                  </Text>
                  <Text
                    className="text-sm font-medium leading-6"
                    style={{ color: colors.text, fontFamily: fonts.body }}
                  >
                    {selectedCategory.summary}
                  </Text>
                  {!!selectedCategory.estimatedReadTime && (
                    <View className="flex-row items-center gap-1 mt-2">
                      <Feather name="clock" size={11} color={colors.mutedText} />
                      <Text
                        className="text-[10px] font-bold"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
                      >
                        {selectedCategory.estimatedReadTime} min read
                      </Text>
                    </View>
                  )}
                </View>

                {(selectedCategory.videoUrl || selectedCategory.audioUrl) && (
                  <View className="flex-row gap-3">
                    {!!selectedCategory.videoUrl && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => Linking.openURL(selectedCategory.videoUrl!)}
                        className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl border"
                        style={{ backgroundColor: colors.surfaceSoft, borderColor: colors.border }}
                      >
                        <Ionicons name="play-circle-outline" size={16} color={colors.primary} />
                        <Text
                          className="text-xs font-bold"
                          style={{ color: colors.primary, fontFamily: fonts.body }}
                        >
                          Watch Video
                        </Text>
                      </TouchableOpacity>
                    )}
                    {!!selectedCategory.audioUrl && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => Linking.openURL(selectedCategory.audioUrl!)}
                        className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl border"
                        style={{ backgroundColor: colors.surfaceSoft, borderColor: colors.border }}
                      >
                        <Ionicons name="headset-outline" size={16} color={colors.primary} />
                        <Text
                          className="text-xs font-bold"
                          style={{ color: colors.primary, fontFamily: fonts.body }}
                        >
                          Listen
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Separator split frame border line */}
                <View style={{ height: 1, backgroundColor: colors.border }} />

                {/* Multi lines detailed clinical checkboxes insights guide system list */}
                <View className="gap-3.5">
                  <Text
                    className="text-xs font-bold tracking-widest uppercase mb-1"
                    style={{ color: colors.success, fontFamily: fonts.heading }}
                  >
                    Verified Care Strategies
                  </Text>
                  {selectedCategory.extendedGuide.map((line, idx) => (
                    <View
                      key={idx}
                      className="flex-row items-start p-4 rounded-2xl"
                      style={{ backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.border }}
                    >
                      <View className="mt-0.5 mr-3.5 p-1 rounded-full" style={{ backgroundColor: colors.successLight }}>
                        <Ionicons
                          name="shield-checkmark"
                          size={14}
                          color={colors.success}
                        />
                      </View>
                      <Text
                        className="flex-1 text-xs font-medium leading-5"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        {line}
                      </Text>
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
