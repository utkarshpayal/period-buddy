import type { DayEntry } from "./api";

/**
 * Body Map: stable region ids, where each day-log symptom sits on the body,
 * and buildBodyMap(), which turns the person's own day logs into markers,
 * intensities and insights. Pure, unit-tested (lib/__tests__/bodyRegions.test.ts).
 *
 * Everything comes from what was logged in the tracker; nothing is entered
 * here, and nothing infers a condition from where a symptom is.
 */

export type SymptomSide = "center" | "left" | "right" | "both";

export type BodyRegionId =
  | "head" | "face" | "neck" | "chest" | "breast" | "upper_abdomen" | "lower_abdomen"
  | "pelvis" | "genital" | "upper_back" | "lower_back" | "buttock" | "shoulder" | "arm"
  | "hand" | "hip" | "thigh" | "knee" | "lower_leg" | "foot" | "whole_body";

// Region ids match period-buddy-be's utils/symptomRecord.js BODY_REGIONS.
export const BODY_REGIONS: Record<BodyRegionId, { label: string; sides: SymptomSide[] }> = {
  head: { label: "Head", sides: ["center"] },
  face: { label: "Face & skin", sides: ["center"] },
  neck: { label: "Neck", sides: ["center"] },
  chest: { label: "Chest", sides: ["center"] },
  breast: { label: "Breasts", sides: ["left", "right", "both"] },
  upper_abdomen: { label: "Upper belly", sides: ["center"] },
  lower_abdomen: { label: "Lower belly", sides: ["center", "left", "right", "both"] },
  pelvis: { label: "Pelvis", sides: ["center"] },
  genital: { label: "Vaginal area", sides: ["center"] },
  upper_back: { label: "Upper back", sides: ["center"] },
  lower_back: { label: "Lower back", sides: ["center", "left", "right", "both"] },
  buttock: { label: "Buttocks", sides: ["left", "right", "both"] },
  shoulder: { label: "Shoulders", sides: ["left", "right", "both"] },
  arm: { label: "Arms", sides: ["left", "right", "both"] },
  hand: { label: "Hands", sides: ["left", "right", "both"] },
  hip: { label: "Hips", sides: ["left", "right", "both"] },
  thigh: { label: "Thighs", sides: ["left", "right", "both"] },
  knee: { label: "Knees", sides: ["left", "right", "both"] },
  lower_leg: { label: "Lower legs", sides: ["left", "right", "both"] },
  foot: { label: "Feet", sides: ["left", "right", "both"] },
  whole_body: { label: "Whole body", sides: ["center"] },
};

export const BODY_REGION_IDS = Object.keys(BODY_REGIONS) as BodyRegionId[];

/** Anchor keys (`region:side`, see lib/bodyModel.generated.ts) a symptom sits on. */
export function anchorKeys(regionId: BodyRegionId, side: SymptomSide): string[] {
  if (regionId === "whole_body") return [];
  if (side === "both") return [`${regionId}:left`, `${regionId}:right`];
  return [`${regionId}:${side}`];
}

// ── Symptoms from the day log ─────────────────────────────────────────────────
// Keys are the day-log tags (components/logOptions.ts, DayDetailsModal) plus
// digestion (`bloating`, `constipation`, `diarrhea`) and skin (`acne`).
export type SymptomDef = { key: string; label: string; region: BodyRegionId; side: SymptomSide; icon: string };

