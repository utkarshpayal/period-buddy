import type { SymptomPrediction } from "./api";

/**
 * Realistic sample predictions for dev builds, so the Symptom Predictions
 * screen can be designed and reviewed on an account with no cycle history.
 * symptom-predictions.tsx only uses it when `__DEV__` and the API returned
 * nothing, and labels it "Sample data".
 */
const CYCLES = 6;

const SAMPLE: Record<string, [period: number, follicular: number, ovulation: number, luteal: number]> = {
  Cramps: [84, 16, 27, 44],
  "Mood swings": [38, 14, 21, 76],
  Bloating: [57, 19, 41, 71],
  Fatigue: [69, 23, 28, 61],
  "Breast tenderness": [14, 8, 33, 64],
  Headache: [36, 11, 29, 49],
  Acne: [22, 9, 17, 53],
  Cravings: [31, 12, 18, 67],
};

const PHASES = ["period", "follicular", "ovulation", "luteal"] as const;

export const SAMPLE_SYMPTOM_PREDICTIONS: SymptomPrediction[] = Object.entries(SAMPLE).flatMap(([symptom, values]) =>
  values.map((likelihood, i) => ({
    symptom,
    phase: PHASES[i],
    likelihood,
    cyclesAnalyzed: CYCLES,
    occurrences: Math.round((likelihood / 100) * CYCLES),
  }))
);

export function sampleNextCycleStart(): string {
  const d = new Date();
  d.setDate(d.getDate() + 9);
  return d.toISOString();
}
