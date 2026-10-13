import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_APP_CONFIG, DEFAULT_HOME_SECTIONS, FEATURE_REGISTRY, hubTilesFor } from "../appConfig";
import {
  DEFAULT_HOME_LAYOUT,
  MAX_SHORTCUTS,
  applyHomeLayout,
  isDefaultLayout,
  moveKey,
  orderedBlocks,
  parseHomeLayout,
  pickableTiles,
  activePreset,
  applyPreset,
  presetBlockLabels,
  BLOCK_SETTINGS,
  blockItems,
  blockTitle,
  cleanText,
  HOME_PRESETS,
  shortcutRuns,
  toggleBlockItem,
  withBlockOptions,
  shortcutTiles,
  styledShortcuts,
  withShortcutStyle,
  withShortcuts,
} from "../homeLayout";

const keys = (sections: { key: string }[]) => sections.map((s) => s.key);

test("the default layout leaves Home exactly as the CMS set it", () => {
  assert.deepEqual(applyHomeLayout(DEFAULT_HOME_SECTIONS, DEFAULT_HOME_LAYOUT), DEFAULT_HOME_SECTIONS);
  assert.ok(isDefaultLayout(DEFAULT_HOME_LAYOUT));
});

test("hidden blocks drop out, promo slots can't be hidden", () => {
  const out = applyHomeLayout(DEFAULT_HOME_SECTIONS, parseHomeLayout({ hidden: ["insights", "promo_top", "weekStrip"] }));
  assert.ok(!keys(out).includes("insights"));
  assert.ok(!keys(out).includes("weekStrip"));
  assert.ok(keys(out).includes("promo_top"));
});

test("reordering keeps promo slots where the CMS put them", () => {
  const out = keys(applyHomeLayout(DEFAULT_HOME_SECTIONS, parseHomeLayout({ order: ["shortcuts", "insights"] })));
  const before = keys(DEFAULT_HOME_SECTIONS);
  assert.equal(out.indexOf("promo_top"), before.indexOf("promo_top"));
  assert.equal(out.indexOf("promo_middle"), before.indexOf("promo_middle"));
  assert.deepEqual(out.slice(0, 2), ["shortcuts", "insights"]);
  assert.equal(out.length, before.length);
});

test("a block the CMS hides stays hidden whatever the person's order says", () => {
  const cms = DEFAULT_HOME_SECTIONS.filter((s) => s.key !== "insights");
  const out = keys(applyHomeLayout(cms, parseHomeLayout({ order: ["insights", "statPills"] })));
  assert.ok(!out.includes("insights"));
  assert.equal(out[0], "statPills");
});

test("orderedBlocks puts placed keys first, the rest in CMS order", () => {
  assert.deepEqual(orderedBlocks(["statPills", "weekStrip", "insights"], { ...DEFAULT_HOME_LAYOUT, order: ["insights"] }), [
    "insights",
    "statPills",
    "weekStrip",
  ]);
});

test("parse drops junk and unknown block keys", () => {
  assert.deepEqual(parseHomeLayout(null), DEFAULT_HOME_LAYOUT);
  assert.deepEqual(parseHomeLayout({ order: ["nope", "insights", 3, "insights"], hidden: "x", shortcuts: "y" }), {
    order: ["insights"],
    hidden: [],
    shortcuts: null,
    shortcutStyles: {},
    blocks: {},
  });
  const many = Array.from({ length: 20 }, (_, i) => `f${i}`);
  assert.equal(parseHomeLayout({ shortcuts: many }).shortcuts?.length, MAX_SHORTCUTS);
  assert.deepEqual(parseHomeLayout({ shortcuts: [] }).shortcuts, []);
});

test("shortcuts: CMS default until picked, then the picks in order", () => {
  const viewer = { signedIn: true, premium: false, platform: "android" as const, appVersion: "9.0.0" };
  assert.deepEqual(
    shortcutTiles(DEFAULT_APP_CONFIG, viewer, DEFAULT_HOME_LAYOUT).map((t) => t.key),
    hubTilesFor(DEFAULT_APP_CONFIG, "home", viewer).map((t) => t.key),
  );
  const picked = shortcutTiles(DEFAULT_APP_CONFIG, viewer, { ...DEFAULT_HOME_LAYOUT, shortcuts: ["forest", "gone", "nuraAi"] });
  assert.deepEqual(picked.map((t) => t.key), ["forest", "nuraAi"]);
  assert.deepEqual(shortcutTiles(DEFAULT_APP_CONFIG, viewer, { ...DEFAULT_HOME_LAYOUT, shortcuts: [] }), []);
});

