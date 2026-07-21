import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
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

export type LockMethod = "biometric" | "pattern";

type StoredAppLockSettings = {
  enabled: boolean;
  method: LockMethod | null;
  patternHash: string | null;
};

const STORAGE_KEY = "period-buddy.app-lock";
const DEFAULT_SETTINGS: StoredAppLockSettings = {
  enabled: false,
  method: null,
  patternHash: null,
};

type AppLockContextValue = {
  hasHydrated: boolean;
  settings: StoredAppLockSettings;
  isLocked: boolean;
  biometricAvailable: boolean;
  biometricLabel: string;
  refreshBiometricAvailability: () => Promise<boolean>;
  hashPattern: (sequence: number[]) => Promise<string>;
  /** Runs a live OS biometric check — does NOT persist anything on its own.
   * Biometric is only ever saved together with a pattern fallback (see
   * `saveLock`), the same way phone OSes always back Face/Touch ID with a
   * passcode — so a failed/unavailable scanner is never a full lockout. */
  verifyBiometric: () => Promise<{ success: boolean; error?: string }>;
  saveLock: (method: LockMethod, patternHash: string) => Promise<void>;
  disableLock: () => Promise<void>;
  unlockWithBiometric: () => Promise<{ success: boolean; error?: string }>;
  unlockWithPattern: (patternHash: string) => boolean;
  lockNow: () => void;
};

const AppLockContext = createContext<AppLockContextValue | undefined>(undefined);

export async function hashPatternSequence(sequence: number[]): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    sequence.join("-"),
  );
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [hasHydrated, setHasHydrated] = useState(false);
  const [settings, setSettings] = useState<StoredAppLockSettings>(DEFAULT_SETTINGS);
  const [isLocked, setIsLocked] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biometric");
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

  const refreshBiometricAvailability = useCallback(async () => {
    try {
      const [hasHardware, isEnrolled, types] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
      ]);
      const available = hasHardware && isEnrolled;
      setBiometricAvailable(available);
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricLabel("Face ID");
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricLabel("Fingerprint");
      } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
        setBiometricLabel("Iris scan");
      } else {
        setBiometricLabel("Biometric");
      }
      return available;
    } catch {
      setBiometricAvailable(false);
      return false;
    }
  }, []);

  useEffect(() => {
    refreshBiometricAvailability();
  }, [refreshBiometricAvailability]);

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

  const hashPattern = useCallback((sequence: number[]) => hashPatternSequence(sequence), []);

  const verifyBiometric = useCallback(async () => {
    try {
      const available = await refreshBiometricAvailability();
      if (!available) {
        return {
          success: false,
          error:
            "No fingerprint or face unlock is set up on this device yet. Set one up in your device settings first.",
        };
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Confirm it's you to turn on App Lock",
      });
      if (!result.success) {
        return { success: false, error: "Couldn't verify — App Lock was not turned on." };
      }
      return { success: true };
    } catch {
      return { success: false, error: "Biometric unlock isn't available here." };
    }
  }, [refreshBiometricAvailability]);

  const saveLock = useCallback(
    async (method: LockMethod, patternHash: string) => {
      await persist({ enabled: true, method, patternHash });
      setIsLocked(false);
    },
    [persist],
  );

  const disableLock = useCallback(async () => {
    // Wipe the method/pattern hash too, not just the enabled flag, so
    // turning App Lock back on always starts from a clean setup instead of
    // silently reactivating whatever was configured before.
    await persist(DEFAULT_SETTINGS);
    setIsLocked(false);
  }, [persist]);

  const unlockWithBiometric = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock The Nura",
      });
      if (result.success) {
        setIsLocked(false);
        return { success: true };
      }
      return { success: false, error: "error" in result ? String(result.error) : "Authentication failed" };
    } catch {
      return { success: false, error: "Biometric unlock isn't available here." };
    }
  }, []);

  const unlockWithPattern = useCallback(
    (patternHash: string) => {
      const matches = Boolean(settings.patternHash) && patternHash === settings.patternHash;
      if (matches) setIsLocked(false);
      return matches;
    },
    [settings.patternHash],
  );

  const lockNow = useCallback(() => {
    if (settings.enabled) setIsLocked(true);
  }, [settings.enabled]);

  const value = useMemo<AppLockContextValue>(
    () => ({
      hasHydrated,
      settings,
      isLocked: isLocked && settings.enabled && isAuthenticated,
      biometricAvailable,
      biometricLabel,
      refreshBiometricAvailability,
      hashPattern,
      verifyBiometric,
      saveLock,
      disableLock,
      unlockWithBiometric,
      unlockWithPattern,
      lockNow,
    }),
    [
      hasHydrated,
      settings,
      isLocked,
      isAuthenticated,
      biometricAvailable,
      biometricLabel,
      refreshBiometricAvailability,
      hashPattern,
      verifyBiometric,
      saveLock,
      disableLock,
      unlockWithBiometric,
      unlockWithPattern,
      lockNow,
    ],
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  const value = useContext(AppLockContext);
  if (!value) throw new Error("useAppLock must be used inside AppLockProvider");
  return value;
}
