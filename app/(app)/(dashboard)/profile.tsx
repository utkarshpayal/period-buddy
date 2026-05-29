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
import { useAppState } from "../../../components/AppState";
import { useAuth } from "../../../components/auth-context";
import { useTheme } from "../../../components/theme";

interface MenuItem {
  id: string;
  title: string;
  icon: string;
  color: string;
  description: string;
  route?: string;
}

export default function Profile() {
  const { colors, isDark } = useTheme();
  const { signOut, user } = useAuth();
  const { tokens, trackedDays } = useAppState();
  const router = useRouter();
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const currentStreak = Math.min(trackedDays, 12);

  const menuItems: MenuItem[] = [
    {
      id: "1",
      title: "My Progress",
      icon: "stats-chart",
      color: colors.primary,
      description: "Open your wellness forest and progress leaderboard.",
      route: "/(app)/forest",
    },
    {
      id: "2",
      title: "Achievements",
      icon: "trophy",
      color: colors.accent,
      description: "You have unlocked a 12-day tracking streak badge.",
    },
    {
      id: "3",
      title: "Settings",
      icon: "settings",
      color: colors.secondary,
      description: "Theme settings are available from the top-right toggle.",
    },
    {
      id: "4",
      title: "Help & Support",
      icon: "help-circle",
      color: colors.primary,
      description: "Support is ready for account, tracking, and privacy help.",
    },
    {
      id: "5",
      title: "Privacy Policy",
      icon: "shield",
      color: colors.secondary,
      description:
        "Your cycle notes stay in this local session unless you submit them.",
    },
  ];

  const handleLogout = () => {
    signOut();
    router.replace("/");
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
        <ScrollView contentContainerClassName="pb-20">
          {/* Profile Header */}
          <View className="items-center px-6 pt-6">
            <View
              className="h-24 w-24 items-center justify-center rounded-full border-4"
              style={{
                backgroundColor: colors.primary,
                borderColor: colors.primaryLight,
              }}
            >
              <Text className="text-4xl">👧</Text>
            </View>

            <Text
              className="mt-4 text-2xl font-bold"
              style={{ color: colors.foreground }}
            >
              {user?.firstName} {user?.lastName}
            </Text>
            <Text className="mt-1 text-sm" style={{ color: colors.mutedText }}>
              {user?.email}
            </Text>
          </View>

          {/* Stats Cards */}
          <View className="mx-6 mt-8 gap-3">
            <View className="flex-row gap-3">
              <View
                className="flex-1 rounded-xl border p-4"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={colors.primary}
                />
                <Text
                  className="mt-3 text-lg font-bold"
                  style={{ color: colors.foreground }}
                >
                  {trackedDays}
                </Text>
                <Text className="text-xs" style={{ color: colors.mutedText }}>
                  Days Tracked
                </Text>
              </View>

              <View
                className="flex-1 rounded-xl border p-4"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Ionicons name="star" size={24} color={colors.accent} />
                <Text
                  className="mt-3 text-lg font-bold"
                  style={{ color: colors.foreground }}
                >
                  {tokens}
                </Text>
                <Text className="text-xs" style={{ color: colors.mutedText }}>
                  Tokens Earned
                </Text>
              </View>

              <View
                className="flex-1 rounded-xl border p-4"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Ionicons name="flame" size={24} color={colors.secondary} />
                <Text
                  className="mt-3 text-lg font-bold"
                  style={{ color: colors.foreground }}
                >
                  {currentStreak}
                </Text>
                <Text className="text-xs" style={{ color: colors.mutedText }}>
                  Day Streak
                </Text>
              </View>
            </View>
          </View>

          {/* Menu Items */}
          <View className="mx-6 mt-8">
            {menuItems.map((item) => (
              <View key={item.id}>
                <TouchableOpacity
                  className="mb-3 flex-row items-center rounded-lg border p-4"
                  onPress={() => {
                    if (item.route) {
                      router.push(item.route as any);
                      return;
                    }

                    setActiveMenuId((current) =>
                      current === item.id ? null : item.id,
                    );
                  }}
                  style={{
                    backgroundColor: colors.surface,
                    borderColor:
                      activeMenuId === item.id ? item.color : colors.border,
                  }}
                >
                  <View
                    className="h-10 w-10 items-center justify-center rounded-lg"
                    style={{ backgroundColor: item.color }}
                  >
                    <Ionicons name={item.icon as any} size={20} color="white" />
                  </View>
                  <Text
                    className="ml-4 flex-1 font-semibold"
                    style={{ color: colors.foreground }}
                  >
                    {item.title}
                  </Text>
                  <Ionicons
                    name={
                      activeMenuId === item.id
                        ? "chevron-down"
                        : "chevron-forward"
                    }
                    size={20}
                    color={colors.mutedText}
                  />
                </TouchableOpacity>

                {activeMenuId === item.id ? (
                  <View
                    className="mb-3 rounded-lg border px-4 py-3"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    }}
                  >
                    <Text style={{ color: colors.text }}>
                      {item.description}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>

          {/* Logout Button */}
          <TouchableOpacity
            onPress={handleLogout}
            activeOpacity={0.85}
            className="mx-6 mt-8 flex-row items-center justify-center rounded-xl border-2 py-4"
            style={{
              backgroundColor: colors.surface,
              borderColor: "#ef4444",
            }}
          >
            <Ionicons name="log-out" size={20} color="#ef4444" />
            <Text className="ml-2 font-bold" style={{ color: "#ef4444" }}>
              Logout
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
