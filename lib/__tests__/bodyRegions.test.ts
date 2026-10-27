import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { DayEntry } from "../api";
import { BODY_ANCHORS, BODY_MODEL_HEIGHT, BODY_VIEWS_2D } from "../bodyModel.generated";
import {
  anchorKeys,
  BODY_REGION_IDS,
  BODY_REGIONS,
  buildBodyMap,
  escalationFor,
  intensityFor,
  nearestAnchor,
  shiftDayKey,
  SYMPTOMS,
  symptomTagsOf,
} from "../bodyRegions";
import { parseGlb } from "../glb";

const TODAY = "2026-10-26";
const log = (dateKey: string, extra: Partial<DayEntry>): DayEntry => ({ dateKey, ...extra });
const ago = (n: number) => shiftDayKey(TODAY, -n);

// Mirrors period-buddy-be's utils/symptomRecord.js BODY_REGIONS.
const BACKEND_REGIONS = {
  head: ["center"], face: ["center"], neck: ["center"], chest: ["center"], breast: ["left", "right", "both"],
  upper_abdomen: ["center"], lower_abdomen: ["center", "left", "right", "both"], pelvis: ["center"],
  genital: ["center"], upper_back: ["center"], lower_back: ["center", "left", "right", "both"],
  buttock: ["left", "right", "both"], shoulder: ["left", "right", "both"], arm: ["left", "right", "both"],
  hand: ["left", "right", "both"], hip: ["left", "right", "both"], thigh: ["left", "right", "both"],
  knee: ["left", "right", "both"], lower_leg: ["left", "right", "both"], foot: ["left", "right", "both"],
  whole_body: ["center"],
};

test("region ids and sides match the backend", () => {
  assert.deepEqual(Object.fromEntries(BODY_REGION_IDS.map((id) => [id, BODY_REGIONS[id].sides])), BACKEND_REGIONS);
});

test("every logged symptom lands on an anchor of the model", () => {
  for (const s of SYMPTOMS) {
    assert.ok(BODY_REGIONS[s.region].sides.includes(s.side), s.key);
    for (const key of anchorKeys(s.region, s.side)) assert.ok(BODY_ANCHORS[key], `missing anchor ${key}`);
  }
});

test("model: anchors sit on the skin, left on +x, colours baked in", () => {
  const glb = parseGlb(new Uint8Array(fs.readFileSync(path.join(__dirname, "../../assets/models/female-body.glb"))));
  const body = glb.find((m) => m.name === "Body")!;
  assert.ok(body.positions.length / 3 > 10_000);
  assert.ok(body.colors && body.colors.length === body.positions.length, "body has vertex colours");
  let top = 0;
  for (let i = 1; i < body.positions.length; i += 3) top = Math.max(top, body.positions[i]);
  assert.ok(Math.abs(top - BODY_MODEL_HEIGHT) < 0.01);
  for (const [key, { p }] of Object.entries(BODY_ANCHORS)) {
    let best = Infinity;
    for (let i = 0; i < body.positions.length; i += 3) {
      best = Math.min(best, Math.hypot(body.positions[i] - p[0], body.positions[i + 1] - p[1], body.positions[i + 2] - p[2]));
    }
    assert.ok(best < 0.002, `${key} is ${best} m off the skin`);
    if (key.endsWith(":left")) assert.ok(p[0] > 0, key);
    if (key.endsWith(":right")) assert.ok(p[0] < 0, key);
  }
  assert.ok(BODY_VIEWS_2D.front.points["lower_abdomen:center"]);
  assert.ok(BODY_VIEWS_2D.back.points["lower_back:center"]);
  assert.equal(BODY_VIEWS_2D.front.points["lower_back:center"], undefined);
});

test("day-log tags, digestion and skin become symptoms; non-body tags are ignored", () => {
  const tags = symptomTagsOf(log(TODAY, { symptoms: ["cramps", "everything-is-fine", "sex-protected"], digestions: ["bloated"], skin: "acne" }));
  assert.deepEqual(tags.sort(), ["acne", "bloating", "cramps"]);
});

test("intensity is per week so ranges compare", () => {
  assert.equal(intensityFor(1, 7), 1);
  assert.equal(intensityFor(2, 7), 2);
  assert.equal(intensityFor(3, 7), 3);
  assert.equal(intensityFor(4, 30), 1);
  assert.equal(intensityFor(6, 30), 2);
  assert.equal(intensityFor(13, 30), 3);
});

test("buildBodyMap: spots, intensity and recency from the day logs; nothing else", () => {
  const logs = [
    log(ago(0), { symptoms: ["cramps", "backache", "fatigue"], phase: "period", note: "Bad day" }),
    log(ago(1), { symptoms: ["cramps", "backache"] }),
    log(ago(2), { symptoms: ["cramps"] }),
    log(ago(20), { symptoms: ["headache", "tender-breasts"] }),
    log(ago(40), { symptoms: ["headache"] }), // outside 30 days
  ];
  const map = buildBodyMap(logs, TODAY, 30);
  assert.deepEqual(Object.keys(map), ["markers"], "only where; counts/phases live in Symptom Trends");
  const belly = map.markers.find((m) => m.key === "lower_abdomen:center")!;
  const cramps = belly.symptoms[0];
  assert.deepEqual(cramps.days, [ago(0), ago(1), ago(2)]);
  assert.equal(cramps.recent, true);
  assert.equal(belly.recent, true);
  // Tender breasts on both sides → two spots.
  assert.ok(map.markers.some((m) => m.key === "breast:left") && map.markers.some((m) => m.key === "breast:right"));
  // Whole-body symptoms have no spot.
  assert.equal(map.markers.some((m) => m.symptoms.some((s) => s.key === "fatigue")), false);
  // The 7-day range drops the headache.
  assert.equal(buildBodyMap(logs, TODAY, 7).markers.some((m) => m.regionId === "head"), false);
  // Most frequent spots first.
  const daily = Array.from({ length: 14 }, (_, n) => log(ago(n), { symptoms: ["headache"] }));
  assert.equal(buildBodyMap([...daily, log(ago(3), { symptoms: ["acne"] })], TODAY, 30).markers[0].regionId, "head");
});

test("escalation from how often things were logged, never a diagnosis", () => {
  const daily = Array.from({ length: 10 }, (_, n) => log(ago(n), { symptoms: ["cramps", "blood-clots", "discharge-gray"] }));
  const map = buildBodyMap(daily, TODAY, 30);
  const by = (k: string) => map.markers.flatMap((m) => m.symptoms).find((s) => s.key === k)!;
  assert.equal(escalationFor(by("cramps"), 30)?.level, "soon");
  assert.equal(escalationFor(by("blood-clots"), 30)?.level, "soon");
  assert.equal(escalationFor(by("discharge-gray"), 30)?.level, "soon");
  const once = buildBodyMap([log(TODAY, { symptoms: ["cramps"] })], TODAY, 30);
  assert.equal(escalationFor(once.markers[0].symptoms[0], 30), null);
});

test("helpers", () => {
  assert.equal(shiftDayKey("2026-03-01", -1), "2026-02-28");
  const anchors = { "head:center": [0, 0], "foot:left": [1, 1] } as Record<string, [number, number]>;
  const d = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  assert.deepEqual(nearestAnchor([0.9, 1], anchors, d, 0.5), { regionId: "foot", side: "left", key: "foot:left" });
  assert.equal(nearestAnchor([0.5, 0.5], anchors, d, 0.2), null);
});
