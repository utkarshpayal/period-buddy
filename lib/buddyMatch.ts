/**
 * Period Buddy discovery list: search, phase filter, sort and labels. Pure,
 * so the screen (app/(app)/buddy-nomination.tsx) stays about layout, and
 * unit-tested in lib/__tests__/buddyMatch.test.ts.
 */

export type BuddyPhaseKey = "period" | "follicular" | "ovulation" | "luteal" | "unknown";

export type BuddyCandidate = {
  id: string;
  name: string;
  /** Backend label, e.g. "Luteal Phase". */
  cyclePhase: string;
  cycleOverlapDays: number;
  compatibility: number;
  similarities: string[];
};

export type BuddySort = "best" | "overlap";

/** The phase a backend label ("Luteal Phase", "Menstrual phase", …) names. */
export function phaseKeyOf(label: string | undefined): BuddyPhaseKey {
  const text = (label ?? "").toLowerCase();
  if (/(menstru|period)/.test(text)) return "period";
  if (/follic/.test(text)) return "follicular";
  if (/ovulat/.test(text)) return "ovulation";
  if (/lute/.test(text)) return "luteal";
  return "unknown";
}

export const PHASE_LABELS: Record<BuddyPhaseKey, string> = {
  period: "Period",
  follicular: "Follicular",
  ovulation: "Ovulation",
  luteal: "Luteal",
  unknown: "Other",
};

/** A plain-words strength for a compatibility score (0-100). */
export function matchStrength(compatibility: number): { label: string; tier: "great" | "good" | "fair" } {
  if (compatibility >= 80) return { label: "Great match", tier: "great" };
  if (compatibility >= 60) return { label: "Good match", tier: "good" };
  return { label: "Fair match", tier: "fair" };
}

/** Phase chips to offer: only phases someone in the list is in, with counts, in cycle order. */
export function phaseFilters(candidates: BuddyCandidate[]): { key: BuddyPhaseKey; label: string; count: number }[] {
  const order: BuddyPhaseKey[] = ["period", "follicular", "ovulation", "luteal", "unknown"];
  const counts = new Map<BuddyPhaseKey, number>();
  for (const c of candidates) {
    const key = phaseKeyOf(c.cyclePhase);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return order.filter((key) => counts.has(key)).map((key) => ({ key, label: PHASE_LABELS[key], count: counts.get(key)! }));
}

/**
 * The list to show: the active buddy pinned first, then search (name, phase,
 * shared traits), the phase chip, and the chosen order. Stable for ties.
 */
export function visibleCandidates<T extends BuddyCandidate>(
  candidates: T[],
  {
    query = "",
    phase = null,
    sort = "best",
    activeId = null,
  }: { query?: string; phase?: BuddyPhaseKey | null; sort?: BuddySort; activeId?: string | null },
): T[] {
  const q = query.trim().toLowerCase();
  const filtered = candidates.filter((c) => {
    if (phase && phaseKeyOf(c.cyclePhase) !== phase) return false;
    if (!q) return true;
    return [c.name, c.cyclePhase, ...c.similarities].join(" ").toLowerCase().includes(q);
  });
  const score = (c: T) => (sort === "overlap" ? c.cycleOverlapDays * 1000 + c.compatibility : c.compatibility * 1000 + c.cycleOverlapDays);
  return filtered
    .map((c, index) => ({ c, index }))
    .sort((a, b) => {
      if (a.c.id === activeId) return -1;
      if (b.c.id === activeId) return 1;
      return score(b.c) - score(a.c) || a.index - b.index;
    })
    .map(({ c }) => c);
}