export const SYMPTOMS: SymptomDef[] = [
  { key: "cramps", label: "Cramps", region: "lower_abdomen", side: "center", icon: "pulse-outline" },
  { key: "abdominal-pain", label: "Abdominal pain", region: "lower_abdomen", side: "center", icon: "medkit-outline" },
  { key: "bloating", label: "Bloating", region: "lower_abdomen", side: "center", icon: "water-outline" },
  { key: "constipation", label: "Constipation", region: "lower_abdomen", side: "center", icon: "swap-vertical-outline" },
  { key: "diarrhea", label: "Diarrhea", region: "lower_abdomen", side: "center", icon: "thunderstorm-outline" },
  { key: "nausea", label: "Nausea", region: "upper_abdomen", side: "center", icon: "sad-outline" },
  { key: "tender-breasts", label: "Tender breasts", region: "breast", side: "both", icon: "heart-half-outline" },
  { key: "headache", label: "Headache", region: "head", side: "center", icon: "flash-outline" },
  { key: "acne", label: "Acne", region: "face", side: "center", icon: "radio-button-on-outline" },
  { key: "backache", label: "Backache", region: "lower_back", side: "center", icon: "body-outline" },
  { key: "vaginal-itching", label: "Vaginal itching", region: "genital", side: "center", icon: "flame-outline" },
  { key: "vaginal-dryness", label: "Vaginal dryness", region: "genital", side: "center", icon: "water-outline" },
  { key: "discharge-unusual", label: "Unusual discharge", region: "genital", side: "center", icon: "help-circle-outline" },
  { key: "discharge-clumpy-white", label: "Clumpy white discharge", region: "genital", side: "center", icon: "snow-outline" },
  { key: "discharge-gray", label: "Gray discharge", region: "genital", side: "center", icon: "cloud-outline" },
  { key: "blood-clots", label: "Blood clots", region: "genital", side: "center", icon: "water" },
  { key: "fatigue", label: "Fatigue", region: "whole_body", side: "center", icon: "bed-outline" },
  { key: "insomnia", label: "Trouble sleeping", region: "whole_body", side: "center", icon: "moon-outline" },
  { key: "cravings", label: "Cravings", region: "whole_body", side: "center", icon: "restaurant-outline" },
];

const SYMPTOM_BY_KEY = new Map(SYMPTOMS.map((s) => [s.key, s]));

export function symptomLabel(key: string): string {
  return SYMPTOM_BY_KEY.get(key)?.label ?? key.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Every body-placed symptom in one day log. */
export function symptomTagsOf(log: DayEntry): string[] {
  const tags = new Set<string>();
  (log.symptoms ?? []).forEach((t) => SYMPTOM_BY_KEY.has(t) && tags.add(t));
  const digestion = log.digestions?.length ? log.digestions : log.digestion ? [log.digestion] : [];
  digestion.forEach((d) => {
    if (d === "bloated") tags.add("bloating");
    if (d === "constipated") tags.add("constipation");
    if (d === "diarrhea") tags.add("diarrhea");
  });
  const skin = log.skins?.length ? log.skins : log.skin ? [log.skin] : [];
  if (skin.includes("acne")) tags.add("acne");
  return [...tags];
}

// ── Building the map ──────────────────────────────────────────────────────────
export type RangeKey = "week" | "month" | "quarter";
export const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "week", label: "7 days", days: 7 },
  { key: "month", label: "30 days", days: 30 },
  { key: "quarter", label: "90 days", days: 90 },
];

/** 1 = now and then, 2 = often, 3 = very often (per week, so ranges compare). */
export type Intensity = 1 | 2 | 3;
export const INTENSITY_LABEL: Record<Intensity, string> = { 1: "Now and then", 2: "Often", 3: "Very often" };

export function intensityFor(days: number, rangeDays: number): Intensity {
  const perWeek = days / Math.max(1, rangeDays / 7);
  return perWeek >= 3 ? 3 : perWeek >= 1.25 ? 2 : 1;
}

export type BodySymptom = SymptomDef & {
  /** Day keys it was logged on in the range, newest first. */
  days: string[];
  intensity: Intensity;
  /** Logged today or yesterday (the dot pulses faster). */
  recent: boolean;
};

export type BodyMarker = {
  /** Anchor key, `region:side`. */
  key: string;
  regionId: BodyRegionId;
  intensity: Intensity;
  recent: boolean;
  symptoms: BodySymptom[];
};

/**
 * Where on the body. Whole-body symptoms (fatigue, sleep, cravings) have no
 * spot, and counts and phase patterns are Symptom Trends' job, so neither is
 * here.
 */
export type BodyMap = { markers: BodyMarker[] };

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

