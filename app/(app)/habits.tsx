import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { alert } from "../../lib/alert";
import { useTheme } from "../../components/theme";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { SkeletonList } from "../../components/Skeleton";
import { getHeroGradient, getShadow, HABIT_CATEGORY_COLORS } from "../../components/ui-tokens";
import { useDataRefresh } from "../../hooks/useDataRefresh";
import { getFriendlyErrorMessage, habitsApi, isNetworkError, type Habit } from "../../lib/api";
import { HeaderIconButton, ScreenHeader } from "../../components/ScreenHeader";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { Icon } from "../../components/Icon";
import { CelebrationBurst } from "../../components/celebrations/Lottie";
import { haptics } from "../../lib/haptics";

const HABIT_IDEAS = [
  { title: "Sleep 8 Hours", icon: "moon-outline", color: HABIT_CATEGORY_COLORS.sleep, tokens: 45 },
  { title: "Eat Iron-Rich Food", icon: "nutrition-outline", color: HABIT_CATEGORY_COLORS.nutrition, tokens: 35 },
  { title: "Stretch for 10 Minutes", icon: "body-outline", color: HABIT_CATEGORY_COLORS.movement, tokens: 25 },
];

function computeTreeState(pct: number) {
  if (pct === 0) return { label: "Resting Seed", icon: "seed-outline", motivation: "Complete a small routine today to start growing your wellness tree." };
  if (pct <= 35) return { label: "New Seedling", icon: "sprout-outline", motivation: "Your basic routines are building steady roots." };
  if (pct <= 75) return { label: "Growing Tree", icon: "tree-outline", motivation: "Nice progress. Your care habits are becoming consistent." };
  return { label: "Blooming Tree", icon: "flower-tulip-outline", motivation: "Strong routine day. Your wellness tree is fully nourished." };
}

