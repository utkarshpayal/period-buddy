import { Vibration } from "react-native";

// Buzz, pause, repeat — like a phone ringing.
const RING_PATTERN = [0, 900, 1100];

/** Ring for an incoming call (vibration on phones; Web Audio on web, see
 * ringTone.web.ts). Returns a function that stops it. */
export function startRingTone(): () => void {
  Vibration.vibrate(RING_PATTERN, true);
  return () => Vibration.cancel();
}
