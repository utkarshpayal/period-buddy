import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { appConfigApi } from "../lib/api";
import { AppConfig, DEFAULT_APP_CONFIG, parseAppConfig } from "../lib/appConfig";

/**
 * Supplies the App CMS layout (lib/appConfig.ts) to the whole app. Sits
 * above ThemeProvider in app/_layout.tsx because the theme reads its colour
 * overrides from here.
 *
 * Load order: built-in defaults render immediately → the last downloaded
 * copy from AsyncStorage replaces them as soon as it's read → a fresh fetch
 * replaces that. It refetches when the app comes back to the foreground
 * (at most every REFRESH_MS), so a CMS change reaches a running app within
 * minutes without a restart, and on sign-in/out (components/AppConfigSync.tsx),
 * since launch states make the config per user. Every failure is silent: the app keeps
 * whatever it last had, since layout config must never block the app.
 */

const CACHE_KEY = "period-buddy.app-config";
const DISMISSED_KEY = "period-buddy.dismissed-banners";
const REFRESH_MS = 3 * 60 * 1000;

type AppConfigContextValue = {
  config: AppConfig;
  /** Banner ids the user closed (dismissible banners only), per device. */
  dismissedBanners: ReadonlySet<string>;
  dismissBanner: (id: string) => void;
  refresh: () => Promise<void>;
};

const AppConfigContext = createContext<AppConfigContextValue | undefined>(undefined);

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [dismissedBanners, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const lastFetch = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  // A fetch that lands before the cache read must not be overwritten by the older cached copy.
  const fetched = useRef(false);

  // A refresh asked for mid-fetch (e.g. right after sign-in, while the
  // signed-out fetch is still out) runs again once it lands, since the
  // config is per user and the older response would be the wrong one.
  const again = useRef(false);

  const refresh = useCallback((): Promise<void> => {
    if (inFlight.current) {
      again.current = true;
      return inFlight.current;
    }
    inFlight.current = (async () => {
      try {
        do {
          again.current = false;
          try {
            const raw = await appConfigApi.get();
            // Superseded by a newer request: drop this one, the loop refetches.
            if (again.current) continue;
            fetched.current = true;
            lastFetch.current = Date.now();
            setConfig(parseAppConfig(raw));
            AsyncStorage.setItem(CACHE_KEY, JSON.stringify(raw)).catch(() => undefined);
          } catch {
            // Offline, old backend without /api/app-config, server error: keep what we have.
          }
        } while (again.current);
      } finally {
        inFlight.current = null;
      }
    })();
    return inFlight.current;
  }, []);

  useEffect(() => {
    let alive = true;
    AsyncStorage.multiGet([CACHE_KEY, DISMISSED_KEY])
      .then(([[, cached], [, dismissed]]) => {
        if (!alive) return;
        if (cached && !fetched.current) {
          try {
            setConfig(parseAppConfig(JSON.parse(cached)));
          } catch {
            /* corrupt cache: defaults stay until the fetch lands */
          }
        }
        if (dismissed) {
          try {
            const ids = JSON.parse(dismissed);
            if (Array.isArray(ids)) setDismissed(new Set(ids.map(String)));
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => undefined);
    refresh();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() - lastFetch.current > REFRESH_MS) refresh();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [refresh]);

  const dismissBanner = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      // Keep the list short; old campaign ids are never shown again anyway.
      AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...next].slice(-100))).catch(() => undefined);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ config, dismissedBanners, dismissBanner, refresh }),
    [config, dismissedBanners, dismissBanner, refresh]
  );

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig() {
  const value = useContext(AppConfigContext);
  if (!value) throw new Error("useAppConfig must be used inside AppConfigProvider");
  return value;
}
