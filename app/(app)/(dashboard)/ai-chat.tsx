import { Redirect } from "expo-router";
import React from "react";

export default function AiChatTab() {
  // Tapping the dashboard's center avatar tab should drop straight into
  // voice-to-voice rather than the text chat screen.
  return <Redirect href={{ pathname: "/(app)/qa", params: { voiceMode: "1" } }} />;
}
