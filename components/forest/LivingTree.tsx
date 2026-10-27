import React, { memo, useMemo } from "react";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";
import type { ForestVitality } from "../../lib/api";

// One procedurally drawn tree on a continuous growth axis (0 = seed in the
// soil, 1 = full tree in bloom), so the Forest screen can tween it smoothly
// between stages instead of swapping pictures. The branch structure comes
// from `seed`, so each tree in a forest has its own shape but the same tree
// always grows the same way. Vitality only changes colour and droop.

const VIEW_W = 200;
const VIEW_H = 220;
const GROUND = 200;
const CX = 100;

/** Growth where the woody tree takes over from the sprout. */
const WOOD_START = 0.2;
const BLOOM_START = 0.86;

type Palette = { dark: string; mid: string; light: string; trunk: string; trunkDark: string; stem: string };

export const PALETTES: Record<ForestVitality, Palette> = {
  new: { dark: "#2E6B34", mid: "#3F9447", light: "#9CCC65", trunk: "#7A5741", trunkDark: "#4E3629", stem: "#5DAA4E" },
  thriving: { dark: "#2E6B34", mid: "#3F9447", light: "#9CCC65", trunk: "#7A5741", trunkDark: "#4E3629", stem: "#5DAA4E" },
  thirsty: { dark: "#4C7A33", mid: "#6FA043", light: "#B5D67A", trunk: "#7C5B45", trunkDark: "#533B2D", stem: "#78A94F" },
  wilting: { dark: "#76762C", mid: "#9C9A38", light: "#CFCB6A", trunk: "#7F6350", trunkDark: "#574436", stem: "#9A9A48" },
  dry: { dark: "#7D5A3C", mid: "#A07650", light: "#D2A66F", trunk: "#806A5A", trunkDark: "#5A4A3F", stem: "#A08A5A" },
};

const DROOP: Record<ForestVitality, number> = { new: 0, thriving: 0, thirsty: 0.5, wilting: 2.5, dry: 4 };
const LEAF_SCALE: Record<ForestVitality, number> = { new: 1, thriving: 1, thirsty: 0.97, wilting: 0.9, dry: 0.78 };

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (v: number) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Blob = { dx: number; dy: number; r: number };
/** A single leaf sticking out of a clump's edge: angle (radians) and size. */
type EdgeLeaf = { a: number; s: number; dark: boolean };
type Branch = {
  angle: number;
  length: number;
  width: number;
  depth: number;
  at: number;
  birth: number;
  bend: number;
  leafR: number;
  blobs: Blob[];
  blossoms: Blob[];
  edge: EdgeLeaf[];
  /** Which of the three leaf greens this clump uses (natural colour variation). */
  hue: number;
  children: Branch[];
};

const MAX_DEPTH = 4;

