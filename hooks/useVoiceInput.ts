import { useCallback, useEffect, useRef, useState } from "react";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { Platform } from "react-native";
import { alert } from "../lib/alert";
import { deleteRecording } from "../lib/audio";
import { startWebMicLevel } from "../lib/webMicLevel";
import { showPermissionModal } from "../lib/modal-host";
import { getFriendlyErrorMessage, speechApi, type LanguageCode } from "../lib/api";

const SILENCE_DB_THRESHOLD = -45;
// Voice mode sends after this much quiet. Long enough for a breath between
// phrases, short enough that a turn doesn't feel laggy.
const SILENCE_TIMEOUT_MS = 1500;
const START_GRACE_MS = 1200;
const METERING_POLL_MS = 100;
const MAX_RECORDING_MS = 20000;
// After this many voice-mode recordings in a row with no speech in them,
// stop re-arming the mic until the person taps it (no endless listening).
const SILENT_ROUNDS_BEFORE_PAUSE = 2;
// How long a voice-mode failure stays visible inline before the "always
// listening" loop resumes on its own — long enough to read a short line.
const VOICE_ERROR_DISPLAY_MS = 3500;

// Speech, not music: mono 16 kHz AAC is what speech-to-text works at anyway,
// and the file is ~8x smaller than HIGH_QUALITY, so it uploads much faster.
const RECORDER_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  web: { mimeType: "audio/webm", bitsPerSecond: 32000 },
  isMeteringEnabled: true,
};

function normalizeLevel(db: number | undefined): number {
  if (db === undefined || Number.isNaN(db)) return 0;
  return Math.max(0, Math.min(1, (db + 50) / 50));
}

interface UseVoiceInputOptions {
  language: LanguageCode;
  voiceMode: boolean;
  /**
   * `fromVoiceMode` is whether the recording was started in voice mode, so a
   * caller can drop a transcript that lands after the person left voice mode
   * instead of starting a new turn with it.
   */
  onTranscript: (transcript: string, info: { fromVoiceMode: boolean }) => void;
}

