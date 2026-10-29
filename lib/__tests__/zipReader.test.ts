import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, strToU8, zipSync } from "fflate";
import { parseImportFile, ZipPasswordError } from "../cycleImport";
import { crc32, listZip, readZip } from "../zipReader";

// Made with `zip -P nura-secret`: ZipCrypto with data descriptors, the same
// flags as Clue's export. Holds measurements.json (a medium period day with
// cramps) and profile.json.
const LOCKED_ZIP = Buffer.from(
  "UEsDBBQACQAIAB0/XV3A2eBjawAAAJcAAAARABwAbWVhc3VyZW1lbnRzLmpzb25VVAkAA/Gu4mrxruJqdXgLAAEE9QEAAAQAAAAA6fEfbzT2AIjAOe5q+fSqXVKU3dKrVU8IM8QbW+SDjUYu94JZF6QaoX3BKkfK2kzAIbgBSgXU1UW/8sJ/b5pnzKXvIteIbtn5BEmp23KQHF0DQqNrTJCrbzeXRUwr7fZXoIsZAVl+kxJ0WIZQSwcIwNngY2sAAACXAAAAUEsDBAoACQAAAB0/XV3sW3YkHwAAABMAAAAMABwAcHJvZmlsZS5qc29uVVQJAAPxruJq8a7ianV4CwABBPUBAAAEAAAAAAkXOn6O0Z+BXuxMlbamN5HGYvC6xDwnWouVFBcfLL1QSwcI7Ft2JB8AAAATAAAAUEsBAh4DFAAJAAgAHT9dXcDZ4GNrAAAAlwAAABEAGAAAAAAAAQAAAKSBAAAAAG1lYXN1cmVtZW50cy5qc29uVVQFAAPxruJqdXgLAAEE9QEAAAQAAAAAUEsBAh4DCgAJAAAAHT9dXexbdiQfAAAAEwAAAAwAGAAAAAAAAQAAAKSBxgAAAHByb2ZpbGUuanNvblVUBQAD8a7ianV4CwABBPUBAAAEAAAAAFBLBQYAAAAAAgACAKkAAAA7AQAAAAA=",
  "base64",
);
const bytes = new Uint8Array(LOCKED_ZIP);

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(strToU8("123456789")), 0xcbf43926);
});

test("listZip sees encrypted entries", () => {
  assert.deepEqual(
    listZip(bytes).map((e) => [e.name, e.encrypted]),
    [
      ["measurements.json", true],
      ["profile.json", true],
    ],
  );
});

test("readZip opens a ZipCrypto zip with the right password", () => {
  const files = readZip(bytes, () => true, "nura-secret");
  assert.equal(strFromU8(files["profile.json"]), '{"birth_year":2004}');
  assert.match(strFromU8(files["measurements.json"]), /"option":"cramps"/);
});

test("readZip asks for a password, and refuses a wrong one", () => {
  assert.throws(() => readZip(bytes, () => true), (err: unknown) => err instanceof ZipPasswordError && err.reason === "needed");
  for (const wrong of ["nura", "Nura-secret", "nura-secret ", "x"]) {
    assert.throws(() => readZip(bytes, () => true, wrong), (err: unknown) => err instanceof ZipPasswordError && err.reason === "wrong");
  }
});

test("readZip reads plain zips too, stored and deflated", () => {
  const plain = zipSync({ "a.json": [strToU8('{"a":1}'), { level: 0 }], "b.json": strToU8("b".repeat(500)) });
  const files = readZip(plain, (e) => e.name.endsWith(".json"));
  assert.equal(strFromU8(files["a.json"]), '{"a":1}');
  assert.equal(files["b.json"].length, 500);
});

test("a locked Clue zip imports once the password is given", () => {
  assert.throws(() => parseImportFile(bytes, "clue.zip", "2026-10-29"), ZipPasswordError);
  const preview = parseImportFile(bytes, "clue.zip", "2026-10-29", "nura-secret");
  assert.deepEqual(preview.days, [{ dateKey: "2026-10-01", flow: "medium", symptoms: ["cramps"] }]);
});
