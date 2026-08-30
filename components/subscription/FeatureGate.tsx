import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Loader } from "../Loader";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { LockedFeatureCard } from "./LockedFeatureCard";
import { PaywallModal } from "./PaywallModal";

type Props = {
  /** The SubscriptionFeature key this screen (or section) requires. Must
   * have a matching entry in period-buddy-be's
   * config/subscriptionRouteRegistry.js for the backend to actually enforce
   * it — this component only handles the app-side UI. */
  featureKey: string;
  title: string;
  description?: string;
  children: React.ReactNode;
};

/**
 * Drop-in whole-screen (or whole-section) paywall gate — the generic
 * version of the hand-rolled `locked`/`useEffect`/`LockedFeatureCard`/
 * `PaywallModal` wiring repeated across documents.tsx, document-chat.tsx,
 * checkin-call.tsx, qa-history.tsx, and government-scheme-detail.tsx.
 *
 * Wrap a screen's real content with it:
 *
 *   export default function MyScreen() {
 *     return (
 *       <FeatureGate featureKey="period_buddy" title="Period Buddy" description="...">
 *         <ActualScreenContent />
 *       </FeatureGate>
 *     );
 *   }
 *
 * That's the entire integration — no manual hasAccess/useEffect/modal state
 * needed at the call site. Adding a brand-new premium screen this way, paired
 * with one entry in the backend's subscriptionRouteRegistry.js and a seeded
 * SubscriptionFeature row, is the full loop: an admin toggling that feature
 * premium in the Content Studio enforces it on both ends immediately, with
 * no other code to write.
 *
 * For gating a single action inside an otherwise-free screen (not the whole
 * screen), use `useSubscriptionAccess().hasAccess(key)` directly at the tap
 * site instead — see CommunityScreen.tsx's new-post button for that shape.
 */
export function FeatureGate({ featureKey, title, description, children }: Props) {
  const { hasAccess, isLoading } = useSubscriptionAccess();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const locked = !isLoading && !hasAccess(featureKey);

  useEffect(() => {
    if (locked) setPaywallVisible(true);
  }, [locked]);

  if (isLoading) {
    return <Loader fullscreen />;
  }

  if (locked) {
    return (
      <>
        <View className="flex-1 items-center justify-center px-6">
          <LockedFeatureCard title={title} description={description} onPress={() => setPaywallVisible(true)} />
        </View>
        <PaywallModal
          visible={paywallVisible}
          onClose={() => setPaywallVisible(false)}
          featureKey={featureKey}
          onUnlocked={() => setPaywallVisible(false)}
        />
      </>
    );
  }

  return <>{children}</>;
}
