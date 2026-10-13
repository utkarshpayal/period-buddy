import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { authApi } from "../lib/api";
import { DEFAULT_HOME_LAYOUT, HomeLayout, parseHomeLayout } from "../lib/homeLayout";
import { useAuth } from "./auth-context";

/**
 * The signed-in person's Home layout (lib/homeLayout.ts). It belongs to the
 * account (`/api/auth/home-layout`), so it follows them to a new phone; a
 * per-account AsyncStorage copy draws Home right away and keeps an edit that
 * couldn't be sent yet (`dirty`), which is sent again on the next launch.
 */
const cacheKey = (userId: string) => `period-buddy.home-layout.${userId}`;
const SAVE_DELAY_MS = 600;

type Cached = { layout: HomeLayout; dirty: boolean };

type HomeLayoutContextValue = {
  layout: HomeLayout;
  setLayout: (next: HomeLayout) => void;
};

const HomeLayoutContext = createContext<HomeLayoutContextValue>({ layout: DEFAULT_HOME_LAYOUT, setLayout: () => {} });

async function readCache(userId: string): Promise<Cached | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { layout: parseHomeLayout(parsed?.layout), dirty: parsed?.dirty === true };
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
  const [state, setState] = useState<{ userId: string | null; layout: HomeLayout }>({ userId: null, layout: DEFAULT_HOME_LAYOUT });
  // Bumped on every local edit, so a load that started earlier can't overwrite it.
  const editSeq = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback(async (id: string, layout: HomeLayout) => {
    try {
      await authApi.saveHomeLayout(layout);
      writeCache(id, { layout, dirty: false });
    } catch {
      // Stays dirty in the cache and goes out on the next launch.
    }
  }, []);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setState({ userId, layout: DEFAULT_HOME_LAYOUT });
    if (!userId) return;
    let cancelled = false;
    const seq = ++editSeq.current;
    (async () => {
      const cached = await readCache(userId);
      if (cancelled || seq !== editSeq.current) return;
      if (cached) setState({ userId, layout: cached.layout });
      if (cached?.dirty) {
        send(userId, cached.layout);
        return;
      }
      try {
        const layout = parseHomeLayout(await authApi.getHomeLayout());
        if (cancelled || seq !== editSeq.current) return;
        setState({ userId, layout });
        writeCache(userId, { layout, dirty: false });
      } catch {
        // Offline or an older backend: keep what we have.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, send]);

  const setLayout = useCallback(
    (layout: HomeLayout) => {
      if (!userId) return;
      editSeq.current += 1;
      setState({ userId, layout });
      writeCache(userId, { layout, dirty: true });
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => send(userId, layout), SAVE_DELAY_MS);
    },
    [userId, send],
  );

  const value = useMemo(
    () => ({ layout: state.userId === userId ? state.layout : DEFAULT_HOME_LAYOUT, setLayout }),
    [state, userId, setLayout],
  );
  return <HomeLayoutContext.Provider value={value}>{children}</HomeLayoutContext.Provider>;
}

export const useHomeLayout = () => useContext(HomeLayoutContext);
