import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import { useTheme } from "../../components/theme";

// --- BACKEND SPECIFIC API DATA SCHEMAS ---
interface Habit {
  id: string;
  title: string;
  icon: string;
  color: string;
  completed: boolean;
  tokens: number;
  streak: number;
}

type BrowserStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const HABITS_STORAGE_KEY = "period-buddy.habits";

const defaultHabits: Habit[] = [
  {
    id: "h_1",
    title: "Log Period Tracking Data",
    icon: "calendar-outline",
    color: "#d946a6",
    completed: false,
    tokens: 50,
    streak: 12,
  },
  {
    id: "h_2",
    title: "Drink 8 Glasses of Water",
    icon: "water-outline",
    color: "#06b6d4",
    completed: false,
    tokens: 30,
    streak: 8,
  },
  {
    id: "h_3",
    title: "Exercise or Sync Movement",
    icon: "fitness-outline",
    color: "#22c55e",
    completed: false,
    tokens: 60,
    streak: 5,
  },
  {
    id: "h_4",
    title: "Mindfulness Meditation",
    icon: "heart-outline",
    color: "#ec4899",
    completed: false,
    tokens: 40,
    streak: 3,
  },
];

const habitIdeas = [
  {
    title: "Sleep 8 Hours Comfortably",
    icon: "moon-outline",
    color: "#6366f1",
    tokens: 45,
  },
  {
    title: "Consume Iron-Rich Nutritional Foods",
    icon: "nutrition-outline",
    color: "#f97316",
    tokens: 35,
  },
  {
    title: "Light Pelvic Stretch for 10 Mins",
    icon: "body-outline",
    color: "#14b8a6",
    tokens: 25,
  },
];

