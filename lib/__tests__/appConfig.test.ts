import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_APP_CONFIG,
  bannersFor,
  describeHub,
  featuresFor,
  groupTiles,
  parseAppConfig,
  featureForRoute,
  sectionText,
  shownSections,
} from "../appConfig";

test("garbage in, defaults out", () => {
  for (const raw of [null, undefined, "x", 42, [], { features: "nope", homeSections: {}, theme: 1 }]) {
    const c = parseAppConfig(raw);
    assert.equal(c.features.length, DEFAULT_APP_CONFIG.features.length);
    assert.deepEqual(c.homeSections, DEFAULT_APP_CONFIG.homeSections);
    assert.deepEqual(c.screenSections, DEFAULT_APP_CONFIG.screenSections);
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

const keys = (list: { key: string }[]) => list.map((s) => s.key);

test("screen sections: sent order per screen, required blocks can't be hidden, defaults fill gaps", () => {
  const c = parseAppConfig({
    screenSections: {
      care_hub: [
        { key: "tiles", visible: true, order: 0 },
        { key: "intro", visible: false, order: 1 },
        { key: "promo", visible: true, order: 2 },
      ],
      profile: [
        { key: "logout", visible: false, order: 0, audience: { segment: "premium" } },
        { key: "stats", visible: false, order: 1 },
        { key: "weekStrip", visible: true, order: 2 },
      ],
      tracker: [{ key: "x", visible: false, order: 0 }],
    },
  });
  assert.deepEqual(keys(shownSections(c, "care_hub")), ["tiles", "promo"]);
  const free = { signedIn: true, premium: false, platform: "android" as const, appVersion: "1.0.0" };
  const profile = keys(shownSections(c, "profile", free));
  assert.equal(profile[0], "logout");
  assert.ok(!profile.includes("stats"));
  assert.equal(profile.length, DEFAULT_APP_CONFIG.screenSections.profile.length - 1);
  assert.deepEqual(c.screenSections.explore_hub, DEFAULT_APP_CONFIG.screenSections.explore_hub);
  assert.deepEqual(parseAppConfig({ screenSections: "nope" }).screenSections, DEFAULT_APP_CONFIG.screenSections);
});

test("blocks: audience, schedule and text apply per viewer and time", () => {
  const c = parseAppConfig({
    homeSections: [
      { key: "insights", visible: true, order: 0, text: "For you", audience: { segment: "premium" } },
      { key: "weekStrip", visible: true, order: 1, startAt: "2026-10-01T00:00:00Z", endAt: "2026-10-10T00:00:00Z" },
      { key: "statPills", visible: true, order: 2, endAt: "not a date" },
    ],
    screenTitles: { care_hub: "Health", explore_hub: 42, profile: "Me" },
  });
  const premium = { signedIn: true, premium: true, platform: "ios" as const, appVersion: "2.0.0" };
  const free = { ...premium, premium: false };
  const during = Date.parse("2026-10-05T00:00:00Z");
  const after = Date.parse("2026-10-11T00:00:00Z");
  assert.deepEqual(keys(shownSections(c, "home", premium, during)).slice(0, 3), ["insights", "weekStrip", "statPills"]);
  assert.deepEqual(keys(shownSections(c, "home", free, after)).slice(0, 1), ["statPills"]);
  assert.equal(sectionText(c.homeSections, "insights", "Insights"), "For you");
  assert.equal(sectionText(c.homeSections, "moreForYou", "More for you"), "More for you");
  assert.deepEqual(c.screenTitles, { care_hub: "Health" });
});

test("featureForRoute matches a feature's screen and anything under it", () => {
  const c = parseAppConfig({});
  assert.equal(featureForRoute(c, "/blogs"), "blogs");
  assert.equal(featureForRoute(c, "/(app)/blogs/123?x=1"), "blogs");
  assert.equal(featureForRoute(c, "/home"), null);
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
  // An unsafe action becomes "none": nothing to open, so it never shows unlocked.
  assert.equal(explore.some((t) => t.key === "link:bad"), false);
  assert.equal(explore.some((t) => t.key === "blogs"), false);
  assert.deepEqual(hubTilesFor(c, "profile", viewer()).map((t) => t.key), ["blogs"]);
  // Home only carries the Gen Z pack by default.
  assert.deepEqual(hubTilesFor(c, "home", viewer()).map((t) => t.key), ["wrapped", "cycleEra", "badges", "circles"]);
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

import { isFeatureVisible, launchForRoute, routePath } from "../appConfig";

const sheet = { headline: "Coming this month", message: "Chat any time", notifyMe: true, onList: false, alternative: { type: "none" } };

test("launch: missing or garbage means open", () => {
  const c = parseAppConfig({
    features: [
      { key: "blogs", placement: "explore_hub", order: 0 },
      { key: "forest", placement: "explore_hub", order: 1, launch: "nope" },
      { key: "videos", placement: "explore_hub", order: 2, launch: { access: "exploded", beta: true } },
    ],
  });
  for (const t of hubTilesFor(c, "explore_hub").filter((x) => ["blogs", "forest", "videos"].includes(x.key))) {
    assert.equal(t.launch.access, "open", t.key);
  }
  // beta only counts on an open tile ("exploded" falls back to open, so it stays)
  assert.equal(hubTilesFor(c, "explore_hub").find((t) => t.key === "videos")!.launch.beta, true);
});

test("launch: soon and paused tiles stay in the hub, locked", () => {
  const c = parseAppConfig({
    features: [
      { key: "consultation", placement: "care_hub", order: 0, launch: { access: "soon", beta: true, sheet } },
      { key: "documents", placement: "care_hub", order: 1, launch: { access: "paused", sheet: { alternative: { type: "url", value: "https://wa.me/91" } } } },
    ],
  });
  const tiles = hubTilesFor(c, "care_hub");
  const consult = tiles.find((t) => t.key === "consultation")!;
  assert.equal(consult.launch.access, "soon");
  assert.equal(consult.launch.beta, false);
  assert.equal(consult.launch.sheet.headline, "Coming this month");
  assert.equal(consult.launch.sheet.notifyMe, true);
  const docs = tiles.find((t) => t.key === "documents")!;
  assert.equal(docs.launch.access, "paused");
  assert.equal(docs.launch.sheet.headline, "Taking a short break");
  assert.equal(docs.launch.sheet.alternative.type, "url");
  assert.equal(isFeatureVisible(c, "consultation"), false);
});

test("launch: openFor narrows a rollout; others get the fallback", () => {
  const c = parseAppConfig({
    features: [
      { key: "symptomChecker", placement: "care_hub", order: 0, launch: { access: "open", beta: true, openFor: { platforms: ["android"] }, fallback: "soon", sheet } },
      { key: "graphsReports", placement: "care_hub", order: 1, launch: { access: "open", openFor: { segment: "premium" }, fallback: "hidden" } },
    ],
  });
  const android = hubTilesFor(c, "care_hub", viewer({ platform: "android", premium: false }));
  assert.equal(android.find((t) => t.key === "symptomChecker")!.launch.access, "open");
  assert.equal(android.find((t) => t.key === "symptomChecker")!.launch.beta, true);
  assert.equal(android.some((t) => t.key === "graphsReports"), false);

  const iphone = hubTilesFor(c, "care_hub", viewer({ platform: "ios", premium: true }));
  assert.equal(iphone.find((t) => t.key === "symptomChecker")!.launch.access, "soon");
  assert.equal(iphone.find((t) => t.key === "graphsReports")!.launch.access, "open");
  assert.equal(isFeatureVisible(c, "graphsReports", viewer({ premium: false })), false);
});

test("launch: link tiles carry launch state under their link: key", () => {
  const c = parseAppConfig({
    customTiles: [
      { id: "abc123", title: "Retreats", icon: "leaf-outline", placement: "home", size: "small", order: 0, action: { type: "url", value: "https://x.in" }, launch: { access: "soon", sheet } },
    ],
  });
  const [tile] = hubTilesFor(c, "home");
  assert.equal(tile.key, "link:abc123");
  assert.equal(tile.launch.access, "soon");
});

test("launch: a teaser tile with no action shows while locked, never unlocked", () => {
  const c = parseAppConfig({
    customTiles: [
      { id: "pcos01", title: "PCOS Care", icon: "heart-outline", placement: "care_hub", size: "large", order: 0, action: { type: "none" }, launch: { access: "soon", sheet } },
      { id: "pcos02", title: "Tester view", icon: "heart-outline", placement: "care_hub", size: "large", order: 1, action: { type: "none" }, launch: { access: "open" } },
    ],
  });
  const keys = hubTilesFor(c, "care_hub").map((t) => t.key);
  assert.ok(keys.includes("link:pcos01"));
  assert.equal(keys.includes("link:pcos02"), false);
});

test("routePath drops groups, query and trailing slash", () => {
  assert.equal(routePath("/(app)/qa?new=1"), "/qa");
  assert.equal(routePath("/(app)/(dashboard)/tracker/"), "/tracker");
  assert.equal(routePath("/documents#x"), "/documents");
});

test("launchForRoute guards a locked feature's route and its sub-routes only", () => {
  const c = parseAppConfig({
    features: [
      { key: "consultation", placement: "care_hub", order: 0, launch: { access: "soon", sheet } },
      { key: "nuraAi", placement: "wellness_hub", order: 0, launch: { access: "paused" } },
      { key: "graphsReports", placement: "care_hub", order: 1, enabled: false, launch: { access: "open", openFor: { segment: "premium" }, fallback: "hidden", sheet } },
    ],
  });
  assert.equal(launchForRoute(c, "/consultation")?.itemKey, "consultation");
  assert.equal(launchForRoute(c, "/(app)/consultation/book/42?x=1")?.access, "soon");
  assert.equal(launchForRoute(c, "/consultations"), null); // a different screen that shares a prefix
  assert.equal(launchForRoute(c, "/qa?new=1")?.access, "paused");
  assert.equal(launchForRoute(c, "/tracker"), null);
  // hidden from this viewer by its rollout: guarded as Coming soon, without Notify me
  const locked = launchForRoute(c, "/graphs-reports", viewer({ premium: false }));
  assert.equal(locked?.access, "soon");
  assert.equal(locked?.sheet.notifyMe, false);
  assert.equal(launchForRoute(c, "/graphs-reports", viewer({ premium: true })), null);
});
