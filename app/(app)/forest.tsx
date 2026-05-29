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
import { useAppState } from "../../components/AppState";
import { useTheme } from "../../components/theme";

interface Tree {
  id: number;
  month: string;
  health: number;
  status: "healthy" | "wilted";
}

export default function Forest() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { trackedDays } = useAppState();
  const currentHealth = Math.min(100, Math.max(45, 55 + trackedDays * 6));

  const trees: Tree[] = [
    {
      id: 1,
      month: "April",
      health: 100,
      status: "healthy",
    },
    {
      id: 2,
      month: "May",
      health: currentHealth,
      status: currentHealth >= 60 ? "healthy" : "wilted",
    },
    {
      id: 3,
      month: "June",
      health: 45,
      status: "wilted",
    },
  ];

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
              Your Wellness Forest
            </Text>
          </View>

          <View className="mx-6 mt-6">
            {/* Forest Info */}
            <View
              className="rounded-2xl border-2 p-6"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.primary,
              }}
            >
              <Text
                className="text-lg font-bold"
                style={{ color: colors.foreground }}
              >
                🌲 How it Works
              </Text>
              <Text
                className="mt-3 leading-6 text-sm"
                style={{ color: colors.text }}
              >
                Every month you track your period consistently, a tree grows in
                your forest!
                {"\n\n"}
                If you miss logging during your cycle, the tree wilts. Stay
                consistent and watch your forest flourish! 🌳
              </Text>
            </View>

            {/* Trees Grid */}
            <Text
              className="mb-4 mt-8 text-lg font-bold"
              style={{ color: colors.foreground }}
            >
              Your Trees
            </Text>

            <View className="gap-4">
              {trees.map((tree) => (
                <View
                  key={tree.id}
                  className="overflow-hidden rounded-xl border-2"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <View className="flex-row items-center justify-between p-6">
                    <View className="flex-1">
                      <Text
                        className="text-lg font-bold"
                        style={{ color: colors.foreground }}
                      >
                        {tree.month}
                      </Text>
                      <View
                        className="mt-4 h-2 overflow-hidden rounded-full"
                        style={{ backgroundColor: colors.border, width: 150 }}
                      >
                        <View
                          className="h-full"
                          style={{
                            width: `${tree.health}%`,
                            backgroundColor:
                              tree.status === "healthy" ? "#22c55e" : "#ef4444",
                          }}
                        />
                      </View>
                      <Text
                        className="mt-2 text-xs"
                        style={{ color: colors.mutedText }}
                      >
                        Health: {tree.health}%
                      </Text>
                    </View>

                    <View className="items-center">
                      <Text className="text-5xl">
                        {tree.status === "healthy" ? "🌳" : "🌱"}
                      </Text>
                      <Text
                        className="mt-2 text-xs font-semibold"
                        style={{
                          color:
                            tree.status === "healthy" ? "#22c55e" : "#ef4444",
                        }}
                      >
                        {tree.status === "healthy" ? "Thriving" : "Needs Care"}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Leaderboard */}
            <Text
              className="mb-4 mt-8 text-lg font-bold"
              style={{ color: colors.foreground }}
            >
              Forest Leaders 🏆
            </Text>

            <View className="gap-2">
              {[
                { name: "Emma_Wellness", trees: 24, health: 98 },
                { name: "Sarah_Health", trees: 22, health: 95 },
                { name: "You", trees: 18, health: 85 },
              ].map((user, idx) => (
                <View
                  key={idx}
                  className="flex-row items-center justify-between rounded-lg border p-3"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <View className="flex-row items-center gap-3">
                    <Text
                      className="h-6 w-6 items-center justify-center text-center font-bold"
                      style={{ color: colors.primary }}
                    >
                      #{idx + 1}
                    </Text>
                    <Text
                      className="font-semibold"
                      style={{ color: colors.foreground }}
                    >
                      {user.name}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm">🌳</Text>
                    <Text
                      className="font-bold"
                      style={{ color: colors.primary }}
                    >
                      {user.trees}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
