import type { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ScreeningCondition, ScreeningRiskLevel } from "../../lib/api";
import type { ThemeColors } from "../theme";
import { getSoftTints } from "../ui-tokens";

type MciName = keyof typeof MaterialCommunityIcons.glyphMap;

/** The checks on offer. `signs` is the plain-words line on the picker card. */
export const CONDITIONS: { id: ScreeningCondition; label: string; icon: MciName; signs: string; tint: "rose" | "lavender" | "amber" | "teal" }[] = [
  { id: "pcos", label: "PCOS", icon: "chart-donut", signs: "Irregular cycles, acne, extra hair growth", tint: "rose" },
  { id: "endometriosis", label: "Endometriosis", icon: "flower-outline", signs: "Painful periods, pelvic or deep pain", tint: "lavender" },
  { id: "fibroid", label: "Fibroids", icon: "circle-multiple-outline", signs: "Heavy flow, pressure, frequent peeing", tint: "amber" },
  { id: "thyroid", label: "Thyroid", icon: "waveform", signs: "Tiredness, weight or mood changes", tint: "teal" },
];

export const conditionLabel = (id: string) => CONDITIONS.find((c) => c.id === id)?.label ?? id;

/** The 0–3 answer scale, with a hint so "Moderate" means the same to everyone. */
export const SCALE_OPTIONS = [
  { value: 0, label: "Not at all", hint: "Never or rarely" },
  { value: 1, label: "Mild", hint: "Now and then" },
  { value: 2, label: "Moderate", hint: "Often" },
  { value: 3, label: "Severe", hint: "Most of the time" },
] as const;

/** A small icon per safety-check item (lib/redFlagScreen.ts ids). */
export const RED_FLAG_ICONS: Record<string, MciName> = {
  soaking: "water-alert",
  bleeding_after_sex: "water",
  postmenopausal_bleeding: "calendar-alert",
  sudden_pain: "lightning-bolt",
  fainting: "head-alert-outline",
  fever_pelvic_pain: "thermometer-alert",
  pregnant_pain_bleeding: "human-pregnant",
};

/** Picks an icon for a question by keyword, so each one carries a visual cue. */
export function questionIcon(text: string): MciName {
  const t = text.toLowerCase();
  if (/(pain|cramp|ache|pelvic)/.test(t)) return "lightning-bolt";
  if (/(bleed|flow|period|spotting|menstru)/.test(t)) return "water";
  if (/(weight|gain|loss)/.test(t)) return "scale-bathroom";
  if (/(hair|hirsut)/.test(t)) return "content-cut";
  if (/(acne|skin|oily)/.test(t)) return "face-woman-shimmer";
  if (/(mood|anxi|depress|irritab|stress)/.test(t)) return "emoticon-sad-outline";
  if (/(tired|fatigue|energy|exhaust)/.test(t)) return "battery-low";
  if (/(sleep|insomnia)/.test(t)) return "sleep";
  if (/(cycle|irregular|late|missed)/.test(t)) return "calendar-sync";
  if (/(bloat|gas|digest|bowel|constip)/.test(t)) return "stomach";
  if (/(cold|hot|temperature|sweat|heat)/.test(t)) return "thermometer";
  if (/(heart|palpitat|pulse)/.test(t)) return "heart-pulse";
  if (/(pee|urin|bladder)/.test(t)) return "toilet";
  return "help-circle-outline";
}

/** Colours and words for a result. "high" never says "high risk": it says what to do. */
export function riskStyle(level: ScreeningRiskLevel | string, colors: ThemeColors) {
  const soft = getSoftTints(colors);
  switch (level) {
    case "high":
      return {
        label: "Talk to a doctor",
        headline: "Worth a check-up",
        meaning: "Several of your answers match this condition. It isn’t a diagnosis, but a gynaecologist can look into it properly.",
        color: colors.danger,
        bg: soft.danger,
        gradient: ["#C2416B", "#9C2F5E", "#6E2A5E"] as const,
      };
    case "moderate":
      return {
        label: "Some signs",
        headline: "Some signs to keep an eye on",
        meaning: "A few of your answers match. Keep tracking your symptoms and mention them at your next check-up.",
        color: colors.warning,
        bg: soft.amber,
        gradient: ["#D9822B", "#B9612A", "#8A4A2E"] as const,
      };
    default:
      return {
        label: "Few signs",
        headline: "Few signs right now",
        meaning: "Your answers don’t point strongly to this condition. If something changes or worries you, check again or ask a doctor.",
        color: colors.success,
        bg: soft.emerald,
        gradient: ["#2E9C7A", "#23806A", "#1D5E58"] as const,
      };
  }
}

export function conditionTint(tint: (typeof CONDITIONS)[number]["tint"], colors: ThemeColors) {
  const soft = getSoftTints(colors);
  switch (tint) {
    case "lavender":
      return { bg: soft.lavender, fg: colors.secondary };
    case "amber":
      return { bg: soft.amber, fg: colors.warning };
    case "teal":
      return { bg: soft.teal, fg: colors.info };
    default:
      return { bg: soft.rose, fg: colors.primaryDark };
  }
}
