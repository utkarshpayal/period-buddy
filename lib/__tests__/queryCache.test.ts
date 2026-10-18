import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { emitDataChange } from "../data-sync";
import {
  clearQueryCache,
  configureQueryPersistence,
  fetchQuery,
  hydrateQuery,
  invalidateQueries,
  isQueryFresh,
  peekQuery,
  setQueryData,
  subscribeQuery,
  type PersistStore,
} from "../queryCache";

function memoryStore(): PersistStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => void map.set(key, value),
    removeItem: async (key) => void map.delete(key),
    getAllKeys: async () => [...map.keys()],
    multiRemove: async (keys) => keys.forEach((key) => map.delete(key)),
  };
}

beforeEach(() => {
  configureQueryPersistence(null);
  clearQueryCache();
});

test("serves a fresh entry without refetching", async () => {
  let calls = 0;
  const fetcher = async () => ++calls;
  assert.equal(await fetchQuery("a", fetcher), 1);
  assert.equal(await fetchQuery("a", fetcher), 1);
  assert.equal(calls, 1);
  assert.equal(await fetchQuery("a", fetcher, { force: true }), 2);
});

test("shares one in-flight request between callers", async () => {
  let calls = 0;
  const fetcher = () => new Promise<number>((resolve) => setTimeout(() => resolve(++calls), 5));
  const [x, y] = await Promise.all([fetchQuery("b", fetcher, { force: true }), fetchQuery("b", fetcher, { force: true })]);
  assert.deepEqual([x, y, calls], [1, 1, 1]);
});

test("a failed fetch is not cached and the next call retries", async () => {
  await assert.rejects(fetchQuery("c", async () => Promise.reject(new Error("boom"))));
  assert.equal(peekQuery("c"), undefined);
  assert.equal(await fetchQuery("c", async () => 7), 7);
});

test("a mutation topic marks the entry stale but keeps the data", async () => {
  await fetchQuery("d", async () => "v1", { topics: ["blogs"] });
  assert.equal(isQueryFresh("d"), true);
  emitDataChange("cycle");
  assert.equal(isQueryFresh("d"), true);
  emitDataChange("blogs");
  assert.equal(isQueryFresh("d"), false);
  assert.equal(peekQuery("d"), "v1");
});

test("staleMs controls freshness", async () => {
  await fetchQuery("e", async () => 1);
  assert.equal(isQueryFresh("e", 60_000), true);
  assert.equal(isQueryFresh("e", 60_000, Date.now() + 61_000), false);
});

test("prefix invalidation only touches matching keys", async () => {
  setQueryData("blogs:list:all", 1);
  setQueryData("blogs:list:pcos", 2);
  setQueryData("schemes:list", 3);
  invalidateQueries("blogs:");
  assert.equal(isQueryFresh("blogs:list:all"), false);
  assert.equal(isQueryFresh("blogs:list:pcos"), false);
  assert.equal(isQueryFresh("schemes:list"), true);
});

test("subscribers hear about new data", () => {
  const seen: unknown[] = [];
  const off = subscribeQuery("f", (value) => seen.push(value));
  setQueryData("f", "x");
  off();
  setQueryData("f", "y");
  assert.deepEqual(seen, ["x"]);
});

test("a fetch that started before clearQueryCache never writes back", async () => {
  let release: (value: string) => void = () => {};
  const pending = fetchQuery("g", () => new Promise<string>((resolve) => (release = resolve)));
  clearQueryCache();
  release("old account");
  await pending;
  assert.equal(peekQuery("g"), undefined);
});

test("persisted entries hydrate as stale and clear wipes the device copy", async () => {
  const store = memoryStore();
  configureQueryPersistence(store);
  await fetchQuery("h", async () => ({ n: 1 }), { persist: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(store.map.size, 1);

  // Simulate a cold start: memory empty, disk still has it.
  const saved = new Map(store.map);
  clearQueryCache();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(store.map.size, 0);
  saved.forEach((value, key) => store.map.set(key, value));

  assert.deepEqual(await hydrateQuery("h"), { n: 1 });
  assert.equal(isQueryFresh("h"), false);
});

test("an old persisted copy is ignored", async () => {
  const store = memoryStore();
  configureQueryPersistence(store);
  store.map.set("nura.qc.i", JSON.stringify({ at: Date.now() - 8 * 24 * 3600 * 1000, data: 1 }));
  assert.equal(await hydrateQuery("i"), undefined);
});
