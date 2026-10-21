import test from "node:test";
import assert from "node:assert/strict";
import { consultationIdOfDoc } from "../prescriptionDocs";

test("only a doctor's prescription document points at its consultation", () => {
  assert.equal(consultationIdOfDoc({ source: "consultation", consultationId: "c1" }), "c1");
  assert.equal(consultationIdOfDoc({ source: "upload", consultationId: "c1" }), null);
  assert.equal(consultationIdOfDoc({}), null);
  assert.equal(consultationIdOfDoc({ source: "consultation" }), null);
});
