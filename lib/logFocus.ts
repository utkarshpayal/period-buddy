/**
 * Sections of the day-log modal (components/DayDetailsModal.tsx) a link can
 * jump to: `/(app)/tracker?log=today&focus=<key>` opens today's log scrolled
 * there. Home's quick-log buttons are picked from this list (Profile →
 * Customize Home), so a new key needs its `recordSection` in the modal.
 */
export const LOG_FOCUS = [
  { key: "flow", label: "Log period", icon: "water" },
  { key: "symptoms", label: "Symptoms", icon: "pulse-outline" },
  { key: "mood", label: "Mood", icon: "happy-outline" },
  { key: "discharge", label: "Discharge", icon: "water-outline" },
  { key: "digestion", label: "Digestion", icon: "nutrition-outline" },
  { key: "activity", label: "Activity", icon: "fitness-outline" },
  { key: "energy", label: "Energy", icon: "battery-half-outline" },
  { key: "skin", label: "Skin", icon: "happy-outline" },
  { key: "sleep", label: "Sleep", icon: "bed-outline" },
  { key: "water", label: "Water", icon: "beaker-outline" },
  { key: "stress", label: "Stress", icon: "pulse" },
  { key: "medications", label: "Medication", icon: "medkit-outline" },
  { key: "notes", label: "Notes", icon: "document-text-outline" },
] as const;

export type LogFocus = (typeof LOG_FOCUS)[number]["key"];

export const isLogFocus = (v: unknown): v is LogFocus => LOG_FOCUS.some((f) => f.key === v);

export const logFocusRoute = (focus: LogFocus) => `/(app)/tracker?log=today&focus=${focus}`;
