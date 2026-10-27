// Red-flag detection for Nura AI questions, kept apart from the chat UI so the
// rule is unit-tested (lib/__tests__/urgentSafety.test.ts). The backend runs
// the same check before any AI call (period-buddy-be's
// `utils/companionChat.js#hasUrgentPattern`); this copy covers the offline
// fallback in lib/qaFallback.ts, so a question asked with no connection still
// gets "call 112" instead of a "that's normal" answer. Keep the two in sync.

export { EMERGENCY_NUMBER } from "./redFlagScreen";

/** Tele-MANAS, India's free 24-hour mental health helpline. */
export const TELE_MANAS_NUMBER = "14416";

const BLEED = String.raw`(bleed\w*|blood|spotting)`;

const SELF_HARM_PATTERNS = [
  /\b(self[-\s]?harm|suicid(e|al)|kill(ing)? myself|end(ing)? my life|want to die|hurt(ing)? myself|(don'?t|do not) want to (live|be alive)|no reason to live|better off dead)\b/i,
  /\b(aatmahatya|atmahatya|aathmahatya|khudkushi|khudkhushi)\b/i,
  /\b(marna|mar jana|mar jaana|mar jaun|mar jaaun)\b.*\b(hai|chahti|chahta|chahiye)\b/i,
  /\b(jeena|jina)\b.*\b(nahi|nahin)\b.*\b(chahti|chahta)\b/i,
  /\bkhud ko\b.*\b(hurt|nuksan|nuksaan|nukshan|chot|maar)\b/i,
  // Devanagari isn't a regex "word" character, so these match plain substrings.
  /आत्महत्या|खुदकुशी|ख़ुदकुशी|मरना चाह|मर जाना|मर जाऊं|मर जाऊँ|जीना नहीं|जीने का मन नहीं|खुद को (नुकसान|नुक़सान|चोट|मार)/,
];

const HI_BLEED = String.raw`(bleed\w*|blood|khoon|khun|spotting|खून|ब्लीडिंग)`;
const PREGNANCY = String.raw`(pregnan\w*|positive (pregnancy )?test|missed (my )?periods?|period is late|late period)`;

const MEDICAL_PATTERNS = [
  /\b(bleeding during pregnancy|pregnant and bleeding)\b/i,
  // Pregnancy (or a missed period / positive test) with pain or bleeding:
  // possible miscarriage or ectopic pregnancy.
  new RegExp(String.raw`\b${PREGNANCY}\b.*\b(pain|cramp\w*|${BLEED})\b`, "i"),
  new RegExp(String.raw`\b(pain|cramp\w*|${BLEED})\b.*\b${PREGNANCY}\b`, "i"),
  // Bleeding after sex or after menopause: see a doctor soon.
  /\bpost[-\s]?coital\b/i,
  new RegExp(String.raw`\b${BLEED}\b.*\b(after|during|post)\s+(having\s+)?(sex|intercourse)\b`, "i"),
  new RegExp(String.raw`\b(after|during)\s+(having\s+)?(sex|intercourse)\b.*\b${BLEED}\b`, "i"),
  new RegExp(String.raw`\b(post[-\s]?)?menopaus\w*\b.*\b${BLEED}\b`, "i"),
  new RegExp(String.raw`\b${BLEED}\b.*\b(post[-\s]?)?menopaus\w*\b`, "i"),
  /\b(soak(s|ed|ing)?|fills?)\b.*\b(pad|pads|tampon|tampons)\b/i,
  /\b(pad|pads|tampon|tampons)\b.*\b(every|each|an|one|per) hour\b/i,
  // Fainting is urgent; dizziness alone isn't, unless it comes with bleeding.
  /\b(faint|fainted|fainting|passed out|pass(ing)? out|blacked out)\b/i,
  new RegExp(String.raw`\b(dizzy|dizziness|light[-\s]?headed)\b.*\b${BLEED}\b`, "i"),
  new RegExp(String.raw`\b${BLEED}\b.*\b(dizzy|dizziness|light[-\s]?headed)\b`, "i"),
  /\b(fever|high temperature)\b.*\b(pelvic|period|cramp|pain)\b/i,
  // Severe period pain on its own is common; it's urgent when sudden or disabling.
  /\b(sudden|suddenly)\b.*\b(severe|sharp|intense|unbearable|worst)\b.*\b(pain|cramps?)\b/i,
  /\b(pain|cramps?)\b.*\b(can'?t|cannot|unable to) (walk|stand|move|breathe)\b/i,
  // The same red flags in Hindi and Hinglish.
  /\b(behosh|behoshi)\b/i,
  /बेहोश/,
  /\b(har|ek|1) ghan?te\b.*\b(pad|pads|tampon)\b/i,
  /\b(pad|pads|tampon)\b.*\b(har|ek|1) ghan?te\b/i,
  /(हर|एक) घंटे.*(पैड|टैम्पोन)|(पैड|टैम्पोन).*(हर|एक) घंटे/,
  new RegExp(String.raw`\b(sex|intercourse)\b (ke )?(baad|bad)\b.*${HI_BLEED}`, "i"),
  new RegExp(String.raw`${HI_BLEED}.*\b(sex|intercourse)\b (ke )?(baad|bad)\b`, "i"),
  /(सेक्स|संबंध) के बाद.*(खून|ब्लीडिंग)|(खून|ब्लीडिंग).*(सेक्स|संबंध) के बाद/,
  new RegExp(String.raw`\b(garbh\w*|pregnancy|pregnant)\b.*(\b(dard|pain)\b|${HI_BLEED})`, "i"),
  /(गर्भवती|गर्भ|प्रेग्नेंट|प्रेगनेंट).*(खून|ब्लीडिंग|दर्द)|(खून|ब्लीडिंग|दर्द).*(गर्भवती|प्रेग्नेंट|प्रेगनेंट)/,
  /\b(bukhar|bukhaar)\b.*\b(dard|pain|pet|period|cramp\w*)\b/i,
  /बुखार.*(दर्द|पेट|पीरियड)/,
  new RegExp(String.raw`\b(chakkar|chakar)\b.*${HI_BLEED}`, "i"),
  new RegExp(String.raw`${HI_BLEED}.*\b(chakkar|chakar)\b`, "i"),
  /चक्कर.*(खून|ब्लीडिंग)|(खून|ब्लीडिंग).*चक्कर/,
  /\b(achanak|ekdum)\b.*\b(bahut|tez|tej)\b.*\b(dard|pain)\b/i,
  /अचानक.*(बहुत|तेज़|तेज).*दर्द/,
];

/** Whether the text mentions thoughts of self-harm or suicide. */
export function mentionsSelfHarm(text: string): boolean {
  return SELF_HARM_PATTERNS.some((pattern) => pattern.test(text));
}

/** Whether a question describes a red flag that needs care, not reassurance. */
export function isUrgentQuestion(text: string): boolean {
  return mentionsSelfHarm(text) || MEDICAL_PATTERNS.some((pattern) => pattern.test(text));
}

/** The backend's `URGENT_COMPANION_REPLY`. */
export const URGENT_REPLY =
  "This could need urgent help. If you are soaking a pad or tampon every hour, feeling faint, have fever with pelvic pain, severe or sudden pain, or pain or bleeding while pregnant (or after a missed period or positive test), go to the nearest hospital or call 112 now. Bleeding after sex, or any bleeding after menopause, is not usually an emergency but is not normal either: please see a doctor or gynaecologist soon, even if it is light. If you are having thoughts of harming yourself, you are not alone: call Tele-MANAS on 14416 (free, 24 hours) or 112, and tell someone you trust.";

/** `URGENT_REPLY` in Hindi. */
export const URGENT_REPLY_HI =
  "यह गंभीर हो सकता है और इसमें तुरंत मदद की ज़रूरत हो सकती है। अगर हर घंटे पैड या टैम्पोन भर रहा है, बेहोशी जैसा लग रहा है, पेट के निचले हिस्से में दर्द के साथ बुखार है, अचानक या बहुत तेज़ दर्द है, या गर्भावस्था में (या पीरियड मिस होने या पॉज़िटिव टेस्ट के बाद) दर्द या खून आ रहा है, तो अभी 112 पर कॉल करें या नज़दीकी अस्पताल जाएँ। सेक्स के बाद खून आना, या मेनोपॉज़ के बाद किसी भी तरह का खून आना, आमतौर पर इमरजेंसी नहीं है, लेकिन सामान्य भी नहीं है: थोड़ा सा भी हो तो जल्द ही डॉक्टर या स्त्री रोग विशेषज्ञ को दिखाएँ। अगर आपके मन में खुद को नुकसान पहुँचाने के विचार आ रहे हैं, तो आप अकेली नहीं हैं: Tele-MANAS को 14416 (मुफ़्त, 24 घंटे) या 112 पर कॉल करें, और किसी भरोसेमंद व्यक्ति को बताएँ।";

const DEVANAGARI = /[ऀ-ॿ]/;

/** The urgent reply in Hindi for a question written in Devanagari, else English. */
export function urgentReplyFor(question: string): string {
  return DEVANAGARI.test(question) ? URGENT_REPLY_HI : URGENT_REPLY;
}
