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

interface ContentItem {
  id: string;
  title: string;
  author: string;
  type: "blog" | "reel";
  time: string;
  image: string;
  verified: boolean;
}

export default function Blogs() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<"all" | "blog" | "reel">(
    "all",
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const content: ContentItem[] = [
    {
      id: "1",
      title: "Understanding Your Hormonal Cycle",
      author: "Dr. Sarah Chen",
      type: "blog",
      time: "8 min read",
      image: "📚",
      verified: true,
    },
    {
      id: "2",
      title: "Yoga for Period Cramps - 10 min",
      author: "@fernandafit",
      type: "reel",
      time: "10 min",
      image: "🧘",
      verified: true,
    },
    {
      id: "3",
      title: "PCOS: What You Need to Know",
      author: "Dr. Priya Sharma",
      type: "blog",
      time: "12 min read",
      image: "🏥",
      verified: true,
    },
    {
      id: "4",
      title: "Period Myths vs Facts",
      author: "@healthwithjess",
      type: "reel",
      time: "5 min",
      image: "❓",
      verified: true,
    },
    {
      id: "5",
      title: "Nutrition Guide for Cycle Syncing",
      author: "Nutritionist Maya",
      type: "blog",
      time: "15 min read",
      image: "🥗",
      verified: true,
    },
  ];

  const filteredContent =
    selectedType === "all"
      ? content
      : content.filter((c) => c.type === selectedType);

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
              Blogs & Reels
            </Text>
          </View>

          <View className="mt-6 flex-row gap-2 px-6">
            {["all", "blog", "reel"].map((type) => (
              <TouchableOpacity
                key={type}
                onPress={() => setSelectedType(type as any)}
                className="rounded-full px-4 py-2"
                style={{
                  backgroundColor:
                    selectedType === type ? colors.primary : colors.surface,
                  borderWidth: selectedType === type ? 0 : 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  className="text-sm font-semibold capitalize"
                  style={{
                    color:
                      selectedType === type
                        ? colors.buttonText
                        : colors.foreground,
                  }}
                >
                  {type === "blog"
                    ? "Blogs"
                    : type === "reel"
                      ? "Videos"
                      : "All"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="mt-6 gap-4 px-6">
            {filteredContent.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.85}
                onPress={() =>
                  setExpandedId((current) =>
                    current === item.id ? null : item.id,
                  )
                }
                className="overflow-hidden rounded-2xl border-2"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <View className="flex-row">
                  <View
                    className="h-32 w-32 items-center justify-center"
                    style={{ backgroundColor: colors.primaryLight }}
                  >
                    <Text className="text-5xl">{item.image}</Text>
                  </View>

                  <View className="flex-1 justify-between p-4">
                    <View>
                      <View className="flex-row items-center gap-2">
                        <Text
                          className="flex-1 font-bold"
                          style={{ color: colors.foreground }}
                        >
                          {item.title}
                        </Text>
                        {item.verified && (
                          <Ionicons
                            name="checkmark-circle"
                            size={16}
                            color={colors.primary}
                          />
                        )}
                      </View>
                      <Text
                        className="mt-1 text-xs"
                        style={{ color: colors.mutedText }}
                      >
                        {item.author}
                      </Text>
                    </View>

                    <View className="flex-row items-center justify-between">
                      <Text
                        className="text-xs"
                        style={{ color: colors.mutedText }}
                      >
                        {item.time}
                      </Text>
                      <View
                        className="rounded-full px-3 py-1"
                        style={{ backgroundColor: colors.primary }}
                      >
                        <Text
                          className="text-xs font-semibold"
                          style={{ color: colors.buttonText }}
                        >
                          {expandedId === item.id
                            ? "Close"
                            : item.type === "blog"
                              ? "Read"
                              : "Watch"}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {expandedId === item.id ? (
                  <View
                    className="border-t p-4"
                    style={{ borderTopColor: colors.border }}
                  >
                    <Text className="leading-5" style={{ color: colors.text }}>
                      {item.type === "blog"
                        ? "A short verified guide is ready to read. Save the full version to your care routine."
                        : "Preview loaded. Tap the Video Content feature for the full playback list."}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
