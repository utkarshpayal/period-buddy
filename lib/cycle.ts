// Canonical cycle-phase type and computation, shared by the tracker calendar,
// the Wellness Forest scene, symptom predictions, and the DayEntry API type.
// Mirrors the backend's getCyclePhase (src/utils/cycle.js) so phase coloring
// scales with the user's actual cycle length instead of a fixed assumption.

export type CyclePhase = "follicular" | "luteal" | "ovulation" | "period";

export function getCyclePhase(
  cycleDay: number,
  periodLength = 5,
  cycleLength = 28,
): CyclePhase {
  if (cycleDay <= periodLength) return "period";
  const ovulationDay = Math.max(periodLength + 1, cycleLength - 13);
  // Fertile window: the 5 days before ovulation plus ovulation day (Wilcox 1995).
  if (cycleDay < ovulationDay - 5) return "follicular";
  if (cycleDay <= ovulationDay) return "ovulation";
  return "luteal";
}