export function buildBodyMap(logs: DayEntry[], todayKey: string, rangeDays: number): BodyMap {
  const byTag = new Map<string, string[]>();
  for (const log of logs) {
    if (!log.dateKey) continue;
    const ago = daysBetween(log.dateKey, todayKey);
    if (ago < 0 || ago >= rangeDays) continue;
    for (const tag of symptomTagsOf(log)) byTag.set(tag, [...(byTag.get(tag) ?? []), log.dateKey]);
  }
  const markers = new Map<string, BodyMarker>();
  for (const [tag, keys] of byTag) {
    const def = SYMPTOM_BY_KEY.get(tag)!;
    const days = [...keys].sort().reverse();
    const s: BodySymptom = {
      ...def,
      days,
      intensity: intensityFor(days.length, rangeDays),
      recent: daysBetween(days[0], todayKey) <= 1,
    };
    for (const key of anchorKeys(s.region, s.side)) {
      const m = markers.get(key) ?? { key, regionId: s.region, intensity: 1 as Intensity, recent: false, symptoms: [] };
      m.symptoms.push(s);
      m.intensity = Math.max(m.intensity, s.intensity) as Intensity;
      m.recent ||= s.recent;
      markers.set(key, m);
    }
  }
  markers.forEach((m) => m.symptoms.sort((a, b) => b.intensity - a.intensity || b.days.length - a.days.length));
  return { markers: [...markers.values()].sort((a, b) => b.intensity - a.intensity || a.key.localeCompare(b.key)) };
}

// ── Safety ────────────────────────────────────────────────────────────────────
export type Escalation = { level: "urgent" | "soon"; title: string; message: string };

/** When what was logged is worth a doctor's look. General guidance, never a diagnosis. */
export function escalationFor(s: BodySymptom, rangeDays: number): Escalation | null {
  const perMonth = (s.days.length * 30) / rangeDays;
  if (s.key === "blood-clots") {
    return {
      level: "soon",
      title: "Worth checking with a gynaecologist",
      message: "Clots bigger than a coin, or soaking a pad every hour, should be looked at. If you feel faint, get care now.",
    };
  }
  if (["discharge-gray", "discharge-clumpy-white", "discharge-unusual"].includes(s.key) || (s.key === "vaginal-itching" && s.days.length >= 3)) {
    return {
      level: "soon",
      title: "Worth checking with a doctor",
      message: "Discharge that looks or smells different, or itching that keeps coming back, is common and usually easy to treat once checked.",
    };
  }
  if (["cramps", "abdominal-pain", "headache", "backache"].includes(s.key) && perMonth >= 8) {
    return {
      level: "soon",
      title: "Pain on this many days is worth a check",
      message: "You don't have to put up with it. A doctor can help find what eases it.",
    };
  }
  return null;
}

/** The "get care now" line for a region, shown in its panel. */
export function urgentAdviceFor(regionId: BodyRegionId): string | null {
  if (regionId === "lower_abdomen" || regionId === "pelvis" || regionId === "upper_abdomen") {
    return "Sudden, severe belly or pelvic pain, especially with fever, fainting, heavy bleeding or if you could be pregnant: call 112.";
  }
  if (regionId === "head") return "A sudden, very severe headache, or one with confusion, weakness or trouble speaking: call 112.";
  if (regionId === "chest") return "Chest pain with breathlessness, sweating or fainting: call 112.";
  if (regionId === "genital") return "Very heavy bleeding (soaking a pad every hour) or bleeding with dizziness: get care now.";
  return null;
}

/** Nearest anchor to a point, for tapping the body. */
export function nearestAnchor<P>(
  point: P,
  anchors: Record<string, P>,
  distance: (a: P, b: P) => number,
  maxDistance: number,
): { regionId: BodyRegionId; side: SymptomSide; key: string } | null {
  let best: string | null = null;
  let bestD = maxDistance;
  for (const [key, p] of Object.entries(anchors)) {
    const d = distance(point, p);
    if (d < bestD) {
      bestD = d;
      best = key;
    }
  }
  if (!best) return null;
  const [regionId, side] = best.split(":") as [BodyRegionId, SymptomSide];
  return { regionId, side, key: best };
}

export function regionLabel(regionId: BodyRegionId, anchorSide?: SymptomSide): string {
  const region = BODY_REGIONS[regionId];
  if (!anchorSide || anchorSide === "center" || anchorSide === "both" || region.sides.length === 1) return region.label;
  return `${region.label} · ${anchorSide}`;
}
