import React from "react";
import { HubScreen } from "../../components/HubScreen";

/**
 * "Wellness & Support" hub — health concerns, private Q&A, hygiene guidance,
 * and sexual wellbeing. Reached from Home's "Wellness & Support" entry card
 * (see (dashboard)/home.tsx).
 *
 * Most-used-first: by default Nura AI and Health Concerns are "large"
 * full-width rows and the lower-frequency tiles sit in a "More support"
 * grid below (docs/fixes.md 2.7). The App CMS (lib/appConfig.ts) can
 * reorder, resize, hide or move any of them.
 */
export default function WellnessHub() {
  return (
    <HubScreen
      placement="wellness_hub"
      title="Wellness & Support"
      intro="Support for your body and mind — private, judgment-free, and always here."
      smallHeading="More support"
    />
  );
}
