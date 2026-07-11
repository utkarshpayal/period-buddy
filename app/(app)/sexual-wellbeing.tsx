import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import { useTheme } from "../../components/theme";
import { getSoftTints } from "../../components/ui-tokens";
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
  const { colors, isDark } = useTheme();
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
  const [sparkCards, setSparkCards] = useState(fallbackSparkCards);
  const [positionCards, setPositionCards] = useState(fallbackPositionCards);

  const softTints = getSoftTints(colors);
  const visibleCategories =
    apiCategories.length > 0 ? apiCategories : categories;

  useEffect(() => {
    let isMounted = true;

    async function loadWellbeing() {
      try {
        const [resources, sparkDeck, positionsDeck] = await Promise.all([
          wellbeingApi.getResources("sexual_wellbeing"),
          wellbeingApi.getGameDecks("spark"),
          wellbeingApi.getGameDecks("positions"),
        ]);

        if (!isMounted) return;

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
        if (isMounted) {
          setApiCategories([]);
          setSparkCards(fallbackSparkCards);
          setPositionCards(fallbackPositionCards);
        }
      }
    }

    loadWellbeing();

    return () => {
      isMounted = false;
    };
  }, []);

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
        <View className="flex-row items-center gap-2 px-6 pt-6">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="p-2.5 -ml-2 rounded-full border"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <Text
            className="flex-1 text-2xl font-black tracking-tight ml-2"
            style={{ color: colors.foreground }}
          >
            Wellbeing
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
        >
          <View className="px-6 mt-4">
            <Text
              className="text-xs font-semibold"
              style={{ color: colors.mutedText }}
            >
              Consent-centered intimacy guidance, safety resources, and private
              partner conversation tools.
            </Text>
          </View>

          {/* DYNAMIC MULTI-MODE PARTNER INTERACTIVE GAME DECKS */}
          <View className="mx-6 mt-6">
            <View
              className="rounded-3xl border p-5 shadow-xs relative overflow-hidden"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              {activeGameMode === "none" && (
                <View className="items-center py-2">
                  <MaterialCommunityIcons
                    name="gamepad-variant-outline"
                    size={32}
                    color={colors.primary}
                  />
                  <Text
                    className="text-base font-black tracking-tight mt-2.5"
                    style={{ color: colors.foreground }}
                  >
                    Partner Intimacy Game Center
                  </Text>
                  <Text
                    className="text-[11px] text-center px-4 leading-4 mt-1"
                    style={{ color: colors.mutedText }}
                  >
                    Choose a specialized conversational or physical card deck to
                    explore comfort, boundaries, and communication together.
                  </Text>

                  <View className="flex-row gap-3 w-full mt-5">
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setActiveGameMode("spark")}
                      className="flex-1 rounded-xl py-3 items-center justify-center border"
                      style={{
                        backgroundColor: softTints.pink,
                        borderColor: colors.border,
                      }}
                    >
                      <Text
                        className="text-xs font-bold"
                        style={{ color: colors.primary }}
                      >
                        Play Spark
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setActiveGameMode("positions")}
                      className="flex-1 rounded-xl py-3 items-center justify-center border"
                      style={{
                        backgroundColor: softTints.lavender,
                        borderColor: colors.border,
                      }}
                    >
                      <Text
                        className="text-xs font-bold"
                        style={{ color: colors.accent }}
                      >
                        Comfort Cards
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {activeGameMode === "spark" && (
                <View className="py-1">
                  <View className="flex-row justify-between items-center mb-4 pb-2 border-b border-neutral-100 dark:border-neutral-900/60">
                    <View className="flex-row items-center gap-2">
                      <Ionicons
                        name="chatbubbles-outline"
                        size={15}
                        color={colors.primary}
                      />
                      <Text
                        className="text-xs font-black tracking-widest uppercase"
                        style={{ color: colors.foreground }}
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

                  <View className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-100 p-5 rounded-2xl min-h-[90px] justify-center">
                    <Text
                      className="text-xs font-bold text-center leading-5 italic"
                      style={{ color: colors.foreground }}
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
                        style={{ color: colors.foreground }}
                      >
                        Next Card
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {activeGameMode === "positions" && (
                <View className="py-1">
                  <View className="flex-row justify-between items-center mb-4 pb-2 border-b border-neutral-100 dark:border-neutral-900/60">
                    <View className="flex-row items-center gap-2">
                      <MaterialCommunityIcons
                        name="fire"
                        size={16}
                        color={colors.danger}
                      />
                      <Text
                        className="text-xs font-black tracking-widest uppercase"
                        style={{ color: colors.foreground }}
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

                  <View className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-100 p-4.5 rounded-2xl">
                    <Text className="text-sm font-black tracking-tight text-center text-pink-500">
                      {positionCards[currentPositionIdx].name}
                    </Text>
                    <View className="my-2.5 px-3 py-1 bg-neutral-100 dark:bg-neutral-800 self-center rounded-md">
                      <Text
                        className="text-[10px] font-bold uppercase tracking-wider text-center"
                        style={{ color: colors.foreground }}
                      >
                        Focus: {positionCards[currentPositionIdx].focus}
                      </Text>
                    </View>
                    <Text
                      className="text-xs font-medium text-center leading-4 mt-1"
                      style={{ color: colors.mutedText }}
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
                        style={{ color: colors.foreground }}
                      >
                        Shuffle Deck
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* DYNAMIC SCROLLABLE CLICKABLE RESOURCE HUB */}
          <Text
            className="text-xs font-black tracking-widest uppercase mt-8 mb-4 px-7"
            style={{ color: colors.primary }}
          >
            Clinical Resource Hub
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, gap: 14 }}
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
                  className="w-64 p-5 rounded-3xl border shadow-3xl justify-between min-h-[210px]"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <View className="flex-row justify-between items-start">
                    <View
                      className="p-3 rounded-2xl"
                      style={{ backgroundColor: currentTint }}
                    >
                      <Ionicons
                        name={category.icon as any}
                        size={20}
                        color={category.color}
                      />
                    </View>
                    <View className="px-2.5 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800">
                      <Text
                        className="text-[9px] font-bold tracking-wide"
                        style={{ color: colors.mutedText }}
                      >
                        {category.items} Hubs
                      </Text>
                    </View>
                  </View>

                  <View className="mt-6 flex-row justify-between items-end">
                    <View className="flex-1 pr-2">
                      <Text
                        className="text-sm font-black tracking-tight"
                        style={{ color: colors.foreground }}
                      >
                        {category.title}
                      </Text>
                      <Text
                        className="text-[11px] font-medium leading-4 mt-2"
                        style={{ color: colors.mutedText }}
                        numberOfLines={2}
                      >
                        {category.summary}
                      </Text>
                    </View>
                    <View className="p-1.5 rounded-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 shadow-3xs">
                      <Feather
                        name="book-open"
                        size={13}
                        color={colors.primary}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* VERIFICATION STATEMENT BADGE FOOTER BAR PANEL */}
          <View
            className="mx-6 mt-8 p-5 rounded-2xl border flex-row items-start gap-4"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <View
              className="p-2.5 rounded-xl"
              style={{ backgroundColor: softTints.emerald }}
            >
              <MaterialCommunityIcons
                name="shield-account-outline"
                size={18}
                color={colors.success}
              />
            </View>
            <View className="flex-1">
              <Text
                className="text-xs font-bold"
                style={{ color: colors.foreground }}
              >
                Verified Guidance
              </Text>
              <Text
                className="mt-1 text-[11px] font-semibold leading-4"
                style={{ color: colors.mutedText }}
              >
                Every data asset is continuously mapped alongside
                board-certified health specialists to eliminate misinformation.
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* --- DYNAMIC THREADS STYLE SLIDING IN-SCREEN ARTICLE DETAIL BOTTOM SHEET MODAL --- */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setModalVisible(false)}
        >
          {selectedCategory && (
            <View
              className="flex-1"
              style={{ backgroundColor: colors.background }}
            >
              {/* Sheet Control Header section */}
              <View
                className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-900 flex-row justify-between items-center"
                style={{ backgroundColor: colors.surface }}
              >
                <View className="flex-row items-center gap-3">
                  <View className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800">
                    <Ionicons
                      name={selectedCategory.icon as any}
                      size={18}
                      color={selectedCategory.color}
                    />
                  </View>
                  <Text
                    className="text-base font-black tracking-tight"
                    style={{ color: colors.foreground }}
                  >
                    {selectedCategory.title}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  className="p-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full"
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
                    style={{ color: colors.primary }}
                  >
                    Overview Summary
                  </Text>
                  <Text
                    className="text-sm font-medium leading-6"
                    style={{ color: colors.text }}
                  >
                    {selectedCategory.summary}
                  </Text>
                </View>

                {/* Separator split frame border line */}
                <View className="h-[1px] w-full bg-neutral-100 dark:bg-neutral-900" />

                {/* Multi lines detailed clinical checkboxes insights guide system list */}
                <View className="gap-3.5">
                  <Text
                    className="text-xs font-bold tracking-widest uppercase mb-1"
                    style={{ color: colors.success }}
                  >
                    Verified Care Strategies
                  </Text>
                  {selectedCategory.extendedGuide.map((line, idx) => (
                    <View
                      key={idx}
                      className="flex-row items-start p-4 rounded-2xl border bg-neutral-50 dark:bg-neutral-900/40"
                      style={{ borderColor: colors.border }}
                    >
                      <View className="mt-0.5 mr-3.5 p-1 rounded-full bg-emerald-500/10">
                        <Ionicons
                          name="shield-checkmark"
                          size={14}
                          color={colors.success}
                        />
                      </View>
                      <Text
                        className="flex-1 text-xs font-medium leading-5"
                        style={{ color: colors.foreground }}
                      >
                        {line}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
        </Modal>
      </SafeAreaView>
    </>
  );
}
