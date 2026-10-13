import type { Ionicons } from "@expo/vector-icons";
import type { DayEntry } from "./AppState";

/**
 * Option lists shared by the full day log (DayDetailsModal) and Home's
 * quick-log sheet (QuickLogSheet), so both offer the same choices.
 */
export type LogOption<Value extends string> = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: Value;
};

// Physical symptoms — the catch-all tag list. "Nausea" also renders again
// under Digestion & stool (same tag, same toggle) since it belongs to both
// groupings in the reference app; everything else here is symptoms-only.
export const symptomOptions: LogOption<string>[] = [
  { icon: "gift-outline", label: "Everything is fine", value: "everything-is-fine" },
  { icon: "pulse-outline", label: "Cramps", value: "cramps" },
  { icon: "heart-half-outline", label: "Tender breasts", value: "tender-breasts" },
  { icon: "flash-outline", label: "Headache", value: "headache" },
  { icon: "radio-button-on-outline", label: "Acne", value: "acne" },
  { icon: "body-outline", label: "Backache", value: "backache" },
  { icon: "bed-outline", label: "Fatigue", value: "fatigue" },
  { icon: "restaurant-outline", label: "Cravings", value: "cravings" },
  { icon: "moon-outline", label: "Insomnia", value: "insomnia" },
  { icon: "medkit-outline", label: "Abdominal pain", value: "abdominal-pain" },
  { icon: "flame-outline", label: "Vaginal itching", value: "vaginal-itching" },
  { icon: "water-outline", label: "Vaginal dryness", value: "vaginal-dryness" },
];

export const flowOptions: LogOption<NonNullable<DayEntry["flow"]>>[] = [
  { icon: "remove-circle-outline", label: "None", value: "none" },
  { icon: "ellipse-outline", label: "Spotting", value: "spotting" },
  { icon: "water-outline", label: "Light", value: "light" },
  { icon: "water", label: "Medium", value: "medium" },
  { icon: "rainy-outline", label: "Heavy", value: "heavy" },
];

