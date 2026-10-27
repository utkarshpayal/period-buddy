/**
 * The Wellness Forest's 3D tree, as data: buildTree(seed) grows the full
 * branch structure once (same seed → same tree), and poseTree() lays it out
 * for a growth value (0 = seed, 1 = full tree in bloom), wind and droop.
 * Pure (no three.js), unit-tested in lib/__tests__/tree3d.test.ts; drawn by
 * components/forest/Forest3D.tsx.
 */

export type V3 = [number, number, number];

export type Branch3 = {
  id: number;
  parent: number; // -1 for the trunk
  depth: number;
  /** Where along the parent it starts (0–1). */
  at: number;
  /** Direction relative to the world, before wind/droop. */
  dir: V3;
  length: number;
  radius: number;
  /** Growth value at which it starts growing; it's full by birth + GROW_SPAN. */
  birth: number;
};

export type Leaf3 = {
  branch: number;
  /** Offset from the branch tip, before scaling by the branch's growth. */
  offset: V3;
  size: number;
  /** 0–1: picks the leaf colour (dark → light). */
  shade: number;
  birth: number;
  /** Sprout leaves fall away once the crown takes over (growth value). */
  until?: number;
  blossom: boolean;
};

export type Tree3 = { seed: number; branches: Branch3[]; leaves: Leaf3[] };

export const GROW_SPAN = 0.22;
export const TRUNK_SPAN = 0.5;
const GOLDEN = 2.39996323;

export function rng(seed: number) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Rotate `v` around unit axis `k` by `a` radians (Rodrigues). */
export function rotate(v: V3, k: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  const d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const x: V3 = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  return [
    v[0] * c + x[0] * s + k[0] * d * (1 - c),
    v[1] * c + x[1] * s + k[1] * d * (1 - c),
    v[2] * c + x[2] * s + k[2] * d * (1 - c),
  ];
}

const perpendicular = (v: V3): V3 => norm(Math.abs(v[1]) < 0.9 ? [v[2], 0, -v[0]] : [0, -v[2], v[1]]);

export function buildTree(seed: number, { lowDetail = false } = {}): Tree3 {
  const r = rng(seed);
  const maxDepth = lowDetail ? 3 : 4;
  const branches: Branch3[] = [];
  const leaves: Leaf3[] = [];
  const lean = (r() - 0.5) * 0.12;

  const grow = (parent: number, depth: number, at: number, dir: V3, length: number, radius: number, birth: number) => {
    const id = branches.length;
    branches.push({ id, parent, depth, at, dir, length, radius, birth });
    if (depth === 0) {
      // Sprout leaves at the young stem's tip: the seedling's first leaves,
      // gone once the crown has filled in.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + r();
        leaves.push({
          branch: id,
          offset: [Math.cos(a) * 0.05, 0.02 + r() * 0.03, Math.sin(a) * 0.05],
          size: 0.07 + r() * 0.02,
          shade: 0.7 + r() * 0.3,
          birth: 0.03,
          until: 0.55,
          blossom: false,
        });
      }
    }
    if (depth >= 1) {
      // A leaf cluster round each tip; outer tips get fuller clusters.
      const count = lowDetail ? 6 : depth >= 3 ? 8 : depth === 2 ? 6 : 4;
      for (let i = 0; i < count; i++) {
        const u = r() * Math.PI * 2, v = Math.acos(2 * r() - 1);
        const rad = 0.08 + r() * (depth >= 3 ? 0.14 : 0.1);
        leaves.push({
          branch: id,
          offset: [Math.sin(v) * Math.cos(u) * rad, Math.cos(v) * rad * 0.8 + 0.04, Math.sin(v) * Math.sin(u) * rad],
          size: 0.085 + r() * 0.07,
          shade: r(),
          birth: Math.min(0.86, birth + GROW_SPAN * 0.45 + r() * 0.06),
          blossom: depth >= 2 && r() < 0.18,
        });
      }
    }
    if (depth >= maxDepth) return;
    const kids = depth === 0 ? 4 + Math.floor(r() * 2) : 2 + Math.floor(r() * 2);
    const side = perpendicular(dir);
    let spin = r() * Math.PI * 2;
    for (let i = 0; i < kids; i++) {
      spin += GOLDEN;
      const t = depth === 0 ? 0.48 + (i / kids) * 0.47 + r() * 0.05 : 0.5 + r() * 0.45;
      const tilt = (depth === 0 ? 0.55 : 0.55) + r() * 0.3;
      let d = rotate(dir, side, tilt);
      d = rotate(d, dir, spin);
      // Branches reach up and out, so the crown rounds off.
      d = norm([d[0], d[1] + 0.45 - depth * 0.08, d[2]]);
      const len = length * (depth === 0 ? 0.78 - t * 0.25 + r() * 0.12 : 0.68 + r() * 0.16);
      // Later-starting, higher-up branches are born later; all done by ~0.8.
      const childBirth = birth + (depth === 0 ? 0.1 + t * 0.18 : GROW_SPAN * (0.45 + r() * 0.25));
      grow(id, depth + 1, t, d, len, radius * (0.6 + r() * 0.1), Math.min(0.78, childBirth));
    }
  };

  grow(-1, 0, 0, norm([lean, 1, lean * 0.5]), 0.8 + r() * 0.12, 0.075 + r() * 0.01, 0.02);
  return { seed, branches, leaves };
}