export default function Habits() {
  useSecureScreen("habits");
  const { colors, isDark, fonts } = useTheme();

  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // The habit just ticked off, for a one-shot burst on its check.
  const [celebrateId, setCelebrateId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; offline: boolean } | null>(null);
  // A ref, so a fast double tap can't add the same habit twice.
  const addingRef = useRef(false);
  const [adding, setAdding] = useState(false);
  const loadedRef = useRef(false);

  const heroGradient = getHeroGradient(colors, isDark) as [string, string, string];

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const data = await habitsApi.getHabits();
      setHabits(data);
      loadedRef.current = true;
      setLoadError(null);
    } catch (err) {
      // With nothing loaded yet, show an error with Retry instead of an empty
      // list; otherwise keep the list on screen.
      if (!loadedRef.current) setLoadError({ message: getFriendlyErrorMessage(err), offline: isNetworkError(err) });
      else if (isRefresh) alert("Couldn't refresh habits", getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Habits ticked elsewhere (Home, Forest); this screen's own writes already
  // update the list.
  useDataRefresh(["habits"], async ({ whileFocused }) => {
    if (whileFocused) return;
    try {
      setHabits(await habitsApi.getHabits());
    } catch {
      // Quiet refresh.
    }
  });

  const toggleHabit = async (id: string) => {
    setTogglingId(id);
    try {
      const result = await habitsApi.toggleHabit(id);
      if (result.completed) {
        haptics.success();
        setCelebrateId(id);
        setTimeout(() => setCelebrateId((current) => (current === id ? null : current)), 900);
      } else haptics.tap();
      setHabits((prev) =>
        prev.map((h) =>
          h.id === id
            ? { ...h, completed: result.completed, streak: result.streak }
            : h,
        ),
      );
    } catch (err) {
      alert("Couldn't update habit", getFriendlyErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  };

  const addHabit = async () => {
    const idea = HABIT_IDEAS.find((idea) => !habits.some((h) => h.title === idea.title));
    if (!idea) {
      alert("Habit list full", "You have already added all suggested habits.");
      return;
    }
    if (addingRef.current) return;
    addingRef.current = true;
    setAdding(true);
    try {
      const newHabit = await habitsApi.createHabit(idea);
      setHabits((prev) => [...prev, newHabit]);
    } catch (err) {
      alert("Couldn't add habit", getFriendlyErrorMessage(err));
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  };

  // Intentionally distinct from the shared wallet balance (see useUserStats()):
  // this is "points earned from today's visible habit checklist" for the tree
  // growth bar below, not the account's lifetime/total points total.
  const totalTokens = habits.reduce((acc, h) => acc + (h.completed ? (h.rewardPoints ?? h.tokens) : 0), 0);
  const maxPossibleTokens = Math.max(180, habits.reduce((acc, h) => acc + (h.rewardPoints ?? h.tokens), 0));
  const growthPct = Math.min((totalTokens / maxPossibleTokens) * 100, 100);
  const treeState = computeTreeState(growthPct);
  const hasSuggestedHabits = HABIT_IDEAS.some(
    (idea) => !habits.some((habit) => habit.title === idea.title),
  );
  const completedCount = habits.filter((h) => h.completed).length;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader
          title="Habit Tracker"
          right={<HeaderIconButton icon="refresh" accessibilityLabel="Refresh" onPress={() => load(true)} />}
        />

        <LoadingErrorState
          loading={loading}
          error={loadError?.message ?? null}
          offline={loadError?.offline}
          onRetry={() => load()}
          skeleton={<SkeletonList count={6} style={{ marginTop: 16 }} />}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
            }
          >
            {/* This week — gradient summary card */}
            <View className="mx-6 mt-4">
              <LinearGradient
                colors={heroGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: 22, borderCurve: "continuous", padding: 18 }}
                className="flex-row items-center justify-between"
              >
                <View className="flex-1 shrink pr-3">
                  <Text className="text-xs font-black opacity-90" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                    This week
                  </Text>
                  <Text className="mt-1 text-2xl font-black tracking-tight" style={{ color: colors.buttonText, fontFamily: fonts.heading }}>
                    {completedCount} of {habits.length || 0} done
                  </Text>
                  <Text className="mt-1 text-xs font-semibold leading-4" style={{ color: colors.buttonText, opacity: 0.85, fontFamily: fonts.body }}>
                    {treeState.label} · {treeState.motivation}
                  </Text>
                </View>
                <View
                  className="h-14 w-14 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: "rgba(255,255,255,0.22)" }}
                >
                  <Text className="text-base font-black" style={{ color: colors.buttonText, fontFamily: fonts.mono }}>
                    {Math.round(growthPct)}%
                  </Text>
                </View>
              </LinearGradient>
            </View>

            {/* Habits List */}
            <View className="mx-6 mt-6">
              <Text className="mb-3 text-xs font-black tracking-widest uppercase px-1" style={{ color: colors.primary, fontFamily: fonts.heading }}>
                Daily Routines
              </Text>

              <View className="gap-3">
                {habits.length === 0 ? (
                  <View
                    className="items-center rounded-2xl border p-5"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    <Icon set="mci" name="sprout-outline" size={30} color={colors.primary} />
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
                      className="rounded-2xl shadow-sm flex-row items-center p-4"
                      style={{
                        backgroundColor: colors.surface,
                        opacity: isToggling ? 0.7 : 1,
                        ...getShadow(colors, isDark),
                      }}
                    >
                      {/* Icon avatar */}
                      <View
                        className="h-10 w-10 items-center justify-center rounded-full mr-3.5"
                        style={{ backgroundColor: `${resolvedColor}22` }}
                      >
                        <Icon set="ion" name={habit.icon as any} size={18} color={resolvedColor} />
                      </View>

                      {/* minWidth: 0 stops this flex item from growing past
                          the row's available width to fit its text content
                          (the default flexbox min-width:auto), which was
                          pushing long habit titles/streak text out past the
                          card edge instead of wrapping/truncating inside it. */}
                      <View className="flex-1" style={{ minWidth: 0 }}>
                        <Text
                          className="text-sm font-bold tracking-tight"
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          style={{
                            color: habit.completed ? colors.mutedText : colors.foreground,
                            textDecorationLine: habit.completed ? "line-through" : "none",
                            opacity: habit.completed ? 0.6 : 1,
                            fontFamily: fonts.heading,
                          }}
                        >
                          {habit.title}
                        </Text>
                        <View className="flex-row items-center mt-0.5" style={{ gap: 4 }}>
                          <Icon set="ion" name="flame" size={13} color={colors.warning} />
                          <Text
                            className="text-xs font-bold"
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            style={{ color: colors.mutedText, fontFamily: fonts.body, flexShrink: 1 }}
                          >
                            {habit.streak} day streak · +{habit.rewardPoints ?? habit.tokens} pts
                          </Text>
                        </View>
                      </View>

                      {/* Checkmark toggle */}
                      {celebrateId === habit.id ? (
                        <View pointerEvents="none" style={{ position: "absolute", right: 16 + 13 - 40, width: 80, height: 80, top: "50%", marginTop: -40 }}>
                          <CelebrationBurst size={80} />
                        </View>
                      ) : null}
                      <View
                        className="h-[26px] w-[26px] items-center justify-center rounded-full border"
                        style={{
                          backgroundColor: habit.completed ? colors.primary : "transparent",
                          borderColor: habit.completed ? colors.primary : colors.border,
                          borderWidth: 2,
                        }}
                      >
                        {isToggling ? (
                          <ActivityIndicator size="small" color={habit.completed ? colors.buttonText : colors.mutedText} />
                        ) : habit.completed ? (
                          <Icon set="feather" name="check" size={13} color={colors.buttonText} />
                        ) : null}
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
                disabled={!hasSuggestedHabits || adding}
                style={{
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceSoft,
                  opacity: hasSuggestedHabits && !adding ? 1 : 0.62,
                }}
              >
                <View className="flex-row items-center gap-2">
                  <Icon set="feather" name="plus-circle" size={15} color={colors.primary} />
                  <Text className="text-xs font-black tracking-wide" style={{ color: colors.primary, fontFamily: fonts.body }}>
                    {hasSuggestedHabits ? "Add Suggested Habit" : "All Suggestions Added"}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </LoadingErrorState>
      </SafeAreaView>
    </>
  );
}