export default function Habits() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { earnTokens } = useAppState();
  const [habits, setHabits] = useState<Habit[]>(readStoredHabits);

  useEffect(() => {
    writeStoredHabits(habits);
  }, [habits]);

  const toggleHabit = (id: string) => {
    const found = habits.find((habit) => habit.id === id);

    if (found) {
      const willComplete = !found.completed;
      if (willComplete) {
        earnTokens(found.tokens);
      }
    }

    setHabits((current) =>
      current.map((habit) =>
        habit.id === id ? { ...habit, completed: !habit.completed } : habit,
      ),
    );
  };

  const addHabit = () => {
    const nextIdea = habitIdeas.find(
      (idea) => !habits.some((habit) => habit.title === idea.title),
    );

    if (!nextIdea) {
      Alert.alert(
        "Ecosystem Slots Full",
        "You have already integrated all available structural habits.",
      );
      return;
    }

    setHabits((current) => [
      ...current,
      {
        ...nextIdea,
        completed: false,
        id: String(Date.now()),
        streak: 0,
      },
    ]);
  };

  const totalTokens = habits.reduce(
    (acc, h) => acc + (h.completed ? h.tokens : 0),
    0,
  );

  // --- DYNAMIC LIFESTYLE TREE GROWTH ENGINE ---
  const maxPossibleTokens = 180;
  const growthPercentage = Math.min(
    (totalTokens / maxPossibleTokens) * 100,
    100,
  );

  function computeTreeStageLabel(percentage: number): {
    label: string;
    icon: string;
    motivation: string;
  } {
    if (percentage === 0) {
      return {
        label: "Dormant Seed",
        icon: "seed-outline",
        motivation: "Complete today's habits to nurture your cycle tree.",
      };
    }
    if (percentage <= 35) {
      return {
        label: "Sprouting Seedling 🌱",
        icon: "sprout-outline",
        motivation:
          "Clean hydration and basic routines are giving roots to your wellness tree.",
      };
    }
    if (percentage <= 75) {
      return {
        label: "Active Budding Branch 🌿",
        icon: "tree-outline",
        motivation:
          "Amazing energy! Your hormone cycles are balancing beautifully today.",
      };
    }
    return {
      label: "Blooming Blossom 🌸",
      icon: "flower-tulip-outline",
      motivation:
        "Peak wellness tree growth attained! Your dynamic system is fully nourished.",
    };
  }

  const currentTreeState = computeTreeStageLabel(growthPercentage);

  const softTints = {
    pink: isDark ? "#3b1a2d" : "#fff0f6",
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
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
        >
          {/* Header Action Row */}
          <View className="flex-row items-center gap-2 px-6 pt-6">
            <TouchableOpacity
              onPress={() => router.back()}
              activeOpacity={0.7}
              className="p-2.5 -ml-2 rounded-full border"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Feather name="arrow-left" size={18} color={colors.foreground} />
            </TouchableOpacity>
            <Text
              className="flex-1 text-2xl font-black tracking-tight ml-2"
              style={{ color: colors.foreground }}
            >
              Habit Tracker
            </Text>
          </View>

          {/* DYNAMIC INTERACTIVE CYCLE TREE GROW HUB PANEL */}
          <View className="mx-6 mt-6">
            <View
              className="rounded-3xl border p-5 shadow-2xl relative overflow-hidden"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              {/* Subtle ambient pink glow tracking background element overlay */}
              <View
                className="absolute -right-6 -top-6 w-20 h-20 rounded-full opacity-35"
                style={{ backgroundColor: softTints.pink }}
              />

              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-2">
                  <Text className="text-[10px] font-black tracking-widest uppercase text-pink-500">
                    Current Cycle Tree
                  </Text>
                  <Text
                    className="mt-1 text-base font-black tracking-tight"
                    style={{ color: colors.foreground }}
                  >
                    {currentTreeState.label}
                  </Text>
                  <Text
                    className="mt-1 text-[11px] font-medium leading-4"
                    style={{ color: colors.mutedText }}
                  >
                    {currentTreeState.motivation}
                  </Text>
                </View>

                {/* Animated Dynamic Graphic Icon Shield Badge */}
                <View
                  className="h-20 w-20 items-center justify-center rounded-2xl border border-dashed border-pink-300"
                  style={{ backgroundColor: softTints.pink }}
                >
                  <MaterialCommunityIcons
                    name={currentTreeState.icon as any}
                    size={36}
                    color={colors.primary}
                  />
                </View>
              </View>

              {/* Progress Core Bar Systems */}
              <View className="mt-5">
                <View className="flex-row justify-between items-center mb-1.5 px-0.5">
                  <Text
                    className="text-[10px] font-bold"
                    style={{ color: colors.mutedText }}
                  >
                    Score: {totalTokens} / {maxPossibleTokens} Tokens
                  </Text>
                  <Text className="text-[10px] font-black text-pink-500">
                    {Math.round(growthPercentage)}% Growth
                  </Text>
                </View>

                <View className="h-2.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${growthPercentage}%`,
                      backgroundColor: colors.primary,
                    }}
                  />
                </View>
              </View>
            </View>
          </View>

          {/* HABITS ACCORDION CORE LIST SYSTEM */}
          <View className="mx-6 mt-8">
            <Text
              className="mb-4 text-xs font-black tracking-widest uppercase px-1"
              style={{ color: colors.primary }}
            >
              Daily Routines Checklist
            </Text>

            <View className="gap-3.5">
              {habits.map((habit) => (
                <TouchableOpacity
                  key={habit.id}
                  activeOpacity={0.8}
                  onPress={() => toggleHabit(habit.id)}
                  className="rounded-2xl border shadow-3xs overflow-hidden"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: habit.completed
                      ? `${habit.color}30`
                      : colors.border,
                  }}
                >
                  <View className="flex-row items-center justify-between p-4.5">
                    <View className="flex-row items-center flex-1 gap-4">
                      {/* Check Sphere Indicator Boxes */}
                      <View
                        className="h-10 w-10 items-center justify-center rounded-xl border"
                        style={{
                          backgroundColor: habit.completed
                            ? habit.color
                            : "transparent",
                          borderColor: habit.completed
                            ? habit.color
                            : colors.border,
                        }}
                      >
                        {habit.completed ? (
                          <Feather name="check" size={16} color="white" />
                        ) : (
                          <Ionicons
                            name={habit.icon as any}
                            size={18}
                            color={colors.mutedText}
                          />
                        )}
                      </View>

                      <View className="flex-1">
                        <Text
                          className="text-sm font-bold tracking-tight"
                          style={{
                            color: habit.completed
                              ? colors.mutedText
                              : colors.foreground,
                            textDecorationLine: habit.completed
                              ? "line-through"
                              : "none",
                            opacity: habit.completed ? 0.6 : 1,
                          }}
                        >
                          {habit.title}
                        </Text>
                        <View className="flex-row items-center gap-1 mt-0.5">
                          <MaterialCommunityIcons
                            name="fire"
                            size={12}
                            color="#f97316"
                          />
                          <Text
                            className="text-[10px] font-bold"
                            style={{ color: colors.mutedText }}
                          >
                            {habit.streak} day streak
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Reward Multi-Multiplier Tokens Value Tags */}
                    <View
                      className="rounded-lg px-2.5 py-1"
                      style={{
                        backgroundColor: habit.completed
                          ? colors.border
                          : `${habit.color}15`,
                      }}
                    >
                      <Text
                        className="text-[10px] font-black"
                        style={{
                          color: habit.completed
                            ? colors.mutedText
                            : habit.color,
                        }}
                      >
                        +{habit.tokens} pts
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* CURATED ADD CUSTOM HABIT IDEA ACTION COMPONENT */}
            <TouchableOpacity
              activeOpacity={0.7}
              className="mt-6 rounded-2xl border border-dashed py-4 items-center justify-center bg-neutral-50/40 dark:bg-neutral-900/10"
              onPress={addHabit}
              style={{ borderColor: colors.border }}
            >
              <View className="flex-row items-center gap-2">
                <Feather name="plus-circle" size={15} color={colors.primary} />
                <Text
                  className="text-xs font-black tracking-wide"
                  style={{ color: colors.primary }}
                >
                  Expand Habit Spectrum
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

// --- LOCAL PERSISTENCE STORAGE LAYER HANDLERS ---
function getStorage() {
  const globalWithStorage = globalThis as typeof globalThis & {
    localStorage?: BrowserStorage;
  };
  return globalWithStorage.localStorage;
}

function readStoredHabits() {
  try {
    const rawHabits = getStorage()?.getItem(HABITS_STORAGE_KEY);
    if (!rawHabits) return defaultHabits;

    const habits = JSON.parse(rawHabits) as Habit[];
    return Array.isArray(habits) && habits.length > 0 ? habits : defaultHabits;
  } catch {
    return defaultHabits;
  }
}

function writeStoredHabits(habits: Habit[]) {
  try {
    getStorage()?.setItem(HABITS_STORAGE_KEY, JSON.stringify(habits));
  } catch {}
}
