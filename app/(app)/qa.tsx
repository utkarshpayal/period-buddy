import { Feather, Ionicons } from "@expo/vector-icons";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppState } from "../../components/AppState";
import { useAuth } from "../../components/auth-context";
import { LanguagePickerSheet } from "../../components/LanguagePickerSheet";
import { SkeletonBlock } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getLogCategoryTints, getSoftTints } from "../../components/ui-tokens";
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
import { CHAT_TOPICS, getChatTopic, isTopicLocked } from "../../lib/chatTopics";
import { SUPPORTED_LANGUAGES } from "../../lib/languages";
import { HeaderIconButton } from "../../components/ScreenHeader";
import { TypingDots } from "../../components/TypingDots";
import { useSecureScreen } from "../../lib/screenPrivacy";

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
  useSecureScreen("qa");
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
  const {
    voiceMode: voiceModeParam,
    sessionId: sessionIdParam,
    new: newChatParam,
    topic: topicParam,
    q: questionParam,
  } = useLocalSearchParams<{
    voiceMode?: string;
    sessionId?: string;
    new?: string;
    topic?: string;
    /** A question typed elsewhere (Wellness hub's Nura AI box): sent as the first message. */
    q?: string;
  }>();
  const { earnTokens } = useAppState();
  const { user } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  const softTints = getSoftTints(colors);
  const categoryTints = getLogCategoryTints(colors);

  // Functional Input and Loading States
  const [typedQuestion, setTypedQuestion] = useState("");
  const [isCompanionTyping, setIsCompanionTyping] = useState(false);
  // A topic picked on the Nura AI home (?topic=) opens the chat already
  // scoped to it — no form, just that topic's starter questions.
  const presetTopic = sessionIdParam ? undefined : getChatTopic(topicParam);
  const [activeTopicId, setActiveTopicId] = useState<ChatTopicId | null>(
    presetTopic && !isTopicLocked(presetTopic, user?.dateOfBirth) ? presetTopic.id : null,
  );
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
  // The reply's audio is still being made. Counts as busy: otherwise the mic
  // re-arms in this gap, records the reply being spoken and sends it back as
  // if the user had said it.
  const isPreparingReply = voiceMode && synthesizingMessageId !== null;

  // Google Assistant style loop: whenever voice mode is idle, auto-arm the mic again.
  // Paused while a voice-mode failure is showing (voiceError) so the user has
  // time to actually read it before the mic starts listening again.
  useEffect(() => {
    if (!voiceMode || isRecording || isTranscribing || isCompanionTyping || isPreparingReply || isSpeakingReply || voiceError) return;
    const timer = setTimeout(() => {
      handleMicPress();
    }, 450);
    return () => clearTimeout(timer);
  }, [voiceMode, isRecording, isTranscribing, isCompanionTyping, isPreparingReply, isSpeakingReply, voiceError, handleMicPress]);

  const voiceStatus: VoiceStatus = isTranscribing
    ? "processing"
    : isRecording
      ? "listening"
      : isCompanionTyping || isPreparingReply
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

  // ?q= from the Wellness hub's question box: ask it straight away, once.
  const askedParamQuestion = useRef(false);
  useEffect(() => {
    if (askedParamQuestion.current || sessionIdParam || !questionParam?.trim()) return;
    askedParamQuestion.current = true;
    handleTriggerConversation(questionParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per screen, on the param it opened with
  }, [questionParam]);

  // Knowledge base containing strict fallback patterns mapping human conversational styles
  const trainedLocalKnowledgeBase = [
    // Checked first: an urgent question must never get a "that's normal" answer.
    {
      keywords: [
        "soaking",
        "faint",
        "dizzy",
        "fever",
        "severe pain",
        "unbearable",
        "bleeding during pregnancy",
        "pregnant and bleeding",
        "suicid",
        "self harm",
        "self-harm",
        "kill myself",
        "want to die",
      ],
      response:
        "This could need urgent help. If you are soaking pads quickly, feeling faint, have fever with pelvic pain, severe one-sided or unbearable pain, or bleeding during pregnancy, go to the nearest hospital or call 112 now. If you are having thoughts of harming yourself, you are not alone: call Tele-MANAS on 14416 (free, 24 hours) or 112, and tell someone you trust.",
      source: "urgent_safety",
    },
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
      keywords: ["boyfriend", "husband", "pms", "partner"],
      response:
        "PMS support works best when it is respectful: validate feelings, offer practical help, and avoid teasing or blaming mood changes on a period. A heating pad, rest, water, and patience can help a lot.",
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
          // Match from the start of a word, so "man" can't hit "woman".
          if (entry.keywords.some((keyword) => new RegExp(`\\b${keyword}`).test(cleanQuery))) {
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

  // Flo-style assistant: a welcome screen with question cards and topics
  // until the first real exchange, then a clean thread with quick replies
  // pinned above the composer.
  const isWelcome = !isLoadingSession && chatLog.length === 1 && chatLog[0].sender === "companion" && !isCompanionTyping;
  const lastMessage = chatLog[chatLog.length - 1];
  const quickReplies =
    !isWelcome && !isCompanionTyping && lastMessage?.sender === "companion" ? (lastMessage.suggestedQuestions ?? []).slice(0, 3) : [];
  const activeTopic = getChatTopic(activeTopicId);
  const starterQuestions = (
    activeTopic && isTopicScoped
      ? activeTopic.questions
      : chatLog[0]?.suggestedQuestions?.length
        ? chatLog[0].suggestedQuestions
        : defaultSuggestedQuestions
  ).slice(0, 4);
  const firstName = user?.firstName && user.firstName !== "Nura" ? user.firstName : "";
  const canSend = Boolean(typedQuestion.trim()) && !isCompanionTyping;

  const avatar = (size: number) => (
    <View
      className="items-center justify-start overflow-hidden rounded-full"
      style={{ width: size, height: size, backgroundColor: softTints.pink }}
    >
      {/* nura-avatar.png is a tall half-body illustration: scale to the
          circle's width and anchor to the top so the face stays in view. */}
      <Image
        source={require("../../assets/images/illustrations/nura-avatar.png")}
        style={{ width: size, height: size * (1294 / 871) }}
        resizeMode="cover"
      />
    </View>
  );

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          {/* Header: back · centred title (tap the language to change it) · history */}
          <View className="flex-row items-center px-6 pt-3 pb-2" style={{ gap: 12 }}>
            <HeaderIconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => router.back()} />
            <View className="flex-1 items-center" style={{ minWidth: 0 }}>
              <Text accessibilityRole="header" numberOfLines={1} style={{ color: colors.foreground, fontSize: 16, fontWeight: "800", fontFamily: fonts.heading }}>
                {isTopicScoped ? getChatTopic(activeTopicId)?.label : "Nura AI"}
              </Text>
              <TouchableOpacity
                onPress={() => setLanguagePickerVisible(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Change language, currently ${selectedLanguage.label}`}
                hitSlop={8}
                className="flex-row items-center"
                style={{ gap: 3, marginTop: 1 }}
              >
                <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 12.5, fontFamily: fonts.body }}>
                  {selectedLanguage.label}
                </Text>
                <Ionicons name="chevron-down" size={12} color={colors.mutedText} />
              </TouchableOpacity>
            </View>
            <HeaderIconButton icon="time-outline" accessibilityLabel="Chat history" onPress={() => router.push("/(app)/qa-history")} />
          </View>

          <ScrollView
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, flexGrow: 1 }}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (!isWelcome) scrollViewRef.current?.scrollToEnd({ animated: true });
            }}
          >
            {isLoadingSession ? (
              <View style={{ gap: 16 }}>
                <SkeletonBlock width="70%" height={64} radius={20} />
                <SkeletonBlock width="55%" height={44} radius={20} style={{ alignSelf: "flex-end" }} />
                <SkeletonBlock width="80%" height={84} radius={20} />
              </View>
            ) : isWelcome ? (
              <View>
                {/* Greeting */}
                <View className="items-center" style={{ marginTop: 12, marginBottom: 28 }}>
                  {avatar(72)}
                  <Text
                    style={{ color: colors.foreground, fontSize: 24, lineHeight: 30, fontWeight: "800", textAlign: "center", marginTop: 14, fontFamily: fonts.heading }}
                  >
                    {firstName ? `Hi ${firstName}, I'm Nura` : "Hi, I'm Nura"}
                  </Text>
                  <Text style={{ color: colors.mutedText, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 6, fontFamily: fonts.body }}>
                    {activeTopic && isTopicScoped
                      ? `Ask me anything about ${activeTopic.label.toLowerCase()}.`
                      : "Ask me anything about your cycle, body or health."}
                  </Text>
                  <View className="flex-row items-center" style={{ gap: 5, marginTop: 10 }}>
                    <Ionicons name="lock-closed" size={12} color={colors.success} />
                    <Text style={{ color: colors.success, fontSize: 12.5, fontWeight: "700", fontFamily: fonts.body }}>Private & anonymous</Text>
                  </View>
                </View>

                {/* Try asking — one tap sends it. */}
                <Text style={{ color: colors.foreground, fontSize: 14.5, fontWeight: "800", marginBottom: 10, fontFamily: fonts.heading }}>
                  Try asking
                </Text>
                <View style={{ gap: 8 }}>
                  {starterQuestions.map((question) => (
                    <TouchableOpacity
                      key={question}
                      activeOpacity={0.8}
                      onPress={() => handleTriggerConversation(question)}
                      accessibilityRole="button"
                      className="flex-row items-center"
                      style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.surface }}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={18} color={activeTopic ? categoryTints[activeTopic.tint].color : colors.primary} />
                      <Text style={{ flex: 1, color: colors.foreground, fontSize: 14.5, fontWeight: "600", fontFamily: fonts.body }}>{question}</Text>
                      <Ionicons name="arrow-forward" size={16} color={colors.mutedText} />
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Topics: only when none was picked on the Nura AI home. Tapping
                    one just swaps the starter questions above; no form. */}
                {presetTopic ? null : (
                  <>
                    <Text style={{ color: colors.foreground, fontSize: 14.5, fontWeight: "800", marginTop: 24, marginBottom: 10, fontFamily: fonts.heading }}>
                      Or pick a topic
                    </Text>
                    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                      {CHAT_TOPICS.map((topic) => {
                        const tint = categoryTints[topic.tint];
                        const isActive = activeTopicId === topic.id;
                        const locked = isTopicLocked(topic, user?.dateOfBirth);
                        return (
                          <TouchableOpacity
                            key={topic.id}
                            activeOpacity={0.75}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isActive }}
                            accessibilityLabel={locked ? `${topic.label}, locked` : topic.label}
                            onPress={() => {
                              if (locked) {
                                alert(
                                  "Age verification needed",
                                  `${topic.label} unlocks once your profile shows you're ${topic.minAge}+. Add your birthday in Profile → Edit profile.`,
                                );
                                return;
                              }
                              setActiveTopicId((prev) => (prev === topic.id ? null : topic.id));
                            }}
                            className="flex-row items-center rounded-full"
                            style={{
                              gap: 6,
                              paddingLeft: 6,
                              paddingRight: 14,
                              paddingVertical: 6,
                              borderWidth: 1.5,
                              backgroundColor: isActive ? tint.light : colors.surface,
                              borderColor: isActive ? tint.color : "transparent",
                              opacity: locked ? 0.55 : 1,
                            }}
                          >
                            <View className="items-center justify-center rounded-full" style={{ width: 26, height: 26, backgroundColor: tint.light }}>
                              <Feather name={locked ? "lock" : topic.icon} size={13} color={tint.color} />
                            </View>
                            <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13.5, fontWeight: "700", fontFamily: fonts.body }}>
                              {topic.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}

                <Text style={{ color: colors.mutedText, fontSize: 12.5, lineHeight: 18, textAlign: "center", marginTop: 24, fontFamily: fonts.body }}>
                  {defaultCompanionDisclaimer}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 14 }}>
                {chatLog.map((message, index) => {
                  const isCompanion = message.sender === "companion";
                  const isUrgent = message.source === "urgent_safety";
                  if (!isCompanion) {
                    return (
                      <View
                        key={message.id}
                        style={{
                          maxWidth: "82%",
                          alignSelf: "flex-end",
                          paddingHorizontal: 16,
                          paddingVertical: 11,
                          borderRadius: 20,
                          borderBottomRightRadius: 6,
                          backgroundColor: colors.primary,
                        }}
                      >
                        <Text style={{ color: colors.buttonText, fontSize: 15, lineHeight: 22, fontFamily: fonts.body }}>{message.text}</Text>
                      </View>
                    );
                  }
                  // Avatar only on the first of consecutive assistant messages.
                  const showAvatar = index === 0 || chatLog[index - 1].sender !== "companion";
                  return (
                    <View key={message.id} className="flex-row items-end" style={{ gap: 8 }}>
                      <View style={{ width: 28 }}>{showAvatar ? avatar(28) : null}</View>
                      <View
                        style={{
                          flexShrink: 1,
                          maxWidth: "86%",
                          paddingHorizontal: 16,
                          paddingTop: 12,
                          paddingBottom: 10,
                          borderRadius: 20,
                          borderBottomLeftRadius: 6,
                          backgroundColor: isUrgent ? colors.dangerLight : colors.surface,
                          borderWidth: isUrgent ? 1 : 0,
                          borderColor: colors.danger,
                        }}
                      >
                        {isUrgent || message.personalized ? (
                          <View className="mb-1.5 flex-row items-center" style={{ gap: 5 }}>
                            <Ionicons
                              name={isUrgent ? "warning-outline" : "calendar-outline"}
                              size={14}
                              color={isUrgent ? colors.danger : colors.primary}
                            />
                            <Text style={{ color: isUrgent ? colors.danger : colors.primary, fontSize: 12.5, fontWeight: "700", fontFamily: fonts.body }}>
                              {isUrgent ? "Please get care soon" : "Based on your logs"}
                            </Text>
                          </View>
                        ) : null}
                        <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 22, fontFamily: fonts.body }}>{message.text}</Text>
                        {isUrgent && message.disclaimer ? (
                          <Text style={{ color: colors.mutedText, fontSize: 12.5, lineHeight: 17, marginTop: 8, fontFamily: fonts.body }}>
                            {message.disclaimer}
                          </Text>
                        ) : null}
                        <TouchableOpacity
                          onPress={() => handleListen(message)}
                          activeOpacity={0.7}
                          disabled={synthesizingMessageId === message.id}
                          accessibilityRole="button"
                          accessibilityLabel={playingMessageId === message.id ? "Pause" : "Listen to this reply"}
                          hitSlop={8}
                          className="flex-row items-center self-start"
                          style={{ gap: 4, marginTop: 8 }}
                        >
                          {synthesizingMessageId === message.id ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : (
                            <Ionicons
                              name={playingMessageId === message.id ? "pause-circle-outline" : "volume-high-outline"}
                              size={17}
                              color={colors.mutedText}
                            />
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
                {isCompanionTyping ? (
                  <View className="flex-row items-end" style={{ gap: 8 }}>
                    <View style={{ width: 28 }}>{lastMessage?.sender === "companion" ? null : avatar(28)}</View>
                    <TypingDots />
                  </View>
                ) : null}
              </View>
            )}
          </ScrollView>

          {/* Quick replies from the latest answer, one tap to send */}
          {quickReplies.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4, gap: 8 }}
            >
              {quickReplies.map((question) => (
                <TouchableOpacity
                  key={question}
                  activeOpacity={0.8}
                  onPress={() => handleTriggerConversation(question)}
                  accessibilityRole="button"
                  style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.background }}
                >
                  <Text numberOfLines={1} style={{ color: colors.primary, fontSize: 13.5, fontWeight: "700", fontFamily: fonts.body }}>
                    {question}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}

          {/* Composer: input pill with mic inside; round button sends, or opens voice chat while empty */}
          <View className="flex-row items-end px-4 pt-2" style={{ gap: 8, paddingBottom: 8 }}>
            <View
              className="flex-1 flex-row items-center"
              style={{
                minHeight: 48,
                borderRadius: 24,
                paddingLeft: 18,
                paddingRight: 6,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: isRecording ? colors.danger : colors.border,
              }}
            >
              <TextInput
                placeholder={isRecording ? "Listening…" : isTranscribing ? "Transcribing…" : "Ask Nura anything"}
                placeholderTextColor={colors.mutedText}
                value={typedQuestion}
                onChangeText={setTypedQuestion}
                onSubmitEditing={() => handleTriggerConversation()}
                maxLength={500}
                multiline
                returnKeyType="send"
                submitBehavior="submit"
                editable={!isRecording && !isTranscribing}
                className="flex-1 outline-none"
                style={{ color: colors.foreground, fontSize: 15, fontFamily: fonts.body, paddingVertical: 12, maxHeight: 120 }}
              />
              <TouchableOpacity
                disabled={isTranscribing}
                onPress={handleMicPress}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={isTranscribing ? "Transcribing" : isRecording ? "Stop recording" : "Dictate your question"}
                hitSlop={6}
                className="items-center justify-center rounded-full"
                style={{ width: 36, height: 36, backgroundColor: isRecording ? colors.danger : "transparent" }}
              >
                {isTranscribing ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name={isRecording ? "stop" : "mic-outline"} size={20} color={isRecording ? "#FFFFFF" : colors.mutedText} />
                )}
              </TouchableOpacity>
            </View>
            {canSend || typedQuestion.trim() ? (
              <TouchableOpacity
                disabled={!canSend}
                onPress={() => handleTriggerConversation()}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Send"
                className="items-center justify-center rounded-full"
                style={{ width: 48, height: 48, backgroundColor: canSend ? colors.primary : colors.primaryLight }}
              >
                <Ionicons name="arrow-up" size={22} color={canSend ? colors.buttonText : colors.primary} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setVoiceMode(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Talk with Nura"
                className="items-center justify-center rounded-full"
                style={{ width: 48, height: 48, backgroundColor: colors.primary }}
              >
                <Ionicons name="headset" size={21} color={colors.buttonText} />
              </TouchableOpacity>
            )}
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
