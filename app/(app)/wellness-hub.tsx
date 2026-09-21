import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/ScreenHeader";
import { genZLabel, useGenZMode } from "../../components/genz-mode";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { getSharedHubTiles } from "../../lib/hubTiles";

// Check-in Call is a one-off setup action (schedule/trigger a phone call),
// not a daily-use destination like the shared tiles below — it stays local
// and visually secondary (fixes.md 2.7).
const CHECKIN_CALL_TILE = {
  bgKey: "skyLight" as const,
  colorKey: "sky" as const,
  desc: "Buddy calls you, hands-free",
  icon: "call-outline",
  id: "checkinCall",
  route: "/(app)/checkin-call",
  title: "Check-in Call",
};

/**
 * "Wellness & Support" hub — health concerns, private Q&A, hygiene guidance,
 * and sexual wellbeing. Reached from Home's "Wellness & Support" entry card
 * (see (dashboard)/home.tsx).
 *
 * Most-used-first: Nura AI and Health Concerns are the daily-use entries and
 * get a prominent full-width row each; Hygiene/Sexual Wellbeing/Check-in
 * Call are lower-frequency and sit in a smaller "More support" grid below
 * (fixes.md 2.7).
 */
export default function WellnessHub() {
  const { colors, isDark, fonts } = useTheme();
  const { enabled: genZModeEnabled } = useGenZMode();
  const router = useRouter();

  const primaryTiles = getSharedHubTiles(["nuraAi", "healthConcerns"]);
  const secondaryTiles = [...getSharedHubTiles(["hygiene", "sexualWellbeing"]), CHECKIN_CALL_TILE];

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title={genZLabel("Wellness & Support", genZModeEnabled)} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
          <Text
            className="mx-6 mt-2 mb-5"
            style={{ fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body, lineHeight: 18 }}
          >
            Support for your body and mind — private, judgment-free, and always here.
          </Text>

          <View className="mx-6" style={{ gap: 10 }}>
            {primaryTiles.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => router.push(item.route as any)}
                activeOpacity={0.85}
                className="flex-row items-center border"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: 20,
                  padding: 16,
                  ...getShadow(colors, isDark),
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: colors[item.bgKey],
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 13,
                  }}
                >
                  <Ionicons name={item.icon as any} size={20} color={colors[item.colorKey]} />
                </View>
                <View className="flex-1">
                  <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}>
                    {genZLabel(item.title, genZModeEnabled)}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: colors.mutedText, marginTop: 2, fontFamily: fonts.body }}>
                    {item.desc}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedText} />
              </TouchableOpacity>
            ))}
          </View>

          <Text
            className="mx-6 mt-6 mb-3"
            style={{ fontSize: 10, fontWeight: "900", color: colors.mutedText, letterSpacing: 0.6, fontFamily: fonts.body, textTransform: "uppercase" }}
          >
            More support
          </Text>

          <View className="mx-6 flex-row flex-wrap" style={{ gap: 10 }}>
            {secondaryTiles.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => router.push(item.route as any)}
                activeOpacity={0.8}
                className="border"
                style={{
                  width: "48%",
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: 20,
                  padding: 16,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: colors[item.bgKey],
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 10,
                  }}
                >
                  <Ionicons name={item.icon as any} size={16} color={colors[item.colorKey]} />
                </View>
                <Text style={{ fontSize: 12.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}>
                  {genZLabel(item.title, genZModeEnabled)}
                </Text>
                <Text
                  style={{ fontSize: 10.5, color: colors.mutedText, marginTop: 3, fontFamily: fonts.body }}
                  numberOfLines={2}
                >
                  {item.desc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
