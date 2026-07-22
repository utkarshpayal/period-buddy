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

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [hasHydrated, setHasHydrated] = useState(false);
  const [settings, setSettings] = useState<StoredAppLockSettings>(DEFAULT_SETTINGS);
  const [isLocked, setIsLocked] = useState(false);
  const [deviceLockLabel, setDeviceLockLabel] = useState("device lock");
  const appStateRef = useRef<AppStateStatus>(RNAppState.currentState);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as StoredAppLockSettings;
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        }
      })
      .catch(() => {})
      .finally(() => setHasHydrated(true));
  }, []);

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

  // Start locked once we know the user has app lock enabled — re-lock is
  // handled below on every background -> foreground transition too.
  useEffect(() => {
    if (hasHydrated && settings.enabled && isAuthenticated) {
      setIsLocked(true);
    }
  }, [hasHydrated, settings.enabled, isAuthenticated]);

  useEffect(() => {
    const subscription = RNAppState.addEventListener("change", (nextState) => {
      const cameFromBackground =
        appStateRef.current.match(/inactive|background/) && nextState === "active";
      appStateRef.current = nextState;
      if (cameFromBackground && settings.enabled && isAuthenticated) {
        setIsLocked(true);
      }
    });
    return () => subscription.remove();
  }, [settings.enabled, isAuthenticated]);

  // Delegates entirely to the OS: `disableDeviceFallback: false` lets it use
  // whatever the phone's own lock screen offers (fingerprint, Face ID, PIN,
  // pattern, or passcode) instead of a custom in-app credential.
  const authenticate = useCallback(async (promptMessage: string): Promise<AuthResult> => {
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
