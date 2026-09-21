import { useCallback, useEffect, useRef, useState } from "react";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { alert } from "../lib/alert";
import { showPermissionModal } from "../lib/modal-host";
import { speechApi, type LanguageCode } from "../lib/api";

const SILENCE_DB_THRESHOLD = -45;
const SILENCE_TIMEOUT_MS = 3000;
const START_GRACE_MS = 1200;
const METERING_POLL_MS = 100;
const MAX_RECORDING_MS = 15000;
// How long a voice-mode failure stays visible inline before the "always
// listening" loop resumes on its own — long enough to read a short line.
const VOICE_ERROR_DISPLAY_MS = 3500;

const RECORDER_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

function normalizeLevel(db: number | undefined): number {
  if (db === undefined || Number.isNaN(db)) return 0;
  return Math.max(0, Math.min(1, (db + 50) / 50));
}

interface UseVoiceInputOptions {
  language: LanguageCode;
  voiceMode: boolean;
  onTranscript: (transcript: string) => void;
}

export function useVoiceInput({ language, voiceMode, onTranscript }: UseVoiceInputOptions) {
  const recorder = useAudioRecorder(RECORDER_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, METERING_POLL_MS);

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

    await recorder.stop();
    const uri = recorder.uri;
    stoppingRef.current = false;
    if (!uri) return;

    setIsTranscribing(true);
    try {
      const result = await speechApi.transcribe(uri, language);
      const transcript = result.transcript.trim();
      if (transcript) {
        onTranscript(transcript);
      } else if (voiceMode) {
        reportVoiceError("Didn't catch that — try again somewhere quieter.");
      } else {
        alert("Didn't catch that", "Try recording again somewhere quieter.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      if (voiceMode) {
        reportVoiceError(message);
      } else {
        alert("Voice input failed", message);
      }
    } finally {
      setIsTranscribing(false);
    }
  }, [clearSilenceTimer, clearMaxDurationTimer, language, onTranscript, recorder, reportVoiceError, voiceMode]);

  // Live amplitude tracking + auto-submit after 3s of silence (voice mode only).
  // The countdown always runs and only resets while actual speech is detected, so
  // it can never get stuck waiting for a "first word" that a flaky mic never reports.
  useEffect(() => {
    if (!recorderState.isRecording) {
      setLevel(0);
      clearSilenceTimer();
      return;
    }

    const normalized = normalizeLevel(recorderState.metering);
    setLevel(normalized);
    if (normalized > peakLevelRef.current) peakLevelRef.current = normalized;

    if (!voiceMode) return;

    // Adaptive threshold: react to a device's actual mic gain instead of a fixed dB
    // cutoff, so quiet mics still detect speech and loud rooms still detect silence.
    const absoluteFloor = normalizeLevel(SILENCE_DB_THRESHOLD);
    const relativeFloor = peakLevelRef.current * 0.35;
    const isSpeaking = normalized > Math.max(absoluteFloor, relativeFloor);

    if (isSpeaking) {
      clearSilenceTimer();
      return;
    }
    // Give the user a beat to start talking before the countdown can fire the first time.
    if (recorderState.durationMillis < START_GRACE_MS) return;
    if (!silenceTimerRef.current) {
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        stopAndTranscribe();
      }, SILENCE_TIMEOUT_MS);
    }
  }, [
    recorderState.isRecording,
    recorderState.metering,
    recorderState.durationMillis,
    voiceMode,
    clearSilenceTimer,
    stopAndTranscribe,
  ]);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      clearMaxDurationTimer();
    };
  }, [clearSilenceTimer, clearMaxDurationTimer]);

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
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      showPermissionModal({
        title: "Microphone access needed",
        message: "Enable microphone access in Settings to use voice input.",
        icon: "mic-outline",
      });
      return;
    }
    peakLevelRef.current = 0;
    await recorder.prepareToRecordAsync();
    recorder.record();

    if (voiceMode) {
      clearMaxDurationTimer();
      maxDurationTimerRef.current = setTimeout(() => {
        maxDurationTimerRef.current = null;
        stopAndTranscribe();
      }, MAX_RECORDING_MS);
    }
  }, [clearMaxDurationTimer, clearVoiceError, isTranscribing, recorder, recorderState.isRecording, stopAndTranscribe, voiceMode]);

  useEffect(() => {
    return () => {
      if (voiceErrorTimerRef.current) clearTimeout(voiceErrorTimerRef.current);
    };
  }, []);

  return {
    clearVoiceError,
    handleMicPress,
    isRecording: recorderState.isRecording,
    isTranscribing,
    level,
    voiceError,
  };
}
