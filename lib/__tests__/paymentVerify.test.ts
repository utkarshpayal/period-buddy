import test from "node:test";
import assert from "node:assert/strict";
import { isPaymentDeclined, verifyStatusOnce, verifyWithRetries } from "../paymentVerify";

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
const noWait = async () => {};

test("only a 400 (by default) counts as a declined payment", () => {
  assert.equal(isPaymentDeclined(httpError(400)), true);
  for (const status of [401, 404, 409, 429, 500, 502, 503, 504]) {
    assert.equal(isPaymentDeclined(httpError(status)), false, String(status));
  }
  assert.equal(isPaymentDeclined(new TypeError("Network request failed")), false);
  assert.equal(isPaymentDeclined(null), false);
  assert.equal(isPaymentDeclined(httpError(409), { failedStatuses: [400, 409] }), true);
});

test("verifyStatusOnce maps answers and never reports a server error as failed", async () => {
  assert.equal(await verifyStatusOnce(async () => ({ _id: "e1" })), "paid");
  assert.equal(await verifyStatusOnce(async () => ({ pending: true as const })), "pending");
  assert.equal(await verifyStatusOnce(() => Promise.reject(httpError(400))), "failed");
  assert.equal(await verifyStatusOnce(() => Promise.reject(httpError(502))), "pending");
  assert.equal(await verifyStatusOnce(() => Promise.reject(new Error("offline"))), "pending");
});

test("verifyWithRetries keeps going through pending and transient errors", async () => {
  const answers: (() => Promise<unknown>)[] = [
    async () => ({ pending: true }),
    () => Promise.reject(httpError(503)),
    async () => ({ _id: "e1" }),
  ];
  let calls = 0;
  const result = await verifyWithRetries(() => answers[calls++]() as Promise<{ _id: string }>, [1, 1, 1], { wait: noWait });
  assert.deepEqual(result, { _id: "e1" });
  assert.equal(calls, 3);
});

test("verifyWithRetries gives up with null after the last delay", async () => {
  let calls = 0;
  const result = await verifyWithRetries(
    async () => {
      calls++;
      return { pending: true as const };
    },
    [1, 1],
    { wait: noWait },
  );
  assert.equal(result, null);
  assert.equal(calls, 3);
});

test("verifyWithRetries rethrows a declined payment at once", async () => {
  let calls = 0;
  await assert.rejects(
    verifyWithRetries(
      () => {
        calls++;
        return Promise.reject(httpError(400));
      },
      [1, 1],
      { wait: noWait },
    ),
    /HTTP 400/,
  );
  assert.equal(calls, 1);
});
