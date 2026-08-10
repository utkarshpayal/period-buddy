  import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Linking,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../components/theme";
import { getSoftTints } from "../../components/ui-tokens";
import { wellbeingApi, type WellbeingResource } from "../../lib/api";

// --- BACKEND RESPONSE MODEL SCHEMAS ---
interface HygieneItem {
  id: string;
  title: string;
  icon: string;
  iconType: "ionicons" | "feather" | "material";
  description: string;
  category: "products" | "daily" | "activities" | "prevention";
  tips: string[];
  estimatedReadTime?: number;
  videoUrl?: string;
  audioUrl?: string;
}

function mapHygieneResource(resource: WellbeingResource, index: number): HygieneItem {
  return {
    id: resource._id ?? resource.id ?? resource.title,
    title: resource.title,
    icon: resource.icon,
    iconType: "ionicons",
    description: resource.summary,
    category: inferHygieneCategory(resource.title, index),
    tips:
      resource.extendedGuide.length > 0
        ? resource.extendedGuide
        : [resource.summary],
    estimatedReadTime: resource.estimatedReadTime,
    videoUrl: resource.videoUrl,
    audioUrl: resource.audioUrl,
  };
}

function inferHygieneCategory(
  title: string,
  index: number,
): HygieneItem["category"] {
  const normalized = title.toLowerCase();
  if (normalized.includes("product") || normalized.includes("pad")) {
    return "products";
  }
  if (
    normalized.includes("bath") ||
    normalized.includes("swim") ||
    normalized.includes("movement")
  ) {
    return "activities";
  }
  if (
    normalized.includes("infection") ||
    normalized.includes("uti") ||
    normalized.includes("odor")
  ) {
    return "prevention";
  }
  if (
    normalized.includes("daily") ||
    normalized.includes("wash") ||
    normalized.includes("vulva")
  ) {
    return "daily";
  }
  return (["products", "daily", "activities", "prevention"] as const)[
    index % 4
  ];
}

