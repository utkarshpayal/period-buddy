/**
 * No usage tracking for anyone under 18 (India's DPDP Act forbids tracking
 * and behavioural monitoring of children). Covers every beacon the app sends
 * for analytics: feature usage (lib/usage.ts), Coming soon tile taps, and
 * banner impressions and clicks (lib/api/appConfig.ts `appConfigApi`).
 *
 * Decided from the signed-in person's profile birthday, set by
 * `AppConfigSync` (components/AppConfigSync.tsx). Beacons from a device
 * nobody is signed in on aren't tied to anyone and still count.
 */

import { ageFromDateOfBirth } from "./onboarding";

let allowed = true;

/**
 * True when this profile birthday makes the person under 18 (calendar-exact,
 * `ageFromDateOfBirth`). No or bad birthday: not treated as a minor.
 */
export function isMinor(dateOfBirth?: string | null, now: number = Date.now()): boolean {
  const age = ageFromDateOfBirth(dateOfBirth, new Date(now));
  return age !== null && age > 0 && age < 18;
}

export function setAnalyticsAllowed(next: boolean) {
  allowed = next;
}

export function analyticsAllowed(): boolean {
  return allowed;
}
