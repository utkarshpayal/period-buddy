import React from "react";
import { HubScreen } from "../../components/HubScreen";

/**
 * "Wellness & Support" hub — health concerns, private Q&A, hygiene guidance,
 * and sexual wellbeing. Reached from Home's "Wellness & Support" entry card
 * (see (dashboard)/home.tsx).
 *
 * Most-used-first: Nura AI leads as a hero card with a question box, then
 * Health Concerns, then a "More support" list (lib/hubLayout.ts). The App
 * CMS (lib/appConfig.ts) can reorder, hide or move any of them.
 */
export default function WellnessHub() {
  return (
    <HubScreen
      placement="wellness_hub"
      title="Wellness & Support"
      intro="Private and judgment-free"
    />
  );
}
