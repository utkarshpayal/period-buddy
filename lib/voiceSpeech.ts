/**
 * Text helpers for Nura AI's voice mode (app/(app)/qa.tsx), with no React or
 * audio in here (unit-tested in lib/__tests__/voiceSpeech.test.ts).
 *
 * Replies are spoken a chunk at a time: the first sentence is synthesized
 * and starts playing while the next is being made, so the voice starts after
 * one short TTS call instead of after the whole answer.
 */

/** Strips what text-to-speech would read out literally (markdown, links, emoji, bullets). */
export function cleanForSpeech(text: string): string {
  return (
    text
      // Rich content (lib/richText.ts): chart data, images and styling tags aren't read.
      .replace(/```chart[^\n]*\n[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/<[^>]*>/g, "")
      // [label](url) → label, then bare URLs.
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "")
      // Code, emphasis, headings, quotes, bullets and numbered list markers.
      .replace(/`+/g, "")
      .replace(/(\*\*|__|\*|_|~~)(?=\S)([^*_~]+?)\1/g, "$2")
      .replace(/^\s{0,3}(#{1,6}|>)\s*/gm, "")
      .replace(/^\s*(?:[-*•▪◦]|\d+[.)])\s+/gm, "")
      // Emoji and pictographs.
      .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
      // Line breaks between items read better as sentence breaks.
      .replace(/\s*\n+\s*/g, (match, offset: number, whole: string) => {
        const before = whole.slice(0, offset).trimEnd();
        return /[.!?।:;,]$/.test(before) ? " " : ". ";
      })
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

/**
 * Splits into chunks of whole sentences, each at most `maxChars` (a longer
 * sentence is cut at a comma or space). The first chunk is kept short so
 * playback starts quickly. Handles the Devanagari full stop (।).
 */
export function splitForSpeech(text: string, maxChars = 220, firstMaxChars = 120): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?।]+(?:[.!?।]+["')\]]*|$)\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];

  const pieces: string[] = [];
  for (const sentence of sentences) {
    let rest = sentence;
    while (rest.length > maxChars) {
      const window = rest.slice(0, maxChars);
      const cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "));
      const at = cut > maxChars * 0.4 ? cut + 1 : window.lastIndexOf(" ") > 0 ? window.lastIndexOf(" ") : maxChars;
      pieces.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) pieces.push(rest);
  }

  // The first sentence plays on its own so the voice starts after one short
  // TTS call; only a tiny opener ("Yes.", "Good question.") takes the next
  // sentence along. Later sentences are grouped up to `maxChars`.
  const chunks: string[] = [];
  for (const piece of pieces) {
    const last = chunks[chunks.length - 1];
    const limit = chunks.length === 1 ? firstMaxChars : maxChars;
    const canMerge =
      last !== undefined && (chunks.length > 1 || last.length < SHORT_OPENER_CHARS) && last.length + 1 + piece.length <= limit;
    if (canMerge) chunks[chunks.length - 1] = `${last} ${piece}`;
    else chunks.push(piece);
  }
  return chunks;
}

const SHORT_OPENER_CHARS = 20;

/** A transcript that is only noise ("", ".", "um", "hmm") isn't worth a reply. */
export function isMeaningfulTranscript(transcript: string): boolean {
  const words = transcript
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return false;
  const fillers = new Set(["um", "uh", "hmm", "hm", "ah", "er", "mm", "uhh", "umm"]);
  return words.some((word) => !fillers.has(word));
}
