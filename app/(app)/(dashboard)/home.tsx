import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppState } from "../../../components/AppState";
import { useAuth } from "../../../components/auth-context";
import { useTheme } from "../../../components/theme";

interface Feature {
  id: string;
  title: string;
  icon: string;
  color: string;
  route: string;
}

export default function Home() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { tokens, trackedDays } = useAppState();

  const features: Feature[] = [
    {
      id: "tracker",
      title: "Period Tracker",
      icon: "calendar",
      color: "#d946a6",
      route: "/(app)/(dashboard)/tracker",
    },
    {
      id: "predictions",
      title: "Predictions",
      icon: "stats-chart",
      color: "#8b5cf6",
      route: "/(app)/predictions",
    },
    {
      id: "health",
      title: "Health Issues",
      icon: "alert-circle",
      color: "#f97316",
      route: "/(app)/health-issues",
    },
    {
      id: "qa",
      title: "Q&A",
      icon: "help-circle",
      color: "#06b6d4",
      route: "/(app)/qa",
    },
    {
      id: "hygiene",
      title: "Hygiene & Care",
      icon: "water",
      color: "#10b981",
      route: "/(app)/hygiene",
    },
    {
      id: "sexual",
      title: "Sexual Wellbeing",
      icon: "heart",
      color: "#ec4899",
      route: "/(app)/sexual-wellbeing",
    },
    {
      id: "blogs",
      title: "Blogs",
      icon: "book",
      color: "#6366f1",
      route: "/(app)/blogs",
    },
    {
      id: "reels",
      title: "Video Content",
      icon: "play",
      color: "#f59e0b",
      route: "/(app)/reels",
    },
    {
      id: "consultation",
      title: "Gynac Consultation",
      icon: "chatbox",
      color: "#14b8a6",
      route: "/(app)/consultation",
    },
    {
      id: "partner",
      title: "Partner Options",
      icon: "people",
      color: "#8b5cf6",
      route: "/(app)/partner",
    },
    {
      id: "habits",
      title: "Build Habits",
      icon: "checkmark-circle",
      color: "#22d3ee",
      route: "/(app)/habits",
    },
    {
      id: "buddy",
      title: "Period Buddy",
      icon: "star",
      color: "#fbbf24",
      route: "/(app)/buddy-nomination",
    },
  ];

  const treeHealth = Math.min(100, Math.max(45, 55 + trackedDays * 6));

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
        <ScrollView contentContainerClassName="pb-20">
          {/* Header */}
          <View className="px-6 pt-6">
            <View className="flex-row items-center justify-between">
              <View>
                <Text
                  className="text-3xl font-bold"
                  style={{ color: colors.foreground }}
                >
                  Hey {user?.firstName || "Girl"}! 👋
                </Text>
                <Text
                  className="mt-1 text-sm"
                  style={{ color: colors.mutedText }}
                >
                  Cycle Day 14 • Expected: Jun 8
                </Text>
              </View>
              <View className="items-center">
                <View
                  className="items-center justify-center rounded-full p-3"
                  style={{
                    backgroundColor: colors.primary,
                  }}
                >
                  <Ionicons name="trophy" size={28} color={colors.buttonText} />
                </View>
                <Text
                  className="mt-2 text-xs font-bold"
                  style={{ color: colors.primary }}
                >
                  {tokens} Tokens
                </Text>
              </View>
            </View>
          </View>

          {/* Forest Section */}
          <View className="mx-6 mt-6">
            <Text
              className="mb-3 text-lg font-bold"
              style={{ color: colors.foreground }}
            >
              Your Wellness Forest 🌳
            </Text>
            <View
              className="items-center justify-center rounded-2xl border-2 p-6"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Ionicons
                name="leaf"
                size={64}
                color={treeHealth > 50 ? "#22c55e" : "#ff6b6b"}
              />
              <Text
                className="mt-3 text-base font-semibold"
                style={{ color: colors.foreground }}
              >
                Tree Health: {treeHealth}%
              </Text>
              <Text
                className="mt-1 text-center text-xs"
                style={{ color: colors.mutedText }}
              >
                Keep tracking to grow your forest! Miss a day and trees wilt.
              </Text>
              <View
                className="mt-4 h-2 w-32 overflow-hidden rounded-full"
                style={{ backgroundColor: colors.border }}
              >
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${treeHealth}%`,
                    backgroundColor: treeHealth > 50 ? "#22c55e" : "#ff6b6b",
                  }}
                />
              </View>
            </View>
          </View>

          {/* Quick Stats */}
          <View className="mx-6 mt-6 flex-row gap-3">
            <View
              className="flex-1 items-center rounded-lg border py-4"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="calendar" size={24} color={colors.primary} />
              <Text
                className="mt-2 text-sm font-semibold"
                style={{ color: colors.foreground }}
              >
                {trackedDays ? `${trackedDays} Days` : "Start"}
              </Text>
              <Text className="text-xs" style={{ color: colors.mutedText }}>
                Days Logged
              </Text>
            </View>
            <View
              className="flex-1 items-center rounded-lg border py-4"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Ionicons
                name="checkmark-circle"
                size={24}
                color={colors.secondary}
              />
              <Text
                className="mt-2 text-sm font-semibold"
                style={{ color: colors.foreground }}
              >
                8 Days
              </Text>
              <Text className="text-xs" style={{ color: colors.mutedText }}>
                Period Length
              </Text>
            </View>
            <View
              className="flex-1 items-center rounded-lg border py-4"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="flame" size={24} color={colors.accent} />
              <Text
                className="mt-2 text-sm font-semibold"
                style={{ color: colors.foreground }}
              >
                12 Days
              </Text>
              <Text className="text-xs" style={{ color: colors.mutedText }}>
                Fertile Window
              </Text>
            </View>
          </View>

          {/* Features Grid */}
          <View className="mt-8 px-6">
            <Text
              className="mb-4 text-lg font-bold"
              style={{ color: colors.foreground }}
            >
              Features
            </Text>
            <View className="flex-row flex-wrap gap-3">
              {features.map((feature) => (
                <TouchableOpacity
                  key={feature.id}
                  onPress={() => router.push(feature.route as any)}
                  activeOpacity={0.85}
                  className="w-[31%] items-center rounded-xl border py-4"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <View
                    className="mb-2 h-10 w-10 items-center justify-center rounded-full"
                    style={{ backgroundColor: feature.color }}
                  >
                    <Ionicons
                      name={feature.icon as any}
                      size={20}
                      color="white"
                    />
                  </View>
                  <Text
                    className="text-center text-xs font-semibold"
                    style={{ color: colors.foreground }}
                  >
                    {feature.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
