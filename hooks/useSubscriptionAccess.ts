import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../components/auth-context";
import { subscriptionApi, type MySubscription } from "../lib/api";

// Mirrors useUserStats.ts's cache: consumed by ~13 stack screens, each of
// which would otherwise refetch GET /api/subscriptions/me on every visit.
const SUBSCRIPTION_CACHE_TTL_MS = 60_000;
let subscriptionCache: { data: MySubscription; fetchedAt: number } | null = null;

export type SubscriptionAccess = {
  /** False while the admin has the whole system switched off — every
   * hasAccess() call returns true in that state, matching the backend's
   * "ALL" sentinel (see subscriptionAccess.js#getUnlockedFeatureKeys). */
  subscriptionEnabled: boolean;
  summary: MySubscription | null;
  isLoading: boolean;
  /** Whether the signed-in user can use `featureKey` right now. Always true
   * until the first fetch resolves, so a screen never flashes a paywall
   * before it knows the real answer — call `isLoading` if you need to wait
   * for a confident result instead. */
  hasAccess: (featureKey: string) => boolean;
  refresh: () => Promise<MySubscription | null>;
};

/**
 * Single source of truth for "can this user use feature X right now,"
 * mirroring useUserStats.ts's shape (fetch once, expose derived values).
 * Screens that gate an action should call `hasAccess('key')` before firing
 * it, and render LockedFeatureCard/open PaywallModal when it's false — but
 * every gated backend route also enforces this independently via a 402, so
 * a screen that skips this hook still degrades safely (see
 * isFeatureLockedError in lib/api.ts).
 */
export function useSubscriptionAccess(): SubscriptionAccess {
  const { isAuthenticated } = useAuth();
  const [summary, setSummary] = useState<MySubscription | null>(subscriptionCache?.data ?? null);
  const [isLoading, setIsLoading] = useState(!subscriptionCache);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      subscriptionCache = null;
      setSummary(null);
      setIsLoading(false);
      return null;
    }
    try {
      const result = await subscriptionApi.getMe();
      subscriptionCache = { data: result, fetchedAt: Date.now() };
      setSummary(result);
      return result;
    } catch {
      setSummary(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      // Logging out invalidates the cache so a new sign-in never briefly
      // shows the previous account's cached entitlements.
      subscriptionCache = null;
      setSummary(null);
      setIsLoading(false);
      return;
    }

    const isFresh = subscriptionCache && Date.now() - subscriptionCache.fetchedAt < SUBSCRIPTION_CACHE_TTL_MS;
    if (isFresh) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const result = await subscriptionApi.getMe();
        if (!isMounted) return;
        subscriptionCache = { data: result, fetchedAt: Date.now() };
        setSummary(result);
      } catch {
        if (isMounted) setSummary(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  const hasAccess = (featureKey: string): boolean => {
    if (!summary) return true; // unknown yet / subscriptions off — never block optimistically
    if (!summary.subscriptionEnabled) return true;
    if (summary.unlockedFeatureKeys === "ALL") return true;
    return summary.unlockedFeatureKeys.includes(featureKey);
  };

  return {
    subscriptionEnabled: summary?.subscriptionEnabled ?? false,
    summary,
    isLoading,
    hasAccess,
    refresh,
  };
}
