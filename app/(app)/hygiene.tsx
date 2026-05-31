import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../components/theme";

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

export default function Hygiene() {
  const { colors, isDark } = useTheme();
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
        "Optimizing comfort cycles matching your live flow density parameters.",
      category: "products",
      tips: [
        "Change standard cotton pads or tampons every 4-6 hours to prevent moisture setup.",
        "Medical-grade silicone menstrual cups can be safely worn up to 12 hours contextually.",
        "Integrate breathable organic period panties during lower baseline or lighter spotting days.",
      ],
    },
    {
      id: "h2",
      title: "Daily Biological Hygiene",
      icon: "leaf-outline",
      iconType: "ionicons",
      description:
        "Essential physiological cleansing protocols during menstrual phases.",
      category: "daily",
      tips: [
        "Cleanse external intimate vulva zones exclusively using lukewarm water daily.",
        "Strictly avoid internal douching loops—it disrupts critical localized flora balances.",
        "Transition into fresh, breathable cotton undergarments twice a day minimum.",
      ],
    },
    {
      id: "h3",
      title: "Bathing & Aquatic Activities",
      icon: "droplet",
      iconType: "feather",
      description:
        "Safe and clean guidelines for aquatic environments or standard recovery.",
      category: "activities",
      tips: [
        "Utilize secure menstrual cups or fresh tampons immediately before entering pools.",
        "Soaking in soothing warm baths is highly encouraged to naturally relieve localized cramps.",
        "Ensure your immediate personal setup zones remain fully sanitized, clean and dry.",
      ],
    },
    {
      id: "h4",
      title: "Systemic Infection Prevention",
      icon: "shield-check-outline",
      iconType: "material",
      description:
        "Mitigating bacterial pathways, UTIs, and standard skin friction rash.",
      category: "prevention",
      tips: [
        "Always follow a definitive front-to-back wiping motion patterns cleanly.",
        "Maintain high baseline hydration levels to flush out urinary tract tracts routinely.",
        "Evade highly synthetic nylon undergarments that trap temperature anomalies.",
      ],
    },
  ];

  const softTints = {
    pink: isDark ? "#3b1a2d" : "#fff0f6",
    purple: isDark ? "#231942" : "#f3e8ff",
    orange: isDark ? "#361e12" : "#fff7ed",
    emerald: isDark ? "#062e20" : "#ecfdf5",
  };

  const currentActiveData = hygieneTips.find(
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
            style={{ color: colors.foreground }}
          >
            Hygiene & Care
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
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
                { id: "products", label: "Ecosystem Products" },
                { id: "daily", label: "Daily Rituals" },
                { id: "activities", label: "Bathing & Fitness" },
                { id: "prevention", label: "Infection Shield" },
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
                      style={{ color: colors.foreground }}
                    >
                      {currentActiveData.title}
                    </Text>
                    <Text
                      className="text-xs font-semibold mt-1 leading-4"
                      style={{ color: colors.mutedText }}
                    >
                      {currentActiveData.description}
                    </Text>
                  </View>
                </View>

                {/* Sub-Section Title Container */}
                <Text
                  className="text-xs font-bold tracking-widest uppercase mt-2 px-1"
                  style={{ color: colors.primary }}
                >
                  Recommended Care Checklists
                </Text>

                {/* Checklist Rows Grid Loop Layout */}
                <View className="gap-3.5">
                  {currentActiveData.tips.map((tip, idx) => (
                    <View
                      key={idx}
                      className="flex-row items-start p-4 rounded-2xl border bg-neutral-50 dark:bg-neutral-900/40"
                      style={{ borderColor: colors.border }}
                    >
                      <View className="mt-0.5 mr-3.5 p-1 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20">
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color="#10b981"
                        />
                      </View>
                      <Text
                        className="flex-1 text-xs font-medium leading-5"
                        style={{ color: colors.foreground }}
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
                  style={{ color: colors.foreground }}
                >
                  Experiencing rash or itching irritation?
                </Text>
                <Text
                  className="text-[10px] font-semibold mt-0.5"
                  style={{ color: colors.mutedText }}
                >
                  Consult private clinical OBGYNs on our encryption channels.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push("/(app)/consultation" as any)}
                className="px-4 py-2 rounded-xl"
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
      </SafeAreaView>
    </>
  );
}
