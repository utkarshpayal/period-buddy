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

interface HygieneItem {
  id: string;
  title: string;
  icon: string;
  description: string;
  tips: string[];
}

export default function Hygiene() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const hygieneTips: HygieneItem[] = [
    {
      id: "1",
      title: "Menstrual Products",
      icon: "water",
      description: "Choose the right products for your flow",
      tips: [
        "Change pads/tampons every 4-6 hours",
        "Menstrual cups can be worn for 12 hours",
        "Use period panties for lighter days",
      ],
    },
    {
      id: "2",
      title: "Daily Hygiene",
      icon: "leaf",
      description: "Essential practices during your period",
      tips: [
        "Wash external area with lukewarm water daily",
        "Avoid douching - it disrupts natural flora",
        "Change into fresh clothes daily",
      ],
    },
    {
      id: "3",
      title: "Bathing & Swimming",
      icon: "water-outline",
      description: "Safe practices for periods",
      tips: [
        "Use tampons or menstrual cups while swimming",
        "Warm baths are fine during periods",
        "Keep bathroom clean and dry",
      ],
    },
    {
      id: "4",
      title: "Infection Prevention",
      icon: "shield-checkmark",
      description: "Prevent UTIs and infections",
      tips: [
        "Wipe from front to back",
        "Stay hydrated and pee regularly",
        "Avoid synthetic undergarments",
      ],
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
              Hygiene & Care
            </Text>
          </View>

          <View className="mx-6 mt-6 gap-3">
            {hygieneTips.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() =>
                  setExpandedId(expandedId === item.id ? null : item.id)
                }
                activeOpacity={0.85}
                className="overflow-hidden rounded-xl border-2"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <View className="flex-row items-center justify-between p-4">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View
                      className="h-12 w-12 items-center justify-center rounded-full"
                      style={{ backgroundColor: colors.primary }}
                    >
                      <Ionicons
                        name={item.icon as any}
                        size={24}
                        color="white"
                      />
                    </View>
                    <View className="flex-1">
                      <Text
                        className="font-bold"
                        style={{ color: colors.foreground }}
                      >
                        {item.title}
                      </Text>
                      <Text
                        className="text-xs"
                        style={{ color: colors.mutedText }}
                      >
                        {item.description}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={
                      expandedId === item.id ? "chevron-up" : "chevron-down"
                    }
                    size={20}
                    color={colors.mutedText}
                  />
                </View>

                {expandedId === item.id && (
                  <View
                    className="border-t px-4 py-4"
                    style={{ borderTopColor: colors.border }}
                  >
                    {item.tips.map((tip, idx) => (
                      <View key={idx} className="mb-3 flex-row gap-3">
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={colors.primary}
                        />
                        <Text
                          className="flex-1 leading-5"
                          style={{ color: colors.text }}
                        >
                          {tip}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
