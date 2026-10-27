#!/usr/bin/env node
/**
 * Builds assets/models/female-body.glb, the Body Map's 3D model, from
 * MakeHuman's CC0 assets (https://github.com/makehumancommunity/makehuman,
 * makehuman/data, LICENSE.ASSETS.md: CC0 1.0). See docs/BODY_MAP.md.
 *
 *   node scripts/generate-body-model.mjs <dir with the MakeHuman files>
 *
 * The directory needs base.obj (data/3dobjs) and these targets
 * (data/targets/macrodetails): african-, asian- and caucasian-female-young
 * .target, mixed a third each like MakeHuman's default young woman. Only the
 * `body` group is kept (no helper or joint geometry), plus two plain eyeballs
 * in the eye sockets. Output is Y-up, metres, feet at y = 0, facing +Z.
 *
 * It also writes the 2D fallback views (assets/models/female-body-{front,back}.png)
 * and lib/bodyModel.generated.ts: every region anchor, snapped to the skin.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/generate-body-model.mjs <makehuman-data-dir>");
  process.exit(1);
}
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/models/female-body.glb");

// ── Read the base mesh ────────────────────────────────────────────────────────
const obj = fs.readFileSync(path.join(dir, "base.obj"), "utf8").split("\n");
const verts = [];
const bodyFaces = [];
const groupVerts = new Map();
let group = "";
for (const line of obj) {
  if (line.startsWith("v ")) {
    const [, x, y, z] = line.trim().split(/\s+/);
    verts.push([+x, +y, +z]);
  } else if (line.startsWith("g ")) {
    group = line.slice(2).trim();
  } else if (line.startsWith("f ")) {
    const idx = line.trim().split(/\s+/).slice(1).map((t) => parseInt(t.split("/")[0], 10) - 1);
    if (group === "body") bodyFaces.push(idx);
    else {
      if (!groupVerts.has(group)) groupVerts.set(group, new Set());
      idx.forEach((i) => groupVerts.get(group).add(i));
    }
  }
}

// ── Apply the female targets ──────────────────────────────────────────────────
const targets = [
  ["african-female-young.target", 1 / 3],
  ["asian-female-young.target", 1 / 3],
  ["caucasian-female-young.target", 1 / 3],
];
for (const [file, weight] of targets) {
  for (const line of fs.readFileSync(path.join(dir, file), "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [i, dx, dy, dz] = line.trim().split(/\s+/);
    const v = verts[+i];
    v[0] += +dx * weight;
    v[1] += +dy * weight;
    v[2] += +dz * weight;
  }
}

// ── Keep only the body's vertices, re-indexed ─────────────────────────────────
const remap = new Map();
const positions = [];
const keep = (i) => {
  if (!remap.has(i)) {
    remap.set(i, positions.length / 3);
    positions.push(...verts[i]);
  }
  return remap.get(i);
};
const indices = [];
for (const f of bodyFaces) {
  const r = f.map(keep);
  for (let k = 1; k + 1 < r.length; k++) indices.push(r[0], r[k], r[k + 1]);
}

// MakeHuman units are decimetres; feet to y = 0, centred on x/z.
let minY = Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (let i = 0; i < positions.length; i += 3) {
  minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
  minY = Math.min(minY, positions[i + 1]);
  minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
}
const cx = (minX + maxX) / 2;
const cz = (minZ + maxZ) / 2;
const place = (p) => [(p[0] - cx) / 10, (p[1] - minY) / 10, (p[2] - cz) / 10];
for (let i = 0; i < positions.length; i += 3) {
  const p = place(positions.slice(i, i + 3));
  positions[i] = p[0]; positions[i + 1] = p[1]; positions[i + 2] = p[2];
}

// ── Mannequin chest ───────────────────────────────────────────────────────────
// The app is used from 13+, so nipple and groin detail is replaced by a smooth surface: a
// quadratic surface z = f(x, y) is fitted to the ring of skin around each
// breast's most forward point, and the inner patch is blended onto it.
{
  let top = 0;
  for (let i = 1; i < positions.length; i += 3) top = Math.max(top, positions[i]);
  const count = positions.length / 3;
  // Each patch: [x range, y range as a fraction of height, radius]. Both
  // breasts' nipple detail, and the groin cleft (same reason).
  const PATCHES = [
    [[0.03, 0.15], [0.68, 0.76], 0.016],
    [[-0.15, -0.03], [0.68, 0.76], 0.016],
    [[-0.01, 0.01], [0.465, 0.48], 0.035],
  ];
  for (const [[x0, x1], [y0, y1], R] of PATCHES) {
    let tip = -1;
    for (let i = 0; i < count; i++) {
      const x = positions[i * 3], y = positions[i * 3 + 1] / top;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (tip < 0 || positions[i * 3 + 2] > positions[tip * 3 + 2]) tip = i;
    }
    const [tx, ty] = [positions[tip * 3], positions[tip * 3 + 1]];
    // Front-facing skin only (z ahead of the tip's plane minus a margin).
    const front = (i) => positions[i * 3 + 2] > positions[tip * 3 + 2] - 0.06;
    const dist = (i) => Math.hypot(positions[i * 3] - tx, positions[i * 3 + 1] - ty);
    const basis = (x, y) => [1, x, y, x * x, x * y, y * y];
    const A = Array.from({ length: 6 }, () => new Array(6).fill(0));
    const b = new Array(6).fill(0);
    for (let i = 0; i < count; i++) {
      const d = dist(i);
      if (d < R || d > R * 2.2 || !front(i)) continue;
      const f = basis(positions[i * 3] - tx, positions[i * 3 + 1] - ty);
      for (let r = 0; r < 6; r++) {
        b[r] += f[r] * positions[i * 3 + 2];
        for (let c = 0; c < 6; c++) A[r][c] += f[r] * f[c];
      }
    }
    const coef = solve(A, b);
    for (let i = 0; i < count; i++) {
      const d = dist(i);
      if (d >= R || !front(i)) continue;
      const f = basis(positions[i * 3] - tx, positions[i * 3 + 1] - ty);
      const fit = f.reduce((s, v, k) => s + v * coef[k], 0);
      const t = Math.min(1, (1 - d / R) / 0.4);
      const w = t * t * (3 - 2 * t);
      positions[i * 3 + 2] += (fit - positions[i * 3 + 2]) * w;
    }
  }
}

// ── Hair ──────────────────────────────────────────────────────────────────────
// Short hair painted onto the scalp with a soft hairline (vertex colours,
// below), and the scalp lifted a little for volume.
const hairWeight = hairWeights(positions);
{
  const n = computeNormals(positions, indices);
  for (let i = 0; i < hairWeight.length; i++) {
    for (let k = 0; k < 3; k++) positions[i * 3 + k] += n[i * 3 + k] * 0.007 * hairWeight[i];
  }
}

// ── Smooth normals ────────────────────────────────────────────────────────────
const normals = computeNormals(positions, indices);

// ── Baked ambient occlusion ───────────────────────────────────────────────────
// Creases (armpits, under the breasts, navel, between the legs, eye sockets)
// get darker, which is most of what makes a plain mesh read as a real body.
// Stored as vertex colour (COLOR_0), multiplied with the skin colour.
const ao = bakeAmbientOcclusion(positions, normals, indices);
// Final body colour = skin or hair, darkened by the occlusion.
const SKIN = [0.89, 0.72, 0.63];
const HAIR = [0.16, 0.1, 0.07];
const bodyColors = [];
for (let i = 0; i < hairWeight.length; i++) {
  const occ = ao[i * 3];
  const w = hairWeight[i];
  for (let k = 0; k < 3; k++) bodyColors.push(+((SKIN[k] * (1 - w) + HAIR[k] * w) * occ).toFixed(3));
}

// ── Eyeballs (MakeHuman ships them as a separate proxy) ───────────────────────
const eyes = ["joint-l-eye", "joint-r-eye"].map((g) => {
  const ids = [...(groupVerts.get(g) ?? [])];
  const c = [0, 0, 0];
  ids.forEach((i) => { c[0] += verts[i][0]; c[1] += verts[i][1]; c[2] += verts[i][2]; });
  return place(c.map((n) => n / ids.length));
});
const eye = mergeMeshes(eyes.map((c) => sphere(c, 0.0118, 24, 16)));
// Iris and pupil on the front of each eyeball (vertex colours).
eye.colors = [];
for (let i = 0; i < eye.normals.length; i += 3) {
  const z = eye.normals[i + 2];
  eye.colors.push(...(z > 0.96 ? [0.05, 0.04, 0.04] : z > 0.86 ? [0.3, 0.19, 0.12] : [0.95, 0.94, 0.92]));
}

// ── Write the GLB ─────────────────────────────────────────────────────────────
const meshes = [
  { name: "Body", positions, normals, indices, colors: bodyColors, material: 0 },
  { name: "Eyes", ...eye, material: 1 },

];
writeGlb(out, meshes, [
  // Colour comes from the vertex colours (skin, hair, occlusion).
  { name: "Skin", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.7 } },
  { name: "Eye", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.25 } },
]);
const height = Math.max(...positions.filter((_, i) => i % 3 === 1));
console.log(`wrote ${out}: ${positions.length / 3} vertices, ${indices.length / 3} triangles, height ${height.toFixed(3)} m`);

// ── Region anchors, snapped to the skin ───────────────────────────────────────
// Keys are `<regionId>:<side>` from lib/bodyRegions.ts. Seeds are
// [x, y as a fraction of height, facing]; the anchor is the outermost body
// vertex near the seed's (x, y) whose normal faces that way. The person's
// left is +x (MakeHuman's joint-l-* side).
if (!(eyes[0][0] > 0)) throw new Error("expected the left eye on +x");
const SEEDS = {
  "head:center": [0, 0.975, "front"],
  "face:center": [0, 0.925, "front"],
  "neck:center": [0, 0.84, "front"],
  "chest:center": [0, 0.74, "front"],
  "breast:left": [0.085, 0.72, "front"],
  "breast:right": [-0.085, 0.72, "front"],
  "upper_abdomen:center": [0, 0.655, "front"],
  "lower_abdomen:center": [0, 0.585, "front"],
  "lower_abdomen:left": [0.07, 0.585, "front"],
  "lower_abdomen:right": [-0.07, 0.585, "front"],
  "pelvis:center": [0, 0.54, "front"],
  "genital:center": [0, 0.505, "front"],
  "hip:left": [0.165, 0.535, "side"],
  "hip:right": [-0.165, 0.535, "side"],
  "shoulder:left": [0.19, 0.81, "up"],
  "shoulder:right": [-0.19, 0.81, "up"],
  "arm:left": [0.27, 0.69, "side"],
  "arm:right": [-0.27, 0.69, "side"],
  "hand:left": [0.39, 0.5, "front"],
  "hand:right": [-0.39, 0.5, "front"],
  "thigh:left": [0.09, 0.43, "front"],
  "thigh:right": [-0.09, 0.43, "front"],
  "knee:left": [0.085, 0.275, "front"],
  "knee:right": [-0.085, 0.275, "front"],
  "lower_leg:left": [0.085, 0.16, "front"],
  "lower_leg:right": [-0.085, 0.16, "front"],
  "foot:left": [0.1, 0.02, "front"],
  "foot:right": [-0.1, 0.02, "front"],
  "upper_back:center": [0, 0.74, "back"],
  "lower_back:center": [0, 0.6, "back"],
  "lower_back:left": [0.06, 0.6, "back"],
  "lower_back:right": [-0.06, 0.6, "back"],
  "buttock:left": [0.07, 0.5, "back"],
  "buttock:right": [-0.07, 0.5, "back"],
};
const DIRS = { front: [0, 0, 1], back: [0, 0, -1], up: [0, 1, 0] };
const anchors = {};
for (const [key, [sx, fy, facing]] of Object.entries(SEEDS)) {
  const sy = fy * height;
  const dir = facing === "side" ? [Math.sign(sx), 0, 0] : DIRS[facing];
  let best = -1, bestD = Infinity;
  for (let i = 0; i < positions.length / 3; i++) {
    const n = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
    if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0.45) continue;
    const dx = positions[i * 3] - sx, dy = positions[i * 3 + 1] - sy;
    const outward = positions[i * 3] * dir[0] + positions[i * 3 + 1] * dir[1] + positions[i * 3 + 2] * dir[2];
    const d = dx * dx + dy * dy - outward * 0.02;
    if (d < bestD) { bestD = d; best = i; }
  }
  anchors[key] = {
    p: [0, 1, 2].map((k) => +positions[best * 3 + k].toFixed(4)),
    n: [0, 1, 2].map((k) => +normals[best * 3 + k].toFixed(3)),
  };
}

// ── 2D front/back views for the fallback (same model, orthographic) ──────────────────────
// Each view is a transparent PNG plus every anchor's [u, v] (0–1 across the
// image) when it's visible from that side.
const VIEWS = { front: 0, back: Math.PI };
const IMG_H = 720;
const MARGIN = 0.02;
const views2d = {};
for (const [view, ang] of Object.entries(VIEWS)) {
  const rot = ([x, y, z]) => [x * Math.cos(ang) + z * Math.sin(ang), y, -x * Math.sin(ang) + z * Math.cos(ang)];
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const r = rot([positions[i], positions[i + 1], positions[i + 2]]);
    lo = Math.min(lo, r[0]); hi = Math.max(hi, r[0]);
  }
  const span = height * (1 + 2 * MARGIN);
  const scale = IMG_H / span;
  const W = Math.ceil((hi - lo + 2 * MARGIN * height) * scale);
  const toPx = ([x, y, z]) => [(x - lo + MARGIN * height) * scale, IMG_H - (y + MARGIN * height) * scale, z];
  const { rgba, zbuf } = rasterAA(W, IMG_H, meshes, rot, toPx);
  const png = path.resolve(path.dirname(out), `female-body-${view}.png`);
  fs.writeFileSync(png, encodePng(W, IMG_H, rgba));
  const points = {};
  for (const [key, { p, n }] of Object.entries(anchors)) {
    const [x, y, z] = toPx(rot(p));
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= IMG_H) continue;
    // Shown when it faces this side, or nothing is in front of it.
    const facing = rot(n)[2] > 0.2;
    if (!facing && z < zbuf[yi * W + xi] - 0.03) continue;
    points[key] = [+(x / W).toFixed(4), +(y / IMG_H).toFixed(4)];
  }
  views2d[view] = { aspect: +(W / IMG_H).toFixed(4), points };
}

// ── The generated TypeScript ──────────────────────────────────────────────────
const tsOut = path.resolve(path.dirname(out), "../../lib/bodyModel.generated.ts");
fs.writeFileSync(
  tsOut,
  `// Generated by scripts/generate-body-model.mjs — do not edit by hand.\n` +
    `// Region anchors on assets/models/female-body.glb (metres, Y-up, facing +Z,\n` +
    `// the person's left on +x) and where each shows on the 2D views.\n\n` +
    `export type Vec3 = [number, number, number];\n` +
    `export type BodyView = "front" | "back" | "left" | "right";\nexport type BodyView2D = "front" | "back";\n\n` +
    `export const BODY_MODEL_HEIGHT = ${height.toFixed(4)};\n\n` +
    `export const BODY_ANCHORS: Record<string, { p: Vec3; n: Vec3 }> = ${JSON.stringify(anchors, null, 2)};\n\n` +
    `export const BODY_VIEWS_2D: Record<BodyView2D, { aspect: number; points: Record<string, [number, number]> }> = ${JSON.stringify(views2d, null, 2)};\n`,
);
console.log(`wrote ${tsOut}`);

// ── Helpers ───────────────────────────────────────────────────────────────────
function computeNormals(pos, idx) {
  const n = new Float64Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const fx = e1[1] * e2[2] - e1[2] * e2[1];
    const fy = e1[2] * e2[0] - e1[0] * e2[2];
    const fz = e1[0] * e2[1] - e1[1] * e2[0];
    for (const v of [a, b, c]) { n[v] += fx; n[v + 1] += fy; n[v + 2] += fz; }
  }
  const outN = [];
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    outN.push(n[i] / l, n[i + 1] / l, n[i + 2] / l);
  }
  return outN;
}

function sphere(c, r, seg, rings) {
  const positions = [], normals = [], indices = [];
  for (let y = 0; y <= rings; y++) {
    const v = y / rings, th = v * Math.PI;
    for (let x = 0; x <= seg; x++) {
      const ph = (x / seg) * Math.PI * 2;
      const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      normals.push(...n);
      positions.push(c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r);
    }
  }
  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < seg; x++) {
      const a = y * (seg + 1) + x, b = a + seg + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  return { positions, normals, indices };
}

function mergeMeshes(list) {
  const m = { positions: [], normals: [], indices: [] };
  for (const s of list) {
    const base = m.positions.length / 3;
    m.positions.push(...s.positions);
    m.normals.push(...s.normals);
    m.indices.push(...s.indices.map((i) => i + base));
  }
  return m;
}

function writeGlb(file, meshList, materials) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  let offset = 0;
  const add = (typed, target) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    chunks.push(bytes, Buffer.alloc(pad));
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    offset += bytes.length + pad;
    return bufferViews.length - 1;
  };
  const gltfMeshes = meshList.map((m) => {
    const pos = new Float32Array(m.positions);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i++) { min[i % 3] = Math.min(min[i % 3], pos[i]); max[i % 3] = Math.max(max[i % 3], pos[i]); }
    accessors.push({ bufferView: add(pos, 34962), componentType: 5126, count: pos.length / 3, type: "VEC3", min, max });
    const posAcc = accessors.length - 1;
    accessors.push({ bufferView: add(new Float32Array(m.normals), 34962), componentType: 5126, count: pos.length / 3, type: "VEC3" });
    const nAcc = accessors.length - 1;
    const attributes = { POSITION: posAcc, NORMAL: nAcc };
    if (m.colors) {
      accessors.push({ bufferView: add(new Float32Array(m.colors), 34962), componentType: 5126, count: pos.length / 3, type: "VEC3" });
      attributes.COLOR_0 = accessors.length - 1;
    }
    const big = pos.length / 3 > 65535;
    const idx = big ? new Uint32Array(m.indices) : new Uint16Array(m.indices);
    accessors.push({ bufferView: add(idx, 34963), componentType: big ? 5125 : 5123, count: idx.length, type: "SCALAR" });
    return { name: m.name, primitives: [{ attributes, indices: accessors.length - 1, material: m.material }] };
  });
  const bin = Buffer.concat(chunks);
  const json = {
    asset: { version: "2.0", generator: "period-buddy scripts/generate-body-model.mjs", copyright: "MakeHuman assets, CC0 1.0" },
    scene: 0,
    scenes: [{ nodes: gltfMeshes.map((_, i) => i) }],
    nodes: gltfMeshes.map((m, i) => ({ name: m.name, mesh: i })),
    meshes: gltfMeshes,
    materials,
    buffers: [{ byteLength: bin.length }],
    bufferViews,
    accessors,
  };
  let jsonBuf = Buffer.from(JSON.stringify(json));
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([header, jh, jsonBuf, bh, bin]));
}

// Software rasteriser for the 2D views: 2× supersampled, soft studio light,
// transparent background. Returns RGBA at W×H and the depth buffer at 2×.
function rasterAA(W, H, meshList, rot, toPx) {
  const SS = 2, w = W * SS, h = H * SS;
  const zbuf = new Float32Array(w * h).fill(-Infinity);
  const shade = new Float32Array(w * h * 3);
  const colors = [[1, 1, 1], [1, 1, 1]];
  const light = normalize([-0.35, 0.55, 0.75]);
  meshList.forEach((m, mi) => {
    const base = colors[mi] ?? colors[0];
    for (let t = 0; t < m.indices.length; t += 3) {
      const ids = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
      const P = ids.map((k) => {
        const [x, y, z] = toPx(rot([m.positions[k * 3], m.positions[k * 3 + 1], m.positions[k * 3 + 2]]));
        return [x * SS, y * SS, z];
      });
      const N = ids.map((k) => rot([m.normals[k * 3], m.normals[k * 3 + 1], m.normals[k * 3 + 2]]));
      const C = ids.map((k) => (m.colors ? [m.colors[k * 3], m.colors[k * 3 + 1], m.colors[k * 3 + 2]] : [1, 1, 1]));
      const [a, b, c] = P;
      const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(d) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d;
        const w1 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
        const o = y * w + x;
        if (z <= zbuf[o]) continue;
        zbuf[o] = z;
        const n = normalize([0, 1, 2].map((k) => w0 * N[0][k] + w1 * N[1][k] + w2 * N[2][k]));
        const diffuse = Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
        const rim = Math.pow(1 - Math.max(0, n[2]), 3) * 0.18;
        const vc = [0, 1, 2].map((k) => w0 * C[0][k] + w1 * C[1][k] + w2 * C[2][k]);
        const l = 0.42 + 0.58 * diffuse;
        for (let k = 0; k < 3; k++) shade[o * 3 + k] = Math.min(1, base[k] * vc[k] * l + rim);
      }
    }
  });
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, bl = 0, cov = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (y * SS + sy) * w + x * SS + sx;
      if (zbuf[o] === -Infinity) continue;
      cov++; r += shade[o * 3]; g += shade[o * 3 + 1]; bl += shade[o * 3 + 2];
    }
    const o = (y * W + x) * 4;
    if (!cov) continue;
    rgba[o] = (r / cov) * 255; rgba[o + 1] = (g / cov) * 255; rgba[o + 2] = (bl / cov) * 255;
    rgba[o + 3] = (cov / (SS * SS)) * 255;
  }
  // Depth at 1× (max of the samples) for the anchor visibility test.
  const z1 = new Float32Array(W * H).fill(-Infinity);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++)
      z1[y * W + x] = Math.max(z1[y * W + x], zbuf[(y * SS + sy) * w + x * SS + sx]);
  return { rgba, zbuf: z1 };
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function encodePng(W, H, rgba) {
  const row = W * 4 + 1;
  const raw = Buffer.alloc(row * H);
  for (let y = 0; y < H; y++) rgba.copy(raw, y * row + 1, y * W * 4, (y + 1) * W * 4);
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Gaussian elimination with partial pivoting.
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const k = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j];
    x[r] = s / M[r][r];
  }
  return x;
}

// Ray-traced ambient occlusion per vertex: cosine-weighted hemisphere rays
// against the mesh through a uniform grid, short range (creases, not the
// whole-body shadow). Returns grey RGB per vertex, lightly smoothed.
function bakeAmbientOcclusion(pos, nor, idx) {
  const RAYS = 48, RANGE = 0.14, CELL = 0.02, EPS = 1e-4;
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]); }
  const dim = [0, 1, 2].map((k) => Math.ceil((hi[k] - lo[k]) / CELL) + 1);
  const grid = new Map();
  const cellOf = (v, k) => Math.max(0, Math.min(dim[k] - 1, Math.floor((v - lo[k]) / CELL)));
  for (let t = 0; t < idx.length; t += 3) {
    const vs = [idx[t], idx[t + 1], idx[t + 2]];
    const mn = [0, 1, 2].map((k) => cellOf(Math.min(...vs.map((v) => pos[v * 3 + k])), k));
    const mx = [0, 1, 2].map((k) => cellOf(Math.max(...vs.map((v) => pos[v * 3 + k])), k));
    for (let x = mn[0]; x <= mx[0]; x++) for (let y = mn[1]; y <= mx[1]; y++) for (let z = mn[2]; z <= mx[2]; z++) {
      const key = (x * dim[1] + y) * dim[2] + z;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(t);
    }
  }
  const hit = (o, d, skip) => {
    // March cell by cell (half-cell steps are enough at this range).
    const seen = new Set();
    for (let s = 0; s <= RANGE; s += CELL * 0.5) {
      const p = [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s];
      const key = (cellOf(p[0], 0) * dim[1] + cellOf(p[1], 1)) * dim[2] + cellOf(p[2], 2);
      for (const t of grid.get(key) ?? []) {
        if (seen.has(t)) continue;
        seen.add(t);
        if (idx[t] === skip || idx[t + 1] === skip || idx[t + 2] === skip) continue;
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
        const e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
        const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
        const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
        if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det;
        const tv = [o[0] - pos[a], o[1] - pos[a + 1], o[2] - pos[a + 2]];
        const u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) * inv;
        if (u < 0 || u > 1) continue;
        const q = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
        const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
        if (v < 0 || u + v > 1) continue;
        const dist = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
        if (dist > EPS && dist < RANGE) return dist;
      }
    }
    return null;
  };
  // Fixed, evenly spread directions (golden spiral) so the bake is repeatable.
  const dirs = Array.from({ length: RAYS }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / RAYS), th = i * 2.399963;
    return [r * Math.cos(th), r * Math.sin(th), Math.sqrt(1 - r * r)];
  });
  const n = pos.length / 3;
  const occ = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const N = [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]];
    const T = normalize(Math.abs(N[0]) < 0.9 ? [0, -N[2], N[1]] : [N[2], 0, -N[0]]);
    const B = [N[1] * T[2] - N[2] * T[1], N[2] * T[0] - N[0] * T[2], N[0] * T[1] - N[1] * T[0]];
    const o = [pos[i * 3] + N[0] * 0.001, pos[i * 3 + 1] + N[1] * 0.001, pos[i * 3 + 2] + N[2] * 0.001];
    let blocked = 0;
    for (const [x, y, z] of dirs) {
      const d = [T[0] * x + B[0] * y + N[0] * z, T[1] * x + B[1] * y + N[1] * z, T[2] * x + B[2] * y + N[2] * z];
      const h = hit(o, d, i);
      if (h != null) blocked += 1 - h / RANGE;
    }
    occ[i] = 1 - blocked / RAYS;
  }
  // Two smoothing passes over neighbours, then map to a soft range.
  const nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b);
  }
  let cur = occ;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = cur[i] * 2, w = 2;
      nb[i].forEach((j) => { s += cur[j]; w++; });
      next[i] = s / w;
    }
    cur = next;
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = Math.pow(Math.max(0, Math.min(1, cur[i])), 1.6) * 0.6 + 0.4;
    out.push(+v.toFixed(3), +v.toFixed(3), +v.toFixed(3));
  }
  return out;
}

// How much of each vertex is hair (0–1): above a hairline that runs from
// the forehead down to the nape, soft over ~1 cm so it reads as a hairline.
function hairWeights(pos) {
  let top = -Infinity, front = -Infinity, back = Infinity;
  for (let i = 0; i < pos.length; i += 3) top = Math.max(top, pos[i + 1]);
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i + 1] > top - 0.12 && Math.abs(pos[i]) < 0.1) { front = Math.max(front, pos[i + 2]); back = Math.min(back, pos[i + 2]); }
  }
  const depth = front - back;
  const out = new Float32Array(pos.length / 3);
  for (let i = 0; i < out.length; i++) {
    const [x, y, z] = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    if (Math.abs(x) > 0.105 || y < top - 0.3) continue;
    const t = Math.max(0, Math.min(1, (front - z) / depth)); // 0 forehead → 1 back
    const temple = Math.min(1, Math.abs(x) / 0.075) * 0.035 * (1 - t);
    const line = top - (0.05 + temple + t * t * 0.135);
    const h = (y - line) / 0.012;
    out[i] = h <= 0 ? 0 : h >= 1 ? 1 : h * h * (3 - 2 * h);
  }
  return out;
}
