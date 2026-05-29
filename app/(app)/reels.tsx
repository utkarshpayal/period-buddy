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

interface Reel {
  id: string;
  title: string;
  creator: string;
  duration: string;
  views: number;
  category: string;
  verified: boolean;
}

export default function Reels() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [activeReelId, setActiveReelId] = useState<string | null>(null);
  const [watchedReelIds, setWatchedReelIds] = useState<Set<string>>(new Set());

  const [reels, setReels] = useState<Reel[]>([
    {
      id: "1",
      title: "5 min Yoga for Period Pain",
      creator: "@yogawiththara",
      duration: "5:23",
      views: 2500,
      category: "Wellness",
      verified: true,
    },
    {
      id: "2",
      title: "Period Nutrition Tips",
      creator: "Dr. Nutrition Hub",
      duration: "3:45",
      views: 1800,
      category: "Nutrition",
      verified: true,
    },
    {
      id: "3",
      title: "Cramp Relief Massage",
      creator: "@bodyworksbyann",
      duration: "4:12",
      views: 3200,
      category: "Self-Care",
      verified: true,
    },
  ]);

  function playReel(id: string) {
    setActiveReelId((current) => (current === id ? null : id));

    if (watchedReelIds.has(id)) return;

    setWatchedReelIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    setReels((current) =>
      current.map((reel) =>
        reel.id === id ? { ...reel, views: reel.views + 1 } : reel,
      ),
    );
  }

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
              Video Content
            </Text>
          </View>

          <View className="mt-6 gap-4 px-6">
            {reels.map((reel) => (
              <TouchableOpacity
                key={reel.id}
                activeOpacity={0.85}
                onPress={() => playReel(reel.id)}
                className="overflow-hidden rounded-2xl border-2"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <View
                  className="h-40 items-center justify-center"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Ionicons name="play-circle" size={60} color="white" />
                  {activeReelId === reel.id ? (
                    <Text className="mt-2 font-bold text-white">Playing</Text>
                  ) : null}
                </View>

                <View className="p-4">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <Text
                        className="font-bold"
                        style={{ color: colors.foreground }}
                      >
                        {reel.title}
                      </Text>
                      <Text
                        className="mt-1 text-xs"
                        style={{ color: colors.mutedText }}
                      >
                        {reel.creator}
                      </Text>
                    </View>
                    {reel.verified && (
                      <Ionicons
                        name="checkmark-circle"
                        size={16}
                        color={colors.primary}
                      />
                    )}
                  </View>

                  <View className="mt-3 flex-row items-center gap-3">
                    <Ionicons name="time" size={14} color={colors.mutedText} />
                    <Text
                      className="text-xs"
                      style={{ color: colors.mutedText }}
                    >
                      {reel.duration}
                    </Text>

                    <Ionicons name="eye" size={14} color={colors.mutedText} />
                    <Text
                      className="text-xs"
                      style={{ color: colors.mutedText }}
                    >
                      {reel.views.toLocaleString()} views
                    </Text>
                  </View>

                  <View
                    className="mt-3 rounded-full px-3 py-1"
                    style={{
                      backgroundColor: colors.primaryLight,
                      alignSelf: "flex-start",
                    }}
                  >
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: colors.primary }}
                    >
                      {reel.category}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
