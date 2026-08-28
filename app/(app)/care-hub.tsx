import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";

/**
 * "Care & Insights" hub — everything data-driven about the user's cycle that
 * isn't the day-to-day tracker itself: forecasts, personalized insights,
 * symptom trends, the screener, and booking a consult. Reached from Home's
 * "Care & Insights" entry card (see (dashboard)/home.tsx).
 */
export default function CareHub() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();

  const careItems = [
    {
      title: "Predictions",
      tag: "Cycle forecasts & trends",
      icon: "trending-up-outline",
      route: "/(app)/predictions",
      color: colors.primary,
      bg: colors.primaryLight,
    },
    {
      title: "Daily Insights",
      tag: "Mood, hormone & energy",
      icon: "sparkles-outline",
      route: "/(app)/insights",
      color: colors.secondary,
      bg: colors.secondaryLight,
    },
    {
      title: "Symptom Trends",
      tag: "Likely by cycle phase",
      icon: "pulse-outline",
      route: "/(app)/symptom-predictions",
      color: colors.accent,
      bg: colors.accentLight,
    },
    {
      title: "Symptom Checker",
      tag: "PCOS, thyroid & more",
      icon: "clipboard-outline",
      route: "/(app)/symptom-checker",
      color: colors.info,
      bg: colors.infoLight,
    },
    {
      title: "Graphs & Reports",
      tag: "Cycle history at a glance",
      icon: "bar-chart-outline",
      route: "/(app)/graphs-reports",
      color: colors.gold,
      bg: colors.goldLight,
    },
  ] as const;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Care & Insights" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
          <Text
            className="mx-6 mt-2 mb-5"
            style={{ fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body, lineHeight: 18 }}
          >
            Your forecasts, personalized insights, and everything to check in on your health.
          </Text>

          <View className="mx-6 flex-row flex-wrap" style={{ gap: 10 }}>
            {careItems.map((item, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => router.push(item.route as any)}
                activeOpacity={0.8}
                className="border"
                style={{
                  width: "48%",
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: 20,
                  padding: 16,
                  ...getShadow(colors, isDark),
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 13,
                    backgroundColor: item.bg,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 12,
                  }}
                >
                  <Ionicons name={item.icon as any} size={19} color={item.color} />
                </View>
                <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}>
                  {item.title}
                </Text>
                <Text
                  style={{ fontSize: 11, color: colors.mutedText, marginTop: 3, fontFamily: fonts.body }}
                  numberOfLines={2}
                >
                  {item.tag}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="mx-6 mt-4">
            <TouchableOpacity
              onPress={() => router.push("/(app)/consultation")}
              activeOpacity={0.85}
              className="flex-row items-center"
              style={{ backgroundColor: colors.primaryLight, borderRadius: 20, padding: 16 }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 13,
                }}
              >
                <Ionicons name="chatbubbles-outline" size={20} color={colors.primary} />
              </View>
              <View className="flex-1">
                <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}>
                  Talk to a gynecologist
                </Text>
                <Text style={{ fontSize: 11, color: colors.mutedText, marginTop: 1.5, fontFamily: fonts.body }} numberOfLines={1}>
                  Private consult, secure chat & video call
                </Text>
              </View>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="arrow-forward" size={15} color={colors.buttonText} />
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
