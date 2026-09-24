import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ForestScene, type ForestPhase } from "../../components/ForestScene";
import { GROWTH_STAGE_LABEL, GROWTH_STAGE_MOTIVATION, GrowthTree, getGrowthStage } from "../../components/GrowthTree";
import { SkeletonBlock } from "../../components/Skeleton";
import { ThemeColors, useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { alert } from "../../lib/alert";
import { cycleApi, forestApi, type ForestStatus } from "../../lib/api";

// Vitality color follows the same red→amber→green read as any health meter
// in the app — high health is good here, so this is deliberately the
// inverse of getSeverityColor (which assumes higher = worse).
function vitalityColor(health: number, colors: ThemeColors) {
  if (health >= 70) return colors.success;
  if (health >= 35) return colors.warning;
  return colors.danger;
}

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

  const [isNourished, setIsNourished] = useState(false);
  const [forestStatus, setForestStatus] = useState<ForestStatus | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  // False until the first status fetch settles — until then the numbers and
  // history below would otherwise show the offline/demo fallback values.
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadForest = useCallback(async () => {
    const [status, predictions] = await Promise.allSettled([
      forestApi.getStatus(),
      cycleApi.getPredictions(),
    ]);
    setForestStatus(status.status === "fulfilled" ? status.value : null);
    setCurrentPhase(
      predictions.status === "fulfilled" ? predictions.value?.currentPhase : undefined,
    );
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    loadForest();
  }, [loadForest]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadForest();
    } finally {
      setRefreshing(false);
    }
  }, [loadForest]);

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
  const growthStage = getGrowthStage(currentHealth);

  async function handleLogCare() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const result = await forestApi.logCare({
        careType: "water",
        dateKey: today,
        note: "Logged care from the app",
      });
      setForestStatus(result.status);
      setIsNourished(true);
      setTimeout(() => setIsNourished(false), 2500);
    } catch (error) {
      if (__DEV__) {
        // Keep the visual confirmation when developing without the backend.
        setIsNourished(true);
        setTimeout(() => setIsNourished(false), 2500);
        return;
      }
      alert(
        "Couldn't log care",
        error instanceof Error ? error.message : "Please try again.",
      );
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
        <ScrollView
          contentContainerClassName="pb-10"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
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
              {hasLoaded ? (
                <Text
                  className="text-lg font-bold"
                  style={{ color: colors.foreground, fontFamily: fonts.heading }}
                >
                  {healthyTreeCount}
                </Text>
              ) : (
                <SkeletonBlock width={28} height={20} style={{ marginVertical: 4 }} />
              )}
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
              {hasLoaded ? (
                <Text
                  className="text-lg font-bold"
                  style={{ color: colors.foreground, fontFamily: fonts.heading }}
                >
                  {forestStatus?.careActions ?? 0}
                </Text>
              ) : (
                <SkeletonBlock width={28} height={20} style={{ marginVertical: 4 }} />
              )}
              <Text
                className="text-[10px] font-bold uppercase mt-0.5"
                style={{ color: colors.mutedText, fontFamily: fonts.body }}
              >
                day streak
              </Text>
            </View>
          </View>

          {/* Forest scene card — the personal GrowthTree stands as the
              scene's centerpiece, growing/drying with real care data instead
              of the fixed 4-species decoration. */}
          <View
            className="mx-[22px] mt-6 rounded-[22px] overflow-hidden"
            style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
          >
            {/* Visual Ecosystem Container — ported from the Marketing
                website's forest simulator (Home.jsx) so the app and site
                share the same sky/hills/tree scene. */}
            <View style={{ position: "relative", width: "100%" }}>
              <ForestScene
                height={236}
                phase={toForestPhase(currentPhase, averageHealth)}
                centerpiece={
                  <GrowthTree
                    health={currentHealth}
                    isThirsty={!forestStatus?.todayCareLogged}
                    isWatering={isNourished}
                    size={108}
                  />
                }
              />

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
            </View>

            {/* Growth stage + vitality meter — the tree's own "how it's
                doing" story, replacing the old generic Forest Size/Health
                pair (that count is already shown in the stat tile above). */}
            <View
              className="px-5 py-4 border-t border-dashed"
              style={{ borderColor: colors.border }}
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text
                  className="text-base font-bold"
                  style={{ color: colors.foreground, fontFamily: fonts.heading }}
                >
                  {GROWTH_STAGE_LABEL[growthStage]}
                </Text>
                <Text
                  className="text-sm font-bold"
                  style={{ color: vitalityColor(currentHealth, colors), fontFamily: fonts.mono }}
                >
                  {currentHealth}%
                </Text>
              </View>
              <Text
                className="text-xs leading-4"
                style={{ color: colors.mutedText, fontFamily: fonts.body }}
              >
                {!forestStatus?.todayCareLogged
                  ? "Thirsty — water it today to keep it growing."
                  : GROWTH_STAGE_MOTIVATION[growthStage]}
              </Text>
              <View
                className="mt-3 h-2 overflow-hidden rounded-full"
                style={{ backgroundColor: colors.border }}
              >
                <View
                  className="h-full rounded-full"
                  style={{ width: `${currentHealth}%`, backgroundColor: vitalityColor(currentHealth, colors) }}
                />
              </View>
            </View>
          </View>

          {/* Caption */}
          <Text
            className="mt-4 px-8 text-center text-xs font-semibold leading-5"
            style={{ color: colors.mutedText, fontFamily: fonts.body }}
          >
            Every day you log care, your tree grows a little more. Skip a few
            days and it&apos;ll start to dry out — keep watering to bring it back.
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
              {!hasLoaded ? (
                <>
                  <SkeletonBlock width="100%" height={88} radius={16} />
                  <SkeletonBlock width="100%" height={88} radius={16} />
                  <SkeletonBlock width="100%" height={88} radius={16} />
                </>
              ) : trees.map((tree) => (
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
                            backgroundColor: vitalityColor(tree.health, colors),
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

                    {/* Right side individual tree render item — the same
                        growth-stage art as the live tree above, at the
                        health that cycle actually reached, instead of a
                        binary healthy/wilted icon swap. */}
                    <View
                      className="items-center justify-center rounded-2xl min-w-[84px] px-1.5 py-2"
                      style={{ backgroundColor: colors.input }}
                    >
                      <GrowthTree health={tree.health} size={48} />
                      <Text
                        numberOfLines={2}
                        className="text-[8.5px] font-bold uppercase tracking-wider text-center -mt-1"
                        style={{ color: vitalityColor(tree.health, colors), fontFamily: fonts.body, lineHeight: 11 }}
                      >
                        {GROWTH_STAGE_LABEL[getGrowthStage(tree.health)]}
                      </Text>
                    </View>
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
