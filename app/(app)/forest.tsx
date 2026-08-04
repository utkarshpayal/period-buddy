import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ForestScene, type ForestPhase } from "../../components/ForestScene";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { cycleApi, forestApi, type ForestStatus } from "../../lib/api";

function toForestPhase(currentPhase: string | undefined, averageHealth: number): ForestPhase {
  const normalized = currentPhase?.toLowerCase();
  if (normalized === "period" || normalized === "follicular" || normalized === "ovulation" || normalized === "luteal") {
    return normalized;
  }
  // No cycle data yet — fall back to a health-based mood so the scene still varies.
  if (averageHealth >= 80) return "ovulation";
  if (averageHealth >= 60) return "follicular";
  if (averageHealth >= 40) return "luteal";
  return "period";
}

interface Tree {
  id: number;
  month: string;
  health: number;
  status: "healthy" | "wilted" | "dead";
}

export default function Forest() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const sparkleAnim = useRef(new Animated.Value(0)).current;

  const [isNourished, setIsNourished] = useState(false);
  const [forestStatus, setForestStatus] = useState<ForestStatus | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string | undefined>(undefined);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkleAnim, {
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(sparkleAnim, {
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [sparkleAnim]);

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

    cycleApi
      .getPredictions()
      .then((predictions) => {
        if (isMounted) setCurrentPhase(predictions?.currentPhase);
      })
      .catch(() => {
        if (isMounted) setCurrentPhase(undefined);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const currentHealth = forestStatus?.currentHealth ?? 55;

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

  // Maps every tier string the backend can actually return (see
  // forestController.js `getTier`) to a color. Keyed by name rather than by
  // `!forestStatus` so the badge is colored correctly for real API data too,
  // not just the offline/demo fallback — previously any real forestTier
  // (including top tiers) silently fell back to the default coral.
  const TIER_COLORS: Record<string, string> = {
    "Ancient Evergreen Canopy": colors.success,
    "Lush Tropical Forest": colors.accent,
    "Growing Cycle Grove": colors.warning,
    "Sprout Woodland": colors.primary,
  };

  // Only used while forestStatus hasn't loaded yet (offline/demo state) —
  // once real status arrives, forestStatus.forestTier always wins.
  const fallbackTier =
    !forestStatus && healthyTreeCount >= 20
      ? "Ancient Evergreen Canopy"
      : !forestStatus && healthyTreeCount >= 14
        ? "Lush Tropical Forest"
        : "Sprout Woodland";

  const forestTier = forestStatus?.forestTier ?? fallbackTier;
  const tierColor = TIER_COLORS[forestTier] ?? colors.primary;
  const sparkleOpacity = sparkleAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.45, 1, 0.45],
  });

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
          {/* Header — circular back button + title, matches mockup frame "19 · FOREST" */}
          <View className="flex-row items-center gap-3 px-[22px] pt-6">
            <TouchableOpacity
              onPress={() => router.back()}
              accessibilityLabel="Back"
              activeOpacity={0.7}
              className="w-9 h-9 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={colors.foreground}
              />
            </TouchableOpacity>
            <Text
              className="flex-1 text-xl font-bold"
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              Your Forest
            </Text>
          </View>

          {/* Stat tiles — trees planted / day streak, side by side */}
          <View className="flex-row gap-3 px-[22px] pt-[14px]">
            <View
              className="flex-1 items-center rounded-2xl p-3"
              style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
            >
              <Text
                className="text-lg font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                {healthyTreeCount}
              </Text>
              <Text
                className="text-[10px] font-bold uppercase mt-0.5"
                style={{ color: colors.mutedText, fontFamily: fonts.body }}
              >
                trees planted
              </Text>
            </View>
            <View
              className="flex-1 items-center rounded-2xl p-3"
              style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
            >
              <Text
                className="text-lg font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                {forestStatus?.careActions ?? 0}
              </Text>
              <Text
                className="text-[10px] font-bold uppercase mt-0.5"
                style={{ color: colors.mutedText, fontFamily: fonts.body }}
              >
                day streak
              </Text>
            </View>
          </View>

          {/* Forest scene card — soft surface card wrapping the scenery */}
          <View
            className="mx-[22px] mt-6 rounded-[22px] overflow-hidden"
            style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
          >
            {/* Visual Ecosystem Container — ported from the Marketing
                website's forest simulator (Home.jsx) so the app and site
                share the same sky/hills/tree scene. */}
            <View style={{ position: "relative", width: "100%" }}>
              <ForestScene height={236} phase={toForestPhase(currentPhase, averageHealth)} />

              <View
                className="absolute left-4 top-4 rounded-2xl border px-3 py-1.5 shadow-sm"
                style={{
                  backgroundColor: isDark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.85)",
                  borderColor: isDark ? "rgba(255,255,255,0.15)" : colors.border,
                }}
              >
                <Text
                  className="text-[11px] font-black tracking-widest uppercase"
                  style={{ color: tierColor, fontFamily: fonts.body }}
                >
                  {forestTier}
                </Text>
              </View>

              {isNourished && (
                <Animated.View
                  className="absolute inset-0 items-center justify-center"
                  style={{
                    backgroundColor: colors.infoLight,
                    opacity: sparkleOpacity,
                  }}
                >
                  <View
                    className="flex-row items-center gap-2 rounded-full border px-4 py-2"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.info,
                    }}
                  >
                    <Ionicons name="water" size={16} color={colors.info} />
                    <Text
                      className="text-xs font-black"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                    >
                      Forest hydrated +5% vitality
                    </Text>
                  </View>
                </Animated.View>
              )}
            </View>

            {/* Stats Dashboard Under Canopy */}
            <View
              className="px-5 py-4 border-t border-dashed"
              style={{ borderColor: colors.border }}
            >
              <View className="flex-row justify-between items-center">
                <View>
                  <Text
                    className="text-xs font-medium"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    Forest Size
                  </Text>
                  <Text
                    className="text-lg font-bold mt-0.5"
                    style={{ color: colors.foreground, fontFamily: fonts.heading }}
                  >
                    {healthyTreeCount} Active Trees
                  </Text>
                </View>

                <View className="items-end">
                  <Text
                    className="text-xs font-medium"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    Forest Health
                  </Text>
                  <Text
                    className="text-lg font-bold mt-0.5"
                    style={{
                      color: averageHealth >= 70 ? colors.success : colors.primary,
                      fontFamily: fonts.mono,
                    }}
                  >
                    {averageHealth}%
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Caption */}
          <Text
            className="mt-4 px-8 text-center text-xs font-semibold leading-5"
            style={{ color: colors.mutedText, fontFamily: fonts.body }}
          >
            Every logged day plants a new sapling. Keep your streak alive to
            grow your forest.
          </Text>

          {/* Primary CTA — pinned pill button, preserves existing handleLogCare action/label */}
          <TouchableOpacity
            className="mx-[22px] mt-5 w-auto py-4 rounded-2xl flex-row items-center justify-center gap-2 active:opacity-90"
            style={{
              backgroundColor: isNourished ? colors.border : colors.primary,
              ...getShadow(colors, isDark),
            }}
            disabled={isNourished || forestStatus?.todayCareLogged}
            onPress={handleLogCare}
          >
            <Ionicons
              name={isNourished || forestStatus?.todayCareLogged ? "checkmark-circle" : "water"}
              size={18}
              color={colors.buttonText}
            />
            <Text
              className="font-bold text-sm"
              style={{ color: colors.buttonText, fontFamily: fonts.body }}
            >
              {isNourished || forestStatus?.todayCareLogged
                ? "Nourished Today"
                : "Water today's tree"}
            </Text>
          </TouchableOpacity>

          {/* History Log Section */}
          <View className="mx-6 mt-6">
            <Text
              className="mb-4 text-lg font-bold"
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
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
                        style={{ color: colors.foreground, fontFamily: fonts.heading }}
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
                              tree.status === "healthy" ? colors.success : colors.primary,
                          }}
                        />
                      </View>
                      <Text
                        className="mt-2 text-[11px] font-semibold"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
                      >
                        Tree Stability: {tree.health}%
                      </Text>
                    </View>

                    {/* Right side individual tree render item */}
                    <View
                      className="items-center justify-center p-3 rounded-2xl min-w-[76px] h-20"
                      style={{ backgroundColor: colors.input }}
                    >
                      {tree.status === "healthy" ? (
                        <MaterialCommunityIcons
                          name="tree"
                          size={36}
                          color={colors.success}
                        />
                      ) : (
                        <MaterialCommunityIcons
                          name="sprout-outline"
                          size={32}
                          color={colors.primary}
                        />
                      )}
                      <Text
                        className="text-[9px] font-bold uppercase tracking-wider mt-1.5"
                        style={{
                          color:
                            tree.status === "healthy" ? colors.success : colors.primary,
                          fontFamily: fonts.body,
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
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
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
                            fontFamily: fonts.mono,
                          }}
                        >
                          #{idx + 1}
                        </Text>
                        <View>
                          <Text
                            className="font-bold text-sm"
                            style={{ color: colors.foreground, fontFamily: fonts.heading }}
                          >
                          {isMe ? `${user.name} (you)` : user.name}
                          </Text>
                          <Text
                            className="text-[11px]"
                            style={{ color: colors.mutedText, fontFamily: fonts.body }}
                          >
                            {user.tier}
                          </Text>
                        </View>
                      </View>
                      <View
                        className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg border"
                        style={{
                          backgroundColor: colors.input,
                          borderColor: colors.border,
                        }}
                      >
                        <MaterialCommunityIcons
                          name="tree-outline"
                          size={14}
                          color={colors.primary}
                        />
                        <Text
                          className="font-bold text-xs"
                          style={{ color: colors.foreground, fontFamily: fonts.mono }}
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
