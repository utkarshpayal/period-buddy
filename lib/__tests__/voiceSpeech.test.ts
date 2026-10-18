import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanForSpeech, isMeaningfulTranscript, splitForSpeech } from "../voiceSpeech";

test("cleanForSpeech drops markdown, links, bullets and emoji", () => {
  const input = "**Cramps** are common 🙂\n- Use a *heat pad*\n- Drink water\nSee [this guide](https://x.y/z) or https://a.b";
  assert.equal(cleanForSpeech(input), "Cramps are common. Use a heat pad. Drink water. See this guide or");
});

test("cleanForSpeech keeps punctuation-ended lines as they are", () => {
  assert.equal(cleanForSpeech("Hello there.\nHow are you?"), "Hello there. How are you?");
});

test("splitForSpeech keeps whole sentences and a short first chunk", () => {
  const text =
    "A 34-day cycle can be normal. Cycles between 21 and 35 days are typical for adults. If it changes suddenly, mention it to a doctor. Keep logging so predictions improve.";
  const chunks = splitForSpeech(text);
  assert.equal(chunks[0], "A 34-day cycle can be normal.");
  assert.equal(chunks.join(" "), text);
  assert.ok(chunks.every((c) => c.length <= 220));
});

test("splitForSpeech cuts a very long sentence at a comma or space", () => {
  const long = `${"word ".repeat(30)}and, ${"more ".repeat(40)}end.`;
  const chunks = splitForSpeech(long, 100, 100);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 100));
  assert.equal(chunks.join(" ").replace(/\s+/g, " "), long.trim().replace(/\s+/g, " "));
});

test("splitForSpeech handles Hindi sentence ends and empty text", () => {
  assert.deepEqual(splitForSpeech("दर्द के लिए गर्म पानी की थैली रखें। आराम करें।"), ["दर्द के लिए गर्म पानी की थैली रखें।", "आराम करें।"]);
  // A tiny opener takes the next sentence along.
  assert.deepEqual(splitForSpeech("Yes. Cramps are common on day one."), ["Yes. Cramps are common on day one."]);
  assert.deepEqual(splitForSpeech("   "), []);
});

test("isMeaningfulTranscript ignores fillers and punctuation", () => {
  assert.equal(isMeaningfulTranscript("."), false);
  assert.equal(isMeaningfulTranscript("um hmm"), false);
  assert.equal(isMeaningfulTranscript("yes"), true);
  assert.equal(isMeaningfulTranscript("मुझे दर्द है"), true);
});