/** How grown a branch/leaf is (0–1) at this growth value. */
export const grownFraction = (growth: number, birth: number, span = GROW_SPAN) =>
  Math.max(0, Math.min(1, (growth - birth) / span));

const smooth = (t: number) => t * t * (3 - 2 * t);

export type BranchPose = { start: V3; end: V3; radius: number; visible: boolean };
export type LeafPose = { pos: V3; size: number; visible: boolean };

/**
 * Lays the tree out for a growth value. `wind` is a sway offset (radians,
 * changes over time), `droop` 0–1 bends branches down (wilting/dry),
 * `rustle` a short extra shake. Writes into `out` (reused every frame).
 */
export function poseTree(
  tree: Tree3,
  growth: number,
  { wind = 0, droop = 0, time = 0, rustle = 0 }: { wind?: number; droop?: number; time?: number; rustle?: number },
  out: { branches: BranchPose[]; leaves: LeafPose[] },
) {
  const { branches, leaves } = tree;
  // Thicker as the whole tree matures.
  const girth = 0.35 + 0.65 * smooth(Math.min(1, growth * 1.2));
  for (const b of branches) {
    // The trunk rises slowly over the first half; branches grow quicker.
    const f = smooth(grownFraction(growth, b.birth, b.depth === 0 ? TRUNK_SPAN : GROW_SPAN));
    const parent = b.parent >= 0 ? out.branches[b.parent] : null;
    const start: V3 = parent
      ? [
          parent.start[0] + (parent.end[0] - parent.start[0]) * b.at,
          parent.start[1] + (parent.end[1] - parent.start[1]) * b.at,
          parent.start[2] + (parent.end[2] - parent.start[2]) * b.at,
        ]
      : [0, 0, 0];
    // Sway grows with depth; each branch has its own phase.
    const sway = (wind + rustle * Math.sin(time * 22 + b.id)) * b.depth * 0.6;
    const phase = Math.sin(time * 1.7 + b.id * 1.3) * 0.25;
    let d: V3 = [b.dir[0] + sway * (1 + phase), b.dir[1] - droop * b.depth * 0.22, b.dir[2] + sway * 0.4 * phase];
    d = norm(d);
    const len = b.length * f;
    out.branches[b.id] = {
      start,
      end: [start[0] + d[0] * len, start[1] + d[1] * len, start[2] + d[2] * len],
      radius: b.radius * girth * (0.35 + 0.65 * f),
      visible: f > 0.001,
    };
  }
  leaves.forEach((l, i) => {
    const b = out.branches[l.branch];
    const gone = l.until != null ? 1 - smooth(grownFraction(growth, l.until, 0.15)) : 1;
    const f = smooth(grownFraction(growth, l.birth, 0.12)) * gone;
    // Blossoms open only near full growth.
    const bloom = l.blossom ? smooth(grownFraction(growth, 0.88, 0.1)) : 1;
    const fall = droop * 0.12;
    out.leaves[i] = {
      pos: [b.end[0] + l.offset[0] * (0.6 + 0.4 * f), b.end[1] + l.offset[1] * (0.6 + 0.4 * f) - fall, b.end[2] + l.offset[2] * (0.6 + 0.4 * f)],
      size: l.size * f * bloom * (1 - droop * 0.35),
      visible: f * bloom > 0.01,
    };
  });
  return out;
}

export const emptyPose = (tree: Tree3) => ({
  branches: tree.branches.map(() => ({ start: [0, 0, 0] as V3, end: [0, 0, 0] as V3, radius: 0, visible: false })),
  leaves: tree.leaves.map(() => ({ pos: [0, 0, 0] as V3, size: 0, visible: false })),
});
