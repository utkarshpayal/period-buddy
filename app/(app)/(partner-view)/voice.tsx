import { Redirect } from "expo-router";
import React from "react";

// Exists purely so the Tabs navigator in ./_layout.tsx has a real screen to
// resolve "voice" against — the tab's own tabPress listener always calls
// e.preventDefault() and routes to /(app)/qa itself (after checking mic
// permission), so this component normally never actually renders.
export default function PartnerViewVoiceTab() {
  return <Redirect href={{ pathname: "/(app)/qa", params: { voiceMode: "1" } }} />;
}
