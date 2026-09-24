import { Feather } from "@expo/vector-icons";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { useAppState } from "../../components/AppState";
import { useAuth } from "../../components/auth-context";
import { LanguagePickerSheet } from "../../components/LanguagePickerSheet";
import { SkeletonBlock } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getLogCategoryTints, getShadow, getSoftTints } from "../../components/ui-tokens";
import { VoiceModeOverlay, type VoiceStatus } from "../../components/VoiceModeOverlay";
import { useVoiceInput } from "../../hooks/useVoiceInput";
import { alert } from "../../lib/alert";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import {
  ApiError,
  isFeatureLockedError,
  questionAnswerApi,
  speechApi,
  voiceAgentApi,
  type ChatTopicId,
  type Language,
  type LanguageCode,
  type QaChatMessage,
  type VoiceAgentPendingAction,
} from "../../lib/api";
import { resolveAudioUri } from "../../lib/audio";
import { CHAT_TOPICS, composeIntakeMessage, getChatTopic, isTopicLocked } from "../../lib/chatTopics";
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
  // The dashboard's center avatar tab links here with ?voiceMode=1 so tapping
  // it drops straight into voice-to-voice instead of the text chat. Opening
  // a past chat from qa-history.tsx links here with ?sessionId=... instead,
  // which loads that session's messages and continues appending to it.
  // qa-history.tsx's "+ New" button links here with ?new=1 to start a fresh
  // conversation. Any other bare open of this screen (a hub card, a search
  // result, ...) gets redirected to qa-history below, so "AI Chat" always
  // lands on the chat list first instead of jumping straight into a blank
  // chat/topic-picker.
  const { voiceMode: voiceModeParam, sessionId: sessionIdParam, new: newChatParam } = useLocalSearchParams<{
    voiceMode?: string;
    sessionId?: string;
    new?: string;
  }>();
  const { earnTokens } = useAppState();
  const { user } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const softTints = getSoftTints(colors);
  const categoryTints = getLogCategoryTints(colors);
  const shadow = getShadow(colors, isDark);

  // Functional Input and Loading States
  const [typedQuestion, setTypedQuestion] = useState("");
  const [isCompanionTyping, setIsCompanionTyping] = useState(false);
  const [activeTopicId, setActiveTopicId] = useState<ChatTopicId | null>(null);
  // Answers to the active topic's short intake form (question id -> text),
  // cleared whenever the topic selection changes.
  const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string>>({});
  // The backend chat session this conversation is persisted to, once one
  // exists — created lazily on the first message (or eagerly when resuming
  // a past chat from history) so idle browsing never creates empty sessions.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(Boolean(sessionIdParam));
  const [paywallVisible, setPaywallVisible] = useState(false);
  const { refresh: refreshSubscriptionAccess } = useSubscriptionAccess();
  // "general" (the "Other" topic tile) is deliberately unscoped, same as
  // picking no topic — only a real topic id should show as "focused".
  const isTopicScoped = Boolean(activeTopicId) && activeTopicId !== "general";

  const [language, setLanguage] = useState<LanguageCode>("en-IN");
  const [languages, setLanguages] = useState<Language[]>(SUPPORTED_LANGUAGES);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [synthesizingMessageId, setSynthesizingMessageId] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(voiceModeParam === "1");
  const [pendingVoiceAction, setPendingVoiceAction] = useState<VoiceAgentPendingAction | undefined>();
  const playerRef = useRef<AudioPlayer | null>(null);

  const { handleMicPress, isRecording, isTranscribing, level, voiceError } = useVoiceInput({
    language,
    voiceMode,
    onTranscript: (transcript) => {
      if (voiceMode) {
        handleVoiceAgentTurn(transcript);
      } else {
        setTypedQuestion((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      }
    },
  });

  const selectedLanguage = languages.find((l) => l.code === language) ?? SUPPORTED_LANGUAGES[0];
  const isSpeakingReply = voiceMode && playingMessageId !== null;

  // Google Assistant style loop: whenever voice mode is idle, auto-arm the mic again.
  // Paused while a voice-mode failure is showing (voiceError) so the user has
  // time to actually read it before the mic starts listening again.
  useEffect(() => {
    if (!voiceMode || isRecording || isTranscribing || isCompanionTyping || isSpeakingReply || voiceError) return;
    const timer = setTimeout(() => {
      handleMicPress();
    }, 450);
    return () => clearTimeout(timer);
  }, [voiceMode, isRecording, isTranscribing, isCompanionTyping, isSpeakingReply, voiceError, handleMicPress]);

  const voiceStatus: VoiceStatus = isTranscribing
    ? "processing"
    : isRecording
      ? "listening"
      : isCompanionTyping
        ? "thinking"
        : isSpeakingReply
          ? "speaking"
          : "idle";

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
      text: "Hi, I am Nura AI. Ask anything about periods, discharge, cramps, hygiene, intimacy, partner questions, or body changes. I can share general education, and I will point you toward care when symptoms sound urgent.",
      time: "9:41 AM",
    },
  ]);

  // Resuming a chat from history: swap the local greeting for the session's
  // real messages and pick up its topic, so "Or pick a topic" stays hidden
  // and any new questions get scoped/persisted the same way this chat was
  // started.
  useEffect(() => {
    if (!sessionIdParam) return;
    let isMounted = true;
    setIsLoadingSession(true);
    questionAnswerApi
      .getSession(sessionIdParam)
      .then((session) => {
        if (!isMounted) return;
        setActiveSessionId(session.id);
        setActiveTopicId(session.topicId === "general" ? null : session.topicId);
        if (session.messages.length) {
          setChatLog(session.messages.map(toChatMessage));
        }
      })
      .catch((error) => {
        if (!isMounted) return;
        alert("Couldn't open that chat", error instanceof Error ? error.message : "Please try again.");
      })
      .finally(() => {
        if (isMounted) setIsLoadingSession(false);
      });
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per sessionIdParam identity, not on every render
  }, [sessionIdParam]);

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

  function formatTime(date: Date): string {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatCurrentTime(): string {
    return formatTime(new Date());
  }

  function toChatMessage(message: QaChatMessage): ChatMessage {
    return {
      disclaimer: message.disclaimer,
      id: message.id,
      personalized: message.personalized,
      sender: message.role === "assistant" ? "companion" : "user",
      source: message.source,
      suggestedQuestions: message.suggestedQuestions,
      text: message.text,
      time: formatTime(new Date(message.createdAt)),
    };
  }

  const AFFIRMATIVE_PATTERN = /\b(yes|yeah|yep|confirm|correct|sure|save it|do it|go ahead)\b/i;

  /**
   * Voice mode's action-capable path — routes transcripts through the
   * backend voice agent (Sarvam-driven) instead of the plain Q&A endpoint,
   * so a spoken "log today's entry" can be gathered and saved through a
   * short back-and-forth instead of only ever getting a text answer back.
   */
  async function handleVoiceAgentTurn(transcript: string) {
    const cleanTranscript = transcript.trim();
    if (!cleanTranscript || isCompanionTyping) return;

    setChatLog((prev) => [
      ...prev,
      { id: `msg_u_${Date.now()}`, sender: "user", text: cleanTranscript, time: formatCurrentTime() },
    ]);
    setIsCompanionTyping(true);

    try {
      const confirming = Boolean(pendingVoiceAction) && AFFIRMATIVE_PATTERN.test(cleanTranscript);
      const reply = await voiceAgentApi.converse(
        cleanTranscript,
        language,
        pendingVoiceAction,
        confirming,
      );

      let replyMessage: ChatMessage;
      if (reply.type === "answer") {
        replyMessage = { id: `msg_c_${Date.now()}`, sender: "companion", text: reply.text, time: formatCurrentTime() };
        setPendingVoiceAction(undefined);
      } else if (reply.type === "action_proposal") {
        replyMessage = {
          id: `msg_c_${Date.now()}`,
          sender: "companion",
          text: reply.followUpQuestion ?? "Can you tell me a bit more?",
          time: formatCurrentTime(),
        };
        setPendingVoiceAction({ action: reply.action, payload: reply.payload });
      } else if (reply.type === "action_confirm") {
        replyMessage = {
          id: `msg_c_${Date.now()}`,
          sender: "companion",
          text: reply.confirmationText,
          time: formatCurrentTime(),
        };
        setPendingVoiceAction({ action: reply.action, payload: reply.payload });
      } else {
        replyMessage = { id: `msg_c_${Date.now()}`, sender: "companion", text: reply.text, time: formatCurrentTime() };
        setPendingVoiceAction(undefined);
      }

      setChatLog((prev) => [...prev, replyMessage]);
      handleListen(replyMessage);
    } catch (error) {
      const failureMessage: ChatMessage = {
        id: `msg_c_${Date.now()}`,
        sender: "companion",
        text: error instanceof Error ? error.message : "Sorry, I couldn't process that just now.",
        time: formatCurrentTime(),
      };
      setChatLog((prev) => [...prev, failureMessage]);
      handleListen(failureMessage);
    } finally {
      setIsCompanionTyping(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  function handleTriggerConversation(overrideText?: string) {
    const submittedQuestion = (overrideText ?? typedQuestion).trim();
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

      // Persist through a chat session (created lazily on the first
      // message, scoped to whichever topic — if any — is active) so this
      // exchange shows up in chat history and follow-ups in the same
      // conversation stay on-topic. Kept as its own try/catch: a 403 here
      // means the topic's age restriction rejected it (see
      // chatSessionController.js#createChatSession) — that should stop the
      // turn with a clear message, not silently fall through to an unscoped
      // answer below.
      let sessionId = activeSessionId;
      if (!sessionId) {
        try {
          const session = await questionAnswerApi.createSession(activeTopicId ?? undefined);
          sessionId = session.id;
          setActiveSessionId(sessionId);
        } catch (createSessionError) {
          if (createSessionError instanceof ApiError && createSessionError.status === 403) {
            setChatLog((prev) => [
              ...prev,
              {
                id: `msg_c_${Date.now()}`,
                sender: "companion",
                text: createSessionError.message,
                time: formatCurrentTime(),
              },
            ]);
            setIsCompanionTyping(false);
            return;
          }
          if (isFeatureLockedError(createSessionError)) {
            // Same hard-stop shape as the age-gate above, but the recovery
            // path is "buy access" rather than "nothing to do" — surface the
            // paywall instead of silently falling through to the free
            // stateless answer, or the premium saved-history feature would
            // never actually get seen/sold.
            setIsCompanionTyping(false);
            setPaywallVisible(true);
            return;
          }
          // Any other failure (offline, server error, ...) — fall through to
          // the stateless/local-fallback path below like a normal send error.
        }
      }

      try {
        if (!sessionId) throw new Error("No chat session available");
        const result = await questionAnswerApi.sendSessionMessage(sessionId, submittedQuestion, language);
        foundMatchedResponse = result.answer;
        companionDisclaimer = result.disclaimer ?? companionDisclaimer;
        companionSource = result.source;
        companionPersonalized = Boolean(result.personalized);
        suggestedQuestions = result.suggestedQuestions?.length
          ? result.suggestedQuestions
          : suggestedQuestions;
      } catch (askError) {
        if (isFeatureLockedError(askError)) {
          setIsCompanionTyping(false);
          setPaywallVisible(true);
          return;
        }
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
      if (voiceMode) {
        handleListen(companionReplyPayload);
      }

      setTimeout(
        () => scrollViewRef.current?.scrollToEnd({ animated: true }),
        100,
      );
    }, 1500); // Organic typing interval lag
  }

  // Bare entry (no voice, no resumed session, no explicit "new chat") — send
  // it to the chat list first instead of dropping straight into a blank
  // chat/topic-picker. All hooks above still run unconditionally every
  // render; only the JSX branches here.
  if (!voiceModeParam && !sessionIdParam && !newChatParam) {
    return <Redirect href="/(app)/qa-history" />;
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
          className="mx-4 mt-4 mb-1 px-4 py-3.5 rounded-3xl flex-row justify-between items-center gap-2"
          style={[
            { backgroundColor: colors.surface },
            shadow,
          ]}
        >
          <View className="flex-row items-center gap-3 flex-1 min-w-0">
            <TouchableOpacity
              onPress={() => router.back()}
              activeOpacity={0.7}
              className="p-2.5 rounded-full border"
              style={{ backgroundColor: colors.input, borderColor: colors.border }}
            >
              <Feather name="arrow-left" size={18} color={colors.foreground} />
            </TouchableOpacity>

            {/* Robot/Companion Identity Sphere Indicator */}
            <View className="relative">
              <View
                className="w-11 h-11 rounded-full items-center justify-start overflow-hidden"
                style={{ backgroundColor: softTints.pink }}
              >
                {/* icon.png is a tall half-body illustration with the face in
                    the top square — scale to container width and anchor to
                    the top (instead of centering) so the circle crops off
                    the shoulders/hands below instead of cutting the face. */}
                <Image
                  source={require("../../assets/images/icon.png")}
                  style={{ width: 44, height: 44 * (1294 / 871) }}
                  resizeMode="cover"
                />
              </View>
              <View
                className="absolute bottom-0 right-0 w-3 h-3 rounded-full"
                style={{ backgroundColor: colors.success, borderWidth: 2, borderColor: colors.surface }}
              />
            </View>

            <View className="flex-1 min-w-0">
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                className="text-base font-black tracking-tight"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                Nura AI
              </Text>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                className="text-[10px] font-bold tracking-wider uppercase mt-0.5"
                style={{ color: isTopicScoped ? colors.primary : colors.success, fontFamily: fonts.body }}
              >
                {/* Visible confirmation that this chat is scoped — matches
                    what the backend's topicScopeInstruction actually does.
                    "general" (the "Other" tile) is intentionally unscoped,
                    same as picking no topic at all. */}
                {isTopicScoped ? `Focused on ${getChatTopic(activeTopicId)?.label}` : "Private guidance online"}
              </Text>
            </View>
          </View>

          {/* Icon-only toggles — keeps the row to a single line even when
              the name/status block is long, instead of squeezing two
              labeled pills in next to the avatar. */}
          <View className="flex-row items-center gap-2 flex-shrink-0">
            <TouchableOpacity
              onPress={() => router.push("/(app)/qa-history")}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Chat history"
              className="w-9 h-9 items-center justify-center rounded-full"
              style={{ backgroundColor: softTints.pink }}
            >
              <Feather name="clock" size={15} color={colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setVoiceMode((prev) => !prev)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={voiceMode ? "Turn off voice mode" : "Turn on voice mode"}
              className="w-9 h-9 items-center justify-center rounded-full"
              style={{ backgroundColor: voiceMode ? colors.primary : softTints.pink }}
            >
              <Feather name="headphones" size={15} color={voiceMode ? colors.buttonText : colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setLanguagePickerVisible(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Change language, currently ${selectedLanguage.label}`}
              className="w-9 h-9 items-center justify-center rounded-full"
              style={{ backgroundColor: softTints.pink }}
            >
              <Feather name="globe" size={15} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {voiceMode ? (
          <View
            className="mx-4 mb-1 mt-2 px-4 py-3 rounded-2xl flex-row items-start gap-2"
            style={{ backgroundColor: softTints.pink }}
          >
            <Feather name="mic" size={13} color={colors.primary} style={{ marginTop: 1.5 }} />
            <Text className="text-[11px] font-bold flex-1 flex-shrink leading-4" style={{ color: colors.primary, fontFamily: fonts.body }}>
              Voice mode on — tap the mic, speak, and I&apos;ll reply out loud in {selectedLanguage.label}. Pause
              for 3 seconds and I&apos;ll send it automatically.
            </Text>
          </View>
        ) : null}

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
          {isLoadingSession ? (
            <View className="gap-4">
              <SkeletonBlock width="70%" height={64} radius={20} />
              <SkeletonBlock width="55%" height={44} radius={20} style={{ alignSelf: "flex-end" }} />
              <SkeletonBlock width="80%" height={84} radius={20} />
              <SkeletonBlock width="45%" height={44} radius={20} style={{ alignSelf: "flex-end" }} />
            </View>
          ) : (
          <View className="gap-4">
            {chatLog.map((message) => {
              const isCompanion = message.sender === "companion";
              const isUrgent = message.source === "urgent_safety";
              return (
                <View key={message.id}>
                  {isCompanion ? (
                    <View
                      className="max-w-[85%] p-4 rounded-3xl self-start rounded-bl-md border"
                      style={[
                        {
                          backgroundColor: isUrgent ? colors.dangerLight : colors.surface,
                          borderColor: isUrgent ? colors.danger : colors.border,
                        },
                        isUrgent ? null : shadow,
                      ]}
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
                        className="text-[15px] font-medium leading-6"
                        style={{
                          color: colors.foreground,
                          fontFamily: fonts.body,
                        }}
                      >
                        {message.text}
                      </Text>
                      {message.disclaimer && (
                        <Text
                          className="text-[11px] font-semibold leading-4 mt-3"
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
                          <Text className="text-[10px] font-bold uppercase tracking-wide" style={{ color: colors.primary, fontFamily: fonts.body }}>
                            {playingMessageId === message.id ? "Playing" : "Listen"}
                          </Text>
                        </TouchableOpacity>
                        <Text
                          className="text-[10px] font-bold opacity-70"
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
                      className="max-w-[85%] self-end rounded-3xl rounded-br-md overflow-hidden p-4"
                      style={[{ backgroundColor: colors.primaryDark }, shadow]}
                    >
                      <Text
                        className="text-[15px] font-medium leading-6"
                        style={{ color: "#FFFFFF", fontFamily: fonts.body }}
                      >
                        {message.text}
                      </Text>
                      <Text
                        className="text-[10px] font-bold text-right mt-1.5 opacity-70"
                        style={{ color: "#FFFFFF", fontFamily: fonts.body }}
                      >
                        {message.time}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}

            {/* TOPIC STARTER GRID — only before the first real exchange, so
                it reads as "what would you like to talk about" rather than
                cluttering an already-active conversation. */}
            {chatLog.length === 1 && !isCompanionTyping ? (
              <View className="gap-3">
                <Text
                  className="text-xs font-black uppercase tracking-wider"
                  style={{ color: colors.mutedText, fontFamily: fonts.heading }}
                >
                  Or pick a topic
                </Text>
                <View className="flex-row flex-wrap gap-2.5">
                  {CHAT_TOPICS.map((topic) => {
                    const tint = categoryTints[topic.tint];
                    const isActive = activeTopicId === topic.id;
                    const locked = isTopicLocked(topic, user?.dateOfBirth);
                    return (
                      <TouchableOpacity
                        key={topic.id}
                        activeOpacity={0.75}
                        onPress={() => {
                          if (locked) {
                            alert(
                              "Age verification needed",
                              `${topic.label} is only available once your profile shows you're ${topic.minAge}+. Update your date of birth in Profile to unlock it.`,
                            );
                            return;
                          }
                          setIntakeAnswers({});
                          setActiveTopicId((prev) => (prev === topic.id ? null : topic.id));
                        }}
                        className="flex-row items-center gap-2 rounded-2xl border px-3 py-2.5"
                        style={{
                          backgroundColor: isActive ? tint.light : colors.surface,
                          borderColor: isActive ? tint.color : colors.border,
                          opacity: locked ? 0.55 : 1,
                          width: "47%",
                        }}
                      >
                        <View
                          className="w-7 h-7 items-center justify-center rounded-full"
                          style={{ backgroundColor: tint.light }}
                        >
                          <Feather name={locked ? "lock" : topic.icon} size={13} color={tint.color} />
                        </View>
                        <Text
                          numberOfLines={2}
                          className="text-[11px] font-bold flex-1 flex-shrink leading-4"
                          style={{ color: colors.foreground, fontFamily: fonts.body }}
                        >
                          {topic.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {activeTopicId
                  ? (() => {
                      const topic = getChatTopic(activeTopicId);
                      if (!topic) return null;

                      // Topics with an intake form (everything but "Other")
                      // collect a couple of quick answers first, so the
                      // AI's first reply is already grounded — the form
                      // itself is never sent to the backend, just the
                      // composed sentence it produces.
                      if (topic.intake?.length) {
                        const requiredUnanswered = topic.intake.some(
                          (question) => !question.optional && !intakeAnswers[question.id]?.trim(),
                        );
                        return (
                          <View
                            className="gap-3 mt-1 p-3.5 rounded-2xl border"
                            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                          >
                            {topic.intake.map((question) => (
                              <View key={question.id} className="gap-2">
                                <Text
                                  className="text-[11px] font-bold"
                                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                                >
                                  {question.label}
                                  {question.optional ? (
                                    <Text style={{ color: colors.mutedText }}> (optional)</Text>
                                  ) : null}
                                </Text>
                                {question.type === "choice" ? (
                                  <View className="flex-row flex-wrap gap-2">
                                    {question.options?.map((option) => {
                                      const selected = intakeAnswers[question.id] === option;
                                      return (
                                        <TouchableOpacity
                                          key={option}
                                          activeOpacity={0.75}
                                          onPress={() =>
                                            setIntakeAnswers((prev) => ({ ...prev, [question.id]: option }))
                                          }
                                          className="rounded-full border px-3 py-1.5"
                                          style={{
                                            backgroundColor: selected ? colors.primary : colors.input,
                                            borderColor: selected ? colors.primary : colors.border,
                                          }}
                                        >
                                          <Text
                                            className="text-[10px] font-bold"
                                            style={{ color: selected ? colors.buttonText : colors.foreground, fontFamily: fonts.body }}
                                          >
                                            {option}
                                          </Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                ) : (
                                  <TextInput
                                    value={intakeAnswers[question.id] ?? ""}
                                    onChangeText={(text) =>
                                      setIntakeAnswers((prev) => ({ ...prev, [question.id]: text }))
                                    }
                                    placeholder={question.placeholder}
                                    placeholderTextColor={colors.mutedText}
                                    maxLength={200}
                                    className="px-3 py-2.5 rounded-xl text-xs"
                                    style={{ backgroundColor: colors.input, color: colors.foreground, fontFamily: fonts.body }}
                                  />
                                )}
                              </View>
                            ))}
                            <TouchableOpacity
                              activeOpacity={0.85}
                              disabled={requiredUnanswered || isCompanionTyping}
                              onPress={() => handleTriggerConversation(composeIntakeMessage(topic, intakeAnswers))}
                              className="items-center py-3 rounded-xl mt-1"
                              style={{ backgroundColor: requiredUnanswered ? colors.input : colors.primary }}
                            >
                              <Text
                                className="text-xs font-black"
                                style={{ color: requiredUnanswered ? colors.mutedText : colors.buttonText, fontFamily: fonts.body }}
                              >
                                Start chat
                              </Text>
                            </TouchableOpacity>
                          </View>
                        );
                      }

                      // No intake form (just "Other") — keep the simple
                      // tap-a-question chips.
                      return (
                        <View className="flex-row flex-wrap gap-2 mt-1">
                          {topic.questions.map((question) => (
                            <TouchableOpacity
                              key={question}
                              activeOpacity={0.75}
                              onPress={() => handleTriggerConversation(question)}
                              className="rounded-full border px-3 py-1.5"
                              style={{ backgroundColor: colors.input, borderColor: colors.border }}
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
                      );
                    })()
                  : null}
              </View>
            ) : null}

            {/* HUMANIZED ACTIVE TYPING STATUS DOTS SIMULATION */}
            {isCompanionTyping && (
              <View
                className="self-start rounded-3xl rounded-bl-md border px-4 py-3.5 items-center justify-center flex-row gap-1"
                style={[
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                  shadow,
                ]}
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
          )}
        </ScrollView>

        {/* PERSISTENT FIXED FOOTER MESSAGE CONSOLE BAR ROW */}
        <View
          className="mx-4 mb-2 px-2 py-2 rounded-full flex-row items-center gap-2"
          style={[
            {
              backgroundColor: colors.surface,
              marginBottom: Math.max(8, insets.bottom),
            },
            shadow,
          ]}
        >
          <TextInput
            placeholder={isRecording ? "Listening..." : "Ask me anything anonymously..."}
            placeholderTextColor={colors.mutedText}
            value={typedQuestion}
            onChangeText={setTypedQuestion}
            onSubmitEditing={() => handleTriggerConversation()}
            maxLength={500}
            returnKeyType="send"
            submitBehavior="submit"
            editable={!isRecording && !isTranscribing}
            className="flex-1 px-4 py-3 rounded-full text-sm"
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
            accessibilityRole="button"
            accessibilityLabel={isTranscribing ? "Transcribing" : isRecording ? "Stop recording" : "Start recording"}
            className="rounded-full overflow-hidden"
          >
            <View
              className="w-11 h-11 items-center justify-center rounded-full"
              style={{ backgroundColor: isRecording ? colors.danger : colors.input }}
            >
              {isTranscribing ? (
                <ActivityIndicator size="small" color={colors.mutedText} />
              ) : (
                <Feather name="mic" size={16} color={isRecording ? "#fff" : colors.mutedText} />
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={!typedQuestion.trim() || isCompanionTyping}
            onPress={() => handleTriggerConversation()}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Send question"
            className="rounded-full overflow-hidden"
          >
            {typedQuestion.trim() && !isCompanionTyping ? (
              <View
                className="w-11 h-11 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.primary }}
              >
                <Feather name="send" size={16} color={colors.buttonText} />
              </View>
            ) : (
              <View
                className="w-11 h-11 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.input }}
              >
                <Feather name="send" size={16} color={colors.mutedText} />
              </View>
            )}
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>

        <LanguagePickerSheet
          languages={languages}
          onClose={() => setLanguagePickerVisible(false)}
          onSelect={setLanguage}
          selectedCode={language}
          title="Chat & voice language"
          visible={languagePickerVisible}
        />
      </SafeAreaView>

      {voiceMode ? (
        <VoiceModeOverlay
          colors={colors}
          errorMessage={voiceError}
          fonts={fonts}
          languageLabel={selectedLanguage.label}
          level={level}
          onCancel={() => setPendingVoiceAction(undefined)}
          onClose={() => setVoiceMode(false)}
          onMicPress={handleMicPress}
          status={voiceStatus}
        />
      ) : null}

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        featureKey="ai_assistant"
        onUnlocked={refreshSubscriptionAccess}
      />
    </>
  );
}
