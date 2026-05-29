import React, { createContext, useContext, useMemo, useState } from "react";
import type { AuthUser } from "../lib/auth";

type AuthSession = {
  token: string;
  user?: AuthUser;
};

type BrowserStorage = {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
};

type AuthContextValue = {
  isAuthenticated: boolean;
  signIn: (session: AuthSession) => void;
  signOut: () => void;
  token: string | null;
  user: AuthUser | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const AUTH_SESSION_STORAGE_KEY = "period-buddy.auth-session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(readStoredSession);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: Boolean(session?.token),
      signIn: (session) => {
        setSession(session);
        writeStoredSession(session);
      },
      signOut: () => {
        setSession(null);
        removeStoredSession();
      },
      token: session?.token ?? null,
      user: session?.user ?? null,
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return value;
}

function getStorage() {
  const globalWithStorage = globalThis as typeof globalThis & {
    localStorage?: BrowserStorage;
  };

  return globalWithStorage.localStorage;
}

function readStoredSession() {
  try {
    const rawSession = getStorage()?.getItem(AUTH_SESSION_STORAGE_KEY);

    if (!rawSession) {
      return null;
    }

    const session = JSON.parse(rawSession) as AuthSession;
    return session.token ? session : null;
  } catch {
    return null;
  }
}

function writeStoredSession(session: AuthSession) {
  try {
    getStorage()?.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // In-memory auth still works when browser storage is unavailable.
  }
}

function removeStoredSession() {
  try {
    getStorage()?.removeItem(AUTH_SESSION_STORAGE_KEY);
  } catch {
    // Nothing to clean up when browser storage is unavailable.
  }
}
