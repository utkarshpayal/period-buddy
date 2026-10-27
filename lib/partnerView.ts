// Words for the partner view (app/(app)/(partner-view)/overview.tsx), which
// talks *about* the owner rather than to them. Pure, so it's unit-tested in
// lib/__tests__/partnerView.test.ts.

/** Phase names in the third person and without gendered pronouns. The
 * owner's own screens use lib/cycleCopy.ts (second person). */
export const PARTNER_PHASE_COPY: Record<string, { title: string; medical: string; note: string }> = {
  period: { title: "Period days", medical: "Menstrual phase", note: "Warmth, rest and patience help most right now." },
  menstrual: { title: "Period days", medical: "Menstrual phase", note: "Warmth, rest and patience help most right now." },
  follicular: { title: "After the period", medical: "Follicular phase", note: "Energy often lifts in these days." },
  ovulation: { title: "Fertile days", medical: "Ovulation", note: "Often a time of more energy and confidence." },
  luteal: { title: "Before the period", medical: "Luteal phase", note: "Moods and cravings can shift. A little extra care helps." },
};

/** "moodSwings" / "tender-breasts" / "low_energy" → "Mood swings" / "Tender breasts" / "Low energy". */
export function humanizeTag(value: string, labels: Record<string, string> = {}): string {
  if (labels[value]) return labels[value];
  const words = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : value;
}

type LogSummary = { mood?: string | null; energy?: string | null; flow?: string | null; symptoms?: string[] | null };

/** A day's log as readable tags: mood, "Low energy", "Heavy flow", then
 * symptoms, without duplicates. Flow "none" is left out. */
export function logTags(log: LogSummary, labels: Record<string, string> = {}): string[] {
  const tags: string[] = [];
  if (log.mood) tags.push(humanizeTag(log.mood, labels));
  if (log.energy) tags.push(`${humanizeTag(log.energy, labels)} energy`);
  if (log.flow && log.flow !== "none") tags.push(`${humanizeTag(log.flow, labels)} flow`);
  for (const s of log.symptoms ?? []) if (s) tags.push(humanizeTag(s, labels));
  return [...new Set(tags)];
}

/** "in 1 day" / "in 5 days" / "today". */
export function inDays(n: number): string {
  if (n <= 0) return "today";
  return `in ${n} ${n === 1 ? "day" : "days"}`;
}
