import test from "node:test";
import assert from "node:assert/strict";
import {
  applyJitsiEvent,
  buildJitsiHtml,
  describeJoinError,
  initialCallState,
  isJoinWindowOpen,
  peerMessageCount,
} from "../jitsiCall";

/** Shaped like lib/api's ApiError (that module can't load under Node). */
const apiError = (message: string, extra: { kind?: string; status?: number; code?: string; details?: object }) =>
  Object.assign(new Error(message), { name: "ApiError", kind: "unknown", ...extra });

test("joining alone: no peer yet, so the screen says it's waiting", () => {
  const s = applyJitsiEvent(initialCallState(), "videoConferenceJoined", { count: 1 });
  assert.equal(s.joined, true);
  assert.deepEqual(s.peers, []);
});

test("joining after the doctor: the doctor counts as present", () => {
  const s = applyJitsiEvent(initialCallState(), "videoConferenceJoined", { count: 2 });
  assert.equal(s.peers.length, 1);
});

test("doctor joins, leaves, rejoins with a new id", () => {
  let s = applyJitsiEvent(initialCallState(), "videoConferenceJoined", { count: 1 });
  s = applyJitsiEvent(s, "participantJoined", { id: "a" });
  assert.deepEqual(s.peers, ["a"]);
  s = applyJitsiEvent(s, "participantLeft", { id: "a" });
  assert.deepEqual(s.peers, []);
  s = applyJitsiEvent(s, "participantJoined", { id: "b" });
  assert.deepEqual(s.peers, ["b"]);
});

test("the 'present' placeholder is replaced by the real id, never double-counted", () => {
  let s = applyJitsiEvent(initialCallState(), "videoConferenceJoined", { count: 2 });
  s = applyJitsiEvent(s, "participantJoined", { id: "a" });
  assert.deepEqual(s.peers, ["a"]);
});

test("mute, camera and audio-only follow Jitsi's events", () => {
  let s = initialCallState();
  s = applyJitsiEvent(s, "audioMuteStatusChanged", { muted: true });
  s = applyJitsiEvent(s, "videoMuteStatusChanged", { muted: true });
  s = applyJitsiEvent(s, "lowBandwidthModeChanged", { enabled: true });
  assert.equal(s.micMuted, true);
  assert.equal(s.cameraOff, true);
  assert.equal(s.audioOnly, true);
});

test("camera permission refused: starts with the camera off", () => {
  assert.equal(initialCallState(false).cameraOff, true);
});

test("mic/camera refused inside the call is surfaced", () => {
  assert.equal(applyJitsiEvent(initialCallState(), "micError", {}).deviceProblem, "mic");
  assert.equal(applyJitsiEvent(initialCallState(), "cameraError", {}).deviceProblem, "camera");
});

test("an expired/invalid token is a fatal auth error with Rejoin", () => {
  const s = applyJitsiEvent(initialCallState(), "errorOccurred", {
    error: { name: "connection.passwordRequired", isFatal: true },
  });
  assert.match(s.failure!, /expired/);
  assert.equal(s.joined, false);
});

test("network failure is fatal with Rejoin; non-fatal errors are ignored", () => {
  const fatal = applyJitsiEvent(initialCallState(), "errorOccurred", {
    error: { name: "connection.droppedError", isFatal: true },
  });
  assert.match(fatal.failure!, /lost its connection/);
  const minor = applyJitsiEvent(initialCallState(), "errorOccurred", { error: { isFatal: false } });
  assert.equal(minor.failure, null);
});

test("leaving on purpose is not a disconnect", () => {
  let s = applyJitsiEvent(initialCallState(), "videoConferenceJoined", { count: 2 });
  s = applyJitsiEvent(s, "videoConferenceLeft", {}, true);
  assert.equal(s.failure, null);
  s = applyJitsiEvent(s, "readyToClose", {}, true);
  assert.equal(s.closed, true);
});

test("being dropped from the conference shows a disconnect", () => {
  const s = applyJitsiEvent(initialCallState(), "videoConferenceLeft", {});
  assert.match(s.failure!, /disconnected/);
});

test("join refusals in plain words", () => {
  const early = describeJoinError(
    apiError("x", { status: 403, code: "JOIN_WINDOW_NOT_OPEN", details: { opensAt: "2026-10-04T09:50:00Z" } }),
  );
  assert.match(early.message, /opens at/);
  assert.equal(early.canRetry, true);
  const over = describeJoinError(apiError("The time is over.", { status: 403, code: "JOIN_WINDOW_CLOSED" }));
  assert.deepEqual(over, { message: "The time is over.", canRetry: false });
  assert.equal(describeJoinError(apiError("x", { kind: "network" })).canRetry, true);
  assert.equal(describeJoinError(apiError("x", { status: 503, kind: "server" })).canRetry, false);
  assert.equal(describeJoinError(apiError("Slow down", { status: 429 })).canRetry, true);
  const offline = describeJoinError(
    apiError("Rose is offline. Video calls need both of you online in the chat.", { status: 409, code: "BUDDY_OFFLINE" }),
  );
  assert.deepEqual(offline, { message: "Rose is offline. Video calls need both of you online in the chat.", canRetry: true });
});

test("join window from the server's videoCall", () => {
  const vc = { joinOpensAt: "2026-10-04T09:50:00Z", joinClosesAt: "2026-10-04T11:00:00Z" };
  assert.equal(isJoinWindowOpen(vc, Date.parse("2026-10-04T09:49:00Z")), false);
  assert.equal(isJoinWindowOpen(vc, Date.parse("2026-10-04T10:00:00Z")), true);
  assert.equal(isJoinWindowOpen(vc, Date.parse("2026-10-04T11:00:01Z")), false);
  assert.equal(isJoinWindowOpen({ joinOpensAt: null, joinClosesAt: null }), true);
  assert.equal(isJoinWindowOpen(null), false);
});

test("the page can't be broken out of by a hostile value, and only loads our domain", () => {
  const html = buildJitsiHtml({
    domain: "meet.thenura.care",
    roomName: "nura-abc",
    jwt: "a.b.c",
    displayName: "</script><script>alert(1)</script>",
    startWithVideoMuted: true,
  });
  assert.equal(html.includes("</script><script>alert(1)"), false);
  assert.match(html, /"startWithVideoMuted":true/);
  assert.match(html, /'https:\/\/' \+ cfg\.domain \+ '\/external_api\.js'/);
  assert.doesNotThrow(() =>
    buildJitsiHtml({ domain: "meet.localtest.me:8443", roomName: "r", jwt: "t", displayName: "d", startWithVideoMuted: false }),
  );
  assert.throws(() =>
    buildJitsiHtml({ domain: "evil.com/x?", roomName: "r", jwt: "t", displayName: "d", startWithVideoMuted: false }),
  );
});

test("in-call chat: unread counts only the other person's messages", () => {
  assert.equal(
    peerMessageCount([
      { id: "1", mine: true, text: "hi" },
      { id: "2", mine: false, text: "hello" },
      { id: "3", mine: false, text: "how are you" },
    ]),
    2,
  );
  assert.equal(peerMessageCount([]), 0);
});
