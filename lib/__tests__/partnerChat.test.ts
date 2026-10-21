import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmLocal,
  mergeFetched,
  mergeIncomingMessage,
  partnerDisplayName,
  partnerMessageId,
  setLocalStatus,
  type LocalPartnerMessage,
} from "../partnerChat";

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 18, 10, 0, seconds)).toISOString();

const local = (text: string, localId: string, seconds = 0): LocalPartnerMessage => ({
  sender: "user",
  text,
  sentAt: at(seconds),
  localId,
  status: "sending",
});

test("an echo replaces the matching local copy instead of duplicating it", () => {
  const prev = [local("hi", "l1")];
  const next = mergeIncomingMessage(prev, { _id: "s1", sender: "user", text: "hi", sentAt: at(1) });
  assert.deepEqual(next, [{ _id: "s1", sender: "user", text: "hi", sentAt: at(1) }]);
});

test("a message already in the thread is a no-op (same array back)", () => {
  const prev: LocalPartnerMessage[] = [{ _id: "s1", sender: "partner", text: "yo", sentAt: at(0) }];
  assert.equal(mergeIncomingMessage(prev, { ...prev[0] }), prev);
});

test("a message from the other side is appended", () => {
  const prev = [local("hi", "l1")];
  const next = mergeIncomingMessage(prev, { _id: "s2", sender: "partner", text: "hi", sentAt: at(2) });
  assert.equal(next.length, 2);
  assert.equal(next[0].localId, "l1");
});

test("confirming a send swaps in the server copy, or drops the local one if the echo won", () => {
  const sent = { _id: "s1", sender: "user" as const, text: "hi", sentAt: at(1) };
  assert.deepEqual(confirmLocal([local("hi", "l1")], "l1", sent, partnerMessageId), [sent]);
  assert.deepEqual(confirmLocal([sent, local("hi", "l1")], "l1", sent, partnerMessageId), [sent]);
  // Unknown response shape: keep the text, just clear the pending state.
  assert.deepEqual(confirmLocal([local("hi", "l1")], "l1", null, partnerMessageId), [
    { sender: "user", text: "hi", sentAt: at(0) },
  ]);
});

test("a failed send stays in the thread and can be marked failed", () => {
  const next = setLocalStatus([local("hi", "l1")], "l1", "failed");
  assert.equal(next[0].status, "failed");
});

test("a refetch keeps unsent local copies but drops ones the server already has", () => {
  const fetched: LocalPartnerMessage[] = [
    { _id: "s0", sender: "partner", text: "hello", sentAt: at(0) },
    { _id: "s1", sender: "user", text: "delivered", sentAt: at(5) },
  ];
  const prev = [local("delivered", "l1", 4), { ...local("offline", "l2", 6), status: "failed" as const }];
  const next = mergeFetched(prev, fetched);
  assert.deepEqual(next.map((m) => m._id ?? m.localId), ["s0", "s1", "l2"]);
});

test("an old identical message in history doesn't swallow a new local one", () => {
  const fetched: LocalPartnerMessage[] = [{ _id: "old", sender: "user", text: "hi", sentAt: at(0) }];
  const later = local("hi", "l1", 0);
  later.sentAt = new Date(Date.UTC(2026, 9, 18, 12, 0, 0)).toISOString();
  assert.equal(mergeFetched([later], fetched).length, 2);
});

test("partner display name", () => {
  assert.equal(partnerDisplayName({ partnerId: { firstName: "Ravi", lastName: "K" } }), "Ravi K");
  assert.equal(partnerDisplayName({ partnerId: { firstName: "Ravi" } }), "Ravi");
  assert.equal(partnerDisplayName({ partnerId: "abc" }), null);
  assert.equal(partnerDisplayName({ partnerId: { firstName: "" } }), null);
  assert.equal(partnerDisplayName(null), null);
});
