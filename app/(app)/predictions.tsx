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
import { useTheme } from "../../components/theme";

// --- BACKEND API RESPONSE LAYER CONTRACTS ---
interface PredictionDataPayload {
  nextPeriodDate: string;
  nextPeriodDaysAway: number;
  fertileWindowRange: string;
  fertileWindowDuration: string;
  ovulationDate: string;
  ovulationDaysAway: number;
  isDataHighlyAccurate: boolean;
}

export default function Predictions() {
  const { colors, isDark } = useTheme();
  const router = useRouter();

  // MOCK PAYLOAD STRUCTURE — Swap this object directly with your backend data state hooks
  const backendResponseData: PredictionDataPayload = {
    nextPeriodDate: "June 8",
    nextPeriodDaysAway: 15,
    fertileWindowRange: "May 24-28",
    fertileWindowDuration: "5 days window",
    ovulationDate: "May 26",
    ovulationDaysAway: 2,
    isDataHighlyAccurate: true,
  };

  const softTints = {
    pink: isDark ? "#3b1a2d" : "#fff0f6",
    blue: isDark ? "#162842" : "#edf2ff",
    orange: isDark ? "#361e12" : "#fff7ed",
    emerald: isDark ? "#062e20" : "#ecfdf5",
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
        {/* Navigation Action Header */}
        <View className="flex-row items-center gap-2 px-6 pt-6">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="p-2 -ml-2 rounded-full border"
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
            Predictions
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
        >
          <View className="mx-6 mt-8">
            {/* HERO HEROIC COMPONENT CARD: NEXT PERIOD ESTIMATIONS */}
            <View
              className="rounded-3xl border p-6 flex-row items-center justify-between shadow-2xs relative overflow-hidden mb-4"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              {/* Context Accent Glow */}
              <View
                className="absolute top-0 right-0 bottom-0 left-0 opacity-40"
                style={{ backgroundColor: softTints.pink }}
              />

              <View className="flex-1 z-10 pr-4">
                <Text
                  className="text-xs font-bold tracking-widest uppercase mb-1"
                  style={{ color: colors.primary }}
                >
                  Next Cycle Core
                </Text>
                <Text
                  className="text-3xl font-black tracking-tighter"
                  style={{ color: colors.foreground }}
                >
                  {backendResponseData.nextPeriodDate}
                </Text>
                <Text
                  className="mt-1.5 text-xs font-semibold"
                  style={{ color: colors.mutedText }}
                >
                  {backendResponseData.nextPeriodDaysAway} days away from
                  tracking timeline
                </Text>
              </View>

              <View className="p-3.5 rounded-2xl bg-white dark:bg-neutral-800 shadow-3xs z-10">
                <MaterialCommunityIcons
                  name="calendar-heart"
                  size={28}
                  color={colors.primary}
                />
              </View>
            </View>

            {/* SIDE-BY-SIDE INTEGRATED SUB METRICS GRID */}
            <View className="flex-row gap-4 mb-6">
              {/* Sub-Card 1: Fertile Window Frame */}
              <View
                className="flex-1 rounded-3xl border p-5 shadow-3xs justify-between min-h-[140px]"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <View
                  className="self-start p-2.5 rounded-xl"
                  style={{ backgroundColor: softTints.blue }}
                >
                  <Ionicons
                    name="heart-outline"
                    size={18}
                    color={colors.secondary}
                  />
                </View>
                <View className="mt-4">
                  <Text
                    className="text-[11px] font-bold tracking-wide"
                    style={{ color: colors.mutedText }}
                  >
                    Fertile Window
                  </Text>
                  <Text
                    className="text-lg font-black tracking-tight mt-0.5"
                    style={{ color: colors.foreground }}
                  >
                    {backendResponseData.fertileWindowRange}
                  </Text>
                  <Text
                    className="text-[10px] font-semibold mt-0.5"
                    style={{ color: colors.mutedText }}
                  >
                    {backendResponseData.fertileWindowDuration}
                  </Text>
                </View>
              </View>

              {/* Sub-Card 2: Ovulation Day Metric Frame */}
              <View
                className="flex-1 rounded-3xl border p-5 shadow-3xs justify-between min-h-[140px]"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <View
                  className="self-start p-2.5 rounded-xl"
                  style={{ backgroundColor: softTints.orange }}
                >
                  <Feather name="zap" size={16} color={colors.accent} />
                </View>
                <View className="mt-4">
                  <Text
                    className="text-[11px] font-bold tracking-wide"
                    style={{ color: colors.mutedText }}
                  >
                    Ovulation Day
                  </Text>
                  <Text
                    className="text-lg font-black tracking-tight mt-0.5"
                    style={{ color: colors.foreground }}
                  >
                    {backendResponseData.ovulationDate}
                  </Text>
                  <Text
                    className="text-[10px] font-semibold mt-0.5"
                    style={{ color: colors.mutedText }}
                  >
                    {backendResponseData.ovulationDaysAway} days away
                  </Text>
                </View>
              </View>
            </View>

            {/* ANALYTICS SUBTITLE & CONFIDENCE INSIGHT BADGE */}
            <View
              className="p-5 rounded-2xl border flex-row items-start gap-4 mt-2"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <View
                className="p-2 rounded-xl"
                style={{ backgroundColor: softTints.emerald }}
              >
                <MaterialCommunityIcons
                  name="shield-check-outline"
                  size={18}
                  color="#10b981"
                />
              </View>
              <View className="flex-1">
                <Text
                  className="text-xs font-bold"
                  style={{ color: colors.foreground }}
                >
                  AI Clinical Engine Notice
                </Text>
                <Text
                  className="mt-1 text-xs leading-4 font-medium"
                  style={{ color: colors.mutedText }}
                >
                  These estimations are computed using advanced dynamic cycle
                  analytics maps. To fine-tune consistency thresholds, ensure
                  continuous status updates are logged over daily timelines.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