function buildBranch(rand: () => number, depth: number, length: number, width: number, birth: number, angle: number, at: number): Branch {
  const children: Branch[] = [];
  if (depth < MAX_DEPTH) {
    const childBirth = birth + 0.1 + rand() * 0.04;
    // A leader carries on roughly straight; one or two side limbs split off,
    // alternating sides, like a real crown.
    children.push(buildBranch(rand, depth + 1, length * (0.6 + rand() * 0.08), width * 0.66, childBirth, (rand() - 0.5) * 0.4, 1));
    const sides = depth === 0 ? 2 : rand() < 0.4 ? 2 : 1;
    const firstSide = rand() < 0.5 ? -1 : 1;
    for (let i = 0; i < sides; i++) {
      const side = i % 2 === 0 ? firstSide : -firstSide;
      children.push(
        buildBranch(
          rand,
          depth + 1,
          length * (0.68 + rand() * 0.12),
          width * 0.58,
          childBirth + 0.02 + rand() * 0.03,
          side * (0.52 + rand() * 0.32),
          0.5 + rand() * 0.35,
        ),
      );
    }
  }
  const leafR = depth >= 3 ? 11 + rand() * 3 : depth === 2 ? 13 + rand() * 3 : 10;
  const blobs: Blob[] = Array.from({ length: 3 }, (_, i) => {
    const a = (i / 3) * Math.PI * 2 + rand();
    return { dx: Math.cos(a) * leafR * 0.55, dy: Math.sin(a) * leafR * 0.4, r: leafR * (0.62 + rand() * 0.2) };
  });
  const blossoms: Blob[] = Array.from({ length: depth >= 3 ? 1 : 0 }, () => {
    const a = rand() * Math.PI * 2;
    return { dx: Math.cos(a) * leafR * 0.7, dy: Math.sin(a) * leafR * 0.6 - 1, r: 2.1 + rand() * 0.8 };
  });
  // Leaves poking out around the clump, mostly upward and outward (where light is),
  // so the crown's outline reads as foliage rather than a stack of circles.
  const edge: EdgeLeaf[] = Array.from({ length: depth >= 2 ? 6 : 4 }, (_, i) => ({
    a: -Math.PI / 2 + ((i / (depth >= 2 ? 6 : 4)) - 0.5) * Math.PI * 1.7 + (rand() - 0.5) * 0.5,
    s: 0.55 + rand() * 0.35,
    dark: rand() < 0.4,
  }));
  const hue = Math.floor(rand() * 3);
  return { angle, length, width, depth, at, birth, bend: (rand() - 0.5) * 0.28, leafR, blobs, blossoms, edge, hue, children };
}

type Segment = { d: string; depth: number; w: number; x2: number; y2: number; bark: string | null };
type Tip = { x: number; y: number; branch: Branch; f: number };

