// Shared motion tokens. Pick a duration by how far/how much moves, not per
// screen: `fast` for press and toggle feedback, `base` for fades and small
// moves, `slow` for sheets and larger reveals. Reanimated skips or shortens
// these by itself when the phone's "reduce motion" setting is on.
import { Platform } from "react-native";
import { Easing, FadeIn, FadeInDown } from "react-native-reanimated";

export const motion = {
  duration: { fast: 150, base: 220, slow: 320 },
  easing: {
    /** Things arriving: quick start, soft landing. */
    enter: Easing.out(Easing.cubic),
    /** Things leaving: a little faster than they arrived. */
    exit: Easing.in(Easing.cubic),
  },
  /** Sheets and cards settling into place: no wobble, no overshoot. */
  spring: { damping: 22, stiffness: 240, mass: 0.9 },
  /** Gap between rows in a staggered list reveal. */
  stagger: 40,
} as const;

/**
 * Fade-up for the first rows of a list on first load. Rows past `maxStaggered`
 * appear together so a long list never waits on its tail.
 */
export function listEntering(index: number, maxStaggered = 8) {
  return FadeInDown.duration(motion.duration.base)
    .delay(Math.min(index, maxStaggered) * motion.stagger)
    .easing(motion.easing.enter);
}

/** Plain fade for content swapping in place (tab or filter changes). */
export const fadeIn = FadeIn.duration(motion.duration.base);

/**
 * Screen transitions for every Stack. Android gets the iOS-style push (the
 * new screen slides in over a slight parallax of the old one) instead of the
 * plain system fade; iOS keeps its native push, with swipe-back from anywhere
 * on the screen. The page colour behind each screen stops a white flash
 * mid-transition in dark mode.
 */
export function stackScreenOptions(background: string) {
  return {
    headerShown: false,
    animation: Platform.OS === "android" ? ("ios_from_right" as const) : ("default" as const),
    fullScreenGestureEnabled: true,
    contentStyle: { backgroundColor: background },
  };
}
