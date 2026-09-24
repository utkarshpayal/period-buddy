import { Feather } from "@expo/vector-icons";
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LanguagePickerSheet } from "../../components/LanguagePickerSheet";
import { SkeletonBlock } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getSoftTints } from "../../components/ui-tokens";
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

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function DocumentChatScreen() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const softTints = getSoftTints(colors);

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
          <View className="px-5 pt-6 pb-3 flex-row justify-between items-center gap-2">
            <View className="flex-row items-center gap-3 flex-1 min-w-0">
              <TouchableOpacity
                onPress={() => router.back()}
                activeOpacity={0.7}
                className="p-2.5 -ml-1 rounded-full border"
                style={{ backgroundColor: colors.surface, borderColor: colors.border }}
              >
                <Feather name="arrow-left" size={18} color={colors.foreground} />
              </TouchableOpacity>

              <View className="flex-1 min-w-0">
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  className="text-sm font-black tracking-tight"
                  style={{ color: colors.foreground, fontFamily: fonts.heading }}
                >
                  Document Assistant
                </Text>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  className="text-[10px] font-bold tracking-wider uppercase mt-0.5"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  Ask Buddy about this report
                </Text>
              </View>
            </View>

            <View className="flex-row items-center gap-1.5 flex-shrink-0">
              <TouchableOpacity
                onPress={() => setVoiceMode((prev) => !prev)}
                activeOpacity={0.7}
                className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-full border"
                style={{
                  backgroundColor: voiceMode ? colors.primary : softTints.pink,
                  borderColor: colors.border,
                }}
              >
                <Feather name="headphones" size={13} color={voiceMode ? colors.buttonText : colors.primary} />
                <Text
                  numberOfLines={1}
                  className="text-[10px] font-black tracking-wide"
                  style={{ color: voiceMode ? colors.buttonText : colors.primary, fontFamily: fonts.body }}
                >
                  Voice
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setLanguagePickerVisible(true)}
                activeOpacity={0.7}
                className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-full border"
                style={{ backgroundColor: softTints.pink, borderColor: colors.border, maxWidth: 92 }}
              >
                <Feather name="globe" size={13} color={colors.primary} />
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  className="text-[10px] font-black tracking-wide flex-shrink"
                  style={{ color: colors.primary, fontFamily: fonts.body }}
                >
                  {selectedLanguage.label}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {voiceMode ? (
            <View
              className="px-5 py-2 flex-row items-start gap-1.5"
              style={{ backgroundColor: softTints.pink }}
            >
              <Feather name="mic" size={11} color={colors.primary} style={{ marginTop: 1.5 }} />
              <Text className="text-[10px] font-bold flex-1 flex-shrink" style={{ color: colors.primary, fontFamily: fonts.body }}>
                Voice mode on — tap the mic, speak, and I&apos;ll reply out loud in {selectedLanguage.label}. Pause
              for 3 seconds and I&apos;ll send it automatically.
              </Text>
            </View>
          ) : null}

          <ScrollView
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}
            className="flex-1 px-5 pt-4"
            contentContainerStyle={{ paddingBottom: 72 }}
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
                  className="max-w-[90%] p-4 rounded-2xl self-start rounded-tl-none border"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                >
                  <Text className="text-[15px] font-medium leading-6" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    Hi! Upload a report, prescription, or bill from the Documents screen, then ask me anything about
                    it — dates, values, medications, or what a term means.
                  </Text>
                </View>
              ) : null}

              {messages.map((message) => {
                const isAssistant = message.role === "assistant";
                return (
                  <View key={message._id}>
                    {isAssistant ? (
                      <View
                        className="max-w-[85%] p-4 self-start border"
                        style={{
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          borderTopLeftRadius: 4,
                          borderTopRightRadius: 16,
                          borderBottomLeftRadius: 16,
                          borderBottomRightRadius: 16,
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
                        <View className="flex-row items-center justify-between mt-1.5">
                          <TouchableOpacity
                            onPress={() => handleListen(message)}
                            activeOpacity={0.7}
                            disabled={synthesizingMessageId === message._id}
                            className="flex-row items-center gap-1 -ml-1 px-1.5 py-0.5"
                          >
                            {synthesizingMessageId === message._id ? (
                              <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                              <Feather
                                name={playingMessageId === message._id ? "pause-circle" : "volume-2"}
                                size={13}
                                color={colors.primary}
                              />
                            )}
                            <Text className="text-[10px] font-bold uppercase tracking-wide" style={{ color: colors.primary, fontFamily: fonts.body }}>
                              {playingMessageId === message._id ? "Playing" : "Listen"}
                            </Text>
                          </TouchableOpacity>
                          <Text
                            className="text-[10px] font-bold opacity-70"
                            style={{ color: colors.mutedText, fontFamily: fonts.body }}
                          >
                            {formatTime(message.createdAt)}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <View
                        className="max-w-[85%] self-end overflow-hidden shadow-md p-4"
                        style={{
                          backgroundColor: colors.primaryDark,
                          borderTopLeftRadius: 16,
                          borderTopRightRadius: 16,
                          borderBottomLeftRadius: 16,
                          borderBottomRightRadius: 4,
                        }}
                      >
                        <Text className="text-[15px] font-medium leading-6" style={{ color: "#FFFFFF", fontFamily: fonts.body }}>
                          {message.text}
                        </Text>
                        <Text
                          className="text-[10px] font-bold text-right mt-1.5 opacity-70"
                          style={{ color: "#FFFFFF", fontFamily: fonts.body }}
                        >
                          {formatTime(message.createdAt)}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}

              {isReplying && (
                <View
                  className="self-start rounded-2xl rounded-tl-none border px-4 py-3.5 items-center justify-center flex-row gap-1"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                >
                  <Text className="text-xs font-bold tracking-widest animate-pulse" style={{ color: colors.primary, fontFamily: fonts.body }}>
                    Reading your documents...
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>

          <View
            className="px-4 py-3.5 border-t flex-row items-center gap-3"
            style={{
              borderColor: colors.border,
              backgroundColor: colors.surface,
              paddingBottom: Math.max(14, insets.bottom + 8),
            }}
          >
            <TextInput
              placeholder={isRecording ? "Listening..." : "Ask about your documents..."}
              placeholderTextColor={colors.mutedText}
              value={typedMessage}
              onChangeText={setTypedMessage}
              onSubmitEditing={() => handleSend()}
              maxLength={1000}
              returnKeyType="send"
              submitBehavior="submit"
              editable={!isRecording && !isTranscribing}
              className="flex-1 px-4 py-3 rounded-xl text-sm"
              style={{ color: colors.foreground, backgroundColor: colors.input, fontFamily: fonts.body }}
            />
            <TouchableOpacity
              disabled={isTranscribing}
              onPress={handleMicPress}
              activeOpacity={0.8}
              className="rounded-full overflow-hidden"
            >
              <View
                className="p-2.5 items-center justify-center"
                style={{ backgroundColor: isRecording ? colors.danger : colors.border }}
              >
                {isTranscribing ? (
                  <ActivityIndicator size="small" color={colors.mutedText} />
                ) : (
                  <Feather name="mic" size={15} color={isRecording ? "#fff" : colors.mutedText} />
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!typedMessage.trim() || isReplying}
              onPress={() => handleSend()}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              className="rounded-full overflow-hidden"
            >
              {typedMessage.trim() && !isReplying ? (
                <View className="p-2.5 items-center justify-center" style={{ backgroundColor: colors.primary }}>
                  <Feather name="send" size={15} color={colors.buttonText} />
                </View>
              ) : (
                <View className="p-2.5 items-center justify-center" style={{ backgroundColor: colors.border }}>
                  <Feather name="send" size={15} color={colors.mutedText} />
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