const quad = (x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number) => ({
  x: (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2,
  y: (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2,
});

function layout(trunk: Branch, g: number, fit: number) {
  const segments: Segment[] = [];
  const tips: Tip[] = [];
  const overall = fit * (0.45 + 0.55 * smooth((g - WOOD_START) / 0.7));

  const walk = (b: Branch, x: number, y: number, parentAngle: number, parentWidth: number) => {
    const f = smooth((g - b.birth) / 0.15);
    if (f <= 0) return false;
    let ang = parentAngle + b.angle;
    ang += (-Math.PI / 2 - ang) * 0.12; // reach for the light
    const len = b.length * f * overall;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    const nx = Math.cos(ang + Math.PI / 2);
    const ny = Math.sin(ang + Math.PI / 2);
    const cx = (x + x2) / 2 + nx * b.bend * len;
    const cy = (y + y2) / 2 + ny * b.bend * len;
    const w1 = Math.min(parentWidth, b.width * overall * (0.45 + 0.55 * f));
    const w2 = w1 * 0.62;
    const h1 = w1 / 2;
    const h2 = w2 / 2;
    const hc = (h1 + h2) / 2;
    const d =
      `M${x + nx * h1},${y + ny * h1} Q${cx + nx * hc},${cy + ny * hc} ${x2 + nx * h2},${y2 + ny * h2} ` +
      `L${x2 - nx * h2},${y2 - ny * h2} Q${cx - nx * hc},${cy - ny * hc} ${x - nx * h1},${y - ny * h1} Z`;
    const bark =
      b.depth <= 1 && w1 > 3
        ? `M${x + nx * h1 * 0.35},${y + ny * h1 * 0.35} Q${cx + nx * hc * 0.2},${cy + ny * hc * 0.2} ${x2 + nx * h2 * 0.3},${y2 + ny * h2 * 0.3} ` +
          `M${x - nx * h1 * 0.4},${y - ny * h1 * 0.4} Q${cx - nx * hc * 0.5},${cy - ny * hc * 0.5} ${x2 - nx * h2 * 0.2},${y2 - ny * h2 * 0.2}`
        : null;
    segments.push({ d, depth: b.depth, w: w2, x2, y2, bark });

    let grownChild = false;
    for (const child of b.children) {
      const p = quad(x, y, cx, cy, x2, y2, child.at);
      if (walk(child, p.x, p.y, ang, w1) && smooth((g - child.birth) / 0.15) > 0.6) grownChild = true;
    }
    // Leaves sit wherever the tree currently ends (until its new shoots have
    // grown in), plus on every fine twig.
    if (!grownChild || b.depth >= 3) tips.push({ x: x2, y: y2, branch: b, f });
    return true;
  };

  walk(trunk, CX, GROUND, -Math.PI / 2, 99);
  return { segments, tips, overall };
}

type Model = { trunk: Branch; fit: number };

function buildModel(seed: number): Model {
  const rand = mulberry32(seed * 9973 + 17);
  const trunk = buildBranch(rand, 0, 62, 13, WOOD_START, 0, 0);
  // Fit the fully grown crown inside the view box.
  const full = layout(trunk, 1, 1);
  let minY = GROUND;
  let maxDx = 1;
  for (const s of full.segments) {
    minY = Math.min(minY, s.y2);
    maxDx = Math.max(maxDx, Math.abs(s.x2 - CX));
  }
  for (const t of full.tips) {
    minY = Math.min(minY, t.y - t.branch.leafR * 1.2);
    maxDx = Math.max(maxDx, Math.abs(t.x - CX) + t.branch.leafR * 1.2);
  }
  const fit = Math.min(1, (GROUND - 10) / (GROUND - minY), (VIEW_W / 2 - 6) / maxDx);
  return { trunk, fit };
}

/** A small leaf pointing along +x, 16 units long, base at the origin. */
const LEAF = "M0,0 C4,-5.5 11,-6 16,0 C11,6 4,5.5 0,0 Z";

function Sprout({ g, palette, droop, idp }: { g: number; palette: Palette; droop: number; idp: string }) {
  const grow = smooth((g - 0.025) / 0.2);
  if (grow <= 0) return null;
  const h = 5 + 30 * grow;
  const topX = CX + 2 + droop * 0.6;
  const topY = GROUND - h + droop;
  const stem = `M${CX},${GROUND} Q${CX - 5},${GROUND - h * 0.55} ${topX},${topY}`;
  const open = 0.35 + 0.55 * smooth(grow * 1.4);
  const leafScale = 0.35 + 0.45 * grow;
  const trueLeaves = smooth((g - 0.09) / 0.1);
  const third = smooth((g - 0.16) / 0.08);
  const mid = quad(CX, GROUND, CX - 5, GROUND - h * 0.55, topX, topY, 0.58);
  return (
    <G>
      <Path d={stem} stroke={palette.stem} strokeWidth={1.8 + 1.6 * grow} strokeLinecap="round" fill="none" />
      {trueLeaves > 0 ? (
        <>
          <G transform={`translate(${mid.x} ${mid.y}) rotate(${-160 + droop * 6}) scale(${0.9 * trueLeaves})`}>
            <Path d={LEAF} fill={`url(#${idp}leaf)`} />
          </G>
          <G transform={`translate(${mid.x} ${mid.y}) rotate(${-20 - droop * 6}) scale(${0.9 * trueLeaves})`}>
            <Path d={LEAF} fill={`url(#${idp}leaf)`} />
          </G>
        </>
      ) : null}
      {third > 0 ? (
        <G transform={`translate(${topX} ${topY}) rotate(-90) scale(${0.7 * third})`}>
          <Path d={LEAF} fill={`url(#${idp}leaf)`} />
        </G>
      ) : null}
      {/* Seed leaves: open like a pair of hands as the stem rises. */}
      <G transform={`translate(${topX} ${topY}) rotate(${-180 + (1 - open) * 70 + droop * 8}) scale(${leafScale})`}>
        <Path d={LEAF} fill={`url(#${idp}leaf)`} />
      </G>
      <G transform={`translate(${topX} ${topY}) rotate(${-(1 - open) * 70 - droop * 8}) scale(${leafScale})`}>
        <Path d={LEAF} fill={`url(#${idp}leaf)`} />
      </G>
    </G>
  );
}

function Seed({ g, idp }: { g: number; idp: string }) {
  const fade = 1 - smooth((g - 0.035) / 0.05);
  if (fade <= 0) return null;
  const crack = g > 0.012;
  return (
    <G opacity={fade} transform={`translate(${CX + 1} ${GROUND - 3}) rotate(-22)`}>
      <Ellipse cx={0} cy={0} rx={7.5} ry={5.2} fill={`url(#${idp}seed)`} />
      <Ellipse cx={-2.4} cy={-1.8} rx={2.2} ry={1.2} fill="rgba(255,255,255,0.35)" />
      {crack ? <Path d="M-3,-4.6 L-0.6,-2 L-2,0 L0.8,2.4" stroke="#3B2618" strokeWidth={0.7} fill="none" /> : null}
    </G>
  );
}

export type LivingTreeProps = {
  /** 0 = seed, 1 = fully grown and blooming. */
  growth: number;
  vitality?: ForestVitality;
  /** Picks this tree's branch shape. */
  seed?: number;
  /** Rendered width; height is 1.1× width. */
  size: number;
  /** Fewer shapes, for small background trees. */
  lowDetail?: boolean;
  /** Draw the soil mound and ground shadow (off when the scene has its own ground). */
  showSoil?: boolean;
  /** The round shadow under the tree (off when the scene casts a directional one). */
  groundShadow?: boolean;
};

function LivingTreeBase({
  growth,
  vitality = "thriving",
  seed = 1,
  size,
  lowDetail = false,
  showSoil = true,
  groundShadow = true,
}: LivingTreeProps) {
  const g = clamp(growth);
  const model = useMemo(() => buildModel(seed), [seed]);
  const palette = PALETTES[vitality];
  const droop = DROOP[vitality];
  const leafScale = LEAF_SCALE[vitality];
  const idp = `lt${seed}${vitality}${lowDetail ? "l" : ""}`;

  const { segments, tips } = useMemo(() => layout(model.trunk, g, model.fit), [model, g]);
  const wood = g >= WOOD_START;
  const sproutFade = 1 - smooth((g - 0.25) / 0.09);
  const bloom = vitality === "wilting" || vitality === "dry" ? 0 : smooth((g - BLOOM_START) / 0.12);
  const moundRx = 18 + 26 * smooth(g / 0.6);

  const canopy = tips.map((t) => {
    const lf = smooth((t.f - 0.15) / 0.5) * leafScale * (0.6 + 0.4 * smooth((g - WOOD_START) / 0.6));
    return { ...t, lf, y: t.y + droop * (1 + t.branch.depth * 0.3) };
  });
  const spread = canopy.reduce((m, t) => Math.max(m, Math.abs(t.x - CX) + t.branch.leafR * t.lf), 0);

  return (
    <Svg width={size} height={size * (VIEW_H / VIEW_W)} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
      <Defs>
        <RadialGradient id={`${idp}blob`} cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor={palette.light} />
          <Stop offset="0.55" stopColor={palette.mid} />
          <Stop offset="1" stopColor={palette.dark} />
        </RadialGradient>
        {/* Two more greens, a touch warmer and cooler, for natural variation. */}
        <RadialGradient id={`${idp}blob1`} cx="30%" cy="24%" r="70%">
          <Stop offset="0" stopColor={palette.light} />
          <Stop offset="0.38" stopColor={palette.light} />
          <Stop offset="0.75" stopColor={palette.mid} />
          <Stop offset="1" stopColor={palette.dark} />
        </RadialGradient>
        <RadialGradient id={`${idp}blob2`} cx="40%" cy="28%" r="80%">
          <Stop offset="0" stopColor={palette.mid} />
          <Stop offset="0.6" stopColor={palette.dark} />
          <Stop offset="1" stopColor={palette.dark} />
        </RadialGradient>
        <LinearGradient id={`${idp}bark`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={palette.trunkDark} />
          <Stop offset="0.45" stopColor={palette.trunk} />
          <Stop offset="1" stopColor={palette.trunkDark} />
        </LinearGradient>
        <LinearGradient id={`${idp}leaf`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={palette.mid} />
          <Stop offset="1" stopColor={palette.light} />
        </LinearGradient>
        <RadialGradient id={`${idp}seed`} cx="40%" cy="35%" r="70%">
          <Stop offset="0" stopColor="#B07A4E" />
          <Stop offset="1" stopColor="#5C3A22" />
        </RadialGradient>
        <RadialGradient id={`${idp}soil`} cx="50%" cy="40%" r="60%">
          <Stop offset="0" stopColor="#7B5A43" />
          <Stop offset="1" stopColor="#4A3325" />
        </RadialGradient>
      </Defs>

      {showSoil ? (
        <>
          {spread > 0 && groundShadow ? (
            <Ellipse cx={CX} cy={GROUND + 3} rx={Math.max(moundRx, spread * 0.9)} ry={6} fill="#1B3A1E" opacity={0.18} />
          ) : null}
          <Ellipse cx={CX} cy={GROUND + 1} rx={moundRx} ry={5.5} fill={`url(#${idp}soil)`} />
          <Ellipse cx={CX - moundRx * 0.3} cy={GROUND - 1} rx={moundRx * 0.35} ry={1.4} fill="rgba(255,255,255,0.12)" />
        </>
      ) : null}

      <Seed g={g} idp={idp} />
      {sproutFade > 0 ? (
        <G opacity={sproutFade}>
          <Sprout g={g} palette={palette} droop={droop} idp={idp} />
        </G>
      ) : null}

      {wood ? (
        <G opacity={smooth((g - WOOD_START) / 0.06)}>
          {/* Back canopy: deep shade that fills the gaps between leaf clumps. */}
          {canopy.map((t, i) =>
            t.lf > 0 ? (
              <Circle key={`b${i}`} cx={t.x} cy={t.y + 2} r={t.branch.leafR * 1.3 * t.lf} fill={palette.dark} opacity={0.92} />
            ) : null,
          )}

          {/* Root flare where the trunk meets the soil. */}
          {segments[0] ? (
            <>
              <Path
                d={`M${CX - segments[0].w * 1.6},${GROUND + 1} Q${CX - segments[0].w * 0.7},${GROUND - 2} ${CX - segments[0].w * 0.7},${GROUND - 9} L${CX + segments[0].w * 0.7},${GROUND - 9} Q${CX + segments[0].w * 0.7},${GROUND - 2} ${CX + segments[0].w * 1.6},${GROUND + 1} Z`}
                fill={`url(#${idp}bark)`}
              />
              {/* Surface roots spreading into the soil. */}
              {!lowDetail
                ? [-1, 1].map((side) => {
                    const w = segments[0].w;
                    return (
                      <Path
                        key={`r${side}`}
                        d={`M${CX + side * w * 0.5},${GROUND - 3} Q${CX + side * w * 1.4},${GROUND - 1.5} ${CX + side * w * 2.6},${GROUND + 1.5} L${CX + side * w * 2.3},${GROUND + 2.6} Q${CX + side * w * 1.2},${GROUND + 0.8} ${CX + side * w * 0.3},${GROUND}`}
                        fill={palette.trunkDark}
                        opacity={0.85}
                      />
                    );
                  })
                : null}
            </>
          ) : null}
          {segments.map((s, i) => (
            <G key={`s${i}`}>
              <Path d={s.d} fill={s.depth <= 1 ? `url(#${idp}bark)` : palette.trunk} />
              {s.bark && !lowDetail ? <Path d={s.bark} stroke={palette.trunkDark} strokeWidth={0.6} opacity={0.45} fill="none" /> : null}
              <Circle cx={s.x2} cy={s.y2} r={s.w / 2} fill={palette.trunk} />
            </G>
          ))}

          {/* Single leaves breaking the crown's outline (behind the clumps). */}
          {!lowDetail
            ? canopy.map((t, i) =>
                t.lf > 0.25
                  ? t.branch.edge.map((e, j) => {
                      const r = t.branch.leafR * t.lf * 0.95;
                      const deg = (e.a * 180) / Math.PI + droop * 4;
                      return (
                        <G
                          key={`e${i}-${j}`}
                          transform={`translate(${t.x + Math.cos(e.a) * r} ${t.y + Math.sin(e.a) * r * 0.85}) rotate(${deg}) scale(${e.s * t.lf * 0.85})`}
                        >
                          <Path d={LEAF} fill={e.dark ? palette.dark : palette.mid} />
                        </G>
                      );
                    })
                  : null,
              )
            : null}

          {/* Leaf clumps, lit from the upper left, each in one of three greens. */}
          {canopy.map((t, i) =>
            t.lf > 0 ? (
              <G key={`c${i}`}>
                {(lowDetail ? t.branch.blobs.slice(0, 1) : t.branch.blobs).map((b, j) => (
                  <Circle
                    key={j}
                    cx={t.x + b.dx * t.lf}
                    cy={t.y + b.dy * t.lf}
                    r={b.r * t.lf}
                    fill={`url(#${idp}${["blob", "blob1", "blob2"][lowDetail ? 0 : (t.branch.hue + j) % 3]})`}
                  />
                ))}
              </G>
            ) : null,
          )}
          {/* Dappled sunlight on the lit side of each clump. */}
          {!lowDetail
            ? canopy.map((t, i) =>
                t.lf > 0 ? (
                  <G key={`h${i}`} opacity={0.26}>
                    <Ellipse
                      cx={t.x - t.branch.leafR * 0.38 * t.lf}
                      cy={t.y - t.branch.leafR * 0.42 * t.lf}
                      rx={t.branch.leafR * 0.32 * t.lf}
                      ry={t.branch.leafR * 0.22 * t.lf}
                      fill={palette.light}
                    />
                    <Circle
                      cx={t.x - t.branch.leafR * 0.05 * t.lf}
                      cy={t.y - t.branch.leafR * 0.62 * t.lf}
                      r={t.branch.leafR * 0.13 * t.lf}
                      fill="#F1F8E9"
                    />
                  </G>
                ) : null,
              )
            : null}

          {bloom > 0
            ? canopy.map((t, i) =>
                t.branch.blossoms.map((b, j) =>
                  (i * 2 + j) % 10 < bloom * 10 ? (
                    <G key={`f${i}-${j}`}>
                      <Circle cx={t.x + b.dx} cy={t.y + b.dy} r={b.r * bloom} fill="#F8BBD0" />
                      <Circle cx={t.x + b.dx - 0.4} cy={t.y + b.dy - 0.4} r={b.r * 0.55 * bloom} fill="#FCE4EC" />
                      <Circle cx={t.x + b.dx} cy={t.y + b.dy} r={b.r * 0.3 * bloom} fill="#FFD54F" />
                    </G>
                  ) : null,
                ),
              )
            : null}
        </G>
      ) : null}
    </Svg>
  );
}

/** Growth is rounded so tiny tween steps don't re-render identical frames. */
export const LivingTree = memo(LivingTreeBase, (a, b) =>
  Math.round(a.growth * 400) === Math.round(b.growth * 400) &&
  a.vitality === b.vitality &&
  a.seed === b.seed &&
  a.size === b.size &&
  a.lowDetail === b.lowDetail &&
  a.showSoil === b.showSoil &&
  a.groundShadow === b.groundShadow,
);

export const TREE_ASPECT = VIEW_H / VIEW_W;
