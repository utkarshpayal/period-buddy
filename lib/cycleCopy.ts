// Plain-language copy for each cycle phase, for screens aimed at first-time
// users. `title` is what we show; `medical` is the textbook name, shown only
// as small print; `note` is one short, hedged line (bodies vary a lot, so we
// say "can" / "some people", never "you will").

import type { CyclePhase } from "./cycle";

export const PHASE_COPY: Record<CyclePhase, { title: string; short: string; medical: string; note: string }> = {
  period: {
    title: "During your period",
    short: "Period",
    medical: "Menstrual phase",
    note: "Some people feel tired or crampy now. Rest and water can help.",
  },
  follicular: {
    title: "After your period",
    short: "After",
    medical: "Follicular phase",
    note: "Energy and mood often lift in the days after your period.",
  },
  ovulation: {
    title: "Your fertile days",
    short: "Fertile",
    medical: "Ovulation",
    note: "The days you could get pregnant. Some people notice more discharge.",
  },
  luteal: {
    title: "Before your period",
    short: "Before",
    medical: "Luteal phase",
    note: "Cravings, mood or sleep can shift before your period.",
  },
};

/** True for the four known phases; anything else (null, "late", …) is not. */
export function isCyclePhase(value: unknown): value is CyclePhase {
  return value === "period" || value === "follicular" || value === "ovulation" || value === "luteal";
}
