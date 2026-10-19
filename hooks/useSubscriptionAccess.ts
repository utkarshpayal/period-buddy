import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../components/auth-context";
import { subscriptionApi, type MySubscription } from "../lib/api";
import { peekQuery, subscribeQuery } from "../lib/queryCache";
import { useDataRefresh } from "./useDataRefresh";

// subscriptionApi.getMe is cached in lib/queryCache under this key (~13
// screens mount this hook), which also clears it on sign-out and marks it
// stale after a purchase.
const CACHE_KEY = "subscription:me";

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
 * isFeatureLockedError in lib/api/client.ts).
 */
export function useSubscriptionAccess(): SubscriptionAccess {
  const { isAuthenticated } = useAuth();
  const [summary, setSummary] = useState<MySubscription | null>(() =>
    isAuthenticated ? (peekQuery<MySubscription>(CACHE_KEY) ?? null) : null,
  );
  const [isLoading, setIsLoading] = useState(() => isAuthenticated && peekQuery(CACHE_KEY) === undefined);

  // Any instance's fetch (or a purchase screen's) updates every mounted gate.
  useEffect(
    () =>
      subscribeQuery(CACHE_KEY, (value) => {
        setSummary(value as MySubscription);
        setIsLoading(false);
      }),
    [],
  );

  const load = useCallback(
    async (force: boolean) => {
      if (!isAuthenticated) {
        setSummary(null);
        setIsLoading(false);
        return null;
      }
      try {
        const result = await subscriptionApi.getMe({ force });
        setSummary(result);
        return result;
      } catch {
        // Unknown entitlements never block (hasAccess is optimistic); the
        // backend's 402 still guards every gated route.
        if (!force) setSummary(null);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [isAuthenticated],
  );

  const refresh = useCallback(() => load(true), [load]);

  // Every mounted gate (FeatureGate, action-level checks on screens under
  // the current one) picks up a purchase made anywhere, e.g. in a
  // PaywallModal or on the My Subscription screen. Keeps the last known
  // entitlements if the refetch fails.
  useDataRefresh(["subscription"], async () => {
    if (!isAuthenticated) return;
    await subscriptionApi.getMe().then(setSummary, () => {});
  });

  useEffect(() => {
    let isMounted = true;
    if (!isAuthenticated) {
      setSummary(null);
      setIsLoading(false);
      return;
    }
    // Served from the cache while fresh; a shared request otherwise.
    subscriptionApi.getMe().then(
      (result) => {
        if (isMounted) setSummary(result);
      },
      () => {
        if (isMounted && peekQuery(CACHE_KEY) === undefined) setSummary(null);
      },
    ).finally(() => {
      if (isMounted) setIsLoading(false);
    });
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
