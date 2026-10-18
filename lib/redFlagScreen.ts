// "Any of these right now?" pre-screen shown before any symptom-checker
// questionnaire (app/(app)/symptom-checker.tsx). Pure, so the triage rule is
// unit-tested in lib/__tests__/redFlagScreen.test.ts.

/** "emergency": get care now (112). "soon": not an emergency, but see a
 * gynaecologist promptly (bleeding after sex / after menopause). */
export type RedFlagUrgency = "emergency" | "soon";

export type RedFlagItem = {
  id: string;
  label: string;
  urgency: RedFlagUrgency;
};

export const EMERGENCY_NUMBER = "112";

export const RED_FLAG_ITEMS: RedFlagItem[] = [
  { id: "soaking", label: "Soaking through a pad or tampon every hour for 2+ hours", urgency: "emergency" },
  { id: "bleeding_after_sex", label: "Bleeding after sex", urgency: "soon" },
  {
    id: "postmenopausal_bleeding",
    label: "Any bleeding after menopause (12+ months without a period)",
    urgency: "soon",
  },
  { id: "sudden_pain", label: "Sudden, severe pain in your pelvis or belly", urgency: "emergency" },
  { id: "fainting", label: "Fainting or feeling faint", urgency: "emergency" },
  { id: "fever_pelvic_pain", label: "Fever with pelvic pain", urgency: "emergency" },
  { id: "pregnant_pain_bleeding", label: "Possibly pregnant, with pain or bleeding", urgency: "emergency" },
];

/** The most urgent level among the ticked items, or "none". */
export function triageRedFlags(selectedIds: readonly string[]): RedFlagUrgency | "none" {
  const picked = RED_FLAG_ITEMS.filter((item) => selectedIds.includes(item.id));
  if (picked.some((item) => item.urgency === "emergency")) return "emergency";
  if (picked.length > 0) return "soon";
  return "none";
}

/** Ticked items that need a doctor soon (shown alongside an emergency too). */
export function soonRedFlags(selectedIds: readonly string[]): RedFlagItem[] {
  return RED_FLAG_ITEMS.filter((item) => item.urgency === "soon" && selectedIds.includes(item.id));
}

/** Backend `redFlags` from POST /api/screening/assess, tolerant of older servers. */
export function hasResultRedFlags(result: { redFlags?: unknown } | null | undefined): boolean {
  return Array.isArray(result?.redFlags) && result.redFlags.length > 0;
}
