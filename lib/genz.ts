import * as Sharing from "expo-sharing";
import type { RefObject } from "react";
import { Platform, type View } from "react-native";
import { captureRef, releaseCapture } from "react-native-view-shot";
import { shareWithAppLink } from "./share";

/**
 * Small shared helpers for the Gen Z pack screens (Wrapped, Era, Badges,
 * Bestie Circles). Display-only; the numbers all come from period-buddy-be's
 * /api/genz and /api/circles.
 */

export const MOOD_DISPLAY: Record<string, { label: string; emoji: string }> = {
  happy: { label: "Happy", emoji: "😊" },
  calm: { label: "Calm", emoji: "😌" },
  energetic: { label: "Energetic", emoji: "⚡" },
  frisky: { label: "Frisky", emoji: "😏" },
  moodSwings: { label: "Mood swings", emoji: "🎢" },
  irritable: { label: "Irritated", emoji: "😤" },
  sad: { label: "Sad", emoji: "🥺" },
  anxious: { label: "Anxious", emoji: "😰" },
  depressed: { label: "Low", emoji: "🌧️" },
  guilty: { label: "Guilty", emoji: "🫠" },
  obsessive: { label: "Overthinking", emoji: "🌀" },
  lowEnergy: { label: "Low energy", emoji: "🪫" },
  apathetic: { label: "Meh", emoji: "😶" },
  confused: { label: "Confused", emoji: "🤔" },
  selfCritical: { label: "Self-critical", emoji: "🫣" },
  emotional: { label: "Emotional", emoji: "🥹" },
  tired: { label: "Tired", emoji: "😴" },
  neutral: { label: "Neutral", emoji: "😐" },
};

export const moodDisplay = (value: string) =>
  MOOD_DISPLAY[value] ?? { label: prettifyTag(value), emoji: "🙂" };

/** "lower_back_pain" / "lowerBackPain" → "Lower back pain". */
export function prettifyTag(value: string) {
  const spaced = value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Share a rendered card as a PNG (story-ready). Needs react-native-view-shot's
 * native module, which only exists in builds made after it was added — older
 * dev/store builds, and web, fall back to sharing text plus an app link.
 */
/**
 * The last captured PNG. view-shot's tmpfiles only go when the app closes, and
 * a Wrapped card shows moods and period stats, so the previous one is deleted
 * at the next share (not right after: on Android `shareAsync` returns before
 * the chosen app has read the file).
 */
let lastCaptureUri: string | null = null;

/** Never rejects: a failed or cancelled share isn't something to report. */
export async function shareViewAsImage(ref: RefObject<View | null>, message: string, deeplink?: string) {
  if (lastCaptureUri) {
    releaseCapture(lastCaptureUri);
    lastCaptureUri = null;
  }
  if (Platform.OS !== "web" && ref.current) {
    try {
      const uri = await captureRef(ref, { format: "png", quality: 1, result: "tmpfile" });
      lastCaptureUri = uri;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: message });
        return;
      }
    } catch {
      // No native module in this build (or capture failed): fall through.
    }
  }
  await shareWithAppLink(message, deeplink).catch(() => undefined);
}
