import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import type { AuthUser } from "../lib/auth";
import { invalidateTokenCache, partnerApi, setUnauthorizedHandler } from "../lib/api";
import { alert } from "../lib/alert";

type PartnerRole = AuthUser["partnerRole"];

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
  /** Re-checks the partner role against the server (or applies `role` when
   * the caller already has a fresh partner profile), so a viewer whose
   * owner disconnected them — or whose role lookup failed at login — gets
   * routed to the right UI by the layout guards. */
  syncPartnerRole: (role?: PartnerRole) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
export const AUTH_SESSION_KEY = "period-buddy.auth-session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Bumped on every sign-in/out and explicit role write. A background role
  // sync that started before one of those drops its (now stale) result —
  // e.g. the post-login sync racing connectPartner() would otherwise land
  // after login's own updateUser(viewer) and reset the role to null.
  const roleWriteSeq = useRef(0);

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

  // Register this device's push token whenever a session exists — after
  // login, and again on every launch (cheap, and it's what picks up a token
  // that changed after an app update/reinstall). While signed in, also
  // re-upload the token whenever FCM rotates it. Logging out drops the token
  // server-side (POST /api/logout), so a signed-out phone stops getting pushes.
  // Waits while first-run setup is open: its finish screen explains reminders
  // and asks for the permission itself, and this re-runs (without prompting
  // again) once isProfileComplete flips. Partner viewers never see that setup
  // (their profile stays incomplete), so they register straight away.
  const setupPending =
    session?.user?.isProfileComplete === false && session.user.partnerRole !== "viewer";
  useEffect(() => {
    if (!session?.token || setupPending) return;
    let cancelled = false;
    let removeListener: (() => void) | null = null;
    import("../lib/notifications")
      .then(({ registerForPushNotificationsAsync, addPushTokenRefreshListener }) => {
        if (cancelled) return;
        registerForPushNotificationsAsync().catch(() => {});
        removeListener = addPushTokenRefreshListener();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [session?.token, setupPending]);

  const signOut = useCallback(async () => {
    roleWriteSeq.current += 1;
    setSession(null);
    invalidateTokenCache();
    await AsyncStorage.removeItem(AUTH_SESSION_KEY).catch(() => {});
  }, []);

  // Awaited by callers before firing off any follow-up authenticated request
  // (e.g. resolving partner role right after login) — otherwise getToken()
  // can read AsyncStorage before this write lands and send that request with
  // no Authorization header at all.
  const signIn = useCallback(async (s: AuthSession) => {
    roleWriteSeq.current += 1;
    setSession(s);
    invalidateTokenCache();
    await AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(s)).catch(() => {});
  }, []);

  // Stable identity (via the functional setSession form, no `session` dep
  // needed) is load-bearing: screens call this from a `useEffect` keyed on
  // `updateUser` itself, and a reference that changed every call previously
  // caused an infinite effect → updateUser → re-render → new reference loop.
  const updateUser = useCallback((u: AuthUser) => {
    if (u.partnerRole !== undefined) roleWriteSeq.current += 1;
    setSession((current) => {
      if (!current) return null;
      // `partnerRole` is resolved client-side (partnerApi.getProfile() after
      // login) — the backend's user object never carries it. Callers that
      // pass a fresh server user (e.g. authApi.updateProfile() after a
      // settings toggle) would otherwise wipe it, and the partner-view layout
      // guard would then bounce a viewer into the owner dashboard. Keep the
      // existing role unless the caller explicitly sets one (null included,
      // as on partner disconnect).
      const partnerRole =
        u.partnerRole !== undefined ? u.partnerRole : current.user?.partnerRole;
      const next = { ...current, user: { ...u, partnerRole } };
      AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const applyPartnerRole = useCallback((role: PartnerRole) => {
    const normalized = role ?? null;
    setSession((current) => {
      if (!current?.user) return current;
      if ((current.user.partnerRole ?? null) === normalized) return current;
      const next = { ...current, user: { ...current.user, partnerRole: normalized } };
      AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const syncPartnerRole = useCallback(
    async (role?: PartnerRole) => {
      if (role !== undefined) {
        roleWriteSeq.current += 1;
        applyPartnerRole(role);
        return;
      }
      const seq = roleWriteSeq.current;
      try {
        const profile = await partnerApi.getProfile();
        if (seq !== roleWriteSeq.current) return;
        applyPartnerRole(profile.role ?? null);
      } catch {
        // Offline/server error: keep the role we already have rather than
        // guessing and flipping the UI.
      }
    },
    [applyPartnerRole],
  );

  // The role is only ever stored on this device, so re-check it on every
  // launch/login and whenever the app comes back to the foreground.
  useEffect(() => {
    if (!session?.token) return;
    syncPartnerRole();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") syncPartnerRole();
    });
    return () => sub.remove();
  }, [session?.token, syncPartnerRole]);

  // Any API call that comes back 401 (expired/invalid token, deactivated
  // account) clears the local session instead of failing silently, so the
  // dashboard's auth guard can redirect back to login.
  // A suspension mid-session gets the same sign-out, plus one explanation —
  // several requests in flight would otherwise each raise their own alert.
  const suspendedAlertShown = useRef(false);
  useEffect(() => {
    setUnauthorizedHandler((reason) => {
      signOut();
      if (reason === "suspended" && !suspendedAlertShown.current) {
        suspendedAlertShown.current = true;
        alert(
          "Account suspended",
          "Your account has been suspended, so you've been signed out. Please contact hello@thenura.care if you think this is a mistake.",
          [{ text: "OK", onPress: () => { suspendedAlertShown.current = false; } }],
        );
      }
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
      syncPartnerRole,
    }),
    [session, signIn, signOut, updateUser, syncPartnerRole],
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
