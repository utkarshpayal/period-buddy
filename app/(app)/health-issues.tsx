import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
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
import { useTheme, type ThemeColors } from "../../components/theme";
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import { healthIssuesApi, type HealthIssue as ApiHealthIssue } from "../../lib/api";

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
}

const fallbackIssues: HealthIssue[] = [
  {
    id: "hi_1",
    title: "PCOS / PCOD",
    category: "Hormonal Equilibrium",
    icon: "alert-circle-outline",
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
    icon: "pulse",
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
    icon: "apps-outline",
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
    icon: "heart-outline",
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
    icon: "shuffle-outline",
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
    icon: "water-outline",
    color: "#06b6d4",
    summary:
      "Menopause and perimenopause can bring hot flashes, sleep changes, mood shifts, vaginal dryness, and bone health changes.",
    guide:
      "1. Track hot flashes and night sweats.\n2. Note sleep, mood, and energy changes.\n3. Discuss calcium, vitamin D, and bone health.\n4. Ask a clinician about treatment options if symptoms disrupt daily life.",
    imageUrl:
      "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=600&auto=format&fit=crop",
  },
];

function getIssueAccentColor(
  issue: Pick<HealthIssue, "color">,
  colors: ThemeColors,
) {
  switch (issue.color) {
    case "#ef4444":
      return colors.primary;
    case "#f97316":
      return colors.warning;
    case "#fbbf24":
      return colors.accent;
    case "#ec4899":
      return colors.rose;
    case "#8b5cf6":
      return colors.lavender;
    default:
      return colors.mint;
  }
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
  };
}

