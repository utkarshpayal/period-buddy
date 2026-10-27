import type { Intensity } from "../../lib/bodyRegions";

/** Pain-dot colours by how often a symptom was logged: amber → orange → red. */
export const PAIN_COLORS: Record<Intensity, string> = {
  1: "#F5A623",
  2: "#F2652B",
  3: "#E0284F",
};
