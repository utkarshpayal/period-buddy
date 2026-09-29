import { Ionicons } from "@expo/vector-icons";
import { type AudioPlayer, createAudioPlayer } from "expo-audio";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
import { resolveAudioUri } from "../../lib/audio";
import { SUPPORTED_LANGUAGES } from "../../lib/languages";
import { HeaderIconButton } from "../../components/ScreenHeader";
import { TypingDots } from "../../components/TypingDots";

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function DocumentChatScreen() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<DocumentChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [typedMessage, setTypedMessage] = useState("");
  const [isReplying, setIsReplying] = useState(false);

  const [language, setLanguage] = useState<LanguageCode>("en-IN");
  const [languages, setLanguages] = useState<Language[]>(SUPPORTED_LANGUAGES);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [synthesizingMessageId, setSynthesizingMessageId] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);
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

  const { handleMicPress, isRecording, isTranscribing, level, voiceError } = useVoiceInput({
    language,
    voiceMode,
    onTranscript: (transcript) => {
      if (voiceMode) {
        handleSend(transcript);
      } else {
        setTypedMessage((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      }
    },
  });

  const selectedLanguage = languages.find((l) => l.code === language) ?? SUPPORTED_LANGUAGES[0];
  const isSpeakingReply = voiceMode && playingMessageId !== null;

  // Google Assistant style loop: whenever voice mode is idle, auto-arm the mic again.
  // Paused while a voice-mode failure is showing (voiceError) so the user has
  // time to actually read it before the mic starts listening again.
  useEffect(() => {
    if (!voiceMode || isRecording || isTranscribing || isReplying || isSpeakingReply || voiceError) return;
    const timer = setTimeout(() => {
      handleMicPress();
    }, 450);
    return () => clearTimeout(timer);
  }, [voiceMode, isRecording, isTranscribing, isReplying, isSpeakingReply, voiceError, handleMicPress]);

  const voiceStatus: VoiceStatus = isTranscribing
    ? "processing"
    : isRecording
      ? "listening"
      : isReplying
        ? "thinking"
        : isSpeakingReply
          ? "speaking"
          : "idle";

  useEffect(() => {
    let isMounted = true;
    documentApi
      .getChatHistory()
      .then((result) => {
        if (isMounted) setMessages(result.messages);
      })
      .catch((error) => {
        console.log("Document chat history failed to load:", error);
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
      playerRef.current?.release();
    };
  }, []);

  async function handleListen(message: DocumentChatMessage) {
    if (playingMessageId === message._id) {
      playerRef.current?.pause();
      setPlayingMessageId(null);
      return;
    }

    playerRef.current?.pause();
    playerRef.current?.release();
    playerRef.current = null;

    setSynthesizingMessageId(message._id);
    try {
      const { audioBase64, audioCodec } = await speechApi.synthesize({ languageCode: language, text: message.text });
      const uri = await resolveAudioUri(audioBase64, audioCodec);
      const player = createAudioPlayer({ uri });
      playerRef.current = player;
      player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) {
          setPlayingMessageId((current) => (current === message._id ? null : current));
        }
      });
      player.play();
      setPlayingMessageId(message._id);
    } catch (error) {
      alert("Couldn't play audio", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSynthesizingMessageId(null);
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

    const optimisticId = `pending_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { _id: optimisticId, createdAt: new Date().toISOString(), role: "user", text, userId: "" },
    ]);
    scrollToEnd();

    try {
      const result = await documentApi.sendChatMessage(text, language);
      setMessages((prev) => [
        ...prev.filter((m) => m._id !== optimisticId),
        result.userMessage,
        result.assistantMessage,
      ]);
      if (voiceMode) {
        handleListen(result.assistantMessage);
      }
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m._id !== optimisticId));
      setTypedMessage(text);
      if (isFeatureLockedError(error)) {
        setPaywallVisible(true);
      } else {
        alert("Message failed", error instanceof Error ? error.message : "Please try again.");
      }
    } finally {
      setIsReplying(false);
      scrollToEnd();
    }
  }

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <View className="flex-row items-center px-6 pt-3 pb-2" style={{ gap: 12 }}>
            <HeaderIconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => router.back()} />
            <View className="flex-1" style={{ minWidth: 0 }}>
              <Text accessibilityRole="header" numberOfLines={1} style={{ color: colors.foreground, fontSize: 16, fontWeight: "800", fontFamily: fonts.heading }}>
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
                <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, flexShrink: 1 }}>
                  Ask about your reports · {selectedLanguage.label}
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

          <ScrollView
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}
            className="flex-1 px-5 pt-2"
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            <View className="gap-4">
              {loadingHistory && messages.length === 0 ? (
                <>
                  <SkeletonBlock width="70%" height={64} radius={16} />
                  <SkeletonBlock width="55%" height={44} radius={16} style={{ alignSelf: "flex-end" }} />
                  <SkeletonBlock width="80%" height={84} radius={16} />
                </>
              ) : null}
              {!loadingHistory && messages.length === 0 ? (
                <View
                  style={{ maxWidth: "85%", alignSelf: "flex-start", padding: 16, borderRadius: 20, borderBottomLeftRadius: 6, backgroundColor: colors.surface }}
                >
                  <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 22, fontFamily: fonts.body }}>
                    Hi! Upload a report in Documents, then ask me anything about it.
                  </Text>
                </View>
              ) : null}

              {messages.map((message) => {
                const isAssistant = message.role === "assistant";
                return (
                  <View key={message._id}>
                    {isAssistant ? (
                      <View
                        style={{
                          maxWidth: "85%",
                          alignSelf: "flex-start",
                          paddingHorizontal: 16,
                          paddingTop: 12,
                          paddingBottom: 10,
                          borderRadius: 20,
                          borderBottomLeftRadius: 6,
                          backgroundColor: colors.surface,
                        }}
                      >
                        <Markdown
                          style={{
                            body: { color: colors.foreground, fontFamily: fonts.body, fontSize: 15, lineHeight: 23, margin: 0 },
                            heading1: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 17, marginBottom: 4 },
                            heading2: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 16, marginTop: 8, marginBottom: 3 },
                            heading3: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 15, marginTop: 6, marginBottom: 3 },
                            strong: { fontFamily: fonts.heading },
                            bullet_list: { marginBottom: 4 },
                            ordered_list: { marginBottom: 4 },
                            list_item: { marginBottom: 2 },
                            paragraph: { marginTop: 0, marginBottom: 6 },
                          }}
                        >
                          {message.text}
                        </Markdown>
                        <View className="flex-row items-center justify-between" style={{ marginTop: 6 }}>
                          <TouchableOpacity
                            onPress={() => handleListen(message)}
                            activeOpacity={0.7}
                            disabled={synthesizingMessageId === message._id}
                            accessibilityRole="button"
                            accessibilityLabel={playingMessageId === message._id ? "Pause" : "Listen to this reply"}
                            hitSlop={8}
                          >
                            {synthesizingMessageId === message._id ? (
                              <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                              <Ionicons
                                name={playingMessageId === message._id ? "pause-circle-outline" : "volume-high-outline"}
                                size={17}
                                color={colors.primary}
                              />
                            )}
                          </TouchableOpacity>
                          <Text style={{ color: colors.mutedText, fontSize: 12, fontFamily: fonts.body }}>{formatTime(message.createdAt)}</Text>
                        </View>
                      </View>
                    ) : (
                      <View
                        style={{
                          maxWidth: "85%",
                          alignSelf: "flex-end",
                          paddingHorizontal: 16,
                          paddingTop: 12,
                          paddingBottom: 8,
                          borderRadius: 20,
                          borderBottomRightRadius: 6,
                          backgroundColor: colors.primary,
                        }}
                      >
                        <Text style={{ color: colors.buttonText, fontSize: 15, lineHeight: 22, fontFamily: fonts.body }}>{message.text}</Text>
                        <Text style={{ color: colors.buttonText, opacity: 0.75, fontSize: 12, textAlign: "right", marginTop: 4, fontFamily: fonts.body }}>
                          {formatTime(message.createdAt)}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}

              {isReplying && <TypingDots />}
            </View>
          </ScrollView>

          {/* Composer — same as Nura AI chat */}
          <View
            className="flex-row items-end px-4 pt-2"
            style={{ gap: 8, paddingBottom: 8, backgroundColor: colors.background }}
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
                placeholder={isRecording ? "Listening…" : isTranscribing ? "Transcribing…" : "Ask about your documents"}
                placeholderTextColor={colors.mutedText}
                value={typedMessage}
                onChangeText={setTypedMessage}
                onSubmitEditing={() => handleSend()}
                maxLength={1000}
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
              disabled={!typedMessage.trim() || isReplying}
              onPress={() => handleSend()}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Send"
              className="items-center justify-center rounded-full"
              style={{ width: 48, height: 48, backgroundColor: typedMessage.trim() && !isReplying ? colors.primary : colors.primaryLight }}
            >
              <Ionicons name="arrow-up" size={22} color={typedMessage.trim() && !isReplying ? colors.buttonText : colors.primary} />
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
          onMicPress={handleMicPress}
          status={voiceStatus}
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
