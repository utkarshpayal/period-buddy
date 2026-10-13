import React from "react";
import { HubScreen } from "../../components/HubScreen";

/**
 * "Care & Insights" hub — everything data-driven about the user's cycle that
 * isn't the day-to-day tracker itself: forecasts, personalized insights,
 * symptom trends, the screener, and booking a consult. Reached from Home's
 * "Care & Insights" entry card (see (dashboard)/home.tsx).
 *
 * Which tiles show here, in what order and how, comes from the App CMS
 * (lib/appConfig.ts); the defaults reproduce the original hard-coded grid.
 */
export default function CareHub() {
  return (
    <HubScreen
      placement="care_hub"
      title="Care & Insights"
      intro="Forecasts and expert care"
    />
  );
}
