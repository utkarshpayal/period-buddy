import React from "react";
import { HubScreen } from "../../components/HubScreen";

/**
 * "Explore" hub — the lighter-weight, browse-anytime destinations (forest,
 * blogs, videos, partner sync, habits, buddy). Reached from Home's
 * "Explore" entry card (see (dashboard)/home.tsx). Tiles come from the App
 * CMS (lib/appConfig.ts); the defaults are the original grid.
 */
export default function ExploreHub() {
  return (
    <HubScreen
      placement="explore_hub"
      title="Explore"
      intro="Community, content, and everything to explore beyond tracking."
    />
  );
}
