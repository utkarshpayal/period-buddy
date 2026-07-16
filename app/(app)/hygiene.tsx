import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
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

  useEffect(() => {
    let isMounted = true;

    async function loadHygieneResources() {
      try {
        const resources = await wellbeingApi.getResources("hygiene");
        if (isMounted && resources.length > 0) {
          setApiHygieneTips(resources.map(mapHygieneResource));
        }
      } catch {
        if (isMounted) setApiHygieneTips([]);
      }
    }

    loadHygieneResources();

    return () => {
      isMounted = false;
    };
  }, []);

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
            Hygiene & Care
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <View className="mt-6">
            {/* HORIZONTAL CATEGORY CHIP CONTROLS */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
              className="mb-6"
            >
              {[
                { id: "products", label: "Products" },
                { id: "daily", label: "Daily Care" },
                { id: "activities", label: "Bathing & Movement" },
                { id: "prevention", label: "Infection Care" },
              ].map((tab) => {
                const isSelected = activeTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    onPress={() => setActiveTab(tab.id as any)}
                    activeOpacity={0.8}
                    className="rounded-full px-5 py-2.5 border shadow-3xs"
                    style={{
                      backgroundColor: isSelected
                        ? colors.primary
                        : colors.surface,
                      borderColor: isSelected ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      className="text-xs font-bold tracking-wide"
                      style={{
                        color: isSelected
                          ? colors.buttonText
                          : colors.foreground,
                        fontFamily: fonts.body,
                      }}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* CONTEXTUAL ACTIVE INTERACTIVE CARD SYSTEM */}
            {currentActiveData && (
              <View className="mx-6 gap-5">
                {/* Hero Header Context Card segment */}
                <View
                  className="rounded-3xl border p-6 flex-row items-center shadow-2xs relative overflow-hidden"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  {/* Subtle contextual ambient glow background circle layout */}
                  <View
                    className="absolute -right-8 -top-8 w-24 h-24 rounded-full opacity-35"
                    style={{ backgroundColor: softTints.pink }}
                  />

                  <View
                    className="p-3.5 rounded-2xl mr-4 z-10"
                    style={{ backgroundColor: softTints.pink }}
                  >
                    {renderItemIcon(currentActiveData)}
                  </View>
                  <View className="flex-1 z-10 pr-2">
                    <Text
                      className="text-base font-black tracking-tight"
                      style={{ color: colors.foreground, fontFamily: fonts.heading }}
                    >
                      {currentActiveData.title}
                    </Text>
                    <Text
                      className="text-xs font-semibold mt-1 leading-4"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      {currentActiveData.description}
                    </Text>
                  </View>
                </View>

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
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
