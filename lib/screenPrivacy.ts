import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireOptionalNativeModule } from "expo";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";

/**
 * Keeps private screens out of screenshots, screen recordings and the app
 * switcher. Two per-device switches on Profile → Data privacy & security,
 * both on by default:
 *
 * - "Block screenshots": screens with health details call
 *   `useSecureScreen()` (documents, Nura AI chat, document chat, the tracker
 *   and calendar, the day log, partner and doctor chat, symptom report).
 *   While one is on screen, screenshots and recordings come out blank. On
 *   Android that also blanks the app in the recent-apps list.
 * - "Blur in app switcher" (iOS): `ScreenPrivacySync` (in AppShell) blurs
 *   the whole app in the app switcher.
 *
 * Uses expo-screen-capture, a native module that only exists in builds made
 * after it was added. Older builds and web skip all of this quietly.
 */

const KEYS = {
  screenshots: "period-buddy.privacy.hide-screens",
  appSwitcher: "period-buddy.privacy.blur-app-switcher",
} as const;
type Setting = keyof typeof KEYS;

type Capture = typeof import("expo-screen-capture");

let capture: Capture | null | undefined;
const getCapture = (): Capture | null => {
  if (capture !== undefined) return capture;
  capture = null;
  if (Platform.OS === "web") return capture;
  try {
    if (requireOptionalNativeModule("ExpoScreenCapture")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      capture = require("expo-screen-capture") as Capture;
    }
  } catch {
    capture = null;
  }
  return capture;
};

/** False on web and on builds without the native module. */
export const screenPrivacyAvailable = () => getCapture() !== null;

const values: Record<Setting, boolean> = { screenshots: true, appSwitcher: true };
let hydrated = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

const hydrate = () => {
  if (hydrated) return;
  hydrated = true;
  AsyncStorage.multiGet(Object.values(KEYS))
    .then((rows) => {
      const stored = new Map(rows);
      let changed = false;
      for (const setting of Object.keys(KEYS) as Setting[]) {
        if (stored.get(KEYS[setting]) === "off") {
          values[setting] = false;
          changed = true;
        }
      }
      if (changed) notify();
    })
    .catch(() => undefined);
};

const subscribe = (fn: () => void) => {
  hydrate();
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function setScreenPrivacySetting(setting: Setting, on: boolean) {
  values[setting] = on;
  notify();
  AsyncStorage.setItem(KEYS[setting], on ? "on" : "off").catch(() => undefined);
}

/** One of the two switches ("screenshots" or "appSwitcher"). */
export function useScreenPrivacySetting(setting: Setting) {
  return useSyncExternalStore(subscribe, () => values[setting], () => values[setting]);
}

/** The app-switcher blur is iOS only (Android gets it from blocking screenshots). */
export const appSwitcherBlurAvailable = () => Platform.OS === "ios" && screenPrivacyAvailable();

/**
 * Block screenshots while this screen is focused (when the setting is on).
 * `active` limits it further, e.g. to while a modal is open.
 */
export function useSecureScreen(key: string, active = true) {
  const on = useScreenPrivacySetting("screenshots") && active;
  useFocusEffect(
    useCallback(() => {
      const sc = getCapture();
      if (!on || !sc) return undefined;
      sc.preventScreenCaptureAsync(key).catch(() => undefined);
      return () => {
        sc.allowScreenCaptureAsync(key).catch(() => undefined);
      };
    }, [key, on]),
  );
}

/** iOS: blur the app in the app switcher while the setting is on. */
export function ScreenPrivacySync() {
  const on = useScreenPrivacySetting("appSwitcher");
  useEffect(() => {
    const sc = getCapture();
    if (Platform.OS !== "ios" || !sc) return;
    (on ? sc.enableAppSwitcherProtectionAsync(0.9) : sc.disableAppSwitcherProtectionAsync()).catch(() => undefined);
  }, [on]);
  return null;
}
