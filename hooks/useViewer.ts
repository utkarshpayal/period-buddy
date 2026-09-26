import Constants from "expo-constants";
import { useMemo } from "react";
import { Platform } from "react-native";
import { useAuth } from "../components/auth-context";
import type { Viewer } from "../lib/appConfig";
import { useSubscriptionAccess } from "./useSubscriptionAccess";

/** The installed app's version (app.json `version`), e.g. "1.0.0". */
export const APP_VERSION =
  Constants.expoConfig?.version ?? (Constants as unknown as { nativeAppVersion?: string }).nativeAppVersion ?? "0.0.0";

const PLATFORM: Viewer["platform"] = Platform.OS === "ios" ? "ios" : Platform.OS === "web" ? "web" : "android";

/**
 * Who's looking, for App CMS audience rules (lib/appConfig.ts
 * `matchesAudience`): signed in or not, premium (any active entitlement),
 * platform and app version. While the subscription is still loading the
 * user counts as free, so premium-only items appear a moment late rather
 * than flashing for free users.
 */
export function useViewer(): Viewer {
  const { isAuthenticated } = useAuth();
  const { summary } = useSubscriptionAccess();
  const premium = Boolean(summary?.entitlements?.some((e) => e.status === "active"));
  return useMemo(
    () => ({ signedIn: isAuthenticated, premium: isAuthenticated && premium, platform: PLATFORM, appVersion: APP_VERSION }),
    [isAuthenticated, premium]
  );
}
