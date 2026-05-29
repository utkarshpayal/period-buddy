import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../components/theme";

interface Question {
  id: string;
  question: string;
  answer: string;
  category: string;
  helpful: number;
}

export default function QA() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([
    {
      id: "1",
      question: "Is it normal to have irregular periods?",
      answer:
        "Yes, irregular periods are common, especially in teens and during stress. However, persistent irregularity should be discussed with a doctor.",
      category: "General",
      helpful: 145,
    },
    {
      id: "2",
      question: "Can I get pregnant during my period?",
      answer:
        "While less likely, it is possible depending on your cycle. Tracking helps predict your fertile window accurately.",
      category: "Pregnancy",
      helpful: 234,
    },
    {
      id: "3",
      question: "What should I do for period cramps?",
      answer:
        "Try heat therapy, light exercise, stay hydrated, and maintain a healthy diet. Over-the-counter pain relief can help too.",
      category: "Symptoms",
      helpful: 312,
    },
  ]);

  const filteredQuestions = questions.filter(
    (q) =>
      q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.answer.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  function askQuestion() {
    const question = searchQuery.trim();

    if (!question) {
      Alert.alert("Add a question", "Type your question in the search box.");
      return;
    }

    const id = String(Date.now());

    setQuestions((current) => [
      {
        id,
        question,
        answer:
          "Thanks for asking. A verified answer will appear here after review.",
        category: "Community",
        helpful: 0,
      },
      ...current,
    ]);
    setExpandedId(id);
    setSearchQuery("");
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
              Q&A
            </Text>
          </View>

          <View className="mx-6 mt-6">
            {/* Search Bar */}
            <View
              className="flex-row items-center rounded-xl border-2 px-4"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="search" size={20} color={colors.mutedText} />
              <TextInput
                placeholder="Search questions..."
                placeholderTextColor={colors.mutedText}
                value={searchQuery}
                onChangeText={setSearchQuery}
                className="ml-3 flex-1 py-4 text-base"
                style={{ color: colors.foreground }}
              />
            </View>

            {/* Questions List */}
            <View className="mt-6 gap-3">
              {filteredQuestions.map((q) => (
                <TouchableOpacity
                  key={q.id}
                  onPress={() =>
                    setExpandedId(expandedId === q.id ? null : q.id)
                  }
                  activeOpacity={0.85}
                  className="rounded-xl border-2 p-4"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  }}
                >
                  <View className="flex-row items-start justify-between">
                    <Text
                      className="flex-1 font-semibold"
                      style={{ color: colors.foreground }}
                    >
                      {q.question}
                    </Text>
                    <Ionicons
                      name={expandedId === q.id ? "chevron-up" : "chevron-down"}
                      size={20}
                      color={colors.mutedText}
                    />
                  </View>

                  {expandedId === q.id && (
                    <View
                      className="mt-4 border-t pt-4"
                      style={{ borderTopColor: colors.border }}
                    >
                      <Text
                        className="leading-6"
                        style={{ color: colors.text }}
                      >
                        {q.answer}
                      </Text>
                      <View className="mt-4 flex-row items-center justify-between">
                        <View className="flex-row items-center gap-2">
                          <Ionicons
                            name="thumbs-up-outline"
                            size={16}
                            color={colors.primary}
                          />
                          <Text
                            className="text-xs"
                            style={{ color: colors.mutedText }}
                          >
                            {q.helpful} found helpful
                          </Text>
                        </View>
                        <Text
                          className="text-xs font-semibold"
                          style={{
                            color: colors.primary,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 4,
                            backgroundColor: colors.primaryLight,
                          }}
                        >
                          {q.category}
                        </Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Ask Question Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Ask a question"
              className="mt-8 rounded-xl"
              onPress={askQuestion}
              style={{
                backgroundColor: colors.primary,
                paddingVertical: 14,
                paddingHorizontal: 16,
              }}
            >
              <Text
                className="text-center font-bold"
                style={{ color: colors.buttonText }}
              >
                Ask Your Question →
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
