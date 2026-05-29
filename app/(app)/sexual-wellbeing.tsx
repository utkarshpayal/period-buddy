import { Ionicons } from "@expo/vector-icons";
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

interface ResourceCategory {
  id: string;
  title: string;
  icon: string;
  color: string;
  items: number;
  summary: string;
}

export default function SexualWellbeing() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );

  const categories: ResourceCategory[] = [
    {
      id: "1",
      title: "Sex & Periods",
      icon: "heart",
      color: "#d946a6",
      items: 8,
      summary:
        "Guidance on intimacy during periods, comfort, protection, and communication.",
    },
    {
      id: "2",
      title: "STI Prevention",
      icon: "shield",
      color: "#10b981",
      items: 12,
      summary:
        "Clear prevention basics, testing reminders, and safer-sex resources.",
    },
    {
      id: "3",
      title: "Contraception",
      icon: "medical",
      color: "#8b5cf6",
      items: 15,
      summary:
        "Compare common contraception options and what to ask a clinician.",
    },
    {
      id: "4",
      title: "Consent & Safety",
      icon: "checkmark-circle",
      color: "#f97316",
      items: 6,
      summary:
        "Practical resources for boundaries, consent, and personal safety.",
    },
    {
      id: "5",
      title: "Pleasure & Health",
      icon: "happy",
      color: "#ec4899",
      items: 10,
      summary: "Body-positive health content focused on comfort and wellbeing.",
    },
    {
      id: "6",
      title: "Partner Communication",
      icon: "chatbubbles",
      color: "#06b6d4",
      items: 9,
      summary:
        "Conversation starters and support tips for healthier communication.",
    },
  ];

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
        <ScrollView contentContainerClassName="pb-10">
          <View className="flex-row items-center gap-4 px-6 pt-6">
            <TouchableOpacity
              onPress={() => router.back()}
              accessibilityLabel="Back"
              style={{ padding: 8, margin: -8 }}
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={colors.foreground}
              />
            </TouchableOpacity>
            <Text
              className="flex-1 text-2xl font-bold"
              style={{ color: colors.foreground }}
            >
              Sexual Wellbeing
            </Text>
          </View>

          <View className="mx-6 mt-6">
            <Text className="mb-4 text-sm" style={{ color: colors.mutedText }}>
              Comprehensive, science-based resources about sexual health
            </Text>

            <View className="gap-3">
              {categories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  activeOpacity={0.85}
                  onPress={() =>
                    setSelectedCategoryId((current) =>
                      current === category.id ? null : category.id,
                    )
                  }
                  className="overflow-hidden rounded-xl border-2"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor:
                      selectedCategoryId === category.id
                        ? category.color
                        : colors.border,
                  }}
                >
                  <View className="flex-row items-center justify-between p-4">
                    <View className="flex-row items-center gap-4 flex-1">
                      <View
                        className="h-14 w-14 items-center justify-center rounded-lg"
                        style={{ backgroundColor: category.color }}
                      >
                        <Ionicons
                          name={category.icon as any}
                          size={28}
                          color="white"
                        />
                      </View>
                      <View className="flex-1">
                        <Text
                          className="font-bold"
                          style={{ color: colors.foreground }}
                        >
                          {category.title}
                        </Text>
                        <Text
                          className="mt-1 text-xs"
                          style={{ color: colors.mutedText }}
                        >
                          {category.items} articles
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name={
                        selectedCategoryId === category.id
                          ? "chevron-down"
                          : "chevron-forward"
                      }
                      size={20}
                      color={colors.mutedText}
                    />
                  </View>

                  {selectedCategoryId === category.id ? (
                    <View
                      className="border-t px-4 py-4"
                      style={{ borderTopColor: colors.border }}
                    >
                      <Text
                        className="leading-5"
                        style={{ color: colors.text }}
                      >
                        {category.summary}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>

            <View
              className="mt-8 rounded-xl border-2 p-6"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.primary,
              }}
            >
              <Ionicons
                name="shield-checkmark"
                size={32}
                color={colors.primary}
              />
              <Text
                className="mt-3 font-bold"
                style={{ color: colors.foreground }}
              >
                All Content is Verified
              </Text>
              <Text
                className="mt-2 text-sm leading-5"
                style={{ color: colors.mutedText }}
              >
                Created by health professionals and reviewed for accuracy.
                Trusted resources for your sexual health.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
