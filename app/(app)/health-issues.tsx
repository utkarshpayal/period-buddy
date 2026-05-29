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

interface HealthIssue {
  id: string;
  title: string;
  icon: string;
  color: string;
  guide: string;
  summary: string;
}

export default function HealthIssues() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const issues: HealthIssue[] = [
    {
      id: "1",
      title: "PCOS",
      icon: "alert-circle",
      color: "#ef4444",
      summary:
        "PCOS is a hormonal disorder that can affect cycles, skin, hair growth, and metabolism.",
      guide:
        "Track cycle changes, note acne or hair growth shifts, maintain regular movement, and speak with a clinician if irregular cycles persist.",
    },
    {
      id: "2",
      title: "Endometriosis",
      icon: "pulse",
      color: "#f97316",
      summary:
        "Endometriosis can cause painful periods, pelvic pain, and pain during daily activities.",
      guide:
        "Log pain severity, bleeding, and triggers. Seek medical advice for severe cramps, heavy bleeding, or pain outside your period.",
    },
    {
      id: "3",
      title: "Fibroids",
      icon: "cellular",
      color: "#fbbf24",
      summary:
        "Fibroids are non-cancerous uterine growths that may cause heavy bleeding or pressure.",
      guide:
        "Track bleeding volume, clotting, fatigue, and pelvic pressure. A clinician can confirm fibroids with imaging.",
    },
    {
      id: "4",
      title: "Pregnancy Tracking",
      icon: "heart",
      color: "#ec4899",
      summary:
        "Pregnancy tracking helps you record symptoms, appointments, and wellness changes.",
      guide:
        "Record missed periods, nausea, tenderness, and test dates. Confirm pregnancy and care plans with a healthcare professional.",
    },
    {
      id: "5",
      title: "Irregular Cycles",
      icon: "shuffle",
      color: "#8b5cf6",
      summary:
        "Irregular cycles may be linked to stress, weight changes, hormones, medication, or health conditions.",
      guide:
        "Track start dates for at least three cycles and note stress, sleep, travel, and medication changes.",
    },
    {
      id: "6",
      title: "Menopause",
      icon: "water",
      color: "#06b6d4",
      summary:
        "Menopause transition can include cycle changes, hot flashes, sleep shifts, and mood changes.",
      guide:
        "Log symptoms and cycle spacing. Discuss disruptive hot flashes, sleep issues, or heavy bleeding with a clinician.",
    },
  ];
  const selectedIssueData = issues.find((issue) => issue.id === selectedIssue);

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
              Health Issues
            </Text>
          </View>

          <View className="mx-6 mt-6">
            <Text className="mb-4 text-sm" style={{ color: colors.mutedText }}>
              Select a health concern to learn more and get guidance
            </Text>

            <View className="flex-row flex-wrap gap-3">
              {issues.map((issue) => (
                <TouchableOpacity
                  key={issue.id}
                  onPress={() => {
                    setSelectedIssue(issue.id);
                    setIsGuideOpen(false);
                  }}
                  activeOpacity={0.85}
                  className="w-[48%] items-center rounded-xl border-2 py-6"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor:
                      selectedIssue === issue.id ? issue.color : colors.border,
                  }}
                >
                  <View
                    className="mb-2 h-12 w-12 items-center justify-center rounded-full"
                    style={{ backgroundColor: issue.color }}
                  >
                    <Ionicons
                      name={issue.icon as any}
                      size={24}
                      color="white"
                    />
                  </View>
                  <Text
                    className="text-center text-sm font-semibold"
                    style={{ color: colors.foreground }}
                  >
                    {issue.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedIssueData && (
              <View
                className="mt-8 rounded-2xl border-2 p-6"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Text
                  className="text-lg font-bold"
                  style={{ color: colors.foreground }}
                >
                  Understanding {selectedIssueData.title}
                </Text>
                <Text className="mt-3 leading-6" style={{ color: colors.text }}>
                  {selectedIssueData.summary}
                </Text>
                {isGuideOpen ? (
                  <Text
                    className="mt-3 leading-6"
                    style={{ color: colors.text }}
                  >
                    {selectedIssueData.guide}
                  </Text>
                ) : null}
                <TouchableOpacity
                  activeOpacity={0.85}
                  className="mt-4 rounded-lg py-3"
                  onPress={() => setIsGuideOpen((open) => !open)}
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text
                    className="text-center font-semibold"
                    style={{ color: colors.buttonText }}
                  >
                    {isGuideOpen ? "Hide Full Guide" : "Read Full Guide →"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