export default function HealthIssues() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [issues, setIssues] = useState<HealthIssue[]>(fallbackIssues);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadIssues() {
      try {
        const response = await healthIssuesApi.getIssues();
        if (isMounted && response.length > 0) {
          setIssues(response.map(mapHealthIssue));
        }
      } catch {
        if (isMounted) setIssues(fallbackIssues);
      }
    }

    loadIssues();

    return () => {
      isMounted = false;
    };
  }, []);

  const softTints = getSoftTints(colors);

  const categoryOptions = [
    "all",
    ...Array.from(new Set(issues.map((issue) => issue.category))),
  ];
  const filteredIssues =
    selectedCategory === "all"
      ? issues
      : issues.filter((issue) => issue.category === selectedCategory);

  const selectedIssueData = issues.find(
    (issue) => issue.id === selectedIssueId,
  );

  function handleTriggerDetails(id: string) {
    setSelectedIssueId(id);
    setDetailModalVisible(true);
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
            style={{ color: colors.foreground, fontFamily: fonts.heading }}
          >
            Health Concerns
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <View className="mx-6 mt-6">
            <Text
              className="mb-4 text-xs font-semibold"
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              Select an encyclopedia entry to explore insights and medical
              guidance.
            </Text>

            {/* Category Filter Dropdown Trigger */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setCategoryPickerVisible(true)}
              className="self-start flex-row items-center gap-1.5 px-4 py-2 mb-5 rounded-full border"
              style={{
                backgroundColor:
                  selectedCategory === "all" ? colors.surface : softTints.pink,
                borderColor:
                  selectedCategory === "all" ? colors.border : colors.primary,
              }}
            >
              <Text
                className="text-xs font-bold"
                style={{
                  color:
                    selectedCategory === "all"
                      ? colors.foreground
                      : colors.primary,
                  fontFamily: fonts.body,
                }}
              >
                {selectedCategory === "all" ? "All Categories" : selectedCategory}
              </Text>
              <Feather
                name="chevron-down"
                size={13}
                color={selectedCategory === "all" ? colors.mutedText : colors.primary}
              />
            </TouchableOpacity>

            {/* HIGH-FIDELITY ASYMMETRIC CLEAN LIST CARD ROWS */}
            <View className="gap-3.5">
              {filteredIssues.map((issue, index) => {
                // Compute matching index tints dynamically for uniform distribution
                const tintColors = [
                  softTints.pink,
                  softTints.amber,
                  softTints.lavender,
                  softTints.blue,
                  softTints.emerald,
                  softTints.mint,
                ];
                const activeTint = tintColors[index % tintColors.length];
                const accentColor = getIssueAccentColor(issue, colors);

                return (
                  <TouchableOpacity
                    key={issue.id}
                    onPress={() => handleTriggerDetails(issue.id)}
                    activeOpacity={0.75}
                    className="flex-row items-center p-4 rounded-2xl border shadow-3xl"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    }}
                  >
                    <View
                      className="p-3 rounded-xl mr-4"
                      style={{ backgroundColor: activeTint }}
                    >
                      <Ionicons
                        name={issue.icon as any}
                        size={20}
                        color={accentColor}
                      />
                    </View>
                    <View className="flex-1 pr-2">
                      <Text
                        className="text-[10px] font-black uppercase tracking-wider"
                        style={{ color: accentColor, fontFamily: fonts.body }}
                      >
                        {issue.category}
                      </Text>
                      <Text
                        className="text-sm font-extrabold tracking-tight mt-0.5"
                        style={{ color: colors.foreground, fontFamily: fonts.heading }}
                      >
                        {issue.title}
                      </Text>
                    </View>
                    <Feather
                      name="chevron-right"
                      size={16}
                      color={colors.mutedText}
                    />
                  </TouchableOpacity>
                );
              })}

              {filteredIssues.length === 0 && (
                <View className="items-center py-10">
                  <Text
                    className="text-sm font-medium"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    No entries found for this category yet.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>

        {/* --- CATEGORY FILTER DROPDOWN SELECT MODAL --- */}
        <Modal
          visible={categoryPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCategoryPickerVisible(false)}
        >
          <Pressable
            className="flex-1 justify-center items-center px-8"
            style={{ backgroundColor: colors.overlay }}
            onPress={() => setCategoryPickerVisible(false)}
          >
            <View
              className="w-full max-w-[300px] p-4 rounded-3xl border"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                ...getShadow(colors, isDark),
              }}
            >
              <Text
                className="text-center font-extrabold mb-3 text-base"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                Filter by Category
              </Text>
              {categoryOptions.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => {
                      setSelectedCategory(cat);
                      setCategoryPickerVisible(false);
                    }}
                    className="py-3 px-4 rounded-xl flex-row items-center justify-between"
                    style={{
                      backgroundColor: isSelected ? softTints.pink : "transparent",
                    }}
                  >
                    <Text
                      className="font-bold text-sm"
                      style={{
                        color: isSelected ? colors.primary : colors.foreground,
                        fontFamily: fonts.body,
                      }}
                    >
                      {cat === "all" ? "All Categories" : cat}
                    </Text>
                    {isSelected && (
                      <Feather name="check" size={16} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Modal>

        {/* --- DYNAMIC FULL PAGE INTERACTIVE DETAIL PRESENTATION MODAL --- */}
        <Modal
          visible={detailModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setDetailModalVisible(false)}
        >
          {selectedIssueData && (
            <View
              className="flex-1"
              style={{ backgroundColor: colors.background }}
            >
              {/* Sheet Control Sticky Upper Header Action Row */}
              <View
                className="px-6 pb-4 border-b flex-row justify-between items-center"
                style={{
                  backgroundColor: colors.surface,
                  borderBottomColor: colors.border,
                  paddingTop: insets.top + 16,
                }}
              >
                <View>
                  <Text
                    className="text-[10px] font-black uppercase tracking-widest pt-4"
                    style={{
                      color: getIssueAccentColor(selectedIssueData, colors),
                      fontFamily: fonts.body,
                    }}
                  >
                    {selectedIssueData.category}
                  </Text>
                  <Text
                    className="text-base font-black tracking-tight mt-0.5"
                    style={{ color: colors.foreground, fontFamily: fonts.heading }}
                  >
                    {selectedIssueData.title}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setDetailModalVisible(false)}
                  className="p-1.5 rounded-full"
                  style={{ backgroundColor: colors.surfaceSoft }}
                >
                  <Feather name="x" size={16} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              {/* Scrollable Clinical Core Body Context Area */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
              >
                {/* HIGH RESOLUTION HERO MEDICAL ILLUSTRATION BANNER */}
                <View
                  className="w-full h-52 relative"
                  style={{ backgroundColor: colors.surfaceSoft }}
                >
                  <Image
                    source={{ uri: selectedIssueData.imageUrl }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                  <View
                    className="absolute inset-0"
                    style={{ backgroundColor: "rgba(0,0,0,0.12)" }}
                  />
                </View>

                {/* CONTENT AREA WRAPPER */}
                <View className="px-6 pt-6">
                  {/* Part A: Clinical Interpretation Framework */}
                  <Text
                    className="text-xs font-bold tracking-widest uppercase mb-2.5"
                    style={{ color: colors.primary, fontFamily: fonts.heading }}
                  >
                    Clinical Understanding
                  </Text>
                  <Text
                    className="text-sm font-medium leading-6 mb-6"
                    style={{ color: colors.foreground, fontFamily: fonts.body }}
                  >
                    {selectedIssueData.summary}
                  </Text>

                  {/* Horizontal Border Break Separator Line */}
                  <View
                    className="h-[1px] w-full mb-6"
                    style={{ backgroundColor: colors.border }}
                  />

                  {/* Part B: Specialized Active Interactive Symptom Guidance Roadmap */}
                  <Text
                    className="text-xs font-bold tracking-widest uppercase mb-3"
                    style={{ color: colors.success, fontFamily: fonts.heading }}
                  >
                    Care Guidance
                  </Text>
                  <View
                    className="p-5 rounded-2xl border"
                    style={{
                      backgroundColor: colors.surfaceSoft,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      className="text-xs font-semibold leading-6"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                    >
                      {selectedIssueData.guide}
                    </Text>
                  </View>

                  {/* Symptoms & Causes Segregation Grid */}
                  {((selectedIssueData.symptoms?.length ?? 0) > 0 ||
                    (selectedIssueData.causes?.length ?? 0) > 0) && (
                    <View className="flex-row gap-3 mt-6">
                      {(selectedIssueData.symptoms?.length ?? 0) > 0 && (
                        <View className="flex-1">
                          <Text
                            className="text-xs font-bold tracking-widest uppercase mb-2"
                            style={{ color: colors.warning, fontFamily: fonts.heading }}
                          >
                            Symptoms
                          </Text>
                          <View className="gap-1.5">
                            {selectedIssueData.symptoms!.map((symptom, idx) => (
                              <View key={idx} className="flex-row items-start gap-1.5">
                                <Text
                                  className="text-xs"
                                  style={{ color: colors.mutedText }}
                                >
                                  •
                                </Text>
                                <Text
                                  className="flex-1 text-xs font-medium leading-5"
                                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                                >
                                  {symptom}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}
                      {(selectedIssueData.causes?.length ?? 0) > 0 && (
                        <View className="flex-1">
                          <Text
                            className="text-xs font-bold tracking-widest uppercase mb-2"
                            style={{ color: colors.lavender, fontFamily: fonts.heading }}
                          >
                            Causes
                          </Text>
                          <View className="gap-1.5">
                            {selectedIssueData.causes!.map((cause, idx) => (
                              <View key={idx} className="flex-row items-start gap-1.5">
                                <Text
                                  className="text-xs"
                                  style={{ color: colors.mutedText }}
                                >
                                  •
                                </Text>
                                <Text
                                  className="flex-1 text-xs font-medium leading-5"
                                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                                >
                                  {cause}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Treatment / Prevention / When To See Doctor Detail Blocks */}
                  {[
                    { label: "Treatment", value: selectedIssueData.treatment },
                    { label: "Prevention", value: selectedIssueData.prevention },
                    { label: "When to See a Doctor", value: selectedIssueData.whenToSeeDoctor },
                  ]
                    .filter((section) => !!section.value)
                    .map((section) => (
                      <View key={section.label} className="mt-6">
                        <Text
                          className="text-xs font-bold tracking-widest uppercase mb-2"
                          style={{ color: colors.primary, fontFamily: fonts.heading }}
                        >
                          {section.label}
                        </Text>
                        <Text
                          className="text-xs font-medium leading-6"
                          style={{ color: colors.foreground, fontFamily: fonts.body }}
                        >
                          {section.value}
                        </Text>
                      </View>
                    ))}

                  {/* Operational Telehealth Action Redirection Banner Badge */}
                  <View
                    className="mt-6 p-4 rounded-xl flex-row items-center justify-between border border-dashed"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    }}
                  >
                    <View className="flex-1 pr-4">
                      <Text
                        className="text-xs font-bold"
                        style={{ color: colors.foreground, fontFamily: fonts.heading }}
                      >
                        Persistent Symptoms?
                      </Text>
                      <Text
                        className="text-[10px] mt-0.5"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
                      >
                        Connect privately with specialized OBGYNs instantly.
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        setDetailModalVisible(false);
                        router.push("/(app)/consultation" as any);
                      }}
                      className="px-3.5 py-2 rounded-xl"
                      style={{ backgroundColor: colors.primary }}
                    >
                      <Text
                        className="text-[11px] font-black"
                        style={{ color: colors.buttonText, fontFamily: fonts.body }}
                      >
                        Consult
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </View>
          )}
        </Modal>
      </SafeAreaView>
    </>
  );
}
