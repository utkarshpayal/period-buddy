import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { authApi } from "../lib/api";
import { DEFAULT_HOME_LAYOUT, HomeLayout, parseHomeLayout } from "../lib/homeLayout";
import { useAuth } from "./auth-context";

/**
 * The signed-in person's Home layout (lib/homeLayout.ts). It belongs to the
 * account (`/api/auth/home-layout`), so it follows them to a new phone; a
 * per-account AsyncStorage copy draws Home right away and keeps an edit that
 * couldn't be sent yet (`dirty`), which is sent again on the next launch
 * unless the account has a newer layout saved from another device.
 * Saves go out one at a time, and only the newest edit marks the copy clean.
 */
const cacheKey = (userId: string) => `period-buddy.home-layout.${userId}`;
const SAVE_DELAY_MS = 600;

/** `editedAt`: when the unsent edit was made (ms), to compare with the server's `updatedAt`. */
type Cached = { layout: HomeLayout; dirty: boolean; editedAt?: number };

type HomeLayoutContextValue = {
  layout: HomeLayout;
  /** False until this account's saved copy has been read, so Home doesn't flash the default first. */
  ready: boolean;
  setLayout: (next: HomeLayout) => void;
};

const HomeLayoutContext = createContext<HomeLayoutContextValue>({ layout: DEFAULT_HOME_LAYOUT, ready: true, setLayout: () => {} });

async function readCache(userId: string): Promise<Cached | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      layout: parseHomeLayout(parsed?.layout),
      dirty: parsed?.dirty === true,
      editedAt: typeof parsed?.editedAt === "number" ? parsed.editedAt : undefined,
    };
  } catch {
    return null;
  }
}

const writeCache = (userId: string, value: Cached) =>
  AsyncStorage.setItem(cacheKey(userId), JSON.stringify(value)).catch(() => {});

export function HomeLayoutProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Partner viewers never see the owner's Home, so they have nothing to load.
  const userId = user?.partnerRole === "viewer" ? null : user?._id ?? null;
  const [state, setState] = useState<{ userId: string | null; layout: HomeLayout; ready: boolean }>({
    userId: null,
    layout: DEFAULT_HOME_LAYOUT,
    ready: false,
  });
  // Bumped on every local edit (and load), so a load or save that started
  // earlier can't overwrite it.
  const editSeq = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Saves run one after another, so an older one can't land after a newer one.
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  // The account signed in right now. A queued save for a different one
  // (signed out or switched since) must not go out under the new token.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const send = useCallback((id: string, layout: HomeLayout, seq: number) => {
    saveQueue.current = saveQueue.current.then(async () => {
      // A newer edit has been made; its own save sends it.
      if (seq !== editSeq.current || id !== userIdRef.current) return;
      try {
        await authApi.saveHomeLayout(layout);
        if (seq === editSeq.current) writeCache(id, { layout, dirty: false });
      } catch {
        // Stays dirty in the cache and goes out on the next launch.
      }
    });
  }, []);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setState({ userId, layout: DEFAULT_HOME_LAYOUT, ready: !userId });
    if (!userId) return;
    let cancelled = false;
    const seq = ++editSeq.current;
    (async () => {
      const cached = await readCache(userId);
      if (cancelled || seq !== editSeq.current) return;
      setState({ userId, layout: cached?.layout ?? DEFAULT_HOME_LAYOUT, ready: true });
      let remote: ReturnType<typeof parseHomeLayout> | null = null;
      let remoteAt = NaN;
      try {
        const payload = await authApi.getHomeLayout();
        remote = parseHomeLayout(payload);
        remoteAt = Date.parse(payload?.updatedAt ?? "");
      } catch {
        // Offline or an older backend: keep what we have.
      }
      if (cancelled || seq !== editSeq.current) return;
      // An unsent edit goes out, unless another device saved after it was made.
      if (cached?.dirty && !(remote && cached.editedAt && remoteAt > cached.editedAt)) {
        send(userId, cached.layout, seq);
        return;
      }
      if (!remote) return;
      setState({ userId, layout: remote, ready: true });
      writeCache(userId, { layout: remote, dirty: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, send]);

  // Unmounting (sign-out) drops a pending save; the edit stays dirty in that
  // account's cache and goes out on its next sign-in.
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      editSeq.current += 1;
      userIdRef.current = null;
    },
    [],
  );

  const setLayout = useCallback(
    (layout: HomeLayout) => {
      if (!userId) return;
      const seq = ++editSeq.current;
      setState({ userId, layout, ready: true });
      writeCache(userId, { layout, dirty: true, editedAt: Date.now() });
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => send(userId, layout, seq), SAVE_DELAY_MS);
    },
    [userId, send],
  );

  const value = useMemo(
    () => ({
      layout: state.userId === userId ? state.layout : DEFAULT_HOME_LAYOUT,
      ready: !userId || (state.userId === userId && state.ready),
      setLayout,
    }),
    [state, userId, setLayout],
  );
  return <HomeLayoutContext.Provider value={value}>{children}</HomeLayoutContext.Provider>;
}

export const useHomeLayout = () => useContext(HomeLayoutContext);
