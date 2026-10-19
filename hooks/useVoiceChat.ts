import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceStatus } from "../components/VoiceModeOverlay";
import { alert } from "../lib/alert";
import { getFriendlyErrorMessage, speechApi, type Language, type LanguageCode } from "../lib/api";
import { SUPPORTED_LANGUAGES } from "../lib/languages";
import { isMeaningfulTranscript } from "../lib/voiceSpeech";
import { useSpokenReply } from "./useSpokenReply";
import { useVoiceInput } from "./useVoiceInput";

type Caption = { heard: string; reply: string };
const EMPTY_CAPTION: Caption = { heard: "", reply: "" };

/**
 * Everything a chat screen needs for voice, shared by Nura AI (qa.tsx) and the
 * Document Assistant (document-chat.tsx): language picker, dictation into the
 * composer, and voice mode (VoiceModeOverlay) with its Assistant-style loop —
 * the mic re-arms whenever nothing is recording, transcribing, replying or
 * being spoken.
 *
 * Voice mode can end at any await (End button), so anything that would speak
 * or caption a reply checks `isVoiceModeOn()` (a ref, never a captured
 * value) first; a transcript from a voice-mode recording that lands after End
 * is dropped instead of starting a new turn.
 */
export function useVoiceChat({
  initialVoiceMode = false,
  busy,
  onVoiceTurn,
  onDictation,
}: {
  initialVoiceMode?: boolean;
  /** The screen is waiting on its own reply (keeps the mic from re-arming). */
  busy: boolean;
  /** A meaningful transcript heard in voice mode. */
  onVoiceTurn: (transcript: string) => void;
  /** Text dictated with the composer's mic, to append to the input. */
  onDictation: (transcript: string) => void;
}) {
  const [language, setLanguage] = useState<LanguageCode>("en-IN");
  const [languages, setLanguages] = useState<Language[]>(SUPPORTED_LANGUAGES);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [voiceMode, setVoiceModeState] = useState(initialVoiceMode);
  const voiceModeRef = useRef(initialVoiceMode);
  // Live captions in the voice overlay: the last thing heard and the answer.
  const [voiceCaption, setVoiceCaption] = useState<Caption>(EMPTY_CAPTION);
  const languageRef = useRef(language);
  languageRef.current = language;
  const { speak, stop: stopSpeaking, playingId, preparingId } = useSpokenReply(language);
  // Read by toggleListen through a ref, so the callback (and every memoized
  // message bubble it's passed to) keeps one identity while replies play.
  const playbackRef = useRef({ playingId, preparingId });
  playbackRef.current = { playingId, preparingId };

  const callbacksRef = useRef({ onVoiceTurn, onDictation });
  callbacksRef.current = { onVoiceTurn, onDictation };

  const setVoiceMode = useCallback((next: boolean) => {
    voiceModeRef.current = next;
    setVoiceModeState(next);
  }, []);
  const isVoiceModeOn = useCallback(() => voiceModeRef.current, []);
  const getLanguage = useCallback(() => languageRef.current, []);

  const mic = useVoiceInput({
    language,
    voiceMode,
    onTranscript: (transcript, { fromVoiceMode }) => {
      if (fromVoiceMode) {
        // Ended voice mode while this was transcribing, or background noise
        // transcribed as "." / "hmm": nothing to do (the loop listens again).
        if (!voiceModeRef.current || !isMeaningfulTranscript(transcript)) return;
        callbacksRef.current.onVoiceTurn(transcript);
      } else {
        callbacksRef.current.onDictation(transcript);
      }
    },
  });
  const { handleMicPress, isRecording, isTranscribing, listeningPaused, voiceError } = mic;

  const isSpeakingReply = voiceMode && playingId !== null;
  // The reply's audio is still being made. Counts as busy: otherwise the mic
  // re-arms in this gap, records the reply being spoken and sends it back as
  // if the user had said it.
  const isPreparingReply = voiceMode && preparingId !== null;

  // Re-arm the mic whenever voice mode is idle. Paused while a voice-mode
  // failure is showing (voiceError) so there's time to read it.
  useEffect(() => {
    if (!voiceMode || isRecording || isTranscribing || busy || isPreparingReply || isSpeakingReply || voiceError || listeningPaused) return;
    const timer = setTimeout(() => {
      void handleMicPress();
    }, 450);
    return () => clearTimeout(timer);
  }, [voiceMode, isRecording, isTranscribing, busy, isPreparingReply, isSpeakingReply, voiceError, handleMicPress, listeningPaused]);

  const voiceStatus: VoiceStatus = isTranscribing
    ? "processing"
    : isRecording
      ? "listening"
      : busy || isPreparingReply
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
    };
  }, []);

  // Leaving voice mode cuts the reply off instead of letting it talk on.
  useEffect(() => {
    if (!voiceMode) stopSpeaking();
    setVoiceCaption(EMPTY_CAPTION);
  }, [voiceMode, stopSpeaking]);

  /** The orb in voice mode: interrupts a reply that's being spoken (barge-in), else the mic as usual. */
  const handleVoiceOrbPress = useCallback(() => {
    if (playingId || preparingId) stopSpeaking();
    void handleMicPress();
  }, [handleMicPress, playingId, preparingId, stopSpeaking]);

  /** A message's Listen button: plays it, or stops it if it's the one playing. */
  const toggleListen = useCallback(
    async (id: string, text: string) => {
      const playback = playbackRef.current;
      if (playback.playingId === id || playback.preparingId === id) {
        stopSpeaking();
        return;
      }
      try {
        await speak(id, text);
      } catch (error) {
        // Voice mode is a full-screen Modal; a second native alert over it is unreliable.
        if (!voiceModeRef.current) alert("Couldn't play audio", getFriendlyErrorMessage(error));
      }
    },
    [speak, stopSpeaking],
  );

  /**
   * Captions a reply in the overlay and speaks it (unless `speakIt` is false,
   * e.g. an error line) — only if voice mode is still on, since it may have
   * ended while the request was in flight.
   */
  const replyAloud = useCallback(
    (id: string, heard: string, text: string, speakIt = true) => {
      if (!voiceModeRef.current) return;
      setVoiceCaption({ heard, reply: text });
      if (!speakIt) return;
      speak(id, text).catch(() => {
        // The caption already shows it; there's no better place in the overlay.
      });
    },
    [speak],
  );

  /** Shows what was heard while the reply is on its way (voice mode only). */
  const captionHeard = useCallback((heard: string) => {
    if (voiceModeRef.current) setVoiceCaption({ heard, reply: "" });
  }, []);

  const selectedLanguage = languages.find((l) => l.code === language) ?? SUPPORTED_LANGUAGES[0];
  const openLanguagePicker = useCallback(() => setLanguagePickerVisible(true), []);
  const closeLanguagePicker = useCallback(() => setLanguagePickerVisible(false), []);

  return {
    language,
    setLanguage,
    languages,
    selectedLanguage,
    languagePickerVisible,
    openLanguagePicker,
    closeLanguagePicker,
    voiceMode,
    setVoiceMode,
    isVoiceModeOn,
    getLanguage,
    voiceCaption,
    captionHeard,
    replyAloud,
    toggleListen,
    playingId,
    preparingId,
    voiceStatus,
    handleVoiceOrbPress,
    mic,
  };
}
