import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState as RNAppState, type AppStateStatus } from "react-native";
import { useAuth } from "./auth-context";

type StoredAppLockSettings = {
  enabled: boolean;
};

const STORAGE_KEY = "period-buddy.app-lock";
const DEFAULT_SETTINGS: StoredAppLockSettings = { enabled: false };

type AuthResult = { success: boolean; error?: string };

type AppLockContextValue = {
  hasHydrated: boolean;
  settings: StoredAppLockSettings;
  isLocked: boolean;
  /** Human label for whatever the device's own lock screen uses — e.g.
   * "Face ID", "Fingerprint", or a generic "device lock" fallback. Purely
   * for display; the actual credential check is entirely owned by the OS. */
  deviceLockLabel: string;
  /** Runs the OS system-lock prompt (biometric with passcode/PIN/pattern
   * fallback) and, on success, turns App Lock on. */
  enableLock: () => Promise<AuthResult>;
  disableLock: () => Promise<void>;
  /** Runs the OS system-lock prompt to unlock the app. */
  unlock: () => Promise<AuthResult>;
  lockNow: () => void;
};

const AppLockContext = createContext<AppLockContextValue | undefined>(undefined);

/**
 * After the OS prompt closes, AppState events from it (Android's PIN/pattern
 * screen is a separate activity, so the app briefly goes to "background")
 * can still arrive; ignore them for this long so unlocking never re-locks.
 */
const AUTH_GRACE_MS = 1000;

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [hasHydrated, setHasHydrated] = useState(false);
  const [settings, setSettings] = useState<StoredAppLockSettings>(DEFAULT_SETTINGS);
  const [isLocked, setIsLocked] = useState(false);
  const [deviceLockLabel, setDeviceLockLabel] = useState("device lock");
  // True while the OS prompt is up (and for AUTH_GRACE_MS after), so the
  // AppState changes it causes don't re-lock the app.
  // A count rather than a flag, so an older prompt's grace timer can't
  // clear it while a newer prompt is still up.
  const authenticatingRef = useRef(0);
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;

  // Cold start: start locked in the same render that marks the settings
  // hydrated, so AppShell (which waits on `hasHydrated`) never paints app
  // content first. AuthProvider only mounts us once the session is known,
  // so isAuthenticated is already final here. Signing in later doesn't lock.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const next = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as StoredAppLockSettings) };
        setSettings(next);
        if (next.enabled && isAuthenticatedRef.current) setIsLocked(true);
      })
      .catch(() => {})
      .finally(() => setHasHydrated(true));
  }, []);

  // A signed-out app has nothing to lock; don't carry a lock into the next sign-in.
  useEffect(() => {
    if (!isAuthenticated) setIsLocked(false);
  }, [isAuthenticated]);

  const persist = useCallback(async (next: StoredAppLockSettings) => {
    setSettings(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // Detection is only used to pick a nicer label for the UI — the actual
  // authenticateAsync call below falls back to the device passcode/PIN/
  // pattern on its own, so we never need to gate on this being available.
  useEffect(() => {
    LocalAuthentication.supportedAuthenticationTypesAsync()
      .then((types) => {
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setDeviceLockLabel("Face ID");
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setDeviceLockLabel("fingerprint");
        } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
          setDeviceLockLabel("iris scan");
        } else {
          setDeviceLockLabel("device lock");
        }
      })
      .catch(() => setDeviceLockLabel("device lock"));
  }, []);

  // Lock as the app goes to the background, not when it comes back: the
  // app-switcher snapshot and the first frames after resume then already
  // show the lock. "inactive" alone (iOS Face ID sheet, Control Center,
  // permission prompts) doesn't count, or unlocking would re-lock at once.
  useEffect(() => {
    const subscription = RNAppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState !== "background" || authenticatingRef.current > 0) return;
      if (settings.enabled && isAuthenticatedRef.current) setIsLocked(true);
    });
    return () => subscription.remove();
  }, [settings.enabled]);

  // Delegates entirely to the OS: `disableDeviceFallback: false` lets it use
  // whatever the phone's own lock screen offers (fingerprint, Face ID, PIN,
  // pattern, or passcode) instead of a custom in-app credential.
  const authenticate = useCallback(async (promptMessage: string): Promise<AuthResult> => {
    authenticatingRef.current += 1;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        disableDeviceFallback: false,
        cancelLabel: "Cancel",
      });
      if (result.success) return { success: true };
      return {
        success: false,
        error: "error" in result ? String(result.error) : "Authentication failed",
      };
    } catch {
      return { success: false, error: "Your device lock isn't available here." };
    } finally {
      setTimeout(() => {
        authenticatingRef.current -= 1;
      }, AUTH_GRACE_MS);
    }
  }, []);

  const enableLock = useCallback(async () => {
    const result = await authenticate("Confirm it's you to turn on App Lock");
    if (result.success) {
      await persist({ enabled: true });
      setIsLocked(false);
    }
    return result;
  }, [authenticate, persist]);

  const disableLock = useCallback(async () => {
    await persist(DEFAULT_SETTINGS);
    setIsLocked(false);
  }, [persist]);

  const unlock = useCallback(async () => {
    const result = await authenticate("Unlock The Nura");
    if (result.success) setIsLocked(false);
    return result;
  }, [authenticate]);

  const lockNow = useCallback(() => {
    if (settings.enabled) setIsLocked(true);
  }, [settings.enabled]);

  const value = useMemo<AppLockContextValue>(
    () => ({
      hasHydrated,
      settings,
      isLocked: isLocked && settings.enabled && isAuthenticated,
      deviceLockLabel,
      enableLock,
      disableLock,
      unlock,
      lockNow,
    }),
    [hasHydrated, settings, isLocked, isAuthenticated, deviceLockLabel, enableLock, disableLock, unlock, lockNow],
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  const value = useContext(AppLockContext);
  if (!value) throw new Error("useAppLock must be used inside AppLockProvider");
  return value;
}
