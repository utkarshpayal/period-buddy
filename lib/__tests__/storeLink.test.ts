import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedStoreUrl, notificationStoreUrl, storeUrlCandidates } from "../storeLink";

const PLAY = "https://play.google.com/store/apps/details?id=com.uvin124.thenura";
const MARKET = "market://details?id=com.uvin124.thenura";
const APPLE = "https://apps.apple.com/in/app/the-nura/id123456789";

test("isAllowedStoreUrl: only Play Store, market:// and App Store links", () => {
  for (const url of [PLAY, MARKET, APPLE, "https://play.google.com", "https://apps.apple.com/"]) {
    assert.equal(isAllowedStoreUrl(url), true, url);
  }
  for (const url of [
    "http://play.google.com/store/apps/details?id=x",
    "https://play.google.com.evil.com/x",
    "https://evil.com/?u=https://play.google.com",
    "https://user:pw@play.google.com/x",
    "https://play.google.com:8443/x",
    "https://apps.apple.com@evil.com/",
    "itms-apps://apps.apple.com/app/id1",
    "market://",
    "javascript:alert(1)",
    "intent://x#Intent;end",
    "/(app)/tracker",
    `https://play.google.com/${"a".repeat(600)}`,
    "https://play.google.com/a b",
    "",
    null,
    42,
  ]) {
    assert.equal(isAllowedStoreUrl(url), false, String(url));
  }
});

test("notificationStoreUrl picks the link for this platform", () => {
  assert.equal(notificationStoreUrl({ storeUrl: PLAY, iosStoreUrl: APPLE }, "android"), PLAY);
  assert.equal(notificationStoreUrl({ storeUrl: PLAY, iosStoreUrl: APPLE }, "ios"), APPLE);
  // Only the other store's link: still better than nothing.
  assert.equal(notificationStoreUrl({ storeUrl: APPLE }, "android"), APPLE);
  assert.equal(notificationStoreUrl({ storeUrl: PLAY }, "ios"), PLAY);
  // Unsafe or missing links mean "no store link" (normal routing).
  assert.equal(notificationStoreUrl({ storeUrl: "https://evil.com" }, "android"), null);
  assert.equal(notificationStoreUrl({ route: "/tracker" }, "android"), null);
  assert.equal(notificationStoreUrl(undefined, "android"), null);
});

test("storeUrlCandidates: market:// first on Android, https fallback", () => {
  assert.deepEqual(storeUrlCandidates(PLAY, "android"), [MARKET, PLAY]);
  assert.deepEqual(storeUrlCandidates(PLAY, "ios"), [PLAY]);
  assert.deepEqual(storeUrlCandidates(MARKET, "android"), [MARKET, PLAY]);
  assert.deepEqual(storeUrlCandidates(APPLE, "ios"), [APPLE]);
  // A Play link that isn't an app page opens as-is.
  assert.deepEqual(storeUrlCandidates("https://play.google.com/store/apps/dev?id=1", "android"), [
    "https://play.google.com/store/apps/dev?id=1",
  ]);
  assert.deepEqual(storeUrlCandidates("https://evil.com", "android"), []);
});
