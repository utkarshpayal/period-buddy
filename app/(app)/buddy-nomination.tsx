import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import { useTheme } from "../../components/theme";

interface Girl {
  id: string;
  name: string;
  cyclePhase: string;
  lastUpdate: string;
  compatibility: number;
  nominated?: boolean;
}

export default function BuddyNomination() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { earnTokens } = useAppState();
  const [searchQuery, setSearchQuery] = useState("");
  const [nominees, setNominees] = useState<Girl[]>([
    {
      id: "1",
      name: "Emma Wilson",
      cyclePhase: "Ovulation Phase",
      lastUpdate: "Updated today",
      compatibility: 95,
    },
    {
      id: "2",
      name: "Jessica Chen",
      cyclePhase: "Luteal Phase",
      lastUpdate: "Updated today",
      compatibility: 88,
    },
    {
      id: "3",
      name: "Sarah Martinez",
      cyclePhase: "Follicular Phase",
      lastUpdate: "Updated 2 days ago",
      compatibility: 85,
    },
  ]);
  const filteredNominees = nominees.filter((girl) =>
    [girl.name, girl.cyclePhase]
      .join(" ")
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase()),
  );

  function nominateGirl(id: string) {
    const nominee = nominees.find((girl) => girl.id === id);

    if (!nominee || nominee.nominated) return;

    setNominees((current) =>
      current.map((girl) =>
        girl.id === id ? { ...girl, nominated: true } : girl,
      ),
    );
    earnTokens(25);
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
              Period Buddy
            </Text>
          </View>

          <View className="mx-6 mt-6">
            <View
              className="rounded-2xl border-2 p-6"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.primary,
              }}
            >
              <Ionicons
                name="star"
                size={40}
                color={colors.primary}
                style={{ alignSelf: "center", marginBottom: 12 }}
              />
              <Text
                className="text-center text-lg font-bold"
                style={{ color: colors.foreground }}
              >
                Nominate Your Period Buddy 🌙
              </Text>
              <Text
                className="mt-3 text-center text-sm leading-5"
                style={{ color: colors.mutedText }}
              >
                Find another girl with a matching cycle phase and nominate her
                as your Period Buddy! Get exclusive rewards.
              </Text>
            </View>

            {/* Search Bar */}
            <View
              className="mt-6 flex-row items-center rounded-xl border-2 px-4"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="search" size={20} color={colors.mutedText} />
              <TextInput
                placeholder="Search for girls..."
                placeholderTextColor={colors.mutedText}
                value={searchQuery}
                onChangeText={setSearchQuery}
                className="ml-3 flex-1 py-4 text-base"
                style={{ color: colors.foreground }}
              />
            </View>

            {/* Best Matches */}
            <Text
              className="mb-4 mt-6 text-base font-bold"
              style={{ color: colors.foreground }}
            >
              Best Matches for You
            </Text>

            <View className="gap-3">
              {filteredNominees.map((girl) => (
                <View
                  key={girl.id}
                  className="overflow-hidden rounded-xl border-2"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <View className="flex-row items-center justify-between p-4">
                    <View className="flex-row items-center gap-4 flex-1">
                      <View
                        className="h-14 w-14 items-center justify-center rounded-full"
                        style={{ backgroundColor: colors.primary }}
                      >
                        <Text className="text-2xl">👩</Text>
                      </View>

                      <View className="flex-1">
                        <Text
                          className="font-bold"
                          style={{ color: colors.foreground }}
                        >
                          {girl.name}
                        </Text>
                        <Text
                          className="mt-1 text-xs"
                          style={{ color: colors.mutedText }}
                        >
                          {girl.cyclePhase}
                        </Text>
                        <Text
                          className="mt-1 text-xs"
                          style={{ color: colors.mutedText }}
                        >
                          {girl.lastUpdate}
                        </Text>
                      </View>
                    </View>

                    <View className="items-center">
                      <View
                        className="h-10 w-10 items-center justify-center rounded-full"
                        style={{
                          backgroundColor:
                            girl.compatibility > 85
                              ? "#22c55e"
                              : colors.primaryLight,
                        }}
                      >
                        <Text className="text-xs font-bold text-white">
                          {girl.compatibility}%
                        </Text>
                      </View>
                      <Text
                        className="mt-1 text-xs"
                        style={{ color: colors.mutedText }}
                      >
                        Match
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={girl.nominated}
                    className="mx-4 mb-4 rounded-lg py-3"
                    onPress={() => nominateGirl(girl.id)}
                    style={{
                      backgroundColor: girl.nominated
                        ? colors.secondary
                        : colors.primary,
                      opacity: girl.nominated ? 0.8 : 1,
                    }}
                  >
                    <Text
                      className="text-center font-bold"
                      style={{ color: colors.buttonText }}
                    >
                      {girl.nominated ? "Nominated" : "Nominate ✨"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
