import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../components/theme";

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
}

export default function HealthIssues() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const issues: HealthIssue[] = [
    {
      id: "hi_1",
      title: "PCOS / PCOD",
      category: "Hormonal Equilibrium",
      icon: "alert-circle-outline",
      color: "#ef4444",
      summary:
        "Polycystic Ovary Syndrome is a complex metabolic and endocrine disorder that can disrupt ovarian function, metabolic baselines, insulin responses, and dermatological consistency.",
      guide:
        "1. Monitor cycle spacing logs diligently.\n2. Note persistent hair texture variations or acne flare-ups.\n3. Implement balanced, low-glycemic active dietary support.\n4. Consult a clinical endocrinologist or OBGYN for systemic evaluations.",
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
        "A progressive condition where tissue similar to the uterine lining extends onto pelvic organs, often generating extreme inflammatory cycles and intense localized discomfort.",
      guide:
        "1. Quantify pain indexes specifically during and outside menstruation.\n2. Record heavy bleeding logs and pain anchors.\n3. Integrate warm thermal compresses during muscle fatigue stages.\n4. Access advanced imaging pathways via certified gynaecology centers.",
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
        "Benign muscular tissue developments within the uterine layers that can expand, introducing local pressure, heavy discharge parameters, and frequent fatigue intervals.",
      guide:
        "1. Log abnormal volume fluctuations or sudden unexpected flows.\n2. Track pelvic pressure indicators or lower body strains.\n3. Balance iron mineral tracking if high bleeding occurs.\n4. Confirm alignment and scale variances using ultrasound diagnostics.",
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
        "Dedicated structural insight suite tracking preliminary symptoms, embryonic biological intervals, nausea variations, and targeted lifestyle optimization.",
      guide:
        "1. Record accurate missed timeline milestones and morning patterns.\n2. Trace breast sensitivity or sudden sensory fluctuations.\n3. Prioritize clean organic hydration and recommended folate blocks.\n4. Validate baseline growth structures regularly with clinical support.",
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
        "Persistent deviations from common cycle frequencies, frequently activated by cortisol stress triggers, underlying endocrine transitions, or sudden travel modifications.",
      guide:
        "1. Track structural start windows across consecutive 90-day segments.\n2. Correlate periods against sleep metrics and mental workloads.\n3. Reduce systemic inflammatory patterns using mindfulness modules.\n4. Initiate medical validation if intervals routinely exceed historical variances.",
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
        "The milestone endocrine evolution marking the completion of reproductive cycle intervals, accompanied by thermoregulation adjustments, sleep shifts, and bone health changes.",
      guide:
        "1. Log the spacing frequency of sudden hot flash intervals.\n2. Evaluate midnight wakefulness indices or energy distribution alterations.\n3. Reinforce calcium and trace minerals configuration mappings.\n4. Engage hormone replacement discussion blocks if discomfort increases.",
      imageUrl:
        "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=600&auto=format&fit=crop",
    },
  ];

  const softTints = {
    pink: isDark ? "#3b1a2d" : "#fff0f6",
    blue: isDark ? "#162842" : "#edf2ff",
    orange: isDark ? "#361e12" : "#fff7ed",
    purple: isDark ? "#231942" : "#f3e8ff",
    emerald: isDark ? "#062e20" : "#ecfdf5",
    cyan: isDark ? "#0c2329" : "#ecfeff",
  };

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
            style={{ color: colors.foreground }}
          >
            Health Concerns
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
        >
          <View className="mx-6 mt-6">
            <Text
              className="mb-5 text-xs font-semibold"
              style={{ color: colors.mutedText }}
            >
              Select an encyclopedia entry to explore insights and medical
              guidance.
            </Text>

            {/* HIGH-FIDELITY ASYMMETRIC CLEAN LIST CARD ROWS */}
            <View className="gap-3.5">
              {issues.map((issue, index) => {
                // Compute matching index tints dynamically for uniform distribution
                const tintColors = [
                  softTints.pink,
                  softTints.orange,
                  softTints.purple,
                  softTints.blue,
                  softTints.emerald,
                  softTints.cyan,
                ];
                const activeTint = tintColors[index % tintColors.length];

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
                        color={issue.color}
                      />
                    </View>
                    <View className="flex-1 pr-2">
                      <Text className="text-[10px] font-black uppercase tracking-wider text-pink-500">
                        {issue.category}
                      </Text>
                      <Text
                        className="text-sm font-extrabold tracking-tight mt-0.5"
                        style={{ color: colors.foreground }}
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
            </View>
          </View>
        </ScrollView>

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
                className="px-6 py-4.5 border-b border-neutral-100 dark:border-neutral-900 flex-row justify-between items-center"
                style={{ backgroundColor: colors.surface }}
              >
                <View>
                  <Text className="text-[10px] font-black uppercase tracking-widest text-pink-500 pt-4">
                    {selectedIssueData.category}
                  </Text>
                  <Text
                    className="text-base font-black tracking-tight mt-0.5"
                    style={{ color: colors.foreground }}
                  >
                    {selectedIssueData.title}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setDetailModalVisible(false)}
                  className="p-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full"
                >
                  <Feather name="x" size={16} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              {/* Scrollable Clinical Core Body Context Area */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 60 }}
              >
                {/* HIGH RESOLUTION HERO MEDICAL ILLUSTRATION BANNER */}
                <View className="w-full h-52 relative bg-neutral-100">
                  <Image
                    source={{ uri: selectedIssueData.imageUrl }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                  <View className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                </View>

                {/* CONTENT AREA WRAPPER */}
                <View className="px-6 pt-6">
                  {/* Part A: Clinical Interpretation Framework */}
                  <Text
                    className="text-xs font-bold tracking-widest uppercase mb-2.5"
                    style={{ color: colors.primary }}
                  >
                    Clinical Understanding
                  </Text>
                  <Text
                    className="text-sm font-medium leading-6 mb-6"
                    style={{ color: colors.foreground }}
                  >
                    {selectedIssueData.summary}
                  </Text>

                  {/* Horizontal Border Break Separator Line */}
                  <View className="h-[1px] w-full bg-neutral-100 dark:bg-neutral-900 mb-6" />

                  {/* Part B: Specialized Active Interactive Symptom Guidance Roadmap */}
                  <Text
                    className="text-xs font-bold tracking-widest uppercase mb-3"
                    style={{ color: "#10b981" }}
                  >
                    Ecosystem Guidance Rules
                  </Text>
                  <View
                    className="p-5 rounded-2xl border bg-neutral-50 dark:bg-neutral-900/40"
                    style={{ borderColor: colors.border }}
                  >
                    <Text
                      className="text-xs font-semibold leading-6"
                      style={{ color: colors.foreground }}
                    >
                      {selectedIssueData.guide}
                    </Text>
                  </View>

                  {/* Operational Telehealth Action Redirection Banner Badge */}
                  <View className="mt-6 p-4 rounded-xl flex-row items-center justify-between border border-dashed border-neutral-300 dark:border-neutral-700">
                    <View className="flex-1 pr-4">
                      <Text
                        className="text-xs font-bold"
                        style={{ color: colors.foreground }}
                      >
                        Persistent Symptoms?
                      </Text>
                      <Text
                        className="text-[10px] mt-0.5"
                        style={{ color: colors.mutedText }}
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
                        style={{ color: colors.buttonText }}
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
