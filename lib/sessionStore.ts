import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Where the signed-in session lives on the device.
 *
 * The token goes to the OS keystore (iOS Keychain / Android Keystore via
 * expo-secure-store): encrypted by the OS, readable only by this app, only
 * after the phone's first unlock, and never restored from a backup onto
 * another phone. The rest of the session (the user's profile, which the
 * app needs before any network call) stays in AsyncStorage without it.
 *
 * Sessions saved before this (token inside the AsyncStorage JSON) are moved
 * over the first time they're read. Web has no keystore, so the web build
 * keeps the token in AsyncStorage (localStorage) as before.
 */

export const AUTH_SESSION_KEY = "period-buddy.auth-session";
const TOKEN_KEY = "period-buddy.auth-token";
const useKeystore = Platform.OS !== "web";
const KEYSTORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

async function writeToken(token: string) {
  if (useKeystore) await SecureStore.setItemAsync(TOKEN_KEY, token, KEYSTORE_OPTIONS);
  else await AsyncStorage.setItem(TOKEN_KEY, token);
}

async function readToken(): Promise<string | null> {
  return useKeystore ? SecureStore.getItemAsync(TOKEN_KEY, KEYSTORE_OPTIONS) : AsyncStorage.getItem(TOKEN_KEY);
}

async function deleteToken() {
  if (useKeystore) await SecureStore.deleteItemAsync(TOKEN_KEY, KEYSTORE_OPTIONS);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

type Stored = { token?: string | null } & Record<string, unknown>;

/** Save a whole session: the token to the keystore, the rest to AsyncStorage. */
export async function saveSession(session: Stored) {
  const { token, ...rest } = session;
  if (token) await writeToken(token);
  await AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(rest));
}

/** Update the stored profile part only (the token is unchanged). */
export async function saveSessionProfile(session: Stored) {
  const { token: _token, ...rest } = session;
  await AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(rest));
}

/** The stored session with its token, or null when signed out. Moves a legacy token into the keystore. */
export async function loadSession<T extends Stored>(): Promise<T | null> {
  const raw = await AsyncStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as T;
  if (parsed.token) {
    await saveSession(parsed);
    return parsed;
  }
  const token = await readToken();
  return token ? ({ ...parsed, token } as T) : null;
}

/**
 * Just the token, for API calls. Only while a session is stored: a keystore
 * token left behind by a sign-out that half failed must not keep working.
 */
export async function loadSessionToken(): Promise<string | null> {
  return (await loadSession())?.token ?? null;
}

export async function clearSession() {
  await Promise.all([AsyncStorage.removeItem(AUTH_SESSION_KEY), deleteToken()]);
}
