import test from "node:test";
import assert from "node:assert/strict";
import { emitDataChange, subscribeDataChange, topicsForMutation } from "../data-sync";

test("GET requests never emit", () => {
  assert.deepEqual(topicsForMutation("GET", "/api/cycle/log"), []);
});

test("cycle writes refresh cycle data and the dashboard", () => {
  assert.deepEqual(topicsForMutation("POST", "/api/cycle/log"), ["cycle", "dashboard"]);
  assert.deepEqual(topicsForMutation("POST", "/api/cycle/settings"), ["cycle", "dashboard"]);
});

test("more specific paths win over their prefixes", () => {
  assert.deepEqual(topicsForMutation("POST", "/api/subscriptions/coupons/apply"), []);
  assert.deepEqual(topicsForMutation("POST", "/api/subscriptions/verify"), ["subscription"]);
  assert.deepEqual(topicsForMutation("POST", "/api/partner/notifications/abc/read"), ["notifications"]);
  assert.deepEqual(topicsForMutation("POST", "/api/partner/message"), []);
  assert.deepEqual(topicsForMutation("DELETE", "/api/partner/disconnect"), ["partner", "notifications"]);
  assert.deepEqual(topicsForMutation("PUT", "/api/auth/profile"), ["profile", "dashboard"]);
  assert.deepEqual(topicsForMutation("POST", "/api/auth/login"), []);
  assert.deepEqual(topicsForMutation("POST", "/api/documents/abc/chat"), []);
  assert.deepEqual(topicsForMutation("DELETE", "/api/documents/abc"), ["documents"]);
  assert.deepEqual(topicsForMutation("POST", "/api/circles/abc/vibes"), ["circles"]);
  assert.deepEqual(topicsForMutation("POST", "/api/support/tickets"), ["support"]);
  assert.deepEqual(topicsForMutation("POST", "/api/support/tickets/abc/reply"), ["support"]);
  assert.deepEqual(topicsForMutation("PATCH", "/api/reels/abc/follow"), ["dashboard"]);
  assert.deepEqual(topicsForMutation("POST", "/api/reels/abc/vote"), ["dashboard"]);
  assert.deepEqual(topicsForMutation("POST", "/api/reels/abc/like"), []);
  assert.deepEqual(topicsForMutation("POST", "/api/reels/abc/comments"), []);
  assert.deepEqual(topicsForMutation("PATCH", "/api/reels/abc/view"), []);
  assert.deepEqual(topicsForMutation("POST", "/api/community/abc/poll/vote"), ["dashboard"]);
  assert.deepEqual(topicsForMutation("POST", "/api/community/abc/save"), ["dashboard"]);
  assert.deepEqual(topicsForMutation("POST", "/api/community/abc/like"), []);
  assert.deepEqual(topicsForMutation("POST", "/api/buddies/message"), ["dashboard"]);
  assert.deepEqual(topicsForMutation("POST", "/api/wellbeing/games/truth/draw"), ["dashboard"]);
});

test("query strings and unknown endpoints", () => {
  assert.deepEqual(topicsForMutation("patch", "/api/habits/1/toggle?x=1"), ["habits", "dashboard"]);
  assert.deepEqual(topicsForMutation("POST", "/api/blogs/abc/track-view"), []);
  assert.deepEqual(topicsForMutation("POST", "/api/speech/synthesize"), []);
});

test("subscribers receive emitted topics until they unsubscribe", () => {
  const seen: string[][] = [];
  const unsubscribe = subscribeDataChange((topics) => seen.push([...topics]));
  emitDataChange("cycle", "dashboard");
  unsubscribe();
  emitDataChange("habits");
  assert.deepEqual(seen, [["cycle", "dashboard"]]);
});

test("habit suggestion dismissals refresh nothing; habit writes still do", () => {
  assert.deepEqual(topicsForMutation("POST", "/api/habits/suggestions/walk/dismiss"), []);
  assert.deepEqual(topicsForMutation("PATCH", "/api/habits/abc/toggle"), ["habits", "dashboard"]);
});
