import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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

export default function Home() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { tokens, trackedDays } = useAppState();

  // following data will come from backend
  let expectedEndDate = "12 June 2026";
  let periodLength = 5;
  let fertileWindow = 5;

  // Mock cycle trends data for the minimalist bar graph
  const analyticGraphData = [
    { month: "Jan", length: 27, heightClass: "h-20" },
    { month: "Feb", length: 28, heightClass: "h-24" },
    { month: "Mar", length: 30, heightClass: "h-28" },
    { month: "Apr", length: 29, heightClass: "h-26" },
    { month: "May", length: 28, heightClass: "h-24" },
  ];

  const treeHealth = Math.min(100, Math.max(45, 55 + trackedDays * 6));

  const softTints = {
    pink: isDark ? "#3b1a2d" : "#fff0f6",
    purple: isDark ? "#231942" : "#f3e8ff",
    orange: isDark ? "#361e12" : "#fff7ed",
    cyan: isDark ? "#0c2329" : "#ecfeff",
    emerald: isDark ? "#062e20" : "#ecfdf5",
    amber: isDark ? "#362312" : "#fef3c7",
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
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
        >
          {/* Header Section */}
          <View className="px-6 pt-6 flex-row justify-between items-center">
            <View>
              <View className="flex-row items-center gap-1">
                <Text
                  className="text-2xl font-extrabold tracking-tight"
                  style={{ color: colors.foreground }}
                >
                  Hey {user?.firstName || "Utkarsh"}!
                </Text>
                <Text className="text-xl">👋</Text>
              </View>
              <Text
                className="mt-1 text-xs font-semibold tracking-wide"
                style={{ color: colors.mutedText }}
              >
                Cycle Day {trackedDays} • Expected: {expectedEndDate}
              </Text>
            </View>

            {/* Tokens Pill Badge */}
            <View
              className="flex-row items-center gap-2 px-4 py-2 rounded-full border shadow-xs"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <MaterialCommunityIcons
                name="trophy-outline"
                size={16}
                color={colors.primary}
              />
              <Text
                className="text-xs font-bold tracking-wider"
                style={{ color: colors.foreground }}
              >
                {tokens || 1064}
              </Text>
            </View>
          </View>

          {/* FOREST STATUS CORE CARD */}
          <View className="mx-6 my-6">
            <View
              className="rounded-3xl border p-6 flex-row items-center justify-between shadow-xs overflow-hidden"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              {/* Left Column: Context Text */}
              <View className="flex-1 pr-4">
                <Text
                  className="text-xs font-bold tracking-widest uppercase mb-1"
                  style={{ color: colors.primary }}
                >
                  Forest Status
                </Text>
                <Text
                  className="text-lg font-extrabold tracking-tight leading-6"
                  style={{ color: colors.foreground }}
                >
                  Your Ecosystem is{" "}
                  {treeHealth > 75
                    ? "Thriving"
                    : treeHealth > 50
                      ? "Healthy"
                      : "Needs Attention"}
                </Text>
                <Text
                  className="mt-2 text-xs leading-4"
                  style={{ color: colors.mutedText }}
                >
                  Log your symptoms today to sustain and protect your forest
                  growth.
                </Text>
              </View>

              {/* Right Column: Premium Concentric Progress Ring */}
              <View className="items-center justify-center">
                <View
                  className="w-24 h-24 rounded-full border-4 items-center justify-center relative"
                  style={{
                    borderColor: isDark ? "#1e293b" : "#f1f5f9",
                  }}
                >
                  {/* Subtle inner ambient pulse layout */}
                  <View
                    className="absolute inset-1 rounded-full opacity-10"
                    style={{
                      backgroundColor:
                        treeHealth > 75
                          ? "#10b981"
                          : treeHealth > 50
                            ? "#f59e0b"
                            : "#ef4444",
                    }}
                  />

                  {/* Numerical Stat Display inside the Ring */}
                  <Text
                    className="text-xl font-black tracking-tighter"
                    style={{ color: colors.foreground }}
                  >
                    {treeHealth}%
                  </Text>
                  <Text
                    className="text-[9px] font-bold uppercase tracking-wider mt-0.5"
                    style={{
                      color:
                        treeHealth > 75
                          ? "#10b981"
                          : treeHealth > 50
                            ? "#f59e0b"
                            : "#ef4444",
                    }}
                  >
                    Health
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* NEW GRAPH SECTION: Premium Cycle Insights Trends */}
          <View className="mx-6 mb-6">
            <View
              className="rounded-3xl border p-5 shadow-xs"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <View className="flex-row justify-between items-center mb-6">
                <View>
                  <Text
                    className="text-xs font-bold tracking-widest uppercase"
                    style={{ color: colors.secondary }}
                  >
                    Analytics
                  </Text>
                  <Text
                    className="text-base font-extrabold tracking-tight"
                    style={{ color: colors.foreground }}
                  >
                    Cycle Length Trends
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Text
                    className="text-xs font-bold"
                    style={{ color: colors.foreground }}
                  >
                    Avg: 28 Days
                  </Text>
                  <Feather name="trending-up" size={14} color="#10b981" />
                </View>
              </View>

              {/* Minimal Clean Graph Canvas Bars */}
              <View className="h-36 flex-row justify-between items-end px-2 pt-2">
                {analyticGraphData.map((data, index) => (
                  <View key={index} className="items-center flex-1 gap-1.5">
                    {/* Value above bars */}
                    <Text
                      className="text-[10px] font-bold"
                      style={{ color: colors.mutedText }}
                    >
                      {data.length}d
                    </Text>

                    {/* Pill Bar Layout */}
                    <View
                      className={`w-4 ${data.heightClass} rounded-full relative overflow-hidden`}
                      style={{
                        backgroundColor: isDark ? "#2d2d39" : "#f1f5f9",
                      }}
                    >
                      {/* Highlighting the latest month bar for premium contrast */}
                      <View
                        className="absolute bottom-0 left-0 right-0 top-0 rounded-full"
                        style={{
                          backgroundColor:
                            index === 4 ? colors.primary : colors.secondary,
                          opacity: index === 4 ? 1 : 0.45,
                        }}
                      />
                    </View>

                    {/* Month Label */}
                    <Text
                      className="text-[10px] font-bold mt-0.5"
                      style={{ color: colors.mutedText }}
                    >
                      {data.month}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Minimal Metric Tiles */}
          <View className="mx-6 mt-2 flex-row gap-3">
            {[
              {
                label: "Days Logged",
                value: trackedDays ? `${trackedDays} Days` : "6 Days",
                icon: "calendar-outline",
                color: colors.primary,
                bg: softTints.pink,
              },
              {
                label: "Period Length",
                value: `${periodLength} Days`,
                icon: "hourglass-outline",
                color: colors.secondary,
                bg: softTints.purple,
              },
              {
                label: "Fertile Window",
                value: `${fertileWindow} Days`,
                icon: "heart-outline",
                color: colors.accent,
                bg: softTints.amber,
              },
            ].map((metric, i) => (
              <View
                key={i}
                className="flex-1 items-center rounded-2xl border p-4 shadow-2xs"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <View
                  className="p-2.5 rounded-xl"
                  style={{ backgroundColor: metric.bg }}
                >
                  <Ionicons
                    name={metric.icon as any}
                    size={18}
                    color={metric.color}
                  />
                </View>
                <Text
                  className="mt-3 text-sm font-extrabold tracking-tight"
                  style={{ color: colors.foreground }}
                >
                  {metric.value}
                </Text>
                <Text
                  className="text-[10px] font-semibold mt-0.5"
                  style={{ color: colors.mutedText }}
                >
                  {metric.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Features Layout Section */}
          <View className="mt-8 px-6">
            <Text
              className="mb-4 text-base font-bold tracking-tight"
              style={{ color: colors.foreground }}
            >
              Your Core Features
            </Text>

            {/* CATEGORY 1: High-Priority Daily Trackers (Wide Rows) */}
            <View className="gap-3 mb-6">
              {[
                {
                  title: "Period Tracker",
                  desc: "Log flows, moods, and symptoms daily",
                  icon: "water-outline",
                  route: "/(app)/(dashboard)/tracker",
                  bg: softTints.pink,
                  iconColor: "#d946a6",
                },
                {
                  title: "Smart Predictions",
                  desc: "AI-driven cycle analysis & schedule charts",
                  icon: "analytics-outline",
                  route: "/(app)/predictions",
                  bg: softTints.purple,
                  iconColor: "#8b5cf6",
                },
                {
                  title: "Gynac Consultation",
                  desc: "Private clinical access and chat options",
                  icon: "chatbubble-ellipses-outline",
                  route: "/(app)/consultation",
                  bg: softTints.emerald,
                  iconColor: "#14b8a6",
                },
              ].map((f) => (
                <TouchableOpacity
                  key={f.title}
                  onPress={() => router.push(f.route as any)}
                  activeOpacity={0.7}
                  className="flex-row items-center p-4 rounded-2xl border shadow-2xs"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <View
                    className="p-3 rounded-xl mr-4"
                    style={{ backgroundColor: f.bg }}
                  >
                    <Ionicons
                      name={f.icon as any}
                      size={20}
                      color={f.iconColor}
                    />
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-sm font-bold"
                      style={{ color: colors.foreground }}
                    >
                      {f.title}
                    </Text>
                    <Text
                      className="text-xs mt-0.5"
                      style={{ color: colors.mutedText }}
                    >
                      {f.desc}
                    </Text>
                  </View>
                  <Feather
                    name="chevron-right"
                    size={16}
                    color={colors.mutedText}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* CATEGORY 2: Discovery & Medical Support (Comfortable 2x2 Grid) */}
            <Text
              className="mb-4 text-base font-bold tracking-tight"
              style={{ color: colors.foreground }}
            >
              Wellness & Support
            </Text>
            <View className="flex-row flex-wrap justify-between gap-3 mb-6">
              {[
                {
                  title: "Health Issues",
                  desc: "Irregularities & symptom tracking",
                  icon: "alert-circle-outline",
                  route: "/(app)/health-issues",
                  bg: softTints.orange,
                  iconColor: "#f97316",
                },
                {
                  title: "Anonymous Q&A",
                  desc: "Safe community discussions",
                  icon: "help-circle-outline",
                  route: "/(app)/qa",
                  bg: softTints.cyan,
                  iconColor: "#06b6d4",
                },
                {
                  title: "Hygiene & Care",
                  desc: "Products and dynamic sanitization",
                  icon: "leaf-outline",
                  route: "/(app)/hygiene",
                  bg: softTints.emerald,
                  iconColor: "#10b981",
                },
                {
                  title: "Sexual Wellbeing",
                  desc: "Intimacy tracking & clean logs",
                  icon: "heart-outline",
                  route: "/(app)/sexual-wellbeing",
                  bg: softTints.pink,
                  iconColor: "#ec4899",
                },
              ].map((f) => (
                <TouchableOpacity
                  key={f.title}
                  onPress={() => router.push(f.route as any)}
                  activeOpacity={0.7}
                  className="w-[48%] p-4 rounded-2xl border justify-between min-h-[110px]"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <View
                    className="self-start p-2 rounded-xl"
                    style={{ backgroundColor: f.bg }}
                  >
                    <Ionicons
                      name={f.icon as any}
                      size={18}
                      color={f.iconColor}
                    />
                  </View>
                  <View className="mt-3">
                    <Text
                      className="text-xs font-bold"
                      style={{ color: colors.foreground }}
                    >
                      {f.title}
                    </Text>
                    <Text
                      className="text-[10px] mt-0.5"
                      numberOfLines={1}
                      style={{ color: colors.mutedText }}
                    >
                      {f.desc}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* CATEGORY 3: Media & Ecosystem Options (Sleek Three-Column Footer Grid) */}
            <Text
              className="mb-4 text-base font-bold tracking-tight"
              style={{ color: colors.foreground }}
            >
              Explore More
            </Text>
            <View className="flex-row flex-wrap gap-2.5">
              {[
                {
                  title: "Forest",
                  icon: "leaf-outline",
                  route: "/(app)/forest",
                  color: "#10b981",
                },
                {
                  title: "Blogs",
                  icon: "book-open-outline",
                  route: "/(app)/blogs",
                  color: "#6366f1",
                },
                {
                  title: "Video Content",
                  icon: "play-circle-outline",
                  route: "/(app)/reels",
                  color: "#f59e0b",
                },
                {
                  title: "Partner sync",
                  icon: "git-merge-outline",
                  route: "/(app)/partner",
                  color: "#8b5cf6",
                },
                {
                  title: "Build Habits",
                  icon: "toggle-outline",
                  route: "/(app)/habits",
                  color: "#22d3ee",
                },
                {
                  title: "Nominate Buddy",
                  icon: "star-outline",
                  route: "/(app)/buddy-nomination",
                  color: "#fbbf24",
                },
              ].map((f) => (
                <TouchableOpacity
                  key={f.title}
                  onPress={() => router.push(f.route as any)}
                  activeOpacity={0.8}
                  className="w-[31.2%] items-center justify-center p-3 rounded-xl border"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <Ionicons name={f.icon as any} size={18} color={f.color} />
                  <Text
                    className="mt-1.5 text-center text-[10px] font-bold"
                    numberOfLines={1}
                    style={{ color: colors.foreground }}
                  >
                    {f.title}
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
