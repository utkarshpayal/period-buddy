import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

const AUDIO_MIME_TYPES: Record<string, string> = {
  aac: "audio/aac",
  flac: "audio/flac",
  mp3: "audio/mpeg",
  opus: "audio/opus",
  wav: "audio/wav",
};

/**
 * Turns Sarvam's base64 TTS audio into a URI `expo-audio` can play.
 *
 * On web, `useAudioPlayer`/`createAudioPlayer` just hand the uri straight to
 * `new Audio(uri)`, which plays `data:` URIs natively. On iOS/Android the
 * native player needs a real file, so the audio is written to a cache file
 * instead.
 */
export async function resolveAudioUri(base64: string, codec: string): Promise<string> {
  if (Platform.OS === "web") {
    return `data:${AUDIO_MIME_TYPES[codec] || "audio/mpeg"};base64,${base64}`;
  }
  // Random suffix: voice mode makes several of these within the same millisecond.
  const file = new File(Paths.cache, `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${codec}`);
  file.write(base64, { encoding: "base64" });
  return file.uri;
}

/** Deletes a cache file made by resolveAudioUri once it has played (no-op for data: URIs). */
export function releaseAudioUri(uri: string) {
  if (Platform.OS === "web" || !uri.startsWith("file:")) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache files are cleaned by the OS eventually anyway.
  }
}

/**
 * Deletes a voice recording once it has been transcribed: it is the person's
 * spoken health question, so it must not sit in the cache. Native recorder
 * URIs can come back with or without the file:// scheme; on web it's a blob URL.
 */
export function deleteRecording(uri: string | null | undefined) {
  if (!uri) return;
  if (Platform.OS === "web") {
    if (uri.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(uri);
      } catch {
        // Nothing to free.
      }
    }
    return;
  }
  try {
    const file = new File(uri.startsWith("/") ? `file://${uri}` : uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone, or the OS cleans the cache eventually.
  }
}
