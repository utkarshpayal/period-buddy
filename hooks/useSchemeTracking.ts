import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { alert } from "../lib/alert";
import {
  getFriendlyErrorMessage,
  isFeatureLockedError,
  schemeApplicationsApi,
  type GovernmentBenefit,
  type SchemeApplication,
} from "../lib/api";
import { useDataRefresh } from "./useDataRefresh";
import { useSubscriptionAccess } from "./useSubscriptionAccess";

export const SCHEME_TRACKING_FEATURE_KEY = "government_scheme_applications";

const PAGE_SIZE = 50;
// Enough for anyone's real list; stops a runaway loop on a broken backend.
const MAX_PAGES = 20;

const schemeIdOf = (a: SchemeApplication) => (typeof a.schemeId === "object" ? a.schemeId?._id : a.schemeId);

/** Whether `schemeId` is in My applications, looking through every page. */
async function isTracked(schemeId: string): Promise<boolean> {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await schemeApplicationsApi.list({ page, limit: PAGE_SIZE });
    if (res.applications.some((a) => schemeIdOf(a) === schemeId)) return true;
    if (res.pagination.page >= res.pagination.pages) return false;
  }
  return false;
}

/**
 * "Track this scheme": whether the scheme is already in My applications, the
 * save itself, and the paywall when the save is locked (opened from the tap,
 * or from a 402 the server sends anyway). After a purchase made from that
 * paywall, the save is retried.
 */
export function useSchemeTracking(scheme: GovernmentBenefit | undefined) {
  const router = useRouter();
  const { hasAccess, refresh: refreshSubscriptionAccess } = useSubscriptionAccess();
  const [saved, setSaved] = useState(false);
  const [applying, setApplying] = useState(false);
  const applyingRef = useRef(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const schemeId = scheme?._id;

  // Re-checked when applications change (e.g. one removed on the My
  // applications screen pushed from here). A failed check keeps the last
  // answer: Track still works, and the server reports "already tracking".
  const [applicationsVersion, setApplicationsVersion] = useState(0);
  useDataRefresh(["schemeApplications"], () => setApplicationsVersion((v) => v + 1));
  useEffect(() => {
    if (!schemeId) return;
    let mounted = true;
    isTracked(schemeId)
      .then((tracked) => {
        if (mounted) setSaved(tracked);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [schemeId, applicationsVersion]);

  const submitApplication = useCallback(async () => {
    if (!schemeId || applyingRef.current) return;
    applyingRef.current = true;
    setApplying(true);
    try {
      const res = await schemeApplicationsApi.create({ schemeId });
      setSaved(true);
      alert(
        res.alreadyExists ? "Already tracking" : "Saved to My applications",
        res.alreadyExists
          ? "This scheme is already in My applications, where you can follow up."
          : "You can follow up from My applications. To apply, finish the official steps.",
        [
          { text: "View", onPress: () => router.push("/scheme-applications") },
          { text: "Done", style: "cancel" },
        ],
      );
    } catch (err) {
      if (isFeatureLockedError(err)) setPaywallVisible(true);
      else alert("Couldn't save", getFriendlyErrorMessage(err));
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  }, [schemeId, router]);

  const handleTrack = useCallback(() => {
    if (saved) {
      router.push("/scheme-applications");
      return;
    }
    // Checked at the tap; the server can still answer 402 (caught above).
    if (!hasAccess(SCHEME_TRACKING_FEATURE_KEY)) {
      setPaywallVisible(true);
      return;
    }
    submitApplication();
  }, [saved, hasAccess, router, submitApplication]);

  const paywall = {
    visible: paywallVisible,
    featureKey: SCHEME_TRACKING_FEATURE_KEY,
    onClose: () => setPaywallVisible(false),
    onUnlocked: () => {
      setPaywallVisible(false);
      refreshSubscriptionAccess();
      submitApplication();
    },
  };

  return { saved, applying, handleTrack, paywall };
}
