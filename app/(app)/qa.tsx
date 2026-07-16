import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAppState } from "../../components/AppState";
import { useTheme } from "../../components/theme";
import { getActionGradient, getSoftTints } from "../../components/ui-tokens";
import { questionAnswerApi } from "../../lib/api";

// --- TELEHEALTH CONVERSATION MODEL CONTRACTS ---
interface ChatMessage {
  disclaimer?: string;
  id: string;
  sender: "user" | "companion";
  source?: string;
  suggestedQuestions?: string[];
  text: string;
  time: string;
}

const defaultSuggestedQuestions = [
  "Is brown period blood normal?",
  "Why are cramps worse this month?",
  "How should I clean during my period?",
];

const defaultCompanionDisclaimer =
  "General guidance only. For severe, unusual, or urgent symptoms, contact a trusted clinician.";

export default function QA() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const { earnTokens } = useAppState();
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const actionGradient = getActionGradient(colors) as [string, string];
  const softTints = getSoftTints(colors);

  // Functional Input and Loading States
  const [typedQuestion, setTypedQuestion] = useState("");
  const [isCompanionTyping, setIsCompanionTyping] = useState(false);

  // Human-like conversational streams database initialization
  const [chatLog, setChatLog] = useState<ChatMessage[]>([
    {
      disclaimer: defaultCompanionDisclaimer,
      id: "init_1",
      sender: "companion",
      suggestedQuestions: defaultSuggestedQuestions,
      text: "Hi, I am Nura Companion. Ask anything about periods, discharge, cramps, hygiene, intimacy, partner questions, or body changes. I can share general education, and I will point you toward care when symptoms sound urgent.",
      time: "9:41 AM",
    },
  ]);

  // Knowledge base containing strict fallback patterns mapping human conversational styles
  const trainedLocalKnowledgeBase = [
    {
      keywords: ["brown", "dark", "black", "blood", "bleed"],
      response:
        "Dark brown blood is often normal at the start or end of a period. It is usually older blood leaving the uterus more slowly. If it comes with severe pain, bad odor, fever, or unusual discharge, it is worth checking with a clinician.",
    },
    {
      keywords: ["cup", "hymen", "break", "virgin"],
      response:
        "A menstrual cup or tampon can stretch the hymen, but virginity is not a medical measurement. Use the smallest comfortable size, go slowly, and stop if you feel pain.",
    },
    {
      keywords: ["poop", "motions", "stomach", "loose"],
      response:
        "Changes in bowel movements around periods are common. Prostaglandins help the uterus contract and can also affect the bowel, which may cause cramps, loose stools, or more frequent bathroom trips.",
    },
    {
      keywords: ["sex", "intimacy", "relation", "intercourse", "safe"],
      response:
        "Sex during a period can be safe if everyone involved is comfortable and consenting. Use protection because pregnancy and infections are still possible, and pause if there is pain or discomfort.",
    },
    {
      keywords: ["wash", "soap", "clean", "vagina", "smell", "scent"],
      response:
        "Avoid scented washes, douching, or internal cleaning. The vagina is self-cleaning, and harsh products can disrupt pH. Warm water on the external vulva is usually enough.",
    },
    {
      keywords: ["boy", "boyfriend", "pms", "partner", "man"],
      response:
        "PMS support works best when it is respectful: validate feelings, offer practical help, and avoid teasing or blaming mood changes on a period. A heating pad, rest, water, and patience can help a lot.",
    },
    {
      keywords: [
        "soaking",
        "faint",
        "dizzy",
        "fever",
        "severe pain",
        "pregnant",
        "suicide",
        "self harm",
      ],
      response:
        "This could need urgent help. If you are soaking pads quickly, feeling faint, have fever with pelvic pain, severe one-sided pain, bleeding during pregnancy, or thoughts of self-harm, contact emergency care or a trusted local clinician now.",
      source: "urgent_safety",
    },
  ];

  function formatCurrentTime(): string {
    const now = new Date();
    return now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function handleTriggerConversation() {
    const submittedQuestion = typedQuestion.trim();
    const cleanQuery = submittedQuestion.toLowerCase();
    if (!cleanQuery || isCompanionTyping) return;

    const userMessagePayload: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      sender: "user",
      text: submittedQuestion,
      time: formatCurrentTime(),
    };

    setChatLog((prev) => [...prev, userMessagePayload]);
    setTypedQuestion("");
    setIsCompanionTyping(true);
    earnTokens(2); // Instantly log token metrics for interaction

    // Auto scroll down matching fluid messaging stream threads
    setTimeout(
      () => scrollViewRef.current?.scrollToEnd({ animated: true }),
      100,
    );

    // AI Companion reply emulation matching internal knowledge tokens mapping arrays
    setTimeout(async () => {
      let foundMatchedResponse = "";
      let companionDisclaimer = defaultCompanionDisclaimer;
      let companionSource = "local_fallback";
      let suggestedQuestions = defaultSuggestedQuestions;

      try {
        const result = await questionAnswerApi.ask(submittedQuestion);
        foundMatchedResponse = result.answer;
        companionDisclaimer = result.disclaimer ?? companionDisclaimer;
        companionSource = result.source;
        suggestedQuestions = result.suggestedQuestions?.length
          ? result.suggestedQuestions
          : suggestedQuestions;
      } catch (askError) {
        try {
          const result = await questionAnswerApi.getQuestions({
            search: cleanQuery,
            limit: 1,
          });
          const matchedQuestion = result.data?.[0] ?? result.questions?.[0];
          if (matchedQuestion?.answer) {
            foundMatchedResponse = matchedQuestion.answer;
            companionSource = "knowledge_base";
          }
        } catch (lookupError) {
          console.log(
            "Backend query failed, falling back to local knowledge base:",
            askError,
            lookupError,
          );
        }
      }

      if (!foundMatchedResponse) {
        // Internal keyword checking loop fallback
        foundMatchedResponse =
          "That is a valid thing to wonder about. Try keywords like 'brown blood', 'period poop', 'tampon', 'cup', 'hygiene', or 'intimacy' so I can give a more specific answer.";

        for (const entry of trainedLocalKnowledgeBase) {
          if (entry.keywords.some((keyword) => cleanQuery.includes(keyword))) {
            foundMatchedResponse = entry.response;
            companionSource = entry.source ?? companionSource;
            break;
          }
        }
      }

      const companionReplyPayload: ChatMessage = {
        disclaimer: companionDisclaimer,
        id: `msg_c_${Date.now()}`,
        sender: "companion",
        source: companionSource,
        suggestedQuestions,
        text: foundMatchedResponse,
        time: formatCurrentTime(),
      };

      setChatLog((prev) => [...prev, companionReplyPayload]);
      setIsCompanionTyping(false);

      setTimeout(
        () => scrollViewRef.current?.scrollToEnd({ animated: true }),
        100,
      );
    }, 1500); // Organic typing interval lag
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
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
        {/* Custom Companion Chat Header Section */}
        <View
          className="px-6 py-4 border-b flex-row justify-between items-center"
          style={{
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              onPress={() => router.back()}
              activeOpacity={0.7}
              className="p-2 -ml-2 rounded-full"
            >
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>

            {/* Robot/Companion Identity Sphere Indicator */}
            <View className="relative">
              <View
                className="w-10 h-10 rounded-full items-center justify-center border"
                style={{
                  backgroundColor: softTints.pink,
                  borderColor: colors.border,
                }}
              >
                <Text className="text-xl">✨</Text>
              </View>
              <View
                className="absolute bottom-0 right-0 w-3 h-3 rounded-full"
                style={{ backgroundColor: colors.success, borderWidth: 2, borderColor: colors.surface }}
              />
            </View>

            <View>
              <Text
                className="text-sm font-black tracking-tight"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                Nura Companion
              </Text>
              <Text className="text-[10px] font-bold tracking-wider uppercase mt-0.5" style={{ color: colors.success, fontFamily: fonts.body }}>
                Private guidance online
              </Text>
            </View>
          </View>

          <MaterialCommunityIcons
            name="comment-text-multiple-outline"
            size={18}
            color={colors.primary}
          />
        </View>

        {/* SCROLLABLE LIVE CHAT MESSAGE STREAM WINDOW CONTAINER */}
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          className="flex-1 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: 72 }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            scrollViewRef.current?.scrollToEnd({ animated: true })
          }
        >
          <View className="gap-4">
            {chatLog.map((message) => {
              const isCompanion = message.sender === "companion";
              const isUrgent = message.source === "urgent_safety";
              return (
                <View key={message.id}>
                  {isCompanion ? (
                    <View
                      className="max-w-[85%] p-4 rounded-2xl self-start rounded-tl-none border"
                      style={{
                        backgroundColor: isUrgent ? colors.dangerLight : colors.surface,
                        borderColor: isUrgent ? colors.danger : colors.border,
                      }}
                    >
                      {isUrgent && (
                        <View className="mb-2 flex-row items-center gap-1.5">
                          <Feather
                            name="alert-triangle"
                            size={13}
                            color={colors.danger}
                          />
                          <Text
                            className="text-[10px] font-black uppercase"
                            style={{ color: colors.danger, fontFamily: fonts.heading }}
                          >
                            Urgent care guidance
                          </Text>
                        </View>
                      )}
                      <Text
                        className="text-xs font-medium leading-5"
                        style={{
                          color: colors.foreground,
                          fontFamily: fonts.body,
                        }}
                      >
                        {message.text}
                      </Text>
                      {message.disclaimer && (
                        <Text
                          className="text-[10px] font-semibold leading-4 mt-3"
                          style={{
                            color: colors.mutedText,
                            fontFamily: fonts.body,
                          }}
                        >
                          {message.disclaimer}
                        </Text>
                      )}
                      {message.suggestedQuestions?.length ? (
                        <View className="mt-3 flex-row flex-wrap gap-2">
                          {message.suggestedQuestions
                            .slice(0, 3)
                            .map((question) => (
                              <TouchableOpacity
                                activeOpacity={0.75}
                                disabled={isCompanionTyping}
                                key={question}
                                onPress={() => setTypedQuestion(question)}
                                className="rounded-full border px-3 py-1.5"
                                style={{
                                  backgroundColor: colors.input,
                                  borderColor: colors.border,
                                }}
                              >
                                <Text
                                  className="text-[10px] font-bold"
                                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                                >
                                  {question}
                                </Text>
                              </TouchableOpacity>
                            ))}
                        </View>
                      ) : null}
                      <Text
                        className="text-[8px] font-bold text-right mt-1.5 opacity-60"
                        style={{
                          color: colors.mutedText,
                          fontFamily: fonts.body,
                        }}
                      >
                        {message.time}
                      </Text>
                    </View>
                  ) : (
                    <View className="max-w-[85%] self-end rounded-2xl rounded-tr-none overflow-hidden shadow-md">
                      <LinearGradient
                        colors={actionGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        className="p-4"
                      >
                        <Text
                          className="text-xs font-medium leading-5"
                          style={{ color: colors.buttonText, fontFamily: fonts.body }}
                        >
                          {message.text}
                        </Text>
                        <Text
                          className="text-[8px] font-bold text-right mt-1.5 opacity-60"
                          style={{ color: colors.buttonText, fontFamily: fonts.body }}
                        >
                          {message.time}
                        </Text>
                      </LinearGradient>
                    </View>
                  )}
                </View>
              );
            })}

            {/* HUMANIZED ACTIVE TYPING STATUS DOTS SIMULATION */}
            {isCompanionTyping && (
              <View
                className="self-start rounded-2xl rounded-tl-none border px-4 py-3.5 items-center justify-center flex-row gap-1"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Text
                  className="text-xs font-bold tracking-widest animate-pulse"
                  style={{ color: colors.primary, fontFamily: fonts.body }}
                >
                  Checking trusted guidance...
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* PERSISTENT FIXED FOOTER MESSAGE CONSOLE BAR ROW */}
        <View
          className="px-4 py-3.5 border-t flex-row items-center gap-3"
          style={{
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingBottom: Math.max(14, insets.bottom + 8),
          }}
        >
          <TextInput
            placeholder="Ask me anything anonymously..."
            placeholderTextColor={colors.mutedText}
            value={typedQuestion}
            onChangeText={setTypedQuestion}
            onSubmitEditing={handleTriggerConversation}
            maxLength={500}
            returnKeyType="send"
            blurOnSubmit={false}
            className="flex-1 px-4 py-3 rounded-xl text-sm"
            style={{
              color: colors.foreground,
              backgroundColor: colors.input,
              fontFamily: fonts.body,
            }}
          />
          <TouchableOpacity
            disabled={!typedQuestion.trim() || isCompanionTyping}
            onPress={handleTriggerConversation}
            activeOpacity={0.8}
            className="rounded-full overflow-hidden"
          >
            {typedQuestion.trim() && !isCompanionTyping ? (
              <LinearGradient
                colors={actionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                className="p-2.5 items-center justify-center"
              >
                <Feather name="send" size={15} color={colors.buttonText} />
              </LinearGradient>
            ) : (
              <View
                className="p-2.5 items-center justify-center"
                style={{ backgroundColor: colors.border }}
              >
                <Feather name="send" size={15} color={colors.mutedText} />
              </View>
            )}
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}
