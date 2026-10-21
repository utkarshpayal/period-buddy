/**
 * Nura AI's offline answers and spoken-confirmation matching, used by
 * app/(app)/qa.tsx when the backend can't answer. Pure (no React, no api.ts
 * import) so it is unit-tested in lib/__tests__/qaFallback.test.ts — the
 * urgent-safety entry in particular must keep winning over "that's normal".
 */

export const DEFAULT_SUGGESTED_QUESTIONS = [
  "Is brown period blood normal?",
  "Why are cramps worse this month?",
  "How should I clean during my period?",
];

export const DEFAULT_COMPANION_DISCLAIMER =
  "General guidance only. For severe, unusual, or urgent symptoms, contact a trusted clinician.";

/** Shown when nothing matched, so the person knows what the offline answers cover. */
export const FALLBACK_HINT =
  "That is a valid thing to wonder about. Try keywords like 'brown blood', 'period poop', 'tampon', 'cup', 'hygiene', or 'intimacy' so I can give a more specific answer.";

export const URGENT_SAFETY_SOURCE = "urgent_safety";

type KnowledgeEntry = { keywords: string[]; response: string; source?: string };

const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  // Checked first: an urgent question must never get a "that's normal" answer.
  {
    keywords: [
      "soaking",
      "faint",
      "dizzy",
      "fever",
      "severe pain",
      "unbearable",
      "bleeding during pregnancy",
      "pregnant and bleeding",
      "suicid",
      "self harm",
      "self-harm",
      "kill myself",
      "want to die",
    ],
    response:
      "This could need urgent help. If you are soaking pads quickly, feeling faint, have fever with pelvic pain, severe one-sided or unbearable pain, or bleeding during pregnancy, go to the nearest hospital or call 112 now. If you are having thoughts of harming yourself, you are not alone: call Tele-MANAS on 14416 (free, 24 hours) or 112, and tell someone you trust.",
    source: URGENT_SAFETY_SOURCE,
  },
  {
    keywords: ["brown", "dark", "black", "blood", "bleed"],
    response:
      "Dark brown blood is often normal at the start or end of a period. It is usually older blood leaving the uterus more slowly. If it comes with severe pain, bad odor, fever, or unusual discharge, it is worth checking with a clinician.",
  },
  {
    keywords: ["cup", "hymen", "break", "virgin"],
    response:
      "A menstrual cup or tampon can stretch the hymen, but virginity is not a medical measurement. Use the smallest comfortable size, go slowly, and stop if you feel pain.",
  },
  {
    keywords: ["poop", "motions", "stomach", "loose"],
    response:
      "Changes in bowel movements around periods are common. Prostaglandins help the uterus contract and can also affect the bowel, which may cause cramps, loose stools, or more frequent bathroom trips.",
  },
  {
    keywords: ["sex", "intimacy", "relation", "intercourse", "safe"],
    response:
      "Sex during a period can be safe if everyone involved is comfortable and consenting. Use protection because pregnancy and infections are still possible, and pause if there is pain or discomfort.",
  },
  {
    keywords: ["wash", "soap", "clean", "vagina", "smell", "scent"],
    response:
      "Avoid scented washes, douching, or internal cleaning. The vagina is self-cleaning, and harsh products can disrupt pH. Warm water on the external vulva is usually enough.",
  },
  {
    keywords: ["boyfriend", "husband", "pms", "partner"],
    response:
      "PMS support works best when it is respectful: validate feelings, offer practical help, and avoid teasing or blaming mood changes on a period. A heating pad, rest, water, and patience can help a lot.",
  },
];

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Built once: match from the start of a word, so "man" can't hit "woman".
const COMPILED = KNOWLEDGE_BASE.map((entry) => ({
  ...entry,
  patterns: entry.keywords.map((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}`)),
}));

/** The first offline answer whose keywords appear in the question, or null. */
export function matchLocalAnswer(question: string): { text: string; source?: string } | null {
  const query = question.trim().toLowerCase();
  if (!query) return null;
  for (const entry of COMPILED) {
    if (entry.patterns.some((pattern) => pattern.test(query))) {
      return { text: entry.response, source: entry.source };
    }
  }
  return null;
}

// English plus common Hindi/Hinglish yeses ("haan", "theek hai", "kar do", हाँ);
// a "no" anywhere ("ji nahi", "don't", मत) wins, so it never confirms by mistake.
const AFFIRMATIVE_PATTERN =
  /\b(yes|yeah|yep|yup|ok|okay|confirm|correct|sure|save it|do it|go ahead|haan|han|haa|ji haan|theek hai|thik hai|kar do)\b|हाँ|हां|ठीक है|कर दो/i;
const NEGATIVE_PATTERN = /\b(no|nope|not|don'?t|cancel|stop|nahi|nahin|mat)\b|नहीं|मत/i;

/** Whether a spoken reply confirms a pending voice action. */
export function isSpokenConfirmation(transcript: string): boolean {
  return AFFIRMATIVE_PATTERN.test(transcript) && !NEGATIVE_PATTERN.test(transcript);
}

/**
 * The backend answers AI endpoints with 403 `AI_CONSENT_REQUIRED` while the
 * Privacy screen's AI switch is off. Duck-typed on `code` so this file
 * stays free of lib/api.
 */
export function isAiConsentRequired(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "AI_CONSENT_REQUIRED";
}
