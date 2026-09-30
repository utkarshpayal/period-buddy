import { useEffect, useRef } from "react";
import { usePathname } from "expo-router";
import { useAppConfig } from "./app-config";
import { useAuth } from "./auth-context";
import { useViewer } from "../hooks/useViewer";
import { featureForRoute } from "../lib/appConfig";
import { setLaunchContext } from "../lib/launchGuard";
import { trackUse } from "../lib/usage";

/**
 * Glue between the App CMS config and auth, mounted once in AppShell
 * (inside AuthProvider, which AppConfigProvider sits above):
 *  - refetches the config when the signed-in account changes, since launch
 *    states make it per user (rollout slice, testers, Notify me);
 *  - mirrors the latest config + viewer into lib/launchGuard.ts so plain
 *    navigation helpers can apply the route guard;
 *  - counts an `open` for the usage beacon each time a feature's screen is
 *    entered (moving around inside the same feature doesn't count again).
 * Renders nothing.
 */
export function AppConfigSync() {
  const { config, refresh } = useAppConfig();
  const viewer = useViewer();
  const { isAuthenticated, user } = useAuth();
  const account = isAuthenticated ? user?._id ?? "signed-in" : null;
  const lastAccount = useRef(account);
  const pathname = usePathname();
  const lastFeature = useRef<string | null>(null);

  useEffect(() => {
    const feature = featureForRoute(config, pathname);
    if (feature && feature !== lastFeature.current) trackUse(feature, "open");
    lastFeature.current = feature;
    // Only a navigation counts; a config refresh on the same screen doesn't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    setLaunchContext(config, viewer);
  }, [config, viewer]);

  useEffect(() => {
    // AppConfigProvider already fetched with the session restored at launch;
    // only a later sign-in, sign-out or account switch needs a new copy.
    if (lastAccount.current === account) return;
    lastAccount.current = account;
    refresh();
  }, [account, refresh]);

  return null;
}
