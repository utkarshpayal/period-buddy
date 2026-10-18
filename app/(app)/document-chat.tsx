import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import Animated, { FadeIn, FadeInUp, FadeOut, LinearTransition } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { LanguagePickerSheet } from "../../components/LanguagePickerSheet";
import { SkeletonBlock } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { VoiceModeOverlay, type VoiceStatus } from "../../components/VoiceModeOverlay";
import { useVoiceInput } from "../../hooks/useVoiceInput";
import { alert } from "../../lib/alert";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import {
  documentApi,
  isFeatureLockedError,
  speechApi,
  type DocumentChatMessage,
  type Language,
  type LanguageCode,
} from "../../lib/api";
import { useSpokenReply } from "../../hooks/useSpokenReply";
import { isMeaningfulTranscript } from "../../lib/voiceSpeech";
import { SUPPORTED_LANGUAGES } from "../../lib/languages";
import { HeaderIconButton } from "../../components/ScreenHeader";
import { TypingDots } from "../../components/TypingDots";
import { getShadow } from "../../components/ui-tokens";
import { useSecureScreen } from "../../lib/screenPrivacy";

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dayLabel(dateString: string) {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

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
  const scrollViewRef = useRef<ScrollView>(null);
  // Opened from a document's "Ask AI": the chat covers all your documents,
  // so the title is used to word the suggested questions.
  const { docTitle } = useLocalSearchParams<{ docTitle?: string }>();
  const [contextTitle, setContextTitle] = useState<string | null>(docTitle?.trim() ? docTitle.trim() : null);
  // Only messages added after the history loads animate in.
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const [sentThisVisit, setSentThisVisit] = useState(false);

  const [messages, setMessages] = useState<DocumentChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [typedMessage, setTypedMessage] = useState("");
  const [isReplying, setIsReplying] = useState(false);

  const [language, setLanguage] = useState<LanguageCode>("en-IN");
  const [languages, setLanguages] = useState<Language[]>(SUPPORTED_LANGUAGES);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  // Live captions in the voice overlay: the last thing heard and the answer.
  const [voiceCaption, setVoiceCaption] = useState<{ heard: string; reply: string }>({ heard: "", reply: "" });
  const { speak, stop: stopSpeaking, playingId: playingMessageId, preparingId: synthesizingMessageId } = useSpokenReply(language);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const { hasAccess, isLoading: subscriptionLoading, refresh: refreshSubscriptionAccess } =
    useSubscriptionAccess();

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

  const { handleMicPress, isRecording, isTranscribing, level, listeningPaused, voiceError } = useVoiceInput({
    language,
    voiceMode,
    onTranscript: (transcript) => {
      if (voiceMode) {
        // Background noise transcribed as "." or "hmm": just listen again.
        if (!isMeaningfulTranscript(transcript)) return;
        handleSend(transcript);
      } else {
        setTypedMessage((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      }
    },
  });

  const selectedLanguage = languages.find((l) => l.code === language) ?? SUPPORTED_LANGUAGES[0];
  // Leaving voice mode cuts the reply off instead of letting it talk on.
  useEffect(() => {
    if (!voiceMode) stopSpeaking();
    setVoiceCaption({ heard: "", reply: "" });
  }, [voiceMode, stopSpeaking]);

  /** The orb in voice mode: interrupts a reply that's being spoken (barge-in), else the mic as usual. */
  const handleVoiceOrbPress = useCallback(() => {
    if (playingMessageId || synthesizingMessageId) stopSpeaking();
    handleMicPress();
  }, [handleMicPress, playingMessageId, stopSpeaking, synthesizingMessageId]);

  const isSpeakingReply = voiceMode && playingMessageId !== null;
  // The reply's audio is still being made. Counts as busy: otherwise the mic
  // re-arms in this gap, records the reply being spoken and sends it back as
  // if the user had said it.
  const isPreparingReply = voiceMode && synthesizingMessageId !== null;

  // Google Assistant style loop: whenever voice mode is idle, auto-arm the mic again.
  // Paused while a voice-mode failure is showing (voiceError) so the user has
  // time to actually read it before the mic starts listening again.
  useEffect(() => {
    if (!voiceMode || isRecording || isTranscribing || isReplying || isPreparingReply || isSpeakingReply || voiceError || listeningPaused) return;
    const timer = setTimeout(() => {
      handleMicPress();
    }, 450);
    return () => clearTimeout(timer);
  }, [voiceMode, isRecording, isTranscribing, isReplying, isPreparingReply, isSpeakingReply, voiceError, handleMicPress, listeningPaused]);

  const voiceStatus: VoiceStatus = isTranscribing
    ? "processing"
    : isRecording
      ? "listening"
      : isReplying || isPreparingReply
        ? "thinking"
        : isSpeakingReply
          ? "speaking"
          : "idle";

  useEffect(() => {
    let isMounted = true;
    documentApi
      .getChatHistory()
      .then((result) => {
        if (isMounted) {
          setMessages(result.messages);
          setHistoryCount(result.messages.length);
        }
      })
      .catch((error) => {
        console.log("Document chat history failed to load:", error);
        if (isMounted) setHistoryCount(0);
      })
      .finally(() => {
        if (isMounted) setLoadingHistory(false);
      });
    speechApi
      .getLanguages()
      .then((result) => {
        if (isMounted && result.languages?.length) setLanguages(result.languages);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleListen(message: DocumentChatMessage) {
    if (playingMessageId === message._id || synthesizingMessageId === message._id) {
      stopSpeaking();
      return;
    }
    try {
      await speak(message._id, message.text);
    } catch (error) {
      // Voice mode is a full-screen Modal; a second native alert over it is unreliable.
      if (!voiceMode) alert("Couldn't play audio", error instanceof Error ? error.message : "Please try again.");
    }
  }

  function scrollToEnd() {
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  }

  async function handleSend(overrideText?: string) {
    const text = (overrideText ?? typedMessage).trim();
    if (!text || isReplying) return;
    if (!hasAccess("document_chat")) {
      setPaywallVisible(true);
      return;
    }

    setTypedMessage("");
    setIsReplying(true);
    setSentThisVisit(true);

    const optimisticId = `pending_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { _id: optimisticId, createdAt: new Date().toISOString(), role: "user", text, userId: "" },
    ]);
    scrollToEnd();
    if (voiceMode) setVoiceCaption({ heard: text, reply: "" });

    try {
      const result = await documentApi.sendChatMessage(text, language);
      setMessages((prev) => [
        ...prev.filter((m) => m._id !== optimisticId),
        result.userMessage,
        result.assistantMessage,
      ]);
      if (voiceMode) {
        setVoiceCaption({ heard: text, reply: result.assistantMessage.text });
        handleListen(result.assistantMessage);
      }
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m._id !== optimisticId));
      setTypedMessage(text);
      if (isFeatureLockedError(error)) {
        setVoiceMode(false);
        setPaywallVisible(true);
      } else if (voiceMode) {
        // The overlay is a full-screen Modal: say it there instead of an alert behind it.
        setVoiceCaption({ heard: text, reply: error instanceof Error ? error.message : "Sorry, that didn't go through." });
      } else {
        alert("Message failed", error instanceof Error ? error.message : "Please try again.");
      }
    } finally {
      setIsReplying(false);
      scrollToEnd();
    }
  }


  const suggestions = useMemo(() => suggestionsFor(contextTitle), [contextTitle]);
  const showSuggestions = !loadingHistory && !sentThisVisit && !isReplying && !typedMessage.trim() && (contextTitle !== null || messages.length === 0);
  const canSend = !!typedMessage.trim() && !isReplying;

  const markdownStyle = {
    body: { color: colors.foreground, fontFamily: fonts.body, fontSize: 15, lineHeight: 23, margin: 0 },
    heading1: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 17, marginBottom: 4 },
    heading2: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 16, marginTop: 8, marginBottom: 3 },
    heading3: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 15, marginTop: 6, marginBottom: 3 },
    strong: { fontFamily: fonts.heading },
    bullet_list: { marginBottom: 4 },
    ordered_list: { marginBottom: 4 },
    list_item: { marginBottom: 2 },
    paragraph: { marginTop: 0, marginBottom: 6 },
  };

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          {/* Header */}
          <View className="flex-row items-center px-6 pt-3 pb-2" style={{ gap: 12 }}>
            <HeaderIconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => router.back()} />
            <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight }}>
              <Ionicons name="sparkles" size={19} color={colors.primary} />
            </View>
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
                onPress={() => setLanguagePickerVisible(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Change language, currently ${selectedLanguage.label}`}
                hitSlop={6}
                className="flex-row items-center self-start"
                style={{ gap: 3, marginTop: 1 }}
              >
                <Ionicons name="language-outline" size={13} color={colors.mutedText} />
                <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, flexShrink: 1 }}>
                  {selectedLanguage.label}
                </Text>
                <Ionicons name="chevron-down" size={13} color={colors.mutedText} />
              </TouchableOpacity>
            </View>
            <HeaderIconButton
              icon="headset-outline"
              accessibilityLabel={voiceMode ? "Turn off voice mode" : "Talk about your reports"}
              active={voiceMode}
              onPress={() => setVoiceMode((prev) => !prev)}
            />
          </View>

          {/* Document chip: what the chat is about */}
          <View className="px-6 pb-2 pt-1 flex-row">
            <Animated.View
              key={contextTitle ?? "all"}
              entering={FadeIn.duration(200)}
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
              <Ionicons name={contextTitle ? "document-text" : "documents-outline"} size={15} color={contextTitle ? colors.primary : colors.mutedText} />
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ flexShrink: 1, fontSize: 13, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                {contextTitle ?? "All your documents"}
              </Text>
              {contextTitle ? (
                <TouchableOpacity
                  onPress={() => setContextTitle(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Ask about all documents instead"
                  hitSlop={6}
                  style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSoft }}
                >
                  <Ionicons name="close" size={14} color={colors.mutedText} />
                </TouchableOpacity>
              ) : null}
            </Animated.View>
          </View>

          <ScrollView
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 }}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            <View style={{ gap: 14 }}>
              {loadingHistory && messages.length === 0 ? (
                <>
                  <SkeletonBlock width="70%" height={64} radius={20} />
                  <SkeletonBlock width="55%" height={44} radius={20} style={{ alignSelf: "flex-end" }} />
                  <SkeletonBlock width="80%" height={84} radius={20} />
                </>
              ) : null}

              {!loadingHistory && messages.length === 0 ? (
                <Animated.View
                  entering={FadeInUp.duration(280)}
                  style={{ alignItems: "center", paddingHorizontal: 12, paddingTop: 24, paddingBottom: 8 }}
                >
                  <View style={{ width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight }}>
                    <Ionicons name="sparkles" size={28} color={colors.primary} />
                  </View>
                  <Text style={{ marginTop: 14, fontSize: 18, fontWeight: "800", textAlign: "center", color: colors.foreground, fontFamily: fonts.heading }}>
                    Ask about your reports
                  </Text>
                  <Text style={{ marginTop: 6, fontSize: 14, lineHeight: 20, textAlign: "center", color: colors.mutedText, fontFamily: fonts.body }}>
                    I read the documents you upload and explain them in plain words. I can make mistakes, so check anything important with your doctor.
                  </Text>
                </Animated.View>
              ) : null}

              {messages.map((message, index) => {
                const isAssistant = message.role === "assistant";
                const prev = messages[index - 1];
                const showDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
                // History doesn't animate; new turns do. The confirmed copy of
                // a sent message replaces its optimistic one, so it doesn't re-animate.
                const animate =
                  historyCount !== null && index >= historyCount && (isAssistant || message._id.startsWith("pending_"));
                return (
                  <React.Fragment key={message._id}>
                    {showDay ? (
                      <Text
                        style={{ alignSelf: "center", fontSize: 13, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body, marginTop: index === 0 ? 0 : 6 }}
                      >
                        {dayLabel(message.createdAt)}
                      </Text>
                    ) : null}
                    <Animated.View entering={animate ? FadeInUp.duration(260) : undefined} layout={LinearTransition.duration(200)}>
                      {isAssistant ? (
                        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "92%" }}>
                          <View style={{ width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight }}>
                            <Ionicons name="sparkles" size={14} color={colors.primary} />
                          </View>
                          <View
                            style={{
                              flexShrink: 1,
                              paddingHorizontal: 16,
                              paddingTop: 12,
                              paddingBottom: 10,
                              borderRadius: 20,
                              borderBottomLeftRadius: 6,
                              backgroundColor: colors.surface,
                              ...getShadow(colors, isDark),
                            }}
                          >
                            <Markdown style={markdownStyle}>{message.text}</Markdown>
                            <View className="flex-row items-center justify-between" style={{ marginTop: 6, gap: 12 }}>
                              <TouchableOpacity
                                onPress={() => handleListen(message)}
                                activeOpacity={0.7}
                                disabled={synthesizingMessageId === message._id}
                                accessibilityRole="button"
                                accessibilityLabel={playingMessageId === message._id ? "Pause" : "Listen to this reply"}
                                hitSlop={8}
                                className="flex-row items-center"
                                style={{ gap: 4, paddingVertical: 2, paddingHorizontal: 8, marginLeft: -8, borderRadius: 12, backgroundColor: playingMessageId === message._id ? colors.primaryLight : "transparent" }}
                              >
                                {synthesizingMessageId === message._id ? (
                                  <ActivityIndicator size="small" color={colors.primary} />
                                ) : (
                                  <Ionicons
                                    name={playingMessageId === message._id ? "pause" : "volume-high-outline"}
                                    size={16}
                                    color={colors.primary}
                                  />
                                )}
                                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primaryDark, fontFamily: fonts.body }}>
                                  {playingMessageId === message._id ? "Pause" : "Listen"}
                                </Text>
                              </TouchableOpacity>
                              <Text style={{ color: colors.mutedText, fontSize: 12, fontFamily: fonts.body }}>{formatTime(message.createdAt)}</Text>
                            </View>
                          </View>
                        </View>
                      ) : (
                        <View
                          style={{
                            maxWidth: "82%",
                            alignSelf: "flex-end",
                            paddingHorizontal: 16,
                            paddingTop: 11,
                            paddingBottom: 8,
                            borderRadius: 20,
                            borderBottomRightRadius: 6,
                            backgroundColor: colors.primary,
                          }}
                        >
                          <Text style={{ color: colors.buttonText, fontSize: 15, lineHeight: 22, fontFamily: fonts.body }}>{message.text}</Text>
                          <Text style={{ color: colors.buttonText, opacity: 0.75, fontSize: 12, textAlign: "right", marginTop: 4, fontFamily: fonts.body }}>
                            {message._id.startsWith("pending_") ? "Sending…" : formatTime(message.createdAt)}
                          </Text>
                        </View>
                      )}
                    </Animated.View>
                  </React.Fragment>
                );
              })}

              {isReplying ? (
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight }}>
                    <Ionicons name="sparkles" size={14} color={colors.primary} />
                  </View>
                  <TypingDots />
                </Animated.View>
              ) : null}
            </View>
          </ScrollView>

          {/* Suggested questions */}
          {showSuggestions ? (
            <Animated.View entering={FadeInUp.duration(220)} exiting={FadeOut.duration(150)}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}
              >
                {suggestions.map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion}
                    onPress={() => handleSend(suggestion)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Ask: ${suggestion}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      maxWidth: 280,
                      height: 38,
                      paddingHorizontal: 14,
                      borderRadius: 19,
                      backgroundColor: colors.primaryLight,
                    }}
                  >
                    <Ionicons name="sparkles-outline" size={14} color={colors.primaryDark} />
                    <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ flexShrink: 1, fontSize: 13, fontWeight: "700", color: colors.primaryDark, fontFamily: fonts.body }}>
                      {suggestion}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Animated.View>
          ) : null}

          {/* Composer — same as Nura AI chat */}
          <View
            className="flex-row items-end px-4 pt-2"
            style={{ gap: 8, paddingBottom: 8, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.track }}
          >
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
                placeholder={isRecording ? "Listening…" : isTranscribing ? "Transcribing…" : contextTitle ? `Ask about "${contextTitle}"` : "Ask about your documents"}
                placeholderTextColor={colors.mutedText}
                value={typedMessage}
                onChangeText={setTypedMessage}
                onSubmitEditing={() => handleSend()}
                maxLength={1000}
                multiline
                returnKeyType="send"
                submitBehavior="submit"
                editable={!isRecording && !isTranscribing}
                accessibilityLabel="Message"
                className="flex-1 outline-none"
                style={{ color: colors.foreground, fontSize: 15, fontFamily: fonts.body, paddingVertical: 12, maxHeight: 120 }}
              />
              <TouchableOpacity
                disabled={isTranscribing}
                onPress={handleMicPress}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={isTranscribing ? "Transcribing" : isRecording ? "Stop recording" : "Speak your question"}
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
            <TouchableOpacity
              disabled={!canSend}
              onPress={() => handleSend()}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !canSend }}
              className="items-center justify-center rounded-full"
              style={{ width: 48, height: 48, backgroundColor: canSend ? colors.primary : colors.primaryLight }}
            >
              {isReplying ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="arrow-up" size={22} color={canSend ? colors.buttonText : colors.primary} />
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
          onClose={() => setVoiceMode(false)}
          onMicPress={handleVoiceOrbPress}
          replyPreview={voiceCaption.reply}
          status={voiceStatus}
          transcriptPreview={voiceCaption.heard}
        />
      ) : null}

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        featureKey="document_chat"
        onUnlocked={refreshSubscriptionAccess}
      />
    </>
  );
}
