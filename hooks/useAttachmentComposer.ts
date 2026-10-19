import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useRef, useState } from "react";
import type { PendingAttachment } from "../components/community/types";
import { alert } from "../lib/alert";
import { showPermissionModal } from "../lib/modal-host";
import { requestPhotoLibraryAccess } from "../lib/photoAccess";

/**
 * One attachment slot (photo, video or voice note) for a composer: the
 * community post sheet and the reply box each use their own.
 *
 * - Recording switches the iOS audio session to record mode and back, or
 *   recording fails on iOS and later playback comes out of the earpiece.
 * - Picker/recorder failures alert instead of becoming unhandled rejections.
 * - `finish()` stops a recording in progress and returns what's attached,
 *   so publishing mid-recording keeps the voice note.
 * - `reset()` drops the attachment and stops the mic (closing a sheet).
 */
export function useAttachmentComposer() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const pendingRef = useRef<PendingAttachment | null>(null);
  // The recorder's state lags a render behind; this flips the moment we start/stop.
  const recordingRef = useRef(false);

  const update = useCallback((next: PendingAttachment | null) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  const stopRecording = useCallback(async (): Promise<PendingAttachment | null> => {
    if (!recordingRef.current) return null;
    recordingRef.current = false;
    try {
      await recorder.stop();
    } catch {
      return null;
    } finally {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
    const uri = recorder.uri;
    return uri ? { uri, type: "audio", mimeType: "audio/m4a" } : null;
  }, [recorder]);

  const pickMedia = useCallback(
    async (kind: "image" | "video") => {
      try {
        const permission = await requestPhotoLibraryAccess();
        if (!permission.granted) {
          showPermissionModal(
            kind === "image"
              ? {
                  title: "Photo access needed",
                  message: "Allow photo library access to attach an image.",
                  icon: "images-outline",
                }
              : {
                  title: "Media access needed",
                  message: "Allow media library access to attach a video.",
                  icon: "videocam-outline",
                },
          );
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: [kind === "image" ? "images" : "videos"],
          quality: 0.8,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        await stopRecording();
        update({
          uri: asset.uri,
          type: kind,
          mimeType: asset.mimeType || (kind === "image" ? "image/jpeg" : "video/mp4"),
        });
      } catch {
        alert(
          kind === "image" ? "Couldn't attach the photo" : "Couldn't attach the video",
          "Please try again.",
        );
      }
    },
    [stopRecording, update],
  );

  const toggleRecording = useCallback(async () => {
    if (recordingRef.current) {
      const recorded = await stopRecording();
      if (recorded) update(recorded);
      else alert("Couldn't save the voice note", "Please try recording again.");
      return;
    }
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        showPermissionModal({
          title: "Microphone access needed",
          message: "Enable microphone access in Settings to attach a voice note.",
          icon: "mic-outline",
        });
        return;
      }
      update(null);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
    } catch {
      recordingRef.current = false;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      alert("Couldn't start recording", "Check that no other app is using the microphone, then try again.");
    }
  }, [recorder, stopRecording, update]);

  const finish = useCallback(async () => {
    const recorded = await stopRecording();
    if (recorded) update(recorded);
    return recorded ?? pendingRef.current;
  }, [stopRecording, update]);

  const reset = useCallback(async () => {
    update(null);
    await stopRecording();
  }, [stopRecording, update]);

  return {
    pending,
    isRecording: recorderState.isRecording,
    pickImage: useCallback(() => pickMedia("image"), [pickMedia]),
    pickVideo: useCallback(() => pickMedia("video"), [pickMedia]),
    toggleRecording,
    finish,
    reset,
  };
}
