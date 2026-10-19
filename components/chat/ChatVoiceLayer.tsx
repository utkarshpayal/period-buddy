import React from "react";
import type { useVoiceChat } from "../../hooks/useVoiceChat";
import { LanguagePickerSheet } from "../LanguagePickerSheet";
import { useTheme } from "../theme";
import { VoiceModeOverlay } from "../VoiceModeOverlay";

/**
 * The language sheet and the full-screen voice overlay for a chat screen
 * driven by useVoiceChat. The sheet goes inside the screen's SafeAreaView;
 * render the overlay (`part="overlay"`) after it, at the screen's root.
 */
export function ChatVoiceLayer({ voice, part }: { voice: ReturnType<typeof useVoiceChat>; part: "languages" | "overlay" }) {
  const { colors, fonts } = useTheme();

  if (part === "languages") {
    return (
      <LanguagePickerSheet
        languages={voice.languages}
        onClose={voice.closeLanguagePicker}
        onSelect={voice.setLanguage}
        selectedCode={voice.language}
        title="Chat & voice language"
        visible={voice.languagePickerVisible}
      />
    );
  }

  if (!voice.voiceMode) return null;
  return (
    <VoiceModeOverlay
      colors={colors}
      errorMessage={voice.mic.voiceError}
      fonts={fonts}
      languageLabel={voice.selectedLanguage.label}
      level={voice.mic.level}
      onClose={() => voice.setVoiceMode(false)}
      onMicPress={voice.handleVoiceOrbPress}
      replyPreview={voice.voiceCaption.reply}
      status={voice.voiceStatus}
      transcriptPreview={voice.voiceCaption.heard}
    />
  );
}