test("pickable tiles list every feature once", () => {
  const all = pickableTiles(DEFAULT_APP_CONFIG, { signedIn: true, premium: true, platform: "ios", appVersion: "9.0.0" }).flatMap((g) => g.tiles);
  assert.equal(new Set(all.map((t) => t.key)).size, all.length);
  assert.equal(all.length, DEFAULT_APP_CONFIG.features.length);
});

test("moveKey swaps neighbours and stops at the ends", () => {
  assert.deepEqual(moveKey(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
  assert.deepEqual(moveKey(["a", "b", "c"], "c", 1), ["a", "b", "c"]);
  assert.deepEqual(moveKey(["a", "b"], "z", 1), ["a", "b"]);
});

const anyViewer = { signedIn: true, premium: true, platform: "android" as const, appVersion: "9.0.0" };

test("shortcut styles: bad looks and colours are dropped", () => {
  const l = parseHomeLayout({ shortcutStyles: { forest: { look: "card", color: "mint" }, blogs: { look: "tile", color: "#fff" }, x: { look: "huge" } } });
  assert.deepEqual(l.shortcutStyles, {
    forest: { look: "card", color: "mint", label: null, icon: null },
    blogs: { look: "tile", color: null, label: null, icon: null },
  });
});

test("styled shortcuts take the picked look and colour", () => {
  let l = withShortcuts(DEFAULT_HOME_LAYOUT, ["forest", "blogs", "videos", "habits"]);
  l = withShortcutStyle(l, "blogs", { look: "card", color: "gold" });
  l = withShortcutStyle(l, "videos", { look: "tile" });
  const tiles = styledShortcuts(DEFAULT_APP_CONFIG, anyViewer, l);
  const blogs = tiles.find((t) => t.key === "blogs")!;
  assert.equal(blogs.look, "card");
  assert.equal(blogs.size, "large");
  assert.equal(blogs.colorKey, "gold");
  assert.equal(tiles.find((t) => t.key === "forest")!.look, "icon");
  assert.deepEqual(
    shortcutRuns(tiles).map((r) => [r.kind, r.tiles.map((t) => t.key)]),
    [["icons", ["forest"]], ["tiles", ["blogs", "videos"]], ["icons", ["habits"]]],
  );
});

test("back to the default style drops the entry; removing a shortcut drops its style", () => {
  let l = withShortcutStyle(withShortcuts(DEFAULT_HOME_LAYOUT, ["forest"]), "forest", { look: "tile" });
  assert.ok(l.shortcutStyles.forest);
  assert.deepEqual(withShortcutStyle(l, "forest", { look: "icon" }).shortcutStyles, {});
  l = withShortcuts(l, []);
  assert.deepEqual(l.shortcutStyles, {});
});

test("shortcut name and icon override the tile's own; junk icons are ignored", () => {
  let l = withShortcuts(DEFAULT_HOME_LAYOUT, ["forest"]);
  l = withShortcutStyle(l, "forest", { label: "  My   tree\n ", icon: "moon-outline" });
  const [forest] = styledShortcuts(DEFAULT_APP_CONFIG, anyViewer, l);
  assert.equal(forest.title, "My tree");
  assert.equal(forest.icon, "moon-outline");
  assert.equal(withShortcutStyle(l, "forest", { icon: "<script>" }).shortcutStyles.forest.icon, null);
  assert.deepEqual(withShortcutStyle(l, "forest", { label: "", icon: null }).shortcutStyles, {});
  assert.equal(cleanText("x".repeat(40), 24)?.length, 24);
});

test("block headings and items: defaults, picks, min/max, back to default", () => {
  assert.equal(blockTitle(DEFAULT_HOME_LAYOUT, "insights"), "Insights");
  assert.equal(blockTitle(DEFAULT_HOME_LAYOUT, "shortcuts"), "Shortcuts");
  assert.equal(blockTitle(DEFAULT_HOME_LAYOUT, "quickActions"), null);
  assert.deepEqual(blockItems(DEFAULT_HOME_LAYOUT, "statPills"), ["streak", "points"]);

  let l = withBlockOptions(DEFAULT_HOME_LAYOUT, "insights", { title: "My trends" });
  assert.equal(blockTitle(l, "insights"), "My trends");
  l = toggleBlockItem(l, "statPills", "cycleDay");
  assert.deepEqual(blockItems(l, "statPills"), ["streak", "points", "cycleDay"]);
  // max 3
  assert.deepEqual(blockItems(toggleBlockItem(l, "statPills", "forest"), "statPills"), ["streak", "points", "cycleDay"]);
  l = toggleBlockItem(l, "statPills", "cycleDay");
  assert.equal(l.blocks.statPills, undefined, "back to the default list drops the entry");
  // min 1
  let one = withBlockOptions(DEFAULT_HOME_LAYOUT, "statPills", { items: ["streak"] });
  one = toggleBlockItem(one, "statPills", "streak");
  assert.deepEqual(blockItems(one, "statPills"), ["streak"]);
  // unknown keys and blocks without settings are dropped on parse
  const parsed = parseHomeLayout({ blocks: { statPills: { items: ["nope", "forest"] }, weekStrip: { title: "x" }, quickActions: { items: ["water"] } } });
  assert.deepEqual(parsed.blocks, { statPills: { title: null, items: ["forest"] }, quickActions: { title: null, items: ["water"] } });
});

test("templates: each applies fully and is recognised; switching swaps shortcuts, styles and headings", () => {
  const tpl = (key: string) => HOME_PRESETS.find((p) => p.key === key)!;
  assert.equal(activePreset(DEFAULT_HOME_LAYOUT), null, "the standard Home is Reset, not a template");

  const custom = withBlockOptions(withShortcutStyle(withShortcuts(DEFAULT_HOME_LAYOUT, ["forest"]), "forest", { look: "card" }), "insights", { title: "Mine" });
  const health = applyPreset(custom, tpl("health"));
  assert.equal(activePreset(health), "health");
  assert.deepEqual(health.shortcuts, tpl("health").shortcuts);
  assert.equal(health.shortcutStyles.forest, undefined, "old styles go with old shortcuts");
  assert.equal(health.shortcutStyles.consultation.look, "card");
  assert.equal(blockTitle(health, "insights"), "My cycle health", "template heading replaces the person's");
  assert.deepEqual(blockItems(health, "quickActions"), ["symptoms", "flow", "medications", "sleep"]);

  const social = applyPreset(health, tpl("social"));
  assert.equal(activePreset(social), "social");
  assert.equal(social.shortcutStyles.consultation, undefined);
  assert.deepEqual(social.shortcutStyles.circles, { look: "tile", color: "mint", label: null, icon: null });
  assert.equal(blockTitle(social, "insights"), "Insights", "back to the default heading");
  assert.equal(activePreset(toggleBlockItem(social, "statPills", "streak")), null, "a change makes it the person's own");
});

test("every template is a useful, valid Home that a default viewer fully sees", () => {
  for (const p of HOME_PRESETS) {
    const shows = presetBlockLabels(p);
    assert.ok(shows.length >= 4, `${p.key} shows ${shows.join(", ")}`);
    assert.ok(shows.includes("Cycle phase card") && shows.includes("Quick log"), p.key);
    assert.ok((p.shortcuts?.length ?? 0) <= MAX_SHORTCUTS, p.key);
    for (const k of p.shortcuts ?? []) assert.ok(FEATURE_REGISTRY.some((f) => f.key === k), `${p.key}: unknown shortcut ${k}`);
    for (const k of Object.keys(p.shortcutStyles ?? {})) assert.ok(p.shortcuts?.includes(k), `${p.key}: style for ${k} not in shortcuts`);
    for (const t of Object.values(p.titles ?? {})) assert.ok(t!.length <= 30, `${p.key}: heading too long`);
    for (const [block, items] of Object.entries(p.items ?? {})) {
      const s = BLOCK_SETTINGS[block as keyof typeof BLOCK_SETTINGS]!.items!;
      assert.ok(items!.length >= s.min && items!.length <= s.max, `${p.key}.${block} count`);
      for (const i of items!) assert.ok(s.options.some((o) => o.key === i), `${p.key}.${block}: unknown ${i}`);
    }
    const applied = applyPreset(DEFAULT_HOME_LAYOUT, p);
    assert.equal(activePreset(applied), p.key);
    const drawn = styledShortcuts(DEFAULT_APP_CONFIG, anyViewer, applied).map((t) => t.key);
    assert.deepEqual(drawn, p.shortcuts, `${p.key}: every shortcut shows`);
  }
});

test("every template opens the same way: this week → promo → cycle card → quick log at the top", () => {
  for (const p of HOME_PRESETS) {
    const home = keys(applyHomeLayout(DEFAULT_HOME_SECTIONS, applyPreset(DEFAULT_HOME_LAYOUT, p)));
    const top = home.filter((k) => k !== "statPills").slice(0, 4);
    assert.deepEqual(top, ["weekStrip", "promo_top", "phaseHero", "quickActions"], `${p.key}: ${home.join(", ")}`);
    if (home.includes("statPills")) assert.equal(home[0], "statPills", p.key);
    assert.equal(home[home.indexOf("quickActions") + 1], "promo_middle", `${p.key}: promo stays after quick log`);
  }
});
