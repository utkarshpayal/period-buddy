import { useEffect, useRef } from "react";
import { useAppConfig } from "./app-config";
import { useAuth } from "./auth-context";
import { useViewer } from "../hooks/useViewer";
import { setLaunchContext } from "../lib/launchGuard";

/**
 * Glue between the App CMS config and auth, mounted once in AppShell
 * (inside AuthProvider, which AppConfigProvider sits above):
 *  - refetches the config when the signed-in account changes, since launch
 *    states make it per user (rollout slice, testers, Notify me);
 *  - mirrors the latest config + viewer into lib/launchGuard.ts so plain
 *    navigation helpers can apply the route guard.
 * Renders nothing.
 */
export function AppConfigSync() {
  const { config, refresh } = useAppConfig();
  const viewer = useViewer();
  const { isAuthenticated, user } = useAuth();
  const account = isAuthenticated ? user?._id ?? "signed-in" : null;
  const lastAccount = useRef(account);

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
