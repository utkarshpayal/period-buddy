import type { DayEntry } from "./api";

/**
 * Symptom Report's numbers, counted on the phone from the day logs (no AI
 * call): how many days had each symptom and mood, and how the period days
 * split by flow. Only real symptoms count: sex, ovulation-test and
 * pregnancy-test tags are not symptoms (and are private) and are left out.
 * Pure, unit-tested (lib/__tests__/symptomReport.test.ts).
 */

export type Count = { key: string; label: string; days: number };
export type FlowKey = "spotting" | "light" | "medium" | "heavy";
export type SymptomReport = {
  daysLogged: number;
  periodDays: number;
  symptoms: Count[];
  moods: Count[];
  flow: Record<FlowKey, number>;
};

const SYMPTOM_LABELS: Record<string, string> = {
  cramps: "Cramps",
  "tender-breasts": "Tender breasts",
  headache: "Headache",
  acne: "Acne",
  backache: "Backache",
  fatigue: "Fatigue",
  cravings: "Cravings",
  insomnia: "Trouble sleeping",
  "abdominal-pain": "Abdominal pain",
  "vaginal-itching": "Vaginal itching",
  "vaginal-dryness": "Vaginal dryness",
  "blood-clots": "Blood clots",
  nausea: "Nausea",
  "discharge-unusual": "Unusual discharge",
  "discharge-clumpy-white": "Clumpy white discharge",
  "discharge-gray": "Gray discharge",
  bloated: "Bloating",
  constipated: "Constipation",
  diarrhea: "Diarrhea",
};

const dayDiff = (a: string, b: string) => {
  const t = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86_400_000);
};

const rank = (m: Map<string, number>, label: (k: string) => string): Count[] =>
  [...m].map(([key, days]) => ({ key, label: label(key), days })).sort((a, b) => b.days - a.days || a.label.localeCompare(b.label));

export function buildSymptomReport(
  logs: DayEntry[],
  todayKey: string,
  rangeDays: number,
  moodLabel: (value: string) => string,
): SymptomReport {
  const symptoms = new Map<string, number>();
  const moods = new Map<string, number>();
  const flow: Record<FlowKey, number> = { spotting: 0, light: 0, medium: 0, heavy: 0 };
  let daysLogged = 0;
  let periodDays = 0;
  const seen = new Set<string>();
  for (const log of logs) {
    if (!log.dateKey || seen.has(log.dateKey)) continue;
    const ago = dayDiff(log.dateKey, todayKey);
    if (ago < 0 || ago >= rangeDays) continue;
    seen.add(log.dateKey);
    daysLogged++;
    const day = new Set<string>();
    (log.symptoms ?? []).forEach((t) => SYMPTOM_LABELS[t] && day.add(t));
    (log.digestions?.length ? log.digestions : log.digestion ? [log.digestion] : []).forEach((d) => SYMPTOM_LABELS[d] && day.add(d));
    if ((log.skins ?? (log.skin ? [log.skin] : [])).includes("acne")) day.add("acne");
    day.forEach((t) => symptoms.set(t, (symptoms.get(t) ?? 0) + 1));
    const dayMoods = new Set(log.moods?.length ? log.moods : log.mood ? [log.mood] : []);
    dayMoods.forEach((m) => moods.set(m, (moods.get(m) ?? 0) + 1));
    if (log.flow && log.flow !== "none") {
      periodDays++;
      flow[log.flow as FlowKey] = (flow[log.flow as FlowKey] ?? 0) + 1;
    }
  }
  return {
    daysLogged,
    periodDays,
    symptoms: rank(symptoms, (k) => SYMPTOM_LABELS[k] ?? k),
    moods: rank(moods, moodLabel),
    flow,
  };
}

/** The flow most period days had, or null. */
export function mainFlow(flow: Record<FlowKey, number>): FlowKey | null {
  const best = (Object.keys(flow) as FlowKey[]).reduce<FlowKey | null>((b, k) => (flow[k] > (b ? flow[b] : 0) ? k : b), null);
  return best;
}
