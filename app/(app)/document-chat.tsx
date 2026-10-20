import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInUp, FadeOut } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChatComposer } from "../../components/chat/ChatComposer";
import { ChatSkeleton } from "../../components/chat/ChatSkeleton";
import { ChatVoiceLayer } from "../../components/chat/ChatVoiceLayer";
import { DocumentAssistantMark, DocumentChatBubble } from "../../components/chat/DocumentChatBubble";
import { SuggestionChips } from "../../components/chat/SuggestionChips";
import { TypingRow } from "../../components/chat/TypingRow";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { HeaderIconButton } from "../../components/ScreenHeader";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import { NuraAvatar } from "../../components/NuraAvatar";
import { useTheme } from "../../components/theme";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { useVoiceChat } from "../../hooks/useVoiceChat";
import { alert } from "../../lib/alert";
import {
  documentApi,
  getFriendlyErrorMessage,
  isFeatureLockedError,
  isNetworkError,
  type DocumentChatMessage,
} from "../../lib/api";
import { isAiConsentRequired } from "../../lib/qaFallback";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Icon } from "../../components/Icon";
import { motion } from "../../components/motion";

/** One-tap questions: about the document opened from Documents, or general ones. */
function suggestionsFor(docTitle: string | null) {
  if (docTitle) {
    return [
      `Summarize my "${docTitle}" in simple words`,
      `Is anything unusual in my "${docTitle}"?`,
      `What should I ask my doctor about "${docTitle}"?`,
    ];
  }
  return ["Summarize my latest report", "Explain my lab results simply", "What should I ask my doctor?"];
}

