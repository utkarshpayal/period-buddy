import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_APP_CONFIG, hubTilesFor, type HubTile } from "../appConfig";
import { HUB_HERO, HUB_SECTIONS, arrangeHub } from "../hubLayout";

const tilesOf = (placement: "care_hub" | "wellness_hub" | "explore_hub") => hubTilesFor(DEFAULT_APP_CONFIG, placement);
const keysOf = (sections: { tiles: HubTile[] }[]) => sections.map((s) => s.tiles.map((t) => t.key));

test("every default hub feature lands in a named section or the hero", () => {
  for (const placement of ["care_hub", "wellness_hub", "explore_hub"] as const) {
    const { hero, sections } = arrangeHub(placement, tilesOf(placement));
    assert.equal(hero?.key ?? null, HUB_HERO[placement] ?? null, placement);
    assert.ok(sections.every((s) => !s.id.startsWith("more-")), `${placement} has an unnamed section`);
    const placed = new Set([hero?.key, ...sections.flatMap((s) => s.tiles.map((t) => t.key))]);
    for (const tile of tilesOf(placement)) assert.ok(placed.has(tile.key), `${tile.key} missing`);
  }
});

test("section keys only name features that exist in that hub by default", () => {
  for (const placement of ["care_hub", "wellness_hub", "explore_hub"] as const) {
    const keys = new Set(tilesOf(placement).map((t) => t.key));
    for (const def of HUB_SECTIONS[placement]) for (const key of def.keys) assert.ok(keys.has(key), `${placement}: ${key}`);
  }
});

test("sections follow the CMS order of their first tile, tiles keep CMS order", () => {
  const tiles = tilesOf("explore_hub");
  const reordered = [tiles.find((t) => t.key === "buddyNomination")!, ...tiles.filter((t) => t.key !== "buddyNomination")];
  const { sections } = arrangeHub("explore_hub", reordered);
  assert.equal(sections[0].id, "connect");
  assert.deepEqual(sections[0].tiles.map((t) => t.key), ["buddyNomination", "partnerSync"]);
});

test("a locked hero feature is drawn as a normal tile", () => {
  const tiles = tilesOf("care_hub").map((t) => (t.key === "consultation" ? { ...t, launch: { ...t.launch, access: "soon" as const } } : t));
  const { hero, sections } = arrangeHub("care_hub", tiles);
  assert.equal(hero, null);
  assert.ok(keysOf(sections).flat().includes("consultation"));
});

test("unknown tiles group by size into untitled runs", () => {
  const base = tilesOf("care_hub")[0];
  const link = (key: string, size: "small" | "large"): HubTile => ({ ...base, key, size, builtIn: false });
  const { sections } = arrangeHub("care_hub", [link("a", "large"), link("b", "large"), link("c", "small")]);
  assert.deepEqual(
    sections.map((s) => [s.title, s.style, s.tiles.map((t) => t.key)]),
    [
      [null, "list", ["a", "b"]],
      [null, "tiles", ["c"]],
    ],
  );
});
