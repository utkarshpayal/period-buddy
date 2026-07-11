import {
  FontAwesome5,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { forestApi, type ForestStatus } from "../../lib/api";

interface Tree {
  id: number;
  month: string;
  health: number;
  status: "healthy" | "wilted" | "dead";
}

export default function Forest() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { trackedDays } = useAppState();

  const [isNourished, setIsNourished] = useState(false);
  const [forestStatus, setForestStatus] = useState<ForestStatus | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadForestStatus() {
      try {
        const status = await forestApi.getStatus();
        if (isMounted) setForestStatus(status);
      } catch {
        if (isMounted) setForestStatus(null);
      }
    }

    loadForestStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  const currentHealth =
    forestStatus?.currentHealth ?? Math.min(100, Math.max(45, 55 + trackedDays * 6));

  const trees: Tree[] =
    forestStatus?.trees?.length
      ? forestStatus.trees.map((tree, index) => ({
          id: index + 1,
          month: tree.month,
          health: tree.health,
          status:
            tree.status === "dead" || tree.status === "healthy" || tree.status === "wilted"
              ? tree.status
              : tree.health >= 60
                ? "healthy"
                : "wilted",
        }))
      : [
          { id: 1, month: "April", health: 100, status: "healthy" },
          {
            id: 2,
            month: "May",
            health: currentHealth,
            status: currentHealth >= 60 ? "healthy" : "wilted",
          },
          { id: 3, month: "June", health: 45, status: "wilted" },
        ];

  const healthyTreeCount =
    forestStatus?.healthyTreeCount ??
    trees.filter((t) => t.status === "healthy").length + 12;
  const averageHealth =
    forestStatus?.averageHealth ??
    Math.round(trees.reduce((acc, t) => acc + t.health, 0) / trees.length);

  let forestTier = forestStatus?.forestTier ?? "Sprout Woodland";
  let tierColor = "#10b981"; // Emerald

  if (!forestStatus && healthyTreeCount >= 20) {
    forestTier = "Ancient Evergreen Canopy";
    tierColor = "#047857";
  } else if (!forestStatus && healthyTreeCount >= 14) {
    forestTier = "Lush Tropical Forest";
    tierColor = "#059669";
  }

  async function handleLogCare() {
    setIsNourished(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const result = await forestApi.logCare({
        careType: "water",
        dateKey: today,
        note: "Logged care from the app",
      });
      setForestStatus(result.status);
    } catch {
      // Keep the visual confirmation when developing without the backend.
    } finally {
      setTimeout(() => setIsNourished(false), 2500);
    }
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
          {/* Header */}
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

          {/* VIRTUAL FOREST CANOPY DISPLAY */}
          <View
            className="mx-6 mt-6 rounded-3xl border-2 overflow-hidden shadow-lg"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            {/* Visual Ecosystem Container */}
            <View className="h-44 w-full relative justify-center items-center overflow-hidden bg-neutral-900/5 dark:bg-black/30 pt-4">
              {/* Ground/Grass Layer Base */}
              <View className="absolute bottom-0 left-0 right-0 h-8 bg-emerald-950/20 dark:bg-emerald-900/10 border-t border-emerald-500/10" />

              {/* Dynamic Layered Vector Trees (Replaced basic Emojis) */}
              {averageHealth >= 50 ? (
                <View className="w-full h-full flex-row justify-center items-end pb-4 px-8 gap-4 relative">
                  {/* Background Smaller Trees for depth */}
                  <MaterialCommunityIcons
                    name="tree"
                    size={54}
                    color={isDark ? "#064e3b" : "#0f766e"}
                    style={{ opacity: 0.5, marginBottom: 4 }}
                  />
                  <FontAwesome5
                    name="tree"
                    size={48}
                    color={isDark ? "#065f46" : "#115e59"}
                    style={{
                      opacity: 0.4,
                      marginBottom: 8,
                      position: "absolute",
                      left: "25%",
                    }}
                  />

                  {/* Primary Center Trees */}
                  <MaterialCommunityIcons
                    name="pine-tree"
                    size={76}
                    color={isDark ? "#10b981" : "#059669"}
                    style={{ zIndex: 10 }}
                  />
                  <FontAwesome5
                    name="tree"
                    size={68}
                    color={isDark ? "#059669" : "#10b981"}
                    style={{ zIndex: 9 }}
                  />

                  {/* Foreground detail */}
                  <MaterialCommunityIcons
                    name="flower-tulip"
                    size={20}
                    color="#f43f5e"
                    style={{
                      position: "absolute",
                      bottom: 6,
                      left: "40%",
                      zIndex: 12,
                    }}
                  />
                  <MaterialCommunityIcons
                    name="leaf"
                    size={16}
                    color="#34d399"
                    style={{
                      position: "absolute",
                      bottom: 12,
                      right: "35%",
                      zIndex: 12,
                      transform: [{ rotate: "-15deg" }],
                    }}
                  />

                </View>
              ) : (
                /* Wilted / Sick Forest State */
                <View className="w-full h-full flex-row justify-center items-end pb-4 gap-6">
                  <MaterialCommunityIcons
                    name="tree-outline"
                    size={64}
                    color="#78716c"
                    style={{ opacity: 0.6 }}
                  />
                  <MaterialCommunityIcons
                    name="pine-tree-box"
                    size={72}
                    color="#57534e"
                  />
                  <MaterialCommunityIcons
                    name="leaf-off"
                    size={24}
                    color="#a8a29e"
                    style={{ position: "absolute", bottom: 16, right: "40%" }}
                  />
                </View>
              )}

              {/* Floating Status Glassmorphic Badge */}
              <View className="absolute top-4 left-4 backdrop-blur-md bg-white/10 dark:bg-black/40 px-3 py-1.5 rounded-2xl border border-white/20 shadow-sm">
                <Text
                  className="text-[11px] font-bold tracking-widest uppercase"
                  style={{ color: tierColor }}
                >
                  {forestTier}
                </Text>
              </View>

              {/* Water droplet animation confirmation */}
              {isNourished && (
                <View className="absolute inset-0 bg-blue-500/10 items-center justify-center">
                  <Text className="text-blue-400 text-xs font-bold bg-neutral-900/80 px-3 py-1 rounded-full border border-blue-400/30">
                    Forest hydrated +5% vitality
                  </Text>
                </View>
              )}
            </View>

            {/* Stats Dashboard Under Canopy */}
            <View
              className="p-5 border-t border-dashed"
              style={{ borderColor: colors.border }}
            >
              <View className="flex-row justify-between items-center">
                <View>
                  <Text
                    className="text-xs font-medium"
                    style={{ color: colors.mutedText }}
                  >
                    Forest Size
                  </Text>
                  <Text
                    className="text-lg font-bold mt-0.5"
                    style={{ color: colors.foreground }}
                  >
                    {healthyTreeCount} Active Trees
                  </Text>
                </View>

                <View className="items-end">
                  <Text
                    className="text-xs font-medium"
                    style={{ color: colors.mutedText }}
                  >
                    Forest Health
                  </Text>
                  <Text
                    className="text-lg font-bold mt-0.5"
                    style={{
                      color: averageHealth >= 70 ? "#10b981" : "#ef4444",
                    }}
                  >
                    {averageHealth}%
                  </Text>
                </View>
              </View>

              {/* Interactive Care Action Bar */}
              <TouchableOpacity
                className="mt-4 w-full py-3 rounded-xl flex-row items-center justify-center gap-2 active:opacity-90"
                style={{
                  backgroundColor: isNourished ? colors.border : "#0284c7",
                }}
                disabled={isNourished || forestStatus?.todayCareLogged}
                onPress={handleLogCare}
              >
                <Ionicons
                  name={isNourished || forestStatus?.todayCareLogged ? "checkmark-circle" : "water"}
                  size={18}
                  color="white"
                />
                <Text className="text-white font-bold text-sm">
                  {isNourished || forestStatus?.todayCareLogged
                    ? "Nourished Today"
                    : "Log Care for Forest"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* History Log Section */}
          <View className="mx-6 mt-6">
            <Text
              className="mb-4 text-lg font-bold"
              style={{ color: colors.foreground }}
            >
              Cycle Tree Logs
            </Text>

            <View className="gap-4">
              {trees.map((tree) => (
                <View
                  key={tree.id}
                  className="overflow-hidden rounded-2xl border-2"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <View className="flex-row items-center justify-between p-5">
                    <View className="flex-1">
                      <Text
                        className="text-base font-bold"
                        style={{ color: colors.foreground }}
                      >
                        {tree.month} Cycle
                      </Text>

                      {/* Health Progress Line */}
                      <View
                        className="mt-3 h-1.5 overflow-hidden rounded-full"
                        style={{ backgroundColor: colors.border, width: 140 }}
                      >
                        <View
                          className="h-full"
                          style={{
                            width: `${tree.health}%`,
                            backgroundColor:
                              tree.status === "healthy" ? "#10b981" : "#f43f5e",
                          }}
                        />
                      </View>
                      <Text
                        className="mt-2 text-[11px] font-semibold"
                        style={{ color: colors.mutedText }}
                      >
                        Tree Stability: {tree.health}%
                      </Text>
                    </View>

                    {/* Right side individual tree render item */}
                    <View className="items-center justify-center p-3 rounded-2xl bg-neutral-100 dark:bg-neutral-900/50 min-w-[76px] h-20">
                      {tree.status === "healthy" ? (
                        <MaterialCommunityIcons
                          name="tree"
                          size={36}
                          color="#10b981"
                        />
                      ) : (
                        <MaterialCommunityIcons
                          name="sprout-outline"
                          size={32}
                          color="#f43f5e"
                        />
                      )}
                      <Text
                        className="text-[9px] font-bold uppercase tracking-wider mt-1.5"
                        style={{
                          color:
                            tree.status === "healthy" ? "#10b981" : "#f43f5e",
                        }}
                      >
                        {tree.status === "healthy" ? "Thriving" : "Wilted"}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Ranking Board */}
            <Text
              className="mb-4 mt-8 text-lg font-bold"
              style={{ color: colors.foreground }}
            >
              Canopy Leaderboard
            </Text>

            <View className="gap-2">
              {[
                { name: "Emma_Wellness", trees: 24, tier: "Ancient Canopy" },
                { name: "Sarah_Health", trees: 22, tier: "Ancient Canopy" },
                { name: "You", trees: healthyTreeCount, tier: forestTier },
              ]
                .sort((a, b) => b.trees - a.trees)
                .map((user, idx) => {
                  const isMe = user.name === "You";
                  return (
                    <View
                      key={idx}
                      className="flex-row items-center justify-between rounded-xl border p-4"
                      style={{
                        backgroundColor: isMe
                          ? `${colors.primary}12`
                          : colors.surface,
                        borderColor: isMe ? colors.primary : colors.border,
                      }}
                    >
                      <View className="flex-row items-center gap-3">
                        <Text
                          className="font-bold text-sm w-4"
                          style={{
                            color: isMe ? colors.primary : colors.mutedText,
                          }}
                        >
                          #{idx + 1}
                        </Text>
                        <View>
                          <Text
                            className="font-bold text-sm"
                            style={{ color: colors.foreground }}
                          >
                          {isMe ? `${user.name} (you)` : user.name}
                          </Text>
                          <Text
                            className="text-[11px]"
                            style={{ color: colors.mutedText }}
                          >
                            {user.tier}
                          </Text>
                        </View>
                      </View>
                      <View
                        className="flex-row items-center gap-1.5 bg-neutral-100 dark:bg-neutral-900 px-3 py-1.5 rounded-lg border"
                        style={{ borderColor: colors.border }}
                      >
                        <MaterialCommunityIcons
                          name="tree-outline"
                          size={14}
                          color={colors.primary}
                        />
                        <Text
                          className="font-bold text-xs"
                          style={{ color: colors.foreground }}
                        >
                          {user.trees} Trees
                        </Text>
                      </View>
                    </View>
                  );
                })}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
