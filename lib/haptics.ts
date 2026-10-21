// Small, named haptic cues so every screen buzzes the same way for the same
// kind of moment. No-ops on web and never throws (some Android devices have
// no vibrator, or the user has turned touch feedback off).
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const enabled = Platform.OS !== "web";

function run(effect: () => Promise<void>) {
  if (!enabled) return;
  effect().catch(() => {});
}

export const haptics = {
  /** A light tick for toggles, chips, likes and votes. */
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Picking a value in a list or wheel. */
  select: () => run(() => Haptics.selectionAsync()),
  /** Something was saved or completed (period logged, habit done, payment ok). */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** A save or payment failed. */
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
