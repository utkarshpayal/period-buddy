import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-context";
import { ChatComposer } from "../../components/chat/ChatComposer";
import { AiUsageNote } from "../../components/qa/AiUsageNote";
import { ChatSkeleton } from "../../components/chat/ChatSkeleton";
import { ChatVoiceLayer } from "../../components/chat/ChatVoiceLayer";
import { SuggestionChips } from "../../components/chat/SuggestionChips";
import { TypingRow } from "../../components/chat/TypingRow";
import { NuraAvatar } from "../../components/NuraAvatar";
import { QaMessageBubble } from "../../components/qa/QaMessageBubble";
import { QaWelcome } from "../../components/qa/QaWelcome";
import { HeaderIconButton } from "../../components/ScreenHeader";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import { useTheme } from "../../components/theme";
import { useQaConversation, type ChatMessage, type QaVoiceBridge } from "../../hooks/useQaConversation";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { useVoiceChat } from "../../hooks/useVoiceChat";
import { getChatTopic, isTopicLocked } from "../../lib/chatTopics";
import { DEFAULT_SUGGESTED_QUESTIONS } from "../../lib/qaFallback";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Icon } from "../../components/Icon";

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
  const { user } = useAuth();
  const [typedQuestion, setTypedQuestion] = useState("");
  const [paywallVisible, setPaywallVisible] = useState(false);
  const { refresh: refreshSubscriptionAccess } = useSubscriptionAccess();

  // A topic picked on the Nura AI home (?topic=) opens the chat already
  // scoped to it — no form, just that topic's starter questions.
  const presetTopic = sessionIdParam ? undefined : getChatTopic(topicParam);

  // useVoiceChat needs the conversation's busy flag, and the conversation
  // needs voice mode, so the conversation reaches voice through this ref.
  const voiceBridge = useRef<QaVoiceBridge | null>(null);
  const conversation = useQaConversation({
    sessionIdParam,
    initialTopicId: presetTopic && !isTopicLocked(presetTopic, user?.dateOfBirth) ? presetTopic.id : null,
    voice: voiceBridge,
    onPaywall: () => setPaywallVisible(true),
  });
  const { chatLog, isCompanionTyping, isLoadingSession, activeTopicId, setActiveTopicId, sendQuestion, sendVoiceTurn, retry } = conversation;

  const voice = useVoiceChat({
    initialVoiceMode: voiceModeParam === "1",
    busy: isCompanionTyping,
    onVoiceTurn: sendVoiceTurn,
    onDictation: (transcript) => setTypedQuestion((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript)),
  });
  const { isVoiceModeOn, getLanguage, setVoiceMode, captionHeard, replyAloud } = voice;
  useEffect(() => {
    voiceBridge.current = { isVoiceModeOn, getLanguage, setVoiceMode, captionHeard, replyAloud };
  }, [isVoiceModeOn, getLanguage, setVoiceMode, captionHeard, replyAloud]);

  const handleSend = useCallback(
    (overrideText?: string) => {
      const sent = sendQuestion(overrideText ?? typedQuestion);
      if (sent && overrideText === undefined) setTypedQuestion("");
    },
    [sendQuestion, typedQuestion],
  );

  // ?q= from the Wellness hub's question box: ask it straight away, once.
  const askedParamQuestion = useRef(false);
  useEffect(() => {
    if (askedParamQuestion.current || sessionIdParam || !questionParam?.trim()) return;
    askedParamQuestion.current = true;
    sendQuestion(questionParam);
  }, [questionParam, sendQuestion, sessionIdParam]);

  const openPrivacy = useCallback(() => router.push("/(app)/privacy"), [router]);
  const toggleTopic = useCallback(
    (topicId: NonNullable<typeof activeTopicId>) => setActiveTopicId((prev) => (prev === topicId ? null : topicId)),
    [setActiveTopicId],
  );

  // Newest first for the inverted list, so it opens at the latest message
  // and stays there as replies arrive, with no scroll-to-end timers.
  const thread = useMemo(() => [...chatLog].reverse(), [chatLog]);

  // Bare entry (no voice, no resumed session, no explicit "new chat") — send
  // it to the chat list first instead of dropping straight into a blank
  // chat/topic-picker. All hooks above still run unconditionally every
  // render; only the JSX branches here.
  if (!voiceModeParam && !sessionIdParam && !newChatParam) {
    return <Redirect href="/(app)/qa-history" />;
  }

  // "general" (the "Other" topic tile) is deliberately unscoped, same as
  // picking no topic — only a real topic id should show as "focused".
  const activeTopic = activeTopicId && activeTopicId !== "general" ? getChatTopic(activeTopicId) : undefined;
  // Flo-style assistant: a welcome screen with question cards and topics
  // until the first real exchange, then a clean thread with quick replies
  // pinned above the composer.
  const isWelcome = !isLoadingSession && chatLog.length === 1 && chatLog[0].sender === "companion" && !isCompanionTyping;
  const lastMessage = chatLog[chatLog.length - 1];
  // Every answer uses one of today's messages: re-read the allowance after each.
  const answerCount = chatLog.filter((m) => m.sender === "companion").length;
  const quickReplies =
    !isWelcome && !isCompanionTyping && lastMessage?.sender === "companion" ? (lastMessage.suggestedQuestions ?? []).slice(0, 3) : [];
  const starterQuestions = (
    activeTopic ? activeTopic.questions : chatLog[0]?.suggestedQuestions?.length ? chatLog[0].suggestedQuestions : DEFAULT_SUGGESTED_QUESTIONS
  ).slice(0, 4);
  const firstName = user?.firstName && user.firstName !== "Nura" ? user.firstName : "";
  // A resumed chat still loading would be split in two by a send now.
  const canSend = Boolean(typedQuestion.trim()) && !isCompanionTyping && !isLoadingSession;
  const { mic } = voice;

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => (
    <QaMessageBubble
      message={item}
      // `thread` is newest first, so the message before this one is index + 1.
      showAvatar={thread[index + 1]?.sender !== "companion"}
      playing={voice.playingId === item.id}
      preparing={voice.preparingId === item.id}
      onListen={voice.toggleListen}
      onRetry={retry}
      onOpenPrivacy={openPrivacy}
    />
  );

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          behavior="padding"
          className="flex-1"
          keyboardVerticalOffset={8}
        >
          {/* Header: back · centred title (tap the language to change it) · history */}
          <View className="flex-row items-center px-6 pt-3 pb-2" style={{ gap: 12 }}>
            <HeaderIconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => router.back()} />
            <View className="flex-1 items-center" style={{ minWidth: 0 }}>
              <Text accessibilityRole="header" numberOfLines={1} style={{ color: colors.foreground, fontSize: 16, fontWeight: "800", fontFamily: fonts.heading }}>
                {activeTopic ? activeTopic.label : "Nura AI"}
              </Text>
              <TouchableOpacity
                onPress={voice.openLanguagePicker}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Change language, currently ${voice.selectedLanguage.label}`}
                hitSlop={8}
                className="flex-row items-center"
                style={{ gap: 3, marginTop: 1 }}
              >
                <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 12.5, fontFamily: fonts.body }}>
                  {voice.selectedLanguage.label}
                </Text>
                <Icon set="ion" name="chevron-down" size={12} color={colors.mutedText} />
              </TouchableOpacity>
            </View>
            <HeaderIconButton icon="time-outline" accessibilityLabel="Chat history" onPress={() => router.push("/(app)/qa-history")} />
          </View>

          {isLoadingSession || isWelcome ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              className="flex-1"
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, flexGrow: 1 }}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
            >
              {isLoadingSession ? (
                <ChatSkeleton />
              ) : (
                <QaWelcome
                  firstName={firstName}
                  activeTopic={activeTopic}
                  activeTopicId={activeTopicId}
                  starterQuestions={starterQuestions}
                  showTopics={!presetTopic}
                  dateOfBirth={user?.dateOfBirth}
                  onAsk={handleSend}
                  onToggleTopic={toggleTopic}
                />
              )}
            </ScrollView>
          ) : (
            <FlatList
              inverted
              data={thread}
              keyExtractor={(message) => message.id}
              renderItem={renderMessage}
              // The list is inverted, so its header sits under the newest message.
              ListHeaderComponent={isCompanionTyping ? <TypingRow avatar={lastMessage?.sender === "companion" ? null : <NuraAvatar size={28} />} /> : null}
              ListHeaderComponentStyle={{ marginTop: 14 }}
              ItemSeparatorComponent={MessageGap}
              showsVerticalScrollIndicator={false}
              className="flex-1"
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
            />
          )}

          {/* Quick replies from the latest answer, one tap to send */}
          {quickReplies.length ? (
            <SuggestionChips questions={quickReplies} onPick={handleSend} variant="outline" contentContainerStyle={{ paddingVertical: 4 }} />
          ) : null}

          {/* Composer: input pill with mic inside; round button sends, or opens voice chat while empty */}
          <ChatComposer
            value={typedQuestion}
            onChangeText={setTypedQuestion}
            onSend={() => handleSend()}
            canSend={canSend}
            placeholder="Ask Nura anything"
            maxLength={500}
            micLabel="Dictate your question"
            isRecording={mic.isRecording}
            isTranscribing={mic.isTranscribing}
            onMicPress={mic.handleMicPress}
            idleAction={{ icon: "headset", label: "Talk with Nura", onPress: () => setVoiceMode(true) }}
          />
          <AiUsageNote refreshKey={answerCount} style={{ paddingBottom: 6 }} />
        </KeyboardAvoidingView>

        <ChatVoiceLayer voice={voice} part="languages" />
      </SafeAreaView>

      <ChatVoiceLayer voice={voice} part="overlay" />

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        featureKey="ai_assistant"
        onUnlocked={refreshSubscriptionAccess}
      />
    </>
  );
}

function MessageGap() {
  return <View style={{ height: 14 }} />;
}
