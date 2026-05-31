import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import { useTheme } from "../../components/theme";

// --- TELEHEALTH CONVERSATION MODEL CONTRACTS ---
interface ChatMessage {
  id: string;
  sender: "user" | "companion";
  text: string;
  time: string;
}

export default function QA() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { earnTokens } = useAppState();
  const scrollViewRef = useRef<ScrollView>(null);

  // Functional Input and Loading States
  const [typedQuestion, setTypedQuestion] = useState("");
  const [isCompanionTyping, setIsCompanionTyping] = useState(false);

  // Human-like conversational streams database initialization
  const [chatLog, setChatLog] = useState<ChatMessage[]>([
    {
      id: "init_1",
      sender: "companion",
      text: "Hey sister! ✨ No judgments, no awkwardness here. Ask me anything about dark brown flows, weird body changes, tampons, intimacy, or even doubts your boyfriend has. I'm trained directly on our local health library. What's on your mind?",
      time: "9:41 AM",
    },
  ]);

  // Knowledge base containing strict fallback patterns mapping human conversational styles
  const trainedLocalKnowledgeBase = [
    {
      keywords: ["brown", "dark", "black", "blood", "bleed"],
      response:
        "Oh, dark brown or blackish blood is completely normal, especially at the start or very end of your period! It's just older blood that took its sweet time leaving the uterus. When it moves slowly, it oxidizes with oxygen and turns dark. No stress at all! ❤️",
    },
    {
      keywords: ["cup", "hymen", "break", "virgin"],
      response:
        "Listen to me: using a menstrual cup or tampon can stretch or tear your hymen, but that has absolutely ZERO correlation with losing your virginity! Virginity is a social concept, not a medical status. Your body is totally safe with a cup. 🩺",
    },
    {
      keywords: ["poop", "motions", "stomach", "loose"],
      response:
        "Ah, the legendary 'period poops'! Totally real. Right before your period, your body releases chemicals called prostaglandins to make your uterus contract. Sometimes these chemicals wander over to your bowels and make them relax too, causing sudden bathroom runs! 🚽",
    },
    {
      keywords: ["sex", "intimacy", "relation", "intercourse", "safe"],
      response:
        "Biologically, yes, it is perfectly fine if both you and your partner are happy and comfortable with it! It can even act as a natural cramp reliever thanks to endorphins. Just remember, your cervix is more sensitive now, and you can still get pregnant or catch infections, so protection is still a must! 🌸",
    },
    {
      keywords: ["wash", "soap", "clean", "vagina", "smell", "scent"],
      response:
        "Please put the scented wash down! 🛑 The vagina is a beautiful, self-cleaning ecosystem. Using harsh soaps, douches, or intimate washes disrupts your natural pH and kills the good bacteria, which actually *causes* infections and odors. Plain warm water on the outside (vulva) is all you ever need.",
    },
    {
      keywords: ["boy", "boyfriend", "pms", "partner", "man"],
      response:
        "That is so sweet that you/he asked! PMS can feel like an emotional roller coaster. The best support is validating those feelings instead of asking 'Are you on your period?'. Keep a heating pad ready, track her cycle phase implicitly, and grab her favorite comforting snacks. It makes a world of difference! 🍫",
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
    const cleanQuery = typedQuestion.trim().toLowerCase();
    if (!cleanQuery) return;

    const userMessagePayload: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      sender: "user",
      text: typedQuestion.trim(),
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
    setTimeout(() => {
      // Internal keyword checking loop
      let foundMatchedResponse =
        "I hear you, and that's a totally valid thing to wonder about! My database is checking that specific context. For immediate guidance, try dropping words like 'brown blood', 'period poop', or 'intimate wash' so I can fetch the exact clinical log from our framework. 📝";

      for (const entry of trainedLocalKnowledgeBase) {
        if (entry.keywords.some((keyword) => cleanQuery.includes(keyword))) {
          foundMatchedResponse = entry.response;
          break;
        }
      }

      const companionReplyPayload: ChatMessage = {
        id: `msg_c_${Date.now()}`,
        sender: "companion",
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
        {/* Custom Companion Chat Header Section */}
        <View
          className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-900/60 flex-row justify-between items-center"
          style={{ backgroundColor: colors.surface }}
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
              <View className="w-10 h-10 rounded-full bg-pink-100 items-center justify-center border border-pink-200/50">
                <Text className="text-xl">✨</Text>
              </View>
              <View className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-neutral-900" />
            </View>

            <View>
              <Text
                className="text-sm font-black tracking-tight"
                style={{ color: colors.foreground }}
              >
                Nura Companion
              </Text>
              <Text className="text-[10px] font-bold text-emerald-500 tracking-wider uppercase mt-0.5">
                Trained & Online
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
          contentContainerStyle={{ paddingBottom: 40 }}
          onContentSizeChange={() =>
            scrollViewRef.current?.scrollToEnd({ animated: true })
          }
        >
          <View className="gap-4">
            {chatLog.map((message) => {
              const isCompanion = message.sender === "companion";
              return (
                <View
                  key={message.id}
                  className={`max-w-[85%] p-4 rounded-2xl ${
                    isCompanion
                      ? "self-start rounded-tl-none border border-neutral-100 dark:border-neutral-800"
                      : "self-end rounded-tr-none shadow-2xs"
                  }`}
                  style={{
                    backgroundColor: isCompanion
                      ? colors.surface
                      : colors.primary,
                  }}
                >
                  {/* Text Message Context */}
                  <Text
                    className="text-xs font-medium leading-5"
                    style={{
                      color: isCompanion
                        ? colors.foreground
                        : colors.buttonText,
                    }}
                  >
                    {message.text}
                  </Text>

                  {/* Subtle Time Tag Indicator */}
                  <Text
                    className="text-[8px] font-bold text-right mt-1.5 opacity-60"
                    style={{
                      color: isCompanion ? colors.mutedText : colors.buttonText,
                    }}
                  >
                    {message.time}
                  </Text>
                </View>
              );
            })}

            {/* HUMANIZED ACTIVE TYPING STATUS DOTS SIMULATION */}
            {isCompanionTyping && (
              <View
                className="self-start rounded-2xl rounded-tl-none border border-neutral-100 dark:border-neutral-800 px-4 py-3.5 items-center justify-center flex-row gap-1"
                style={{ backgroundColor: colors.surface }}
              >
                <Text className="text-xs font-bold tracking-widest text-pink-500 animate-pulse">
                  Companion is writing...
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* PERSISTENT FIXED FOOTER MESSAGE CONSOLE BAR ROW */}
        <View
          className="px-4 py-3.5 border-t border-neutral-100 dark:border-neutral-900/60 flex-row items-center gap-3"
          style={{ backgroundColor: colors.surface }}
        >
          <TextInput
            placeholder="Ask me anything anonymously..."
            placeholderTextColor={colors.mutedText}
            value={typedQuestion}
            onChangeText={setTypedQuestion}
            onSubmitEditing={handleTriggerConversation}
            returnKeyType="send"
            className="flex-1 bg-neutral-100 dark:bg-neutral-800 px-4 py-3 rounded-xl text-sm"
            style={{ color: colors.foreground }}
          />
          <TouchableOpacity
            disabled={!typedQuestion.trim()}
            onPress={handleTriggerConversation}
            activeOpacity={0.8}
            className="p-2.5 rounded-full items-center justify-center"
            style={{
              backgroundColor: typedQuestion.trim()
                ? colors.primary
                : colors.border,
            }}
          >
            <Feather
              name="send"
              size={15}
              color={
                typedQuestion.trim() ? colors.buttonText : colors.mutedText
              }
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </>
  );
}
