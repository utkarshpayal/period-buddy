import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
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

  // Gamified Card Decks Pool Arrays
  const intimacyPromptsPool = [
    "What is one small, non-physical gesture that always makes you feel deeply loved or secure by me?",
    "If we could try any brand new couple's habit or routine together this month, what would it be?",
    "What's a clean or easy boundary you want to talk about regarding intimacy during heavy period flows?",
    "Describe your absolute favorite memory of a cozy, relaxed night spent together.",
  ];

  const positionsPool = [
    {
      name: "The Mission Comfort",
      focus: "High Clitoral Contact & Proximity",
      tip: "Place a soft pillow under the lower hips to perfectly ease pelvic pressure and elevate deep comfort structures smoothly.",
    },
    {
      name: "The Lotus Variant",
      focus: "Intense Eye Contact & Deep Sync",
      tip: "An incredibly relaxed sitting posture that shifts full body workload speed control directly to the female partner. Perfect for fatigue stages.",
    },
    {
      name: "The Side Spoon Wrap",
      focus: "Zero Pelvic Pressure & Low Fatigue",
      tip: "The absolute best medical-wellness position for cramping period days. Allows comforting full body contact from behind with zero weight strains.",
    },
  ];

  const categories: ResourceCategory[] = [
    {
      id: "sw_1",
      title: "Intimacy & Periods",
      icon: "heart-outline",
      color: "#d946a6",
      items: 8,
      summary:
        "Science-backed guidance on comfort parameters, physical safety maps, and clear boundary setup during active flows.",
      extendedGuide: [
        "Communication Hub: Discuss energy levels and flow intensity before establishing intimate touch.",
        "Natural Relief: Endorphins released during climax can act as an organic painkiller for heavy tracking cramps.",
        "Preparation: Place a dark comfort towel down to eliminate staining concerns or friction drops entirely.",
      ],
    },
    {
      id: "sw_2",
      title: "STI Prevention Guide",
      icon: "shield-checkmark-outline",
      color: "#10b981",
      items: 12,
      summary:
        "Clear clinical barrier method breakdowns, routine health panel checkpoints, and stigma-free screening data.",
      extendedGuide: [
        "Barrier Mechanics: Always ensure compatible protective barriers are deployed sequentially from the start.",
        "Routine Testing: Clinical panels are recommended every 6 months for active partners.",
        "Asymptomatic Spreads: Remember that many micro-bacterial pathways transfer tracking loops without physical signs.",
      ],
    },
    {
      id: "sw_3",
      title: "Contraception Matrix",
      icon: "apps-outline",
      color: "#8b5cf6",
      items: 15,
      summary:
        "Compare hormonal adjustments, physical barriers, effectiveness indices, and what to discuss with an OBGYN.",
      extendedGuide: [
        "Double Shielding: Combine barrier tracking with hormonal tracking loops for up to 99% accuracy.",
        "Emergency Window: Pill methods are most active when deployed within 72 hours of unprotected loops.",
        "OBGYN Alignment: Consult our clinical desk before modifying regular hormonal prescription cycles.",
      ],
    },
    {
      id: "sw_4",
      title: "Consent & Safety Cores",
      icon: "checkmark-circle-outline",
      color: "#f97316",
      items: 6,
      summary:
        "Navigating personal physiological choices, digital tracking security, boundaries, and affirmative verification.",
      extendedGuide: [
        "Affirmative Choice: Clear, conscious, and enthusiastic confirmation must be present at every level.",
        "Reversible Steps: Consent can be securely paused or changed at any point during active intimacy.",
        "Digital Boundaries: Establish clear privacy layouts before sharing media assets over public chains.",
      ],
    },
  ];

  const softTints = {
    pink: isDark ? "#3b1a2d" : "#fff0f6",
    emerald: isDark ? "#062e20" : "#ecfdf5",
    purple: isDark ? "#231942" : "#f3e8ff",
    orange: isDark ? "#361e12" : "#fff7ed",
  };

  // Deck Shuffle Controller Mechanics
  function handleNextSparkCard() {
    setCurrentPromptIdx((prev) => (prev + 1) % intimacyPromptsPool.length);
    earnTokens(1);
  }

  function handleNextPositionCard() {
    setCurrentPositionIdx((prev) => (prev + 1) % positionsPool.length);
    earnTokens(2);
  }

  // MODAL TRIGGER ACTION INSTEAD OF REDIRECT HOOKS
  function handleOpenArticleModal(category: ResourceCategory) {
    setSelectedCategory(category);
    setModalVisible(true);
    earnTokens(3); // Reward reading interaction metrics
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
              Science-backed biological insights, intimacy metrics, and
              relational gamified tools.
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
                    explore intimacy levels dynamically together.
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
                        💬 Play Spark
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setActiveGameMode("positions")}
                      className="flex-1 rounded-xl py-3 items-center justify-center border"
                      style={{
                        backgroundColor: softTints.purple,
                        borderColor: colors.border,
                      }}
                    >
                      <Text
                        className="text-xs font-bold"
                        style={{ color: "#8b5cf6" }}
                      >
                        🔥 Positions
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
                      "{intimacyPromptsPool[currentPromptIdx]}"
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
                        color="#ef4444"
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
                      {positionsPool[currentPositionIdx].name}
                    </Text>
                    <View className="my-2.5 px-3 py-1 bg-neutral-100 dark:bg-neutral-800 self-center rounded-md">
                      <Text
                        className="text-[10px] font-bold uppercase tracking-wider text-center"
                        style={{ color: colors.foreground }}
                      >
                        🎯 Focus: {positionsPool[currentPositionIdx].focus}
                      </Text>
                    </View>
                    <Text
                      className="text-xs font-medium text-center leading-4 mt-1"
                      style={{ color: colors.mutedText }}
                    >
                      {positionsPool[currentPositionIdx].tip}
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
            {categories.map((category, index) => {
              const categoryTints = [
                softTints.pink,
                softTints.emerald,
                softTints.purple,
                softTints.orange,
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
                color="#10b981"
              />
            </View>
            <View className="flex-1">
              <Text
                className="text-xs font-bold"
                style={{ color: colors.foreground }}
              >
                Ecosystem Verification Framework
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
                    style={{ color: "#10b981" }}
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
                          color="#10b981"
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
