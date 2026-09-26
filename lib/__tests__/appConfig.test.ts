import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_APP_CONFIG,
  bannersFor,
  describeHub,
  featuresFor,
  groupTiles,
  parseAppConfig,
} from "../appConfig";

test("garbage in, defaults out", () => {
  for (const raw of [null, undefined, "x", 42, [], { features: "nope", homeSections: {}, theme: 1 }]) {
    const c = parseAppConfig(raw);
    assert.equal(c.features.length, DEFAULT_APP_CONFIG.features.length);
    assert.deepEqual(c.homeSections, DEFAULT_APP_CONFIG.homeSections);
    assert.deepEqual(c.theme, { light: {}, dark: {} });
    assert.deepEqual(c.banners, []);
  }
});

test("defaults reproduce the original hubs", () => {
  const c = parseAppConfig({});
  assert.deepEqual(featuresFor(c, "wellness_hub").map((f) => f.key), [
    "nuraAi", "healthConcerns", "hygiene", "sexualWellbeing", "checkinCall",
  ]);
  const blocks = groupTiles(featuresFor(c, "wellness_hub"));
  // two large rows, then one grid of three small tiles
  assert.equal(blocks.length, 3);
  assert.ok(Array.isArray(blocks[2]) && blocks[2].length === 3);
});

test("CMS overrides apply; unknown keys and bad values are ignored", () => {
  const c = parseAppConfig({
    features: [
      { key: "blogs", enabled: false, placement: "explore_hub", order: 0 },
      { key: "forest", enabled: true, placement: "care_hub", order: 99, badge: "NEW", size: "large", colorKey: "gold", title: "Grow" },
      { key: "someFutureFeature", enabled: true, placement: "care_hub", order: 0 },
      { key: "habits", placement: "mars", size: "huge", colorKey: "javascript" },
    ],
  });
  assert.equal(featuresFor(c, "explore_hub").some((f) => f.key === "blogs"), false);
  const forest = featuresFor(c, "care_hub").find((f) => f.key === "forest")!;
  assert.equal(forest.title, "Grow");
  assert.equal(forest.badge, "NEW");
  assert.equal(forest.size, "large");
  assert.equal(forest.colorKey, "gold");
  assert.equal(c.features.some((f) => f.key === "someFutureFeature"), false);
  const habits = c.features.find((f) => f.key === "habits")!;
  assert.equal(habits.placement, "explore_hub");
  assert.equal(habits.size, "small");
  assert.equal(habits.colorKey, "warning");
});

test("home sections follow the sent order and keep unknown-to-backend ones", () => {
  const c = parseAppConfig({
    homeSections: [
      { key: "insights", visible: true, order: 0 },
      { key: "statPills", visible: false, order: 1 },
      { key: "bogus", visible: true, order: 2 },
    ],
  });
  assert.equal(c.homeSections[0].key, "insights");
  assert.equal(c.homeSections[1].visible, false);
  assert.equal(c.homeSections.length, DEFAULT_APP_CONFIG.homeSections.length);
});

test("theme accepts only overridable tokens with safe colours", () => {
  const c = parseAppConfig({
    theme: { light: { primary: "#123456", danger: "#000000", accent: "url(evil)" }, dark: { surface: "rgba(1,2,3,0.5)" } },
  });
  assert.deepEqual(c.theme, { light: { primary: "#123456" }, dark: { surface: "rgba(1,2,3,0.5)" } });
});

test("banners: bad actions are neutralised, expired and dismissed ones drop out", () => {
  const c = parseAppConfig({
    banners: [
      { id: "a", title: "Sale", placement: "home_top", priority: 1, action: { type: "route", value: "//evil.com" } },
      { id: "b", title: "Book", placement: "home_top", priority: 5, action: { type: "url", value: "https://thenura.care" } },
      { id: "c", title: "Old", placement: "home_top", endAt: "2000-01-01T00:00:00Z" },
      { id: "d", title: "Pic", placement: "home_top", layout: "image" },
      { id: "e", title: "Nowhere", placement: "sidebar" },
    ],
  });
  const shown = bannersFor(c, "home_top", new Set(["x"]));
  assert.deepEqual(shown.map((b) => b.id), ["b", "a"]);
  assert.deepEqual(shown[1].action, { type: "none", value: null, fallbackUrl: null });
  assert.deepEqual(bannersFor(c, "home_top", new Set(["b"])).map((b) => b.id), ["a"]);
});

