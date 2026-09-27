import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";

/**
 * A random id for this install, made on first use and kept in AsyncStorage.
 * Sent as `X-Device-Id` with the App CMS config so a signed-out user still
 * lands in a stable rollout slice and can join a "Notify me" list
 * (docs in The-Nura-CMS docs/launch-states.md §7.3). It identifies the
 * install, not the person, and is lost on reinstall.
 */
const DEVICE_ID_KEY = "period-buddy.device-id";

let cached: string | null = null;
let pending: Promise<string> | null = null;

export function getDeviceId(): Promise<string> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = (async () => {
      try {
        const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
        if (stored && /^[A-Za-z0-9-]{8,64}$/.test(stored)) {
          cached = stored;
          return stored;
        }
      } catch {
        /* storage unavailable: a fresh id for this session is still useful */
      }
      const id = randomUUID();
      cached = id;
      AsyncStorage.setItem(DEVICE_ID_KEY, id).catch(() => undefined);
      return id;
    })().finally(() => {
      pending = null;
    });
  }
  return pending;
}
