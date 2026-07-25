import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../lib/auth";
import { setUnauthorizedHandler } from "../lib/api";

type AuthSession = {
  token: string;
  user?: AuthUser;
};

type AuthContextValue = {
  isAuthenticated: boolean;
  signIn: (session: AuthSession) => Promise<void>;
  signOut: () => Promise<void>;
  token: string | null;
  user: AuthUser | null;
  updateUser: (user: AuthUser) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
export const AUTH_SESSION_KEY = "period-buddy.auth-session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Hydrate from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(AUTH_SESSION_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as AuthSession;
          if (parsed.token) setSession(parsed);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (session?.token) {
      // Register for push notifications after authentication
      import("../lib/notifications")
        .then(({ registerForPushNotificationsAsync }) => {
          registerForPushNotificationsAsync().catch(() => {});
        })
        .catch(() => {});
    }
  }, [session?.token]);

  const signOut = useCallback(async () => {
    setSession(null);
    await AsyncStorage.removeItem(AUTH_SESSION_KEY).catch(() => {});
  }, []);

  // Awaited by callers before firing off any follow-up authenticated request
  // (e.g. resolving partner role right after login) — otherwise getToken()
  // can read AsyncStorage before this write lands and send that request with
  // no Authorization header at all.
  const signIn = useCallback(async (s: AuthSession) => {
    setSession(s);
    await AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(s)).catch(() => {});
  }, []);

  // Stable identity (via the functional setSession form, no `session` dep
  // needed) is load-bearing: screens call this from a `useEffect` keyed on
  // `updateUser` itself, and a reference that changed every call previously
  // caused an infinite effect → updateUser → re-render → new reference loop.
  const updateUser = useCallback((u: AuthUser) => {
    setSession((current) => {
      if (!current) return null;
      const next = { ...current, user: u };
      AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // Any API call that comes back 401 (expired/invalid token, deactivated
  // account) clears the local session instead of failing silently, so the
  // dashboard's auth guard can redirect back to login.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: Boolean(session?.token),
      signIn,
      signOut,
      token: session?.token ?? null,
      user: session?.user ?? null,
      updateUser,
    }),
    [session, signIn, signOut, updateUser],
  );

  // Don't render children until we know auth state (avoids flash)
  if (!loaded) return null;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
