import { Feather } from "@expo/vector-icons";
import {
  type AudioPlayer,
  RecordingPresets,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import { useTheme } from "../../components/theme";
import { getSoftTints } from "../../components/ui-tokens";
import { alert } from "../../lib/alert";
import { questionAnswerApi, speechApi, type Language, type LanguageCode } from "../../lib/api";
import { resolveAudioUri } from "../../lib/audio";
import { SUPPORTED_LANGUAGES } from "../../lib/languages";

// --- TELEHEALTH CONVERSATION MODEL CONTRACTS ---
interface ChatMessage {
  disclaimer?: string;
  id: string;
  personalized?: boolean;
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
  const softTints = getSoftTints(colors);

  // Functional Input and Loading States
  const [typedQuestion, setTypedQuestion] = useState("");
  const [isCompanionTyping, setIsCompanionTyping] = useState(false);

  const [language, setLanguage] = useState<LanguageCode>("en-IN");
  const [languages, setLanguages] = useState<Language[]>(SUPPORTED_LANGUAGES);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [synthesizingMessageId, setSynthesizingMessageId] = useState<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const playerRef = useRef<AudioPlayer | null>(null);

  const selectedLanguage = languages.find((l) => l.code === language) ?? SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    let isMounted = true;
    speechApi
      .getLanguages()
      .then((result) => {
        if (isMounted && result.languages?.length) setLanguages(result.languages);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
      playerRef.current?.release();
    };
  }, []);

  async function handleMicPress() {
    if (recorderState.isRecording) {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) return;

      setIsTranscribing(true);
      try {
        const result = await speechApi.transcribe(uri, language);
        if (result.transcript.trim()) {
          setTypedQuestion((prev) => (prev.trim() ? `${prev.trim()} ${result.transcript.trim()}` : result.transcript.trim()));
        } else {
          alert("Didn't catch that", "Try recording again somewhere quieter.");
        }
      } catch (error) {
        alert("Voice input failed", error instanceof Error ? error.message : "Please try again.");
      } finally {
        setIsTranscribing(false);
      }
      return;
    }

    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      alert("Microphone access needed", "Enable microphone access in Settings to use voice input.");
      return;
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function handleListen(message: ChatMessage) {
    if (playingMessageId === message.id) {
      playerRef.current?.pause();
      setPlayingMessageId(null);
      return;
    }

    playerRef.current?.pause();
    playerRef.current?.release();
    playerRef.current = null;

    setSynthesizingMessageId(message.id);
    try {
      const { audioBase64, audioCodec } = await speechApi.synthesize({ languageCode: language, text: message.text });
      const uri = await resolveAudioUri(audioBase64, audioCodec);
      const player = createAudioPlayer({ uri });
      playerRef.current = player;
      player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) {
          setPlayingMessageId((current) => (current === message.id ? null : current));
        }
      });
      player.play();
      setPlayingMessageId(message.id);
    } catch (error) {
      alert("Couldn't play audio", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSynthesizingMessageId(null);
    }
  }

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
      let companionPersonalized = false;

      try {
        const result = await questionAnswerApi.ask(submittedQuestion, language);
        foundMatchedResponse = result.answer;
        companionDisclaimer = result.disclaimer ?? companionDisclaimer;
        companionSource = result.source;
        companionPersonalized = Boolean(result.personalized);
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
        personalized: companionPersonalized,
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

          <TouchableOpacity
            onPress={() => setLanguagePickerVisible(true)}
            activeOpacity={0.7}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border"
            style={{ backgroundColor: softTints.pink, borderColor: colors.border }}
          >
            <Feather name="globe" size={13} color={colors.primary} />
            <Text className="text-[10px] font-black tracking-wide" style={{ color: colors.primary, fontFamily: fonts.body }}>
              {selectedLanguage.label}
            </Text>
          </TouchableOpacity>
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
                      {message.personalized && !isUrgent && (
                        <View className="mb-2 flex-row items-center gap-1.5">
                          <Feather name="user-check" size={12} color={colors.primary} />
                          <Text
                            className="text-[10px] font-black uppercase"
                            style={{ color: colors.primary, fontFamily: fonts.heading }}
                          >
                            Personalized for you
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
                      <View className="flex-row items-center justify-between mt-1.5">
                        <TouchableOpacity
                          onPress={() => handleListen(message)}
                          activeOpacity={0.7}
                          disabled={synthesizingMessageId === message.id}
                          className="flex-row items-center gap-1 -ml-1 px-1.5 py-0.5"
                        >
                          {synthesizingMessageId === message.id ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : (
                            <Feather
                              name={playingMessageId === message.id ? "pause-circle" : "volume-2"}
                              size={13}
                              color={colors.primary}
                            />
                          )}
                          <Text className="text-[8px] font-bold uppercase tracking-wide" style={{ color: colors.primary, fontFamily: fonts.body }}>
                            {playingMessageId === message.id ? "Playing" : "Listen"}
                          </Text>
                        </TouchableOpacity>
                        <Text
                          className="text-[8px] font-bold opacity-60"
                          style={{
                            color: colors.mutedText,
                            fontFamily: fonts.body,
                          }}
                        >
                          {message.time}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View
                      className="max-w-[85%] self-end rounded-2xl rounded-tr-none overflow-hidden shadow-md p-4"
                      style={{ backgroundColor: colors.primary }}
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
            placeholder={recorderState.isRecording ? "Listening..." : "Ask me anything anonymously..."}
            placeholderTextColor={colors.mutedText}
            value={typedQuestion}
            onChangeText={setTypedQuestion}
            onSubmitEditing={handleTriggerConversation}
            maxLength={500}
            returnKeyType="send"
            blurOnSubmit={false}
            editable={!recorderState.isRecording && !isTranscribing}
            className="flex-1 px-4 py-3 rounded-xl text-sm"
            style={{
              color: colors.foreground,
              backgroundColor: colors.input,
              fontFamily: fonts.body,
            }}
          />
          <TouchableOpacity
            disabled={isTranscribing}
            onPress={handleMicPress}
            activeOpacity={0.8}
            className="rounded-full overflow-hidden"
          >
            <View
              className="p-2.5 items-center justify-center"
              style={{ backgroundColor: recorderState.isRecording ? colors.danger : colors.border }}
            >
              {isTranscribing ? (
                <ActivityIndicator size="small" color={colors.mutedText} />
              ) : (
                <Feather name="mic" size={15} color={recorderState.isRecording ? "#fff" : colors.mutedText} />
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={!typedQuestion.trim() || isCompanionTyping}
            onPress={handleTriggerConversation}
            activeOpacity={0.8}
            className="rounded-full overflow-hidden"
          >
            {typedQuestion.trim() && !isCompanionTyping ? (
              <View
                className="p-2.5 items-center justify-center"
                style={{ backgroundColor: colors.primary }}
              >
                <Feather name="send" size={15} color={colors.buttonText} />
              </View>
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

        <Modal transparent animationType="fade" visible={languagePickerVisible} onRequestClose={() => setLanguagePickerVisible(false)}>
          <View className="flex-1 justify-end">
            <Pressable
              onPress={() => setLanguagePickerVisible(false)}
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay }}
            />
            <View
              className="rounded-t-3xl border p-4"
              style={{ backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(16, insets.bottom + 10) }}
            >
              <View className="items-center mb-3">
                <View className="rounded-full" style={{ backgroundColor: colors.border, height: 4, width: 42 }} />
              </View>
              <Text className="text-sm font-black mb-3" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                Chat & voice language
              </Text>
              <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                {languages.map((item) => (
                  <TouchableOpacity
                    key={item.code}
                    onPress={() => {
                      setLanguage(item.code);
                      setLanguagePickerVisible(false);
                    }}
                    activeOpacity={0.7}
                    className="flex-row items-center justify-between py-3 px-1"
                  >
                    <Text className="text-xs font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                      {item.label}
                    </Text>
                    {item.code === language ? <Feather name="check" size={16} color={colors.primary} /> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}
