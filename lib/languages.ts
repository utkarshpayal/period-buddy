import type { Language } from "./api";

// Mirrors the backend's SUPPORTED_LANGUAGES (src/utils/sarvamClient.js) — the
// single language list every picker in the app (chat, Q&A, summarize,
// health report) draws from, so voice/text language options stay consistent
// everywhere.
export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "Hindi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "mr-IN", label: "Marathi" },
  { code: "od-IN", label: "Odia" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
];
