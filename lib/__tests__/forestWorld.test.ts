import assert from "node:assert/strict";
import test from "node:test";
import { forestLayout, nextWildlife, wildlifeFor, wildlifeLine, worldRadius } from "../forestWorld";

test("the meadow grows with the forest, up to a cap", () => {
  assert.ok(worldRadius(0) < worldRadius(10));
  assert.equal(worldRadius(1000), 7.5);
});

test("grown trees spread out: off the middle, apart, inside the meadow, stable", () => {
  const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
  const spots = forestLayout(seeds);
  assert.ok(spots.length >= 28, `${spots.length} placed`);
  const R = worldRadius(seeds.length);
  for (const s of spots) {
    const d = Math.hypot(s.x, s.z);
    assert.ok(d >= 1.35 && d <= R, `distance ${d}`);
  }
  for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
    assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z) > 0.7);
  }
  assert.deepEqual(forestLayout(seeds), spots);
  // Newest first, at most maxTrees.
  assert.equal(forestLayout(seeds, 10)[0].seed, 30);
  assert.equal(forestLayout(seeds, 10).length <= 10, true);
});

test("animals move in as the forest gets denser", () => {
  const none = wildlifeFor(0, "thriving");
  assert.equal(none.birds + none.rabbits + none.deer, 0);
  assert.ok(none.butterflies > 0);
  assert.ok(wildlifeFor(1, "thriving").birds >= 2);
  assert.equal(wildlifeFor(2, "thriving").rabbits, 0);
  assert.ok(wildlifeFor(3, "thriving").rabbits >= 1);
  assert.ok(wildlifeFor(8, "thriving").deer >= 1);
  assert.equal(wildlifeFor(12, "thriving").foxes, 1);
  // A dry forest scares most of them off.
  assert.ok(wildlifeFor(12, "dry").birds < wildlifeFor(12, "thriving").birds);
});

test("wildlife line and the next animal", () => {
  assert.equal(wildlifeLine({ birds: 3, butterflies: 2, rabbits: 1, squirrels: 0, deer: 1, foxes: 0 }), "3 birds, a rabbit and a deer live here");
  assert.equal(wildlifeLine({ birds: 0, butterflies: 2, rabbits: 0, squirrels: 0, deer: 0, foxes: 0 }), "");
  assert.deepEqual(nextWildlife(6), { at: 8, label: "Deer" });
  assert.equal(nextWildlife(20), null);
});