export default function DocumentChatScreen() {
  useSecureScreen("document-chat");
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  // Opened from a document's "Ask AI": the chat covers all your documents,
  // so the title is used to word the suggested questions.
  const { docTitle } = useLocalSearchParams<{ docTitle?: string }>();
  const [contextTitle, setContextTitle] = useState<string | null>(docTitle?.trim() ? docTitle.trim() : null);
  // Only messages added after the history loads animate in.
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const [sentThisVisit, setSentThisVisit] = useState(false);

  const [messages, setMessages] = useState<DocumentChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyOffline, setHistoryOffline] = useState(false);
  const [typedMessage, setTypedMessage] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  // One send at a time, even on a double tap before the state above re-renders.
  const replyingRef = useRef(false);
  const mountedRef = useRef(true);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const { hasAccess, isLoading: subscriptionLoading, refresh: refreshSubscriptionAccess } =
    useSubscriptionAccess();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // This whole screen is the premium feature — show the paywall the moment
  // it's clear the user can't use it, not after they've typed and sent a
  // message. Waits for subscriptionLoading to resolve first so a locked
  // user doesn't see the chat UI flash before the paywall takes over.
  useEffect(() => {
    if (!subscriptionLoading && !hasAccess("document_chat")) {
      setPaywallVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionLoading]);

  const loadHistory = useCallback(() => {
    setLoadingHistory(true);
    setHistoryError(null);
    documentApi
      .getChatHistory()
      .then((result) => {
        if (!mountedRef.current) return;
        setMessages(result.messages);
        setHistoryCount(result.messages.length);
      })
      .catch((error) => {
        // Shown as an error with Retry: an empty chat would look like the history was deleted.
        if (!mountedRef.current) return;
        setHistoryError(getFriendlyErrorMessage(error));
        setHistoryOffline(isNetworkError(error));
      })
      .finally(() => {
        if (mountedRef.current) setLoadingHistory(false);
      });
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const sendRef = useRef<(text: string) => void>(() => {});
  const voice = useVoiceChat({
    busy: isReplying,
    onVoiceTurn: (transcript) => sendRef.current(transcript),
    onDictation: (transcript) => setTypedMessage((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript)),
  });
  const { mic, setVoiceMode, captionHeard, replyAloud, isVoiceModeOn, language } = voice;

  async function handleSend(overrideText?: string) {
    const text = (overrideText ?? typedMessage).trim();
    if (!text || replyingRef.current || loadingHistory || historyError) return;
    if (!hasAccess("document_chat")) {
      setPaywallVisible(true);
      return;
    }

    replyingRef.current = true;
    setTypedMessage("");
    setIsReplying(true);
    setSentThisVisit(true);

    const optimisticId = `pending_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { _id: optimisticId, createdAt: new Date().toISOString(), role: "user", text, userId: "" },
    ]);
    captionHeard(text);

    try {
      const result = await documentApi.sendChatMessage(text, language);
      if (!mountedRef.current) return;
      setMessages((prev) => [
        ...prev.filter((m) => m._id !== optimisticId),
        result.userMessage,
        result.assistantMessage,
      ]);
      // Only if voice mode is still on: End may have been tapped while this was in flight.
      replyAloud(result.assistantMessage._id, text, result.assistantMessage.text);
    } catch (error) {
      if (!mountedRef.current) return;
      setMessages((prev) => prev.filter((m) => m._id !== optimisticId));
      setTypedMessage(text);
      if (isFeatureLockedError(error)) {
        setVoiceMode(false);
        setPaywallVisible(true);
      } else if (isAiConsentRequired(error)) {
        // The voice overlay can't link anywhere, so leave it for the alert.
        setVoiceMode(false);
        alert("AI features are off", "Turn on AI features in Data privacy & security to ask about your documents.", [
          { style: "cancel", text: "Not now" },
          { text: "Open settings", onPress: () => router.push("/(app)/privacy") },
        ]);
      } else if (isVoiceModeOn()) {
        // The overlay is a full-screen Modal: say it there instead of an alert behind it.
        replyAloud(optimisticId, text, getFriendlyErrorMessage(error), false);
      } else {
        alert("Message failed", getFriendlyErrorMessage(error));
      }
    } finally {
      replyingRef.current = false;
      if (mountedRef.current) setIsReplying(false);
    }
  }
  sendRef.current = (text) => void handleSend(text);

  const suggestions = useMemo(() => suggestionsFor(contextTitle), [contextTitle]);
  const historyReady = !loadingHistory && !historyError;
  const showSuggestions = historyReady && !sentThisVisit && !isReplying && !typedMessage.trim() && (contextTitle !== null || messages.length === 0);
  const canSend = !!typedMessage.trim() && !isReplying && historyReady;

  // One style object for every reply: a new one each render re-parses all their Markdown.
  const markdownStyle = useMemo(
    () => ({
      body: { color: colors.foreground, fontFamily: fonts.body, fontSize: 15, lineHeight: 23, margin: 0 },
      heading1: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 17, marginBottom: 4 },
      heading2: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 16, marginTop: 8, marginBottom: 3 },
      heading3: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 15, marginTop: 6, marginBottom: 3 },
      strong: { fontFamily: fonts.heading },
      bullet_list: { marginBottom: 4 },
      ordered_list: { marginBottom: 4 },
      list_item: { marginBottom: 2 },
      paragraph: { marginTop: 0, marginBottom: 6 },
    }),
    [colors.foreground, fonts.body, fonts.heading],
  );

  // Newest first for the inverted list, so it opens at the latest message
  // and stays there as replies arrive, with no scroll-to-end timers.
  const thread = useMemo(() => [...messages].reverse(), [messages]);

  const renderMessage = ({ item, index }: { item: DocumentChatMessage; index: number }) => {
    // `thread` is newest first: the message before this one is index + 1.
    const previous = thread[index + 1];
    const position = messages.length - 1 - index;
    return (
      <DocumentChatBubble
        message={item}
        showDay={!previous || new Date(previous.createdAt).toDateString() !== new Date(item.createdAt).toDateString()}
        // History doesn't animate; new turns do. The confirmed copy of a sent
        // message replaces its optimistic one, so it doesn't re-animate.
        animate={historyCount !== null && position >= historyCount && (item.role === "assistant" || item._id.startsWith("pending_"))}
        playing={voice.playingId === item._id}
        preparing={voice.preparingId === item._id}
        markdownStyle={markdownStyle}
        onListen={voice.toggleListen}
      />
    );
  };

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          behavior="padding"
          className="flex-1"
          keyboardVerticalOffset={8}
        >
          {/* Header */}
          <View className="flex-row items-center px-6 pt-3 pb-2" style={{ gap: 12 }}>
            <HeaderIconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => router.back()} />
            <NuraAvatar size={40} />
            <View className="flex-1" style={{ minWidth: 0 }}>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
                style={{ color: colors.foreground, fontSize: 17, fontWeight: "800", fontFamily: fonts.heading }}
              >
                Document Assistant
              </Text>
              <TouchableOpacity
                onPress={voice.openLanguagePicker}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Change language, currently ${voice.selectedLanguage.label}`}
                hitSlop={6}
                className="flex-row items-center self-start"
                style={{ gap: 3, marginTop: 1 }}
              >
                <Icon set="ion" name="language-outline" size={13} color={colors.mutedText} />
                <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, flexShrink: 1 }}>
                  {voice.selectedLanguage.label}
                </Text>
                <Icon set="ion" name="chevron-down" size={13} color={colors.mutedText} />
              </TouchableOpacity>
            </View>
            <HeaderIconButton
              icon="headset-outline"
              accessibilityLabel={voice.voiceMode ? "Turn off voice mode" : "Talk about your reports"}
              active={voice.voiceMode}
              onPress={() => setVoiceMode(!voice.voiceMode)}
            />
          </View>

          {/* Document chip: what the chat is about */}
          <View className="px-6 pb-2 pt-1 flex-row">
            <Animated.View
              key={contextTitle ?? "all"}
              entering={FadeIn.duration(motion.duration.base)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                maxWidth: "100%",
                height: 36,
                paddingLeft: 12,
                paddingRight: contextTitle ? 4 : 14,
                borderRadius: 18,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Icon set="ion" name={contextTitle ? "document-text" : "documents-outline"} size={15} color={contextTitle ? colors.primary : colors.mutedText} />
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ flexShrink: 1, fontSize: 13, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                {contextTitle ?? "All your documents"}
              </Text>
              {contextTitle ? (
                <TouchableOpacity
                  onPress={() => setContextTitle(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Ask about all documents instead"
                  hitSlop={10}
                  style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSoft }}
                >
                  <Icon set="ion" name="close" size={14} color={colors.mutedText} />
                </TouchableOpacity>
              ) : null}
            </Animated.View>
          </View>

          <LoadingErrorState
            loading={loadingHistory && messages.length === 0}
            error={historyError}
            offline={historyOffline}
            onRetry={loadHistory}
            errorTitle="Couldn't load your chat"
            skeleton={
              <View className="flex-1" style={{ paddingHorizontal: 24, paddingTop: 8 }}>
                <ChatSkeleton />
              </View>
            }
          >
            {messages.length === 0 && !isReplying ? (
              <View className="flex-1">
                <Animated.View
                  entering={FadeInUp.duration(motion.duration.base)}
                  style={{ alignItems: "center", paddingHorizontal: 36, paddingTop: 32, paddingBottom: 8 }}
                >
                  <NuraAvatar size={64} />
                  <Text style={{ marginTop: 14, fontSize: 18, fontWeight: "800", textAlign: "center", color: colors.foreground, fontFamily: fonts.heading }}>
                    Ask about your reports
                  </Text>
                  <Text style={{ marginTop: 6, fontSize: 14, lineHeight: 20, textAlign: "center", color: colors.mutedText, fontFamily: fonts.body }}>
                    I read the documents you upload and explain them in plain words. I can make mistakes, so check anything important with your doctor.
                  </Text>
                </Animated.View>
              </View>
            ) : (
              <FlatList
                inverted
                data={thread}
                keyExtractor={(message) => message._id}
                renderItem={renderMessage}
                // The list is inverted, so its header sits under the newest message.
                ListHeaderComponent={
                  isReplying ? (
                    <Animated.View entering={FadeIn.duration(motion.duration.base)} exiting={FadeOut.duration(motion.duration.fast)}>
                      <TypingRow avatar={<DocumentAssistantMark />} />
                    </Animated.View>
                  ) : null
                }
                ListHeaderComponentStyle={{ marginTop: 14 }}
                ItemSeparatorComponent={MessageGap}
                showsVerticalScrollIndicator={false}
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 8 }}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
              />
            )}
          </LoadingErrorState>

          {/* Suggested questions */}
          {showSuggestions ? (
            <Animated.View entering={FadeInUp.duration(motion.duration.base)} exiting={FadeOut.duration(motion.duration.fast)}>
              <SuggestionChips questions={suggestions} onPick={(question) => void handleSend(question)} variant="soft" contentContainerStyle={{ paddingBottom: 8 }} />
            </Animated.View>
          ) : null}

          {/* Composer — same as Nura AI chat */}
          <ChatComposer
            value={typedMessage}
            onChangeText={setTypedMessage}
            onSend={() => void handleSend()}
            canSend={canSend}
            sending={isReplying}
            placeholder={contextTitle ? `Ask about "${contextTitle}"` : "Ask about your documents"}
            maxLength={1000}
            micLabel="Speak your question"
            isRecording={mic.isRecording}
            isTranscribing={mic.isTranscribing}
            onMicPress={mic.handleMicPress}
            style={{ backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.track }}
          />
        </KeyboardAvoidingView>

        <ChatVoiceLayer voice={voice} part="languages" />
      </SafeAreaView>

      <ChatVoiceLayer voice={voice} part="overlay" />

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        featureKey="document_chat"
        onUnlocked={refreshSubscriptionAccess}
      />
    </>
  );
}

function MessageGap() {
  return <View style={{ height: 14 }} />;
}
