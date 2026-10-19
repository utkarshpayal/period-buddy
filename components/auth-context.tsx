import { clearSession, loadSession, saveSession, saveSessionProfile } from "../lib/sessionStore";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, InteractionManager } from "react-native";
import { usePathname } from "expo-router";
import type { AuthUser } from "../lib/auth";
import { partnerApi, setSessionToken, setUnauthorizedHandler } from "../lib/api";
import { alert } from "../lib/alert";
import { emitDataChange } from "../lib/data-sync";
import { clearForestCache } from "../lib/forestCache";
import { clearQueryCache } from "../lib/queryCache";
import { clearStoredAppState } from "./AppState";

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

// Screens a signed-in user only passes through on the way into the app
// (they router.replace() to the dashboard). Push registration waits until
// the user has left them, so the permission prompt shows over the tracker.
const PUSH_DEFER_PATHS = new Set(["/", "/login", "/signup", "/oauthredirect"]);
// Lets the replace() into the dashboard finish animating before the prompt.
const PUSH_PROMPT_DELAY_MS = 600;
export { AUTH_SESSION_KEY } from "../lib/sessionStore";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Bumped on every sign-in/out and explicit role write. A background role
  // sync that started before one of those drops its (now stale) result —
  // e.g. the post-login sync racing connectPartner() would otherwise land
  // after login's own updateUser(viewer) and reset the role to null.
  const roleWriteSeq = useRef(0);
  // Which account the device last held, so signIn can tell a new account from a refresh of the same one.
  const signedInUserId = useRef<string | null>(null);

  // Hydrate from the device (lib/sessionStore.ts) on mount
  useEffect(() => {
    loadSession<AuthSession>()
      .then((parsed) => {
        if (parsed?.token) {
          signedInUserId.current = parsed.user?._id ?? null;
          setSessionToken(parsed.token);
          setSession(parsed);
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
  // The OS permission prompt must open over the screen the person lands on
  // (tracker / partner overview), never over login, signup or the welcome
  // screen: on Android the dialog pauses the activity, so a prompt fired the
  // moment signIn() set the session froze login in the background until it
  // was answered. Hold off while an entry screen is showing, then wait for
  // the landing transition to finish before asking.
  const pathname = usePathname();
  const onEntryScreen = PUSH_DEFER_PATHS.has(pathname);
  useEffect(() => {
    if (!session?.token || setupPending || onEntryScreen) return;
    let cancelled = false;
    let removeListener: (() => void) | null = null;
    let interaction: { cancel: () => void } | null = null;
    const timer = setTimeout(() => {
      interaction = InteractionManager.runAfterInteractions(() => {
        import("../lib/notifications")
          .then(({ registerForPushNotificationsAsync, addPushTokenRefreshListener }) => {
            if (cancelled) return;
            registerForPushNotificationsAsync().catch(() => {});
            removeListener = addPushTokenRefreshListener();
          })
          .catch(() => {});
      });
    }, PUSH_PROMPT_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      interaction?.cancel();
      removeListener?.();
    };
  }, [session?.token, setupPending, onEntryScreen]);

  // Per-account data held outside React state must not carry over to the
  // next session: the 60s dashboard/subscription caches (useUserStats,
  // useSubscriptionAccess — both drop their cache on these topics) and the
  // locally persisted day logs, the Forest's offline copy + queued waterings,
  // and every response cached by lib/queryCache.ts (useAsyncLoad's cacheKey).
  const clearAccountData = useCallback(() => {
    clearQueryCache();
    emitDataChange("dashboard", "subscription");
    clearStoredAppState();
    clearForestCache();
  }, []);

  const signOut = useCallback(async () => {
    roleWriteSeq.current += 1;
    setSession(null);
    setSessionToken(null);
    clearAccountData();
    await clearSession().catch(() => {});
  }, [clearAccountData]);

  // The token goes to the API client (setSessionToken) before the session is
  // set, so the screens that mount on sign-in send it on their very first
  // request instead of reading the device store before the write below lands.
  const signIn = useCallback(async (s: AuthSession) => {
    roleWriteSeq.current += 1;
    // Onboarding's finish re-signs-in the same user; only a different account clears.
    if (signedInUserId.current !== (s.user?._id ?? null)) clearAccountData();
    signedInUserId.current = s.user?._id ?? null;
    setSessionToken(s.token);
    setSession(s);
    await saveSession(s).catch(() => {});
  }, [clearAccountData]);

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
      const user = { ...u, partnerRole };
      // Most calls (every useUserStats fetch) pass back the same profile;
      // keeping `current` then spares all useAuth consumers — AppShell and
      // the Stack included — a re-render, and the device a storage write.
      if (current.user && JSON.stringify(current.user) === JSON.stringify(user)) return current;
      const next = { ...current, user };
      saveSessionProfile(next).catch(() => {});
      return next;
    });
  }, []);

  const applyPartnerRole = useCallback((role: PartnerRole) => {
    const normalized = role ?? null;
    setSession((current) => {
      if (!current?.user) return current;
      if ((current.user.partnerRole ?? null) === normalized) return current;
      const next = { ...current, user: { ...current.user, partnerRole: normalized } };
      saveSessionProfile(next).catch(() => {});
      return next;
    });
  }, []);

  // One server lookup at a time: callers arriving while it's in flight share it.
  const roleSyncInFlight = useRef<Promise<void> | null>(null);

  const syncPartnerRole = useCallback(
    async (role?: PartnerRole) => {
      if (role !== undefined) {
        roleWriteSeq.current += 1;
        applyPartnerRole(role);
        return;
      }
      if (roleSyncInFlight.current) return roleSyncInFlight.current;
      const seq = roleWriteSeq.current;
      const run = (async () => {
        try {
          const profile = await partnerApi.getProfile();
          if (seq !== roleWriteSeq.current) return;
          applyPartnerRole(profile.role ?? null);
        } catch {
          // Offline/server error: keep the role we already have rather than
          // guessing and flipping the UI.
        } finally {
          roleSyncInFlight.current = null;
        }
      })();
      roleSyncInFlight.current = run;
      return run;
    },
    [applyPartnerRole],
  );

  // The role is only ever stored on this device, so re-check it on every
  // launch/login and whenever the app comes back from the background (not
  // on inactive -> active: the Face ID sheet, Control Center and permission
  // prompts all cause that, and none can change the role).
  useEffect(() => {
    if (!session?.token) return;
    void syncPartnerRole();
    let previous = AppState.currentState;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && previous === "background") void syncPartnerRole();
      previous = state;
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