export default function Hygiene() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();

  // Tab controller to filter hygiene sections gracefully
  const [activeTab, setActiveTab] =
    useState<HygieneItem["category"]>("products");

  // Dynamic Array Payloads ready for easy backend mapping
  const hygieneTips: HygieneItem[] = [
    {
      id: "h1",
      title: "Menstrual Products Management",
      icon: "water-outline",
      iconType: "ionicons",
      description:
        "Choose and change period products based on your flow and comfort.",
      category: "products",
      tips: [
        "Change pads or tampons every 4-6 hours, or sooner if flow is heavy.",
        "Menstrual cups can often be worn up to 12 hours, depending on flow and product guidance.",
        "Use breathable period underwear for light days, spotting, or backup protection.",
      ],
    },
    {
      id: "h2",
      title: "Daily Biological Hygiene",
      icon: "leaf-outline",
      iconType: "ionicons",
      description:
        "Simple daily care during periods without disrupting your natural balance.",
      category: "daily",
      tips: [
        "Clean only the external vulva with lukewarm water.",
        "Avoid douching or scented intimate washes because they can disrupt pH.",
        "Change into fresh, breathable underwear when damp or uncomfortable.",
      ],
    },
    {
      id: "h3",
      title: "Bathing & Aquatic Activities",
      icon: "droplet",
      iconType: "feather",
      description:
        "Clean, comfortable guidance for swimming, bathing, and movement.",
      category: "activities",
      tips: [
        "Use a fresh tampon or cup before swimming if that feels right for you.",
        "Warm baths can help ease cramps and lower body tension.",
        "Dry off and change products or underwear after swimming or workouts.",
      ],
    },
    {
      id: "h4",
      title: "Systemic Infection Prevention",
      icon: "shield-check-outline",
      iconType: "material",
      description:
        "Reduce irritation, odor, UTIs, and friction during sensitive days.",
      category: "prevention",
      tips: [
        "Wipe front to back to reduce infection risk.",
        "Stay hydrated, especially if you are prone to UTIs.",
        "Avoid tight synthetic underwear when skin feels irritated.",
      ],
    },
  ];
  const [apiHygieneTips, setApiHygieneTips] = useState<HygieneItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadHygieneResources = useCallback(async () => {
    try {
      const resources = await wellbeingApi.getResources("hygiene");
      if (resources.length > 0) {
        setApiHygieneTips(resources.map(mapHygieneResource));
      }
    } catch {
      setApiHygieneTips([]);
    }
  }, []);

  useEffect(() => {
    loadHygieneResources();
  }, [loadHygieneResources]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadHygieneResources();
    } finally {
      setRefreshing(false);
    }
  }, [loadHygieneResources]);

  const softTints = getSoftTints(colors);

  // Merge per category rather than swapping the whole list: the live API can
  // return fewer resources than there are tabs, and a wholesale swap would
  // leave tabs with no matching category blank (worse than static fallback).
  const activeResources: HygieneItem[] = (
    ["products", "daily", "activities", "prevention"] as const
  ).map(
    (category) =>
      apiHygieneTips.find((item) => item.category === category) ??
      hygieneTips.find((item) => item.category === category)!,
  );

  const currentActiveData = activeResources.find(
    (item) => item.category === activeTab,
  );

  // Reports how long the reader actually had this tab's tip open, so the
  // backend can refine its read-time average instead of relying on a static
  // admin estimate. The cleanup (fired on tab change or unmount) reports the
  // duration for the tip that was active when the effect was set up.
  useEffect(() => {
    if (!currentActiveData) return;
    const id = currentActiveData.id;
    const openedAt = Date.now();
    return () => {
      const durationSeconds = Math.round((Date.now() - openedAt) / 1000);
      wellbeingApi.trackView(id, durationSeconds).catch(() => {});
    };
    // Deliberately keyed on id only — this reports dwell time for the tip
    // that was active when the effect ran, not on every object identity
    // change from re-renders of activeResources.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentActiveData?.id]);

  // Helper renderer engine for conditional multi-package icons support
  const renderItemIcon = (item: HygieneItem) => {
    if (item.iconType === "material") {
      return (
        <MaterialCommunityIcons
          name={item.icon as any}
          size={20}
          color={colors.primary}
        />
      );
    }
    if (item.iconType === "feather") {
      return (
        <Feather name={item.icon as any} size={18} color={colors.primary} />
      );
    }
    return (
      <Ionicons name={item.icon as any} size={20} color={colors.primary} />
    );
  };

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
        {/* Upper Navigation Action Header */}
        <View className="flex-row items-center gap-3 px-[22px] pt-6 pb-1.5">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="w-9 h-9 rounded-full items-center justify-center shadow-2xs"
            style={{ backgroundColor: colors.surface }}
          >
            <Feather name="arrow-left" size={16} color={colors.foreground} />
          </TouchableOpacity>
          <Text
            className="text-lg font-bold tracking-tight"
            style={{ color: colors.foreground, fontFamily: fonts.heading }}
          >
            Hygiene & Wellbeing
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          <View className="mt-5">
            {/* 2x2 TOPIC CARD GRID — tap a card to switch the active topic */}
            <View className="flex-row flex-wrap px-[22px]" style={{ gap: 12 }}>
              {(
                [
                  { id: "products", tint: softTints.pink, bg: colors.primaryLight },
                  { id: "daily", tint: softTints.mint, bg: colors.accentLight },
                  { id: "activities", tint: softTints.lavender, bg: colors.secondaryLight },
                  { id: "prevention", tint: softTints.pink, bg: colors.primaryLight },
                ] as const
              ).map(({ id, bg }) => {
                const item = activeResources.find((r) => r.category === id);
                if (!item) return null;
                const isSelected = activeTab === id;
                return (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setActiveTab(id)}
                    activeOpacity={0.85}
                    className="rounded-[18px] p-4 shadow-2xs"
                    style={{
                      width: "47%",
                      backgroundColor: colors.surface,
                      borderWidth: isSelected ? 1.5 : 1,
                      borderColor: isSelected ? colors.primary : colors.border,
                    }}
                  >
                    <View
                      className="w-6 h-6 rounded-lg items-center justify-center"
                      style={{ backgroundColor: bg }}
                    >
                      {renderItemIcon(item)}
                    </View>
                    <Text
                      className="text-[12.5px] font-bold mt-2"
                      style={{ color: colors.foreground, fontFamily: fonts.heading }}
                      numberOfLines={2}
                    >
                      {item.title}
                    </Text>
                    <Text
                      className="text-[10.5px] font-medium mt-0.5 leading-4"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
                      numberOfLines={2}
                    >
                      {item.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* CONTEXTUAL ACTIVE INTERACTIVE CARD SYSTEM */}
            {currentActiveData && (
              <View className="mx-6 gap-5 mt-6">
                {/* Video / Audio Companion Media Row */}
                {(currentActiveData.videoUrl || currentActiveData.audioUrl) && (
                  <View className="flex-row gap-3">
                    {!!currentActiveData.videoUrl && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => Linking.openURL(currentActiveData.videoUrl!)}
                        className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl border"
                        style={{ backgroundColor: colors.surface, borderColor: colors.border }}
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
                    {!!currentActiveData.audioUrl && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => Linking.openURL(currentActiveData.audioUrl!)}
                        className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl border"
                        style={{ backgroundColor: colors.surface, borderColor: colors.border }}
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

                {/* Sub-Section Title Container */}
                <Text
                  className="text-xs font-bold tracking-widest uppercase mt-2 px-1"
                  style={{ color: colors.primary, fontFamily: fonts.heading }}
                >
                  Recommended Care Checklists
                </Text>

                {/* Checklist Rows Grid Loop Layout */}
                <View className="gap-3.5">
                  {currentActiveData.tips.map((tip, idx) => (
                    <View
                      key={idx}
                      className="flex-row items-start p-4 rounded-2xl border"
                      style={{
                        backgroundColor: colors.surfaceSoft,
                        borderColor: colors.border,
                      }}
                    >
                      <View
                        className="mt-0.5 mr-3.5 p-1 rounded-full"
                        style={{ backgroundColor: colors.successLight }}
                      >
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={colors.success}
                        />
                      </View>
                      <Text
                        className="flex-1 text-xs font-medium leading-5"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        {tip}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Support Telehealth quick redirection help block banner panel */}
            <View
              className="mx-6 mt-8 p-5 rounded-2xl border flex-row items-center justify-between"
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
                  Experiencing rash or itching irritation?
                </Text>
                <Text
                  className="text-[10px] font-semibold mt-0.5"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  Talk privately with an OBGYN if symptoms persist or worsen.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push("/(app)/consultation" as any)}
                className="px-4 py-2 rounded-xl"
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

            {/* Footer trust / privacy note */}
            <Text
              className="text-[12px] font-bold text-center mx-[22px] mt-1.5 px-1 py-2"
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              Gentle reminders, zero judgment. All chats here are private.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
