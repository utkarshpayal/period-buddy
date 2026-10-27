import assert from "node:assert/strict";
import test from "node:test";
import { buildTree, emptyPose, grownFraction, poseTree, rng, rotate } from "../tree3d";

test("same seed grows the same tree; different seeds differ", () => {
  assert.deepEqual(buildTree(7), buildTree(7));
  assert.notDeepEqual(buildTree(7).branches.map((b) => b.dir), buildTree(8).branches.map((b) => b.dir));
  const r = rng(3);
  for (let i = 0; i < 100; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
  }
});

test("a full tree has a trunk, a crown and leaves; low detail is lighter", () => {
  const full = buildTree(1);
  const low = buildTree(1, { lowDetail: true });
  assert.equal(full.branches[0].parent, -1);
  assert.ok(full.branches.length > 40 && full.branches.length < 200, `${full.branches.length} branches`);
  assert.ok(full.leaves.length > 150);
  assert.ok(low.branches.length < full.branches.length / 2);
  // Children are born after their parent.
  for (const b of full.branches) if (b.parent >= 0) assert.ok(b.birth > full.branches[b.parent].birth);
});

test("growth 0 shows nothing; growth 1 shows everything at full size", () => {
  const tree = buildTree(3);
  const seed = poseTree(tree, 0, {}, emptyPose(tree));
  assert.ok(seed.branches.every((b) => !b.visible));
  assert.ok(seed.leaves.every((l) => !l.visible));
  const full = poseTree(tree, 1, {}, emptyPose(tree));
  assert.ok(full.branches.every((b) => b.visible));
  const trunk = full.branches[0];
  const len = Math.hypot(...([0, 1, 2].map((k) => trunk.end[k] - trunk.start[k]) as [number, number, number]));
  assert.ok(Math.abs(len - tree.branches[0].length) < 1e-9);
  // Every crown leaf shows; the sprout's first leaves have fallen.
  tree.leaves.forEach((l, i) => assert.equal(full.leaves[i].visible, l.until == null));
  const sprout = poseTree(tree, 0.15, {}, emptyPose(tree));
  assert.ok(tree.leaves.some((l, i) => l.until != null && sprout.leaves[i].visible), "a sprout has leaves");
});

test("growing is monotonic: more growth never shrinks the tree", () => {
  const tree = buildTree(5);
  let prev = -1;
  for (let g = 0; g <= 1.0001; g += 0.05) {
    const pose = poseTree(tree, g, {}, emptyPose(tree));
    const total = pose.branches.reduce((s, b) => s + Math.hypot(b.end[0] - b.start[0], b.end[1] - b.start[1], b.end[2] - b.start[2]), 0);
    assert.ok(total >= prev - 1e-9);
    prev = total;
  }
  // Mid-growth: a sapling, part of the crown.
  const mid = poseTree(tree, 0.4, {}, emptyPose(tree));
  const shown = mid.branches.filter((b) => b.visible).length;
  assert.ok(shown > 1 && shown < tree.branches.length);
});

test("children start on their parent; droop bends the crown down", () => {
  const tree = buildTree(9);
  const pose = poseTree(tree, 1, {}, emptyPose(tree));
  for (const b of tree.branches) {
    if (b.parent < 0) continue;
    const p = pose.branches[b.parent];
    const expect = [0, 1, 2].map((k) => p.start[k] + (p.end[k] - p.start[k]) * b.at);
    assert.deepEqual(pose.branches[b.id].start.map((v) => +v.toFixed(9)), expect.map((v) => +v.toFixed(9)));
  }
  const top = (p: ReturnType<typeof poseTree>) => Math.max(...p.branches.map((b) => b.end[1]));
  assert.ok(top(poseTree(tree, 1, { droop: 1 }, emptyPose(tree))) < top(pose));
});

test("helpers", () => {
  assert.equal(grownFraction(0.5, 0.5), 0);
  assert.equal(grownFraction(2, 0), 1);
  const v = rotate([1, 0, 0], [0, 1, 0], Math.PI / 2);
  assert.ok(Math.abs(v[2] + 1) < 1e-9 && Math.abs(v[0]) < 1e-9);
});
