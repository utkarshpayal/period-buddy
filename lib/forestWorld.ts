import type { ForestVitality } from "./api";
import { rng } from "./tree3d";

/**
 * The Wellness Forest's world: where the person's grown trees stand round the
 * current one, how big the meadow is, and which animals live there. Pure,
 * unit-tested (lib/__tests__/forestWorld.test.ts); drawn by
 * components/forest/Forest3D.tsx.
 */

/** The meadow grows with the forest so the trees never crowd the edge. */
export function worldRadius(trees: number): number {
  return Math.min(7.5, 2 + Math.sqrt(trees) * 0.8);
}

export type TreeSpot = { seed: number; x: number; z: number; scale: number; rot: number };

/**
 * Grown trees in a natural spread round the current tree (golden-angle
 * spiral with jitter), never closer than 1.35 to the middle (a clearing round
 * your tree) or 0.7 to each other. Newest trees stand nearest. Same seeds → same forest.
 */
export function forestLayout(seeds: number[], maxTrees = 40): TreeSpot[] {
  const list = seeds.slice(-maxTrees).reverse();
  const out: TreeSpot[] = [];
  const R = worldRadius(seeds.length);
  for (let i = 0; i < list.length; i++) {
    const r = rng(list[i] * 97 + 13);
    for (let attempt = 0; attempt < 12; attempt++) {
      const k = i + attempt * 0.37;
      const a = k * 2.39996 + r() * 0.6;
      const d = Math.min(R - 0.35, 1.35 + Math.sqrt(k + 1) * 0.66 + r() * 0.25);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (out.every((t) => Math.hypot(t.x - x, t.z - z) > 0.7)) {
        out.push({ seed: list[i], x, z, scale: 0.55 + r() * 0.25, rot: r() * Math.PI * 2 });
        break;
      }
    }
  }
  return out;
}

export type Wildlife = {
  birds: number;
  butterflies: number;
  rabbits: number;
  squirrels: number;
  deer: number;
  foxes: number;
};

/**
 * Animals by how dense the forest is (grown trees) and how the current tree
 * is doing: a wilting or dry forest scares most of them off.
 */
export function wildlifeFor(trees: number, vitality: ForestVitality): Wildlife {
  const calm = vitality === "thriving" || vitality === "new" ? 1 : vitality === "thirsty" ? 0.6 : 0.25;
  const n = (base: number) => Math.floor(base * calm);
  return {
    birds: n(trees >= 1 ? Math.min(8, 2 + Math.floor(trees / 2)) : 0),
    butterflies: n(trees >= 12 ? 4 : trees >= 3 ? 3 : 2),
    rabbits: n(trees >= 3 ? Math.min(4, 1 + Math.floor(trees / 4)) : 0),
    squirrels: n(trees >= 5 ? Math.min(3, Math.floor(trees / 5)) : 0),
    deer: n(trees >= 8 ? Math.min(3, Math.floor(trees / 8)) : 0),
    foxes: n(trees >= 12 ? 1 : 0),
  };
}

/** "3 birds, 2 rabbits and a deer live here" (empty when none). */
export function wildlifeLine(w: Wildlife): string {
  const parts: string[] = [];
  const add = (count: number, one: string, many: string) => {
    if (count === 1) parts.push(`a ${one}`);
    else if (count > 1) parts.push(`${count} ${many}`);
  };
  add(w.birds, "bird", "birds");
  add(w.rabbits, "rabbit", "rabbits");
  add(w.squirrels, "squirrel", "squirrels");
  add(w.deer, "deer", "deer");
  add(w.foxes, "fox", "foxes");
  if (!parts.length) return "";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} live here`;
}

/** Next animal to move in, to give a reason to grow another tree. */
export function nextWildlife(trees: number): { at: number; label: string } | null {
  const steps = [
    { at: 1, label: "Birds" },
    { at: 3, label: "Rabbits" },
    { at: 5, label: "Squirrels" },
    { at: 8, label: "Deer" },
    { at: 12, label: "A fox" },
  ];
  return steps.find((s) => s.at > trees) ?? null;
}
