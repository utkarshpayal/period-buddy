import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Small, health-related values kept on the phone (e.g. the onboarding
 * answers: period dates, cycle length, birthday) go to the OS keystore
 * instead of AsyncStorage, which is a plain file and ends up in backups.
 * Same keystore options as the session token (lib/sessionStore.ts).
 *
 * Values saved in AsyncStorage by older builds are moved over the first time
 * they're read. Web has no keystore, so it keeps using AsyncStorage. Keep
 * values small (the keystore is meant for a few KB at most).
 */

const useKeystore = Platform.OS !== "web";
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

// The keystore only accepts letters, digits, ".", "-" and "_" in keys.
const keystoreKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

export async function secureGetItem(key: string): Promise<string | null> {
  if (!useKeystore) return AsyncStorage.getItem(key);
  const value = await SecureStore.getItemAsync(keystoreKey(key), OPTIONS);
  if (value !== null) return value;
  const legacy = await AsyncStorage.getItem(key);
  if (legacy !== null) {
    await SecureStore.setItemAsync(keystoreKey(key), legacy, OPTIONS);
    await AsyncStorage.removeItem(key);
  }
  return legacy;
}

export async function secureSetItem(key: string, value: string): Promise<void> {
  if (!useKeystore) return AsyncStorage.setItem(key, value);
  await SecureStore.setItemAsync(keystoreKey(key), value, OPTIONS);
}

export async function secureRemoveItem(key: string): Promise<void> {
  if (!useKeystore) return AsyncStorage.removeItem(key);
  await Promise.all([SecureStore.deleteItemAsync(keystoreKey(key), OPTIONS), AsyncStorage.removeItem(key)]);
}
