import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";

/**
 * "Wellness & Support" hub — health concerns, private Q&A, hygiene guidance,
 * and sexual wellbeing. Reached from Home's "Wellness & Support" entry card
 * (see (dashboard)/home.tsx).
 */
export default function WellnessHub() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();

  const items = [
    {
      title: "Health Concerns",
      desc: "Irregularities & symptoms",
      icon: "alert-circle-outline",
      route: "/(app)/health-issues",
      color: colors.warning,
      bg: colors.warningLight,
    },
    {
      title: "Nura AI",
      desc: "Ask privately, anytime",
      icon: "help-circle-outline",
      route: "/(app)/qa",
      color: colors.info,
      bg: colors.infoLight,
    },
    {
      title: "Hygiene & Care",
      desc: "Product guidance & comfort",
      icon: "leaf-outline",
      route: "/(app)/hygiene",
      color: colors.accent,
      bg: colors.accentLight,
    },
    {
      title: "Sexual Wellbeing",
      desc: "Consent, intimacy & safety",
      icon: "heart-outline",
      route: "/(app)/sexual-wellbeing",
      color: colors.secondary,
      bg: colors.secondaryLight,
    },
    {
      title: "Check-in Call",
      desc: "Buddy calls you, hands-free",
      icon: "call-outline",
      route: "/(app)/checkin-call",
      color: colors.sky,
      bg: colors.skyLight,
    },
  ] as const;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Wellness & Support" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
          <Text
            className="mx-6 mt-2 mb-5"
            style={{ fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body, lineHeight: 18 }}
          >
            Support for your body and mind — private, judgment-free, and always here.
          </Text>

          <View className="mx-6 flex-row flex-wrap" style={{ gap: 10 }}>
            {items.map((item, idx) => (
              <TouchableOpacity
                key={idx}
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
                  <Ionicons name={item.icon as any} size={18} color={item.color} />
                </View>
                <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}>
                  {item.title}
                </Text>
                <Text
                  style={{ fontSize: 11, color: colors.mutedText, marginTop: 3, fontFamily: fonts.body }}
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
