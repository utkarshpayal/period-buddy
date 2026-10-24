import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StatusBar, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { alert } from "../../lib/alert";
import { useTheme } from "../../components/theme";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { SkeletonList } from "../../components/Skeleton";
import { useDataRefresh } from "../../hooks/useDataRefresh";
import {
  getFriendlyErrorMessage,
  habitsApi,
  isNetworkError,
  type Habit,
  type HabitSuggestion,
  type HabitSuggestions,
} from "../../lib/api";
import { applyTick, habitProgress } from "../../lib/habits";
import { showErrorToast, showToast } from "../../lib/toast";
import { HeaderIconButton, ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { haptics } from "../../lib/haptics";
import { useTodayKey } from "../../hooks/useTodayKey";
import { EmptyState } from "../../components/EmptyState";
import { HabitsHero } from "../../components/habits/HabitsHero";
import { HabitCard } from "../../components/habits/HabitCard";
import { LogFirstCard, SuggestionCard } from "../../components/habits/SuggestionCard";
import { suggestionColor } from "../../components/habits/habitColor";

export default function Habits() {
  useSecureScreen("habits");
  const { colors, isDark } = useTheme();
  const router = useRouter();

  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // The habit just ticked off, for a one-shot burst on its check.
  const [celebrateId, setCelebrateId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; offline: boolean } | null>(null);
  // Refs, so a fast double tap can't add a habit twice or send two toggles.
  const addingRef = useRef(false);
  const togglingRef = useRef(new Set<string>());
  const loadedRef = useRef(false);
  const todayKey = useTodayKey();
  // null until the first answer; the day's first one can take a few seconds (AI).
  const [suggestions, setSuggestions] = useState<HabitSuggestion[] | null>(null);
  const [suggestionSource, setSuggestionSource] = useState<HabitSuggestions["source"]>("rules");
  // Nothing logged lately: habits only come from logs, so show "Log today".
  const [needsLogs, setNeedsLogs] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  // Same set all day (stored by the server); a failure just hides the section.
  const loadSuggestions = useCallback(async () => {
    try {
      const result = await habitsApi.getSuggestions();
      setSuggestions(result.suggestions);
      setSuggestionSource(result.source);
      setNeedsLogs(Boolean(result.needsLogs));
    } catch {
      setSuggestions((current) => current ?? []);
    }
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
        // Also brings back picks that failed to load earlier.
        loadSuggestions();
      } else setLoading(true);
      const data = await habitsApi.getHabits();
      setHabits(data);
      loadedRef.current = true;
      setLoadError(null);
    } catch (err) {
      // With nothing loaded yet, show an error with Retry instead of an empty
      // list; otherwise keep the list on screen.
      if (!loadedRef.current) setLoadError({ message: getFriendlyErrorMessage(err), offline: isNetworkError(err) });
      else if (isRefresh) showErrorToast(getFriendlyErrorMessage(err), "Couldn't refresh habits");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadSuggestions]);

  useEffect(() => {
    load();
  }, [load]);

  // Loaded apart from the list so a slow first-of-the-day pick never holds it
  // up; again when the local day changes.
  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions, todayKey]);

  // Back from "Log today": the first log makes the day's picks. Once picks
  // exist they're fixed for the day, so later logs don't need a refetch.
  useDataRefresh(["cycle"], () => {
    if (needsLogs) loadSuggestions();
  });

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

  // Ticks show at once; the server's answer then sets the real streak, and a
  // failure puts the habit back as it was.
  const toggleHabit = async (habit: Habit) => {
    if (togglingRef.current.has(habit.id)) return;
    togglingRef.current.add(habit.id);
    const done = !habit.completed;
    setHabits((prev) => prev.map((h) => (h.id === habit.id ? applyTick(h, done) : h)));
    if (done) {
      haptics.success();
      setCelebrateId(habit.id);
      setTimeout(() => setCelebrateId((current) => (current === habit.id ? null : current)), 900);
    } else haptics.tap();
    try {
      const result = await habitsApi.toggleHabit(habit.id);
      setHabits((prev) =>
        prev.map((h) =>
          h.id === habit.id ? { ...applyTick(h, result.completed), streak: result.streak } : h,
        ),
      );
    } catch (err) {
      haptics.error();
      setHabits((prev) => prev.map((h) => (h.id === habit.id ? habit : h)));
      showErrorToast(getFriendlyErrorMessage(err), "Couldn't update habit");
    } finally {
      togglingRef.current.delete(habit.id);
    }
  };

  // The server leaves out habits already added; this also hides one the
  // moment it's added here.
  const shownSuggestions = useMemo(() => {
    const taken = new Set(habits.map((h) => h.title.trim().toLowerCase()));
    return (suggestions ?? []).filter((s) => !taken.has(s.title.trim().toLowerCase()));
  }, [suggestions, habits]);

  const addHabit = async (idea: HabitSuggestion) => {
    if (addingRef.current) return;
    addingRef.current = true;
    setAddingKey(idea.key);
    try {
      const newHabit = await habitsApi.createHabit({
        title: idea.title,
        icon: idea.icon,
        color: suggestionColor(idea),
        rewardPoints: idea.rewardPoints,
        reason: idea.reason,
        suggestionKey: idea.key,
        suggestionSource,
      });
      haptics.success();
      setHabits((prev) => [...prev, newHabit]);
      // The day's spare picks keep the list at 10.
      loadSuggestions();
      showToast("Added. Tick it off once you've done it today.", { variant: "success" });
    } catch (err) {
      haptics.error();
      showErrorToast(getFriendlyErrorMessage(err), "Couldn't add habit");
    } finally {
      addingRef.current = false;
      setAddingKey(null);
    }
  };

  // "Not for me": gone at once; the server keeps it out for two weeks.
  const dismissSuggestion = (idea: HabitSuggestion) => {
    haptics.tap();
    setSuggestions((prev) => prev?.filter((s) => s.key !== idea.key) ?? prev);
    habitsApi
      .dismissSuggestion(idea.key)
      // The day's spare picks keep the list at 10.
      .then(() => loadSuggestions())
      .catch(() => {
      // It would come back on the next open, so put it back now and say so.
      setSuggestions((prev) => (prev && !prev.some((s) => s.key === idea.key) ? [...prev, idea] : prev));
      showErrorToast("Couldn't hide that suggestion. Try again.");
      });
  };

  const removeHabit = (habit: Habit) => {
    haptics.select();
    alert(
      `Remove "${habit.title}"?`,
      habit.streak > 0
        ? `Your ${habit.streak}-day streak will end. Points you've earned stay.`
        : "Points you've earned stay. You can add it again later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const index = habits.findIndex((h) => h.id === habit.id);
            setHabits((prev) => prev.filter((h) => h.id !== habit.id));
            try {
              await habitsApi.deleteHabit(habit.id);
            } catch (err) {
              haptics.error();
              setHabits((prev) => {
                if (prev.some((h) => h.id === habit.id)) return prev;
                const next = [...prev];
                next.splice(Math.max(0, Math.min(index, next.length)), 0, habit);
                return next;
              });
              showErrorToast(getFriendlyErrorMessage(err), "Couldn't remove habit");
            }
          },
        },
      ],
    );
  };

  const { done, total } = habitProgress(habits);

  const picksSection =
    suggestions !== null && needsLogs ? (
      <View className="mx-6 mt-8">
        <LogFirstCard onLog={() => router.push("/(app)/tracker?log=today" as never)} />
      </View>
    ) : suggestions === null || shownSuggestions.length > 0 ? (
      <View className="mx-6 mt-8">
        <SectionHeader
          title="Picked for you"
          subtitle={
            suggestions === null
              ? "Nura is reading your recent logs…"
              : suggestionSource === "ai"
                ? "By Nura, from your logs and cycle"
                : "From your recent logs and cycle"
          }
        />
        {suggestions === null ? (
          <SkeletonList count={2} />
        ) : (
          <View style={{ gap: 12 }}>
            {shownSuggestions.map((idea, i) => (
              <SuggestionCard
                key={idea.key}
                idea={idea}
                index={i}
                adding={addingKey === idea.key}
                disabled={addingKey !== null && addingKey !== idea.key}
                onAdd={addHabit}
                onDismiss={dismissSuggestion}
              />
            ))}
          </View>
        )}
      </View>
    ) : null;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader
          title="Habits"
          right={<HeaderIconButton icon="refresh" accessibilityLabel="Refresh" onPress={() => load(true)} />}
        />

        <LoadingErrorState
          loading={loading}
          error={loadError?.message ?? null}
          offline={loadError?.offline}
          onRetry={() => load()}
          skeleton={<SkeletonList count={5} style={{ marginTop: 16 }} />}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
            }
          >
            <View className="mx-6 mt-4">
              <HabitsHero
                done={done}
                total={total}
                todayKey={todayKey}
                onOpenForest={() => router.push("/(app)/forest" as never)}
              />
            </View>

            {/* A new person starts from the picks, so they come first until a habit is added. */}
            {total === 0 ? picksSection : null}

            {total > 0 ? (
              <View className="mx-6 mt-8">
                <SectionHeader title="Your habits" subtitle="Tap to tick off · press and hold to remove" />
                <View style={{ gap: 12 }}>
                  {habits.map((habit, i) => (
                    <HabitCard
                      key={habit.id}
                      habit={habit}
                      index={i}
                      celebrating={celebrateId === habit.id}
                      onToggle={toggleHabit}
                      onRemove={removeHabit}
                    />
                  ))}
                </View>
              </View>
            ) : suggestions !== null && !needsLogs && shownSuggestions.length === 0 ? (
              <EmptyState
                compact
                icon="sprout-outline"
                title="No habits yet"
                message="New picks from your logs arrive tomorrow."
              />
            ) : null}

            {total > 0 ? picksSection : null}
          </ScrollView>
        </LoadingErrorState>
      </SafeAreaView>
    </>
  );
}
