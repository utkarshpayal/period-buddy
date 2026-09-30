/**
 * No usage tracking for anyone under 18 (India's DPDP Act forbids tracking
 * and behavioural monitoring of children). Covers every beacon the app sends
 * for analytics: feature usage (lib/usage.ts), Coming soon tile taps, and
 * banner impressions and clicks (lib/api.ts `appConfigApi`).
 *
 * Decided from the signed-in person's profile birthday, set by
 * `AppConfigSync` (components/AppConfigSync.tsx). Beacons from a device
 * nobody is signed in on aren't tied to anyone and still count.
 */

let allowed = true;

/**
 * True when this profile birthday makes the person under 18. Same age maths
 * as `computeAge` in lib/chatTopics.ts and the backend's companionChat.js,
 * so every age check agrees. No or bad birthday: not treated as a minor.
 */
export function isMinor(dateOfBirth?: string | null, now: number = Date.now()): boolean {
  if (!dateOfBirth) return false;
  const born = new Date(dateOfBirth).getTime();
  if (Number.isNaN(born)) return false;
  const age = Math.floor((now - born) / (365.25 * 24 * 60 * 60 * 1000));
  return age > 0 && age < 18;
}

export function setAnalyticsAllowed(next: boolean) {
  allowed = next;
}

export function analyticsAllowed(): boolean {
  return allowed;
}