test("describeHub keeps the copy until the CMS moves tiles", () => {
  assert.equal(describeHub(parseAppConfig({}), "explore_hub", "fallback"), "fallback");
  const moved = parseAppConfig({ features: [{ key: "blogs", enabled: false, placement: "explore_hub", order: 0 }] });
  assert.equal(describeHub(moved, "explore_hub", "fallback"), "Forest, Videos, Partner Sync & more");
});

import { gateState, hubTilesFor, isAppLink, matchesAudience } from "../appConfig";

const viewer = (over: Partial<{ signedIn: boolean; premium: boolean; platform: "android" | "ios" | "web"; appVersion: string }> = {}) => ({
  signedIn: true,
  premium: false,
  platform: "android" as const,
  appVersion: "1.0.0",
  ...over,
});

test("audience rules", () => {
  const a = (x: object) => ({ segment: "all", platforms: [], minAppVersion: null, maxAppVersion: null, ...x }) as any;
  assert.equal(matchesAudience(a({}), viewer({ signedIn: false })), true);
  assert.equal(matchesAudience(a({ segment: "signed_in" }), viewer({ signedIn: false })), false);
  assert.equal(matchesAudience(a({ segment: "premium" }), viewer()), false);
  assert.equal(matchesAudience(a({ segment: "premium" }), viewer({ premium: true })), true);
  assert.equal(matchesAudience(a({ segment: "free" }), viewer({ premium: true })), false);
  assert.equal(matchesAudience(a({ segment: "free" }), viewer({ signedIn: false })), false);
  assert.equal(matchesAudience(a({ platforms: ["ios"] }), viewer()), false);
  assert.equal(matchesAudience(a({ minAppVersion: "1.2" }), viewer({ appVersion: "1.10.0" })), true);
  assert.equal(matchesAudience(a({ maxAppVersion: "1.0" }), viewer({ appVersion: "1.0.1" })), false);
});

test("link tiles join a hub in CMS order, and features can move to Home/Profile", () => {
  const c = parseAppConfig({
    features: [{ key: "blogs", enabled: true, placement: "profile", order: 0 }],
    customTiles: [
      { id: "yt", title: "YouTube", icon: "logo-youtube", colorKey: "rose", placement: "explore_hub", size: "large", order: -1, enabled: true, action: { type: "app", value: "youtube://x", fallbackUrl: "https://youtube.com/x" } },
      { id: "vip", title: "VIP", icon: "star-outline", colorKey: "gold", placement: "explore_hub", size: "small", order: 50, action: { type: "url", value: "https://x.y" }, audience: { segment: "premium" } },
      { id: "bad", title: "Evil", icon: "link-outline", colorKey: "rose", placement: "explore_hub", action: { type: "app", value: "javascript:alert(1)" } },
    ],
  });
  const explore = hubTilesFor(c, "explore_hub", viewer());
  assert.equal(explore[0].key, "link:yt");
  assert.equal(explore[0].builtIn, false);
  assert.equal(explore.some((t) => t.key === "link:vip"), false); // premium only
  assert.equal(c.customTiles.some((t) => t.id === "bad"), false);
  assert.equal(explore.some((t) => t.key === "blogs"), false);
  assert.deepEqual(hubTilesFor(c, "profile", viewer()).map((t) => t.key), ["blogs"]);
  assert.equal(hubTilesFor(c, "home", viewer()).length, 0);
});

test("isAppLink", () => {
  for (const ok of ["whatsapp://send?phone=91", "youtube://www.youtube.com/@x", "https://wa.me/91", "tel:+911234"]) assert.equal(isAppLink(ok), true, ok);
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc", "nope", ""]) assert.equal(isAppLink(bad), false, bad);
});

test("gateState: maintenance, required and optional updates", () => {
  const base = parseAppConfig({}).settings;
  assert.deepEqual(gateState(base, viewer(), null), { kind: "none" });
  const maint = parseAppConfig({ settings: { maintenance: { enabled: true, title: "Down", message: "Back soon" } } }).settings;
  assert.equal(gateState(maint, viewer(), null).kind, "maintenance");
  const upd = parseAppConfig({ settings: { update: { minVersion: "1.1.0", latestVersion: "1.3.0", androidUrl: "https://play.google.com/x" } } }).settings;
  const required = gateState(upd, viewer({ appVersion: "1.0.9" }), null);
  assert.equal(required.kind === "update" && required.required, true);
  const optional = gateState(upd, viewer({ appVersion: "1.2.0" }), null);
  assert.equal(optional.kind === "update" && !optional.required, true);
  assert.deepEqual(gateState(upd, viewer({ appVersion: "1.2.0" }), "1.3.0"), { kind: "none" }); // dismissed
  assert.deepEqual(gateState(upd, viewer({ appVersion: "1.0.0", platform: "web" }), null), { kind: "none" });
});