export function useVoiceInput({ language, voiceMode, onTranscript }: UseVoiceInputOptions) {
  const recorder = useAudioRecorder(RECORDER_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, METERING_POLL_MS);
  // Read through a ref: callers pass an inline callback, and depending on it
  // would give stopAndTranscribe/handleMicPress a new identity every render
  // (resetting the callers' mic re-arm timer each time).
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const recordingVoiceModeRef = useRef(false);

  // Ask for mic permission as soon as this hook mounts, before any recorder
  // method touches the native audio hardware — some Android builds crash
  // natively (instead of failing in JS) if recording is prepared/started
  // without the permission already granted.
  useEffect(() => {
    requestRecordingPermissionsAsync().catch(() => {});
  }, []);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [level, setLevel] = useState(0);
  // In voice mode there's no native Alert/AppModalHost dialog to surface
  // failures with — VoiceModeOverlay is already a full-screen `<Modal>`, and
  // stacking a second native Modal on top of it is the same
  // double-Modal-unreliability pattern documented elsewhere in this codebase
  // (PaywallModal/CashfreeCheckoutModal). So voice-mode failures are reported
  // here instead, for the overlay to render inline.
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peakLevelRef = useRef(0);
  const stoppingRef = useRef(false);
  // Whether this recording ever crossed the speech threshold (voice mode).
  const heardSpeechRef = useRef(false);
  // Whether this recording reported any mic level at all. Without one we
  // can't tell speech from silence, so the recording is always sent.
  const meteringSeenRef = useRef(false);
  // Web: expo-audio reports no metering there, so we measure it ourselves.
  const webMeterRef = useRef<Awaited<ReturnType<typeof startWebMicLevel>>>(null);
  const webMeterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [webLevel, setWebLevel] = useState<number | undefined>(undefined);
  const silentRoundsRef = useRef(0);
  const [listeningPaused, setListeningPaused] = useState(false);

  // Entering (or leaving) voice mode starts the silence count over.
  useEffect(() => {
    silentRoundsRef.current = 0;
    setListeningPaused(false);
  }, [voiceMode]);

  const clearVoiceError = useCallback(() => {
    if (voiceErrorTimerRef.current) {
      clearTimeout(voiceErrorTimerRef.current);
      voiceErrorTimerRef.current = null;
    }
    setVoiceError(null);
  }, []);

  const reportVoiceError = useCallback((message: string) => {
    if (voiceErrorTimerRef.current) clearTimeout(voiceErrorTimerRef.current);
    setVoiceError(message);
    voiceErrorTimerRef.current = setTimeout(() => {
      voiceErrorTimerRef.current = null;
      setVoiceError(null);
    }, VOICE_ERROR_DISPLAY_MS);
  }, []);

  const stopWebMeter = useCallback(() => {
    if (webMeterTimerRef.current) clearInterval(webMeterTimerRef.current);
    webMeterTimerRef.current = null;
    webMeterRef.current?.stop();
    webMeterRef.current = null;
    setWebLevel(undefined);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearMaxDurationTimer = useCallback(() => {
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
  }, []);

  const stopAndTranscribe = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    clearSilenceTimer();
    clearMaxDurationTimer();
    peakLevelRef.current = 0;

    stopWebMeter();
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch {
      // The recorder was already stopped or released; nothing to send.
    } finally {
      // Always released, or one failed stop would leave the mic dead until remount.
      stoppingRef.current = false;
    }
    if (!uri) return;
    const fromVoiceMode = recordingVoiceModeRef.current;

    // Nothing was said: don't upload silence. After a couple of rounds,
    // stop re-arming until the person taps the mic.
    if (voiceMode && meteringSeenRef.current && !heardSpeechRef.current) {
      deleteRecording(uri);
      silentRoundsRef.current += 1;
      if (silentRoundsRef.current >= SILENT_ROUNDS_BEFORE_PAUSE) setListeningPaused(true);
      return;
    }
    silentRoundsRef.current = 0;

    setIsTranscribing(true);
    try {
      const result = await speechApi.transcribe(uri, language);
      const transcript = result.transcript.trim();
      if (transcript) {
        onTranscriptRef.current(transcript, { fromVoiceMode });
      } else if (voiceMode) {
        reportVoiceError("Didn't catch that — try again somewhere quieter.");
      } else {
        alert("Didn't catch that", "Try recording again somewhere quieter.");
      }
    } catch (error) {
      const message = getFriendlyErrorMessage(error);
      if (voiceMode) {
        reportVoiceError(message);
      } else {
        alert("Voice input failed", message);
      }
    } finally {
      deleteRecording(uri);
      setIsTranscribing(false);
    }
  }, [clearSilenceTimer, clearMaxDurationTimer, language, recorder, reportVoiceError, stopWebMeter, voiceMode]);

  // Live amplitude tracking + auto-submit after SILENCE_TIMEOUT_MS of quiet (voice mode only).
  // The countdown always runs and only resets while actual speech is detected, so
  // it can never get stuck waiting for a "first word" that a flaky mic never reports.
  useEffect(() => {
    if (!recorderState.isRecording) {
      setLevel(0);
      clearSilenceTimer();
      return;
    }

    const metering = Platform.OS === "web" ? webLevel : recorderState.metering;
    if (metering !== undefined && Number.isFinite(metering)) meteringSeenRef.current = true;
    const normalized = normalizeLevel(metering);
    setLevel(normalized);
    if (normalized > peakLevelRef.current) peakLevelRef.current = normalized;

    if (!voiceMode) return;

    // Adaptive threshold: react to a device's actual mic gain instead of a fixed dB
    // cutoff, so quiet mics still detect speech and loud rooms still detect silence.
    const absoluteFloor = normalizeLevel(SILENCE_DB_THRESHOLD);
    const relativeFloor = peakLevelRef.current * 0.35;
    const isSpeaking = normalized > Math.max(absoluteFloor, relativeFloor);

    if (isSpeaking) {
      if (recorderState.durationMillis >= 300) heardSpeechRef.current = true;
      clearSilenceTimer();
      return;
    }
    // Give the user a beat to start talking before the countdown can fire the first time.
    if (recorderState.durationMillis < START_GRACE_MS) return;
    if (!silenceTimerRef.current) {
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        void stopAndTranscribe();
      }, SILENCE_TIMEOUT_MS);
    }
  }, [
    recorderState.isRecording,
    recorderState.metering,
    webLevel,
    recorderState.durationMillis,
    voiceMode,
    clearSilenceTimer,
    stopAndTranscribe,
  ]);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      clearMaxDurationTimer();
      stopWebMeter();
    };
  }, [clearSilenceTimer, clearMaxDurationTimer, stopWebMeter]);

  const handleMicPress = useCallback(async () => {
    if (recorderState.isRecording) {
      await stopAndTranscribe();
      return;
    }
    // A still-in-flight transcribe (from the previous recording) hasn't
    // released the recorder yet — starting a new one here races the native
    // module into "already recording"/"no active recording" errors. This
    // was reachable via a fast double-tap, and also once the caller's own
    // voice-mode re-arm effect saw isRecording flip false at the same
    // moment the user tapped again.
    if (isTranscribing) return;

    clearVoiceError();
    const { granted } = await requestRecordingPermissionsAsync().catch(() => ({ granted: false }));
    if (!granted) {
      showPermissionModal({
        title: "Microphone access needed",
        message: "Enable microphone access in Settings to use voice input.",
        icon: "mic-outline",
      });
      return;
    }
    peakLevelRef.current = 0;
    heardSpeechRef.current = false;
    meteringSeenRef.current = false;
    setListeningPaused(false);
    // iOS needs a recording-capable session; replies switch it back
    // (hooks/useSpokenReply.ts) so they play on the loudspeaker.
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => {});
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (error) {
      // A busy audio session, or the permission revoked between prompts.
      const message = "Couldn't start the microphone. Please try again.";
      if (voiceMode) reportVoiceError(message);
      else alert("Voice input failed", message);
      console.warn("Recorder failed to start:", error);
      return;
    }
    recordingVoiceModeRef.current = voiceMode;

    if (Platform.OS === "web" && voiceMode) {
      stopWebMeter();
      webMeterRef.current = await startWebMicLevel();
      if (webMeterRef.current) {
        webMeterTimerRef.current = setInterval(() => setWebLevel(webMeterRef.current?.read()), METERING_POLL_MS);
      }
    }

    if (voiceMode) {
      clearMaxDurationTimer();
      maxDurationTimerRef.current = setTimeout(() => {
        maxDurationTimerRef.current = null;
        void stopAndTranscribe();
      }, MAX_RECORDING_MS);
    }
  }, [clearMaxDurationTimer, clearVoiceError, isTranscribing, recorder, recorderState.isRecording, reportVoiceError, stopAndTranscribe, stopWebMeter, voiceMode]);

  useEffect(() => {
    return () => {
      if (voiceErrorTimerRef.current) clearTimeout(voiceErrorTimerRef.current);
    };
  }, []);

  return {
    clearVoiceError,
    handleMicPress,
    /** Voice mode stopped auto-listening after silent rounds; a mic tap resumes it. */
    listeningPaused,
    isRecording: recorderState.isRecording,
    isTranscribing,
    level,
    voiceError,
  };
}
