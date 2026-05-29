import { Ionicons } from "@expo/vector-icons";
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
    id: "1",
    title: "Log Period Tracking",
    icon: "calendar",
    color: "#d946a6",
    completed: true,
    tokens: 50,
    streak: 12,
  },
  {
    id: "2",
    title: "Drink 8 Glasses Water",
    icon: "water",
    color: "#06b6d4",
    completed: false,
    tokens: 30,
    streak: 8,
  },
  {
    id: "3",
    title: "Exercise 30 Minutes",
    icon: "fitness",
    color: "#22c55e",
    completed: true,
    tokens: 60,
    streak: 5,
  },
  {
    id: "4",
    title: "Meditation Session",
    icon: "heart",
    color: "#ec4899",
    completed: false,
    tokens: 40,
    streak: 3,
  },
];

const habitIdeas = [
  {
    title: "Sleep 8 Hours",
    icon: "moon",
    color: "#6366f1",
    tokens: 45,
  },
  {
    title: "Eat Iron-Rich Food",
    icon: "nutrition",
    color: "#f97316",
    tokens: 35,
  },
  {
    title: "Stretch for 10 Minutes",
    icon: "body",
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
      Alert.alert("Habit list is full", "You have added all starter habits.");
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
              Build Habits
            </Text>
          </View>

          {/* Daily Goal */}
          <View
            className="mx-6 mt-6 rounded-2xl border-2 p-6"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.primary,
            }}
          >
            <View className="flex-row items-center justify-between">
              <View>
                <Text
                  className="text-sm font-semibold"
                  style={{ color: colors.mutedText }}
                >
                  {"Today's Tokens"}
                </Text>
                <Text
                  className="mt-2 text-3xl font-bold"
                  style={{ color: colors.primary }}
                >
                  {totalTokens}
                </Text>
                <Text
                  className="mt-1 text-xs"
                  style={{ color: colors.mutedText }}
                >
                  Out of 180 possible
                </Text>
              </View>
              <View
                className="h-24 w-24 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.primaryLight }}
              >
                <Text className="text-3xl">🏆</Text>
              </View>
            </View>
            <View
              className="mt-4 h-2 overflow-hidden rounded-full"
              style={{ backgroundColor: colors.border }}
            >
              <View
                className="h-full"
                style={{
                  width: `${(totalTokens / 180) * 100}%`,
                  backgroundColor: colors.primary,
                }}
              />
            </View>
          </View>

          {/* Habits List */}
          <View className="mx-6 mt-6">
            <Text
              className="mb-4 text-base font-bold"
              style={{ color: colors.foreground }}
            >
              Daily Habits
            </Text>

            <View className="gap-3">
              {habits.map((habit) => (
                <View
                  key={habit.id}
                  className="overflow-hidden rounded-xl border-2"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: habit.completed ? habit.color : colors.border,
                  }}
                >
                  <View className="flex-row items-center justify-between p-4">
                    <TouchableOpacity
                      onPress={() => toggleHabit(habit.id)}
                      className="flex-row items-center flex-1 gap-4"
                    >
                      <View
                        className="h-12 w-12 items-center justify-center rounded-full border-2"
                        style={{
                          backgroundColor: habit.completed
                            ? habit.color
                            : "transparent",
                          borderColor: habit.color,
                        }}
                      >
                        {habit.completed && (
                          <Ionicons name="checkmark" size={24} color="white" />
                        )}
                        {!habit.completed && (
                          <Ionicons
                            name={habit.icon as any}
                            size={24}
                            color={habit.color}
                          />
                        )}
                      </View>

                      <View className="flex-1">
                        <Text
                          className="font-semibold"
                          style={{
                            color: colors.foreground,
                            textDecorationLine: habit.completed
                              ? "line-through"
                              : "none",
                          }}
                        >
                          {habit.title}
                        </Text>
                        <Text
                          className="mt-1 text-xs"
                          style={{ color: colors.mutedText }}
                        >
                          🔥 {habit.streak} day streak
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <View
                      className="rounded-lg px-3 py-1"
                      style={{ backgroundColor: habit.color }}
                    >
                      <Text className="text-xs font-bold text-white">
                        +{habit.tokens}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Add New Habit */}
            <TouchableOpacity
              activeOpacity={0.85}
              className="mt-6 rounded-xl border-2 border-dashed py-4"
              onPress={addHabit}
              style={{
                borderColor: colors.border,
              }}
            >
              <View className="flex-row items-center justify-center gap-2">
                <Ionicons name="add-circle" size={20} color={colors.primary} />
                <Text
                  className="font-semibold"
                  style={{ color: colors.primary }}
                >
                  Add New Habit
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function getStorage() {
  const globalWithStorage = globalThis as typeof globalThis & {
    localStorage?: BrowserStorage;
  };

  return globalWithStorage.localStorage;
}

function readStoredHabits() {
  try {
    const rawHabits = getStorage()?.getItem(HABITS_STORAGE_KEY);

    if (!rawHabits) {
      return defaultHabits;
    }

    const habits = JSON.parse(rawHabits) as Habit[];

    return Array.isArray(habits) && habits.length > 0 ? habits : defaultHabits;
  } catch {
    return defaultHabits;
  }
}

function writeStoredHabits(habits: Habit[]) {
  try {
    getStorage()?.setItem(HABITS_STORAGE_KEY, JSON.stringify(habits));
  } catch {
    // Habit changes still work in memory if storage is blocked.
  }
}
