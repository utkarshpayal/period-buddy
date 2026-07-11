import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../lib/auth";

type AuthSession = {
  token: string;
  user?: AuthUser;
};

type AuthContextValue = {
  isAuthenticated: boolean;
  signIn: (session: AuthSession) => void;
  signOut: () => Promise<void>;
  token: string | null;
  user: AuthUser | null;
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

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: Boolean(session?.token),
      signIn: (s) => {
        setSession(s);
        AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(s)).catch(() => {});
      },
      signOut: async () => {
        setSession(null);
        await AsyncStorage.removeItem(AUTH_SESSION_KEY).catch(() => {});
      },
      token: session?.token ?? null,
      user: session?.user ?? null,
    }),
    [session],
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
