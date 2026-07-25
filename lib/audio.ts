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
  const file = new File(Paths.cache, `tts-${Date.now()}.${codec}`);
  file.write(base64, { encoding: "base64" });
  return file.uri;
}
