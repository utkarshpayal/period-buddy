import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../components/theme";
import { getActionGradient, getSoftTints } from "../../components/ui-tokens";
import { habitsApi, type Habit } from "../../lib/api";

const HABIT_IDEAS = [
  { title: "Sleep 8 Hours", icon: "moon-outline", color: "#7c3aed", tokens: 45 },
  { title: "Eat Iron-Rich Food", icon: "nutrition-outline", color: "#d97706", tokens: 35 },
  { title: "Stretch for 10 Minutes", icon: "body-outline", color: "#0f766e", tokens: 25 },
];

function computeTreeState(pct: number) {
  if (pct === 0) return { label: "Resting Seed", icon: "seed-outline", motivation: "Complete a small routine today to start growing your wellness tree." };
  if (pct <= 35) return { label: "New Seedling", icon: "sprout-outline", motivation: "Your basic routines are building steady roots." };
  if (pct <= 75) return { label: "Growing Tree", icon: "tree-outline", motivation: "Nice progress. Your care habits are becoming consistent." };
  return { label: "Blooming Tree", icon: "flower-tulip-outline", motivation: "Strong routine day. Your wellness tree is fully nourished." };
}

export default function Habits() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();

  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const softTints = getSoftTints(colors);
  const actionGradient = getActionGradient(colors) as [string, string];

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const data = await habitsApi.getHabits();
      setHabits(data);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to load habits");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleHabit = async (id: string) => {
    setTogglingId(id);
    try {
      const result = await habitsApi.toggleHabit(id);
      setHabits((prev) =>
        prev.map((h) =>
          h.id === id
            ? { ...h, completed: result.completed, streak: result.streak }
            : h,
        ),
      );
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not update habit");
    } finally {
      setTogglingId(null);
    }
  };

  const addHabit = async () => {
    const idea = HABIT_IDEAS.find((idea) => !habits.some((h) => h.title === idea.title));
    if (!idea) {
      Alert.alert("Habit list full", "You have already added all suggested habits.");
      return;
    }
    try {
      const newHabit = await habitsApi.createHabit(idea);
      setHabits((prev) => [...prev, newHabit]);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not add habit");
    }
  };

  const totalTokens = habits.reduce((acc, h) => acc + (h.completed ? (h.rewardPoints ?? h.tokens) : 0), 0);
  const maxPossibleTokens = Math.max(180, habits.reduce((acc, h) => acc + (h.rewardPoints ?? h.tokens), 0));
  const growthPct = Math.min((totalTokens / maxPossibleTokens) * 100, 100);
  const treeState = computeTreeState(growthPct);
  const hasSuggestedHabits = HABIT_IDEAS.some(
    (idea) => !habits.some((habit) => habit.title === idea.title),
  );

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        {/* Header */}
        <View className="flex-row items-center gap-2 px-6 pt-6">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="p-2.5 -ml-2 rounded-full border"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <Text className="flex-1 text-2xl font-black tracking-tight ml-2" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
            Habit Tracker
          </Text>
          <TouchableOpacity onPress={() => load(true)} className="p-2.5 rounded-full border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <Feather name="refresh-cw" size={16} color={colors.mutedText} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center px-6">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="mt-4 text-xs font-bold text-center" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              Loading your daily routines...
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
            }
          >
            {/* Tree Hub Panel */}
            <View className="mx-6 mt-6">
              <View
                className="rounded-3xl border p-5 shadow-2xl relative overflow-hidden"
                style={{ backgroundColor: colors.surface, borderColor: colors.border }}
              >
                <View className="absolute -right-6 -top-6 w-20 h-20 rounded-full opacity-35" style={{ backgroundColor: softTints.pink }} />

                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-2">
                    <Text
                      className="text-[10px] font-black tracking-widest uppercase"
                      style={{ color: colors.primary, fontFamily: fonts.body }}
                    >
                      Current Cycle Tree
                    </Text>
                    <Text className="mt-1 text-base font-black tracking-tight" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                      {treeState.label}
                    </Text>
                    <Text className="mt-1 text-[11px] font-medium leading-4" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                      {treeState.motivation}
                    </Text>
                  </View>
                  <View
                    className="h-20 w-20 items-center justify-center rounded-2xl border border-dashed"
                    style={{ backgroundColor: softTints.pink, borderColor: `${colors.primary}40` }}
                  >
                    <MaterialCommunityIcons name={treeState.icon as any} size={36} color={colors.primary} />
                  </View>
                </View>

                {/* Progress Bar */}
                <View className="mt-5">
                  <View className="flex-row justify-between items-center mb-1.5 px-0.5">
                    <Text className="text-[10px] font-bold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                      Score: {totalTokens} / {maxPossibleTokens} Tokens
                    </Text>
                    <Text className="text-[10px] font-black" style={{ color: colors.primary, fontFamily: fonts.mono }}>
                      {Math.round(growthPct)}% Growth
                    </Text>
                  </View>
                  <View className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: colors.surfaceSoft }}>
                    <LinearGradient
                      colors={actionGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ height: "100%", width: `${growthPct}%`, borderRadius: 99 }}
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* Habits List */}
            <View className="mx-6 mt-8">
              <Text className="mb-4 text-xs font-black tracking-widest uppercase px-1" style={{ color: colors.primary, fontFamily: fonts.heading }}>
                Daily Routines Checklist
              </Text>

              <View className="gap-3.5">
                {habits.length === 0 ? (
                  <View
                    className="items-center rounded-2xl border p-5"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    <MaterialCommunityIcons name="sprout-outline" size={30} color={colors.primary} />
                    <Text className="mt-3 text-sm font-black" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                      Start with one gentle habit
                    </Text>
                    <Text className="mt-1 text-xs text-center leading-5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                      Add a suggested routine and your tree will begin growing from today.
                    </Text>
                  </View>
                ) : habits.map((habit) => {
                  const isToggling = togglingId === habit.id;
                  const resolveHabitColor = (hex: string) => {
                    if (!hex) return colors.primary;
                    const h = hex.toLowerCase();
                    if (h === "#7c3aed" || h.includes("7c")) return colors.lavender;
                    if (h === "#d97706" || h.includes("d9")) return colors.warning;
                    if (h === "#0f766e" || h.includes("0f")) return colors.success;
                    return colors.primary;
                  };
                  const resolvedColor = resolveHabitColor(habit.color);

                  return (
                    <TouchableOpacity
                      key={habit.id}
                      activeOpacity={0.8}
                      onPress={() => toggleHabit(habit.id)}
                      disabled={isToggling}
                      className="rounded-2xl border shadow-sm overflow-hidden"
                      style={{
                        backgroundColor: colors.surface,
                        borderColor: habit.completed ? `${resolvedColor}40` : colors.border,
                        opacity: isToggling ? 0.7 : 1,
                      }}
                    >
                      <View className="flex-row items-center justify-between p-4">
                        <View className="flex-row items-center flex-1 gap-4">
                          {/* Checkbox */}
                          <View
                            className="h-10 w-10 items-center justify-center rounded-xl border"
                            style={{
                              backgroundColor: habit.completed ? resolvedColor : "transparent",
                              borderColor: habit.completed ? resolvedColor : colors.border,
                            }}
                          >
                            {isToggling ? (
                              <ActivityIndicator size="small" color={habit.completed ? "white" : colors.mutedText} />
                            ) : habit.completed ? (
                              <Feather name="check" size={16} color="white" />
                            ) : (
                              <Ionicons name={habit.icon as any} size={18} color={colors.mutedText} />
                            )}
                          </View>

                          <View className="flex-1">
                            <Text
                              className="text-sm font-bold tracking-tight"
                              style={{
                                color: habit.completed ? colors.mutedText : colors.foreground,
                                textDecorationLine: habit.completed ? "line-through" : "none",
                                opacity: habit.completed ? 0.6 : 1,
                                fontFamily: fonts.heading,
                              }}
                            >
                              {habit.title}
                            </Text>
                            <View className="flex-row items-center gap-1 mt-0.5">
                              <MaterialCommunityIcons name="fire" size={12} color={colors.warning} />
                              <Text className="text-[10px] font-bold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                                {habit.streak} day streak
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View
                          className="rounded-lg px-2.5 py-1"
                          style={{ backgroundColor: habit.completed ? colors.border : `${resolvedColor}18` }}
                        >
                          <Text
                            className="text-[10px] font-black"
                            style={{ color: habit.completed ? colors.mutedText : resolvedColor, fontFamily: fonts.mono }}
                          >
                            +{habit.rewardPoints ?? habit.tokens} pts
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Add Habit Button */}
              <TouchableOpacity
                activeOpacity={0.7}
                className="mt-6 rounded-2xl border border-dashed py-4 items-center justify-center"
                onPress={addHabit}
                disabled={!hasSuggestedHabits}
                style={{
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceSoft,
                  opacity: hasSuggestedHabits ? 1 : 0.62,
                }}
              >
                <View className="flex-row items-center gap-2">
                  <Feather name="plus-circle" size={15} color={colors.primary} />
                  <Text className="text-xs font-black tracking-wide" style={{ color: colors.primary, fontFamily: fonts.body }}>
                    {hasSuggestedHabits ? "Add Suggested Habit" : "All Suggestions Added"}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}
