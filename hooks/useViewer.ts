import { useMemo } from "react";
import { useAuth } from "../components/auth-context";
import { APP_PLATFORM, APP_VERSION } from "../lib/api";
import type { Viewer } from "../lib/appConfig";
import { useSubscriptionAccess } from "./useSubscriptionAccess";

export { APP_VERSION };

const PLATFORM: Viewer["platform"] = APP_PLATFORM;

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
