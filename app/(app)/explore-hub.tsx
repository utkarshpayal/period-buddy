import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";

/**
 * "Explore" hub — the lighter-weight, browse-anytime destinations (forest,
 * blogs, videos, partner sync, habits, buddy). Reached from Home's "Explore"
 * entry card (see (dashboard)/home.tsx).
 */
export default function ExploreHub() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();

  const items = [
    { title: "Forest", desc: "Grow your wellness tree", icon: "leaf-outline", route: "/(app)/forest", color: colors.success, bg: colors.successLight },
    { title: "Blogs", desc: "Articles on cycle health", icon: "book-outline", route: "/(app)/blogs", color: colors.info, bg: colors.infoLight },
    { title: "Videos", desc: "Short videos and reels", icon: "play-circle-outline", route: "/(app)/reels", color: colors.primary, bg: colors.primaryLight },
    { title: "Partner Sync", desc: "Share cycle info & chat", icon: "git-merge-outline", route: "/(app)/partner", color: colors.accent, bg: colors.accentLight },
    { title: "Habits", desc: "Daily habit tracking", icon: "checkmark-done-outline", route: "/(app)/habits", color: colors.warning, bg: colors.warningLight },
    { title: "Nominate Buddy", desc: "Anonymous peer support", icon: "star-outline", route: "/(app)/buddy-nomination", color: colors.secondary, bg: colors.secondaryLight },
  ] as const;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Explore" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
          <Text
            className="mx-6 mt-2 mb-5"
            style={{ fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body, lineHeight: 18 }}
          >
            Community, content, and everything to explore beyond tracking.
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
