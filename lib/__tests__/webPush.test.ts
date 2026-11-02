import test from "node:test";
import assert from "node:assert/strict";
import { parseWebPushTapParam, readWebPushMessage, resolveFirebaseWebConfig, toPushData } from "../webPushData";

const full = { apiKey: "k", appId: "1:2:web:3", projectId: "p", messagingSenderId: "2", vapidKey: "v" };

test("resolveFirebaseWebConfig: env wins, any blank field turns web push off", () => {
  assert.deepEqual(resolveFirebaseWebConfig(full, {}), full);
  assert.deepEqual(resolveFirebaseWebConfig({ ...full, apiKey: "" }, { apiKey: " envKey " }), { ...full, apiKey: "envKey" });
  assert.equal(resolveFirebaseWebConfig({ ...full, vapidKey: "" }, {}), null);
  assert.equal(resolveFirebaseWebConfig({ ...full, appId: 5 }, {}), null);
  assert.equal(resolveFirebaseWebConfig(undefined, {}), null);
});

test("toPushData keeps flat string-able values only", () => {
  assert.deepEqual(toPushData({ route: "/tracker", n: 2, ok: true, nested: { a: 1 }, nil: null }), {
    route: "/tracker",
    n: "2",
    ok: "true",
  });
  for (const bad of [null, "x", 3, ["a"]]) assert.equal(toPushData(bad), null);
});

test("parseWebPushTapParam reads ?nuraPush=<json> and rejects junk", () => {
  const search = "?nuraPush=" + encodeURIComponent(JSON.stringify({ route: "/circles?id=1", type: "system" }));
  assert.deepEqual(parseWebPushTapParam(search), { route: "/circles?id=1", type: "system" });
  assert.equal(parseWebPushTapParam("?nuraPush=%7Bnope"), null);
  assert.equal(parseWebPushTapParam("?other=1"), null);
  assert.equal(parseWebPushTapParam("?nuraPush=" + "x".repeat(5000)), null);
});

test("readWebPushMessage: only our service worker messages", () => {
  assert.deepEqual(readWebPushMessage({ type: "nura-push-tap", data: { route: "/tracker" } }), {
    kind: "tap",
    data: { route: "/tracker" },
  });
  assert.deepEqual(readWebPushMessage({ type: "nura-push-received" }), { kind: "received" });
  assert.equal(readWebPushMessage({ type: "nura-push-tap", data: "x" }), null);
  assert.equal(readWebPushMessage({ type: "other" }), null);
  assert.equal(readWebPushMessage(null), null);
});
