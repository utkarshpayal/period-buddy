import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReviewDate, medicalReviewLabel } from "../medicalReview";

test("no badge unless medically reviewed", () => {
  assert.equal(medicalReviewLabel(undefined), null);
  assert.equal(medicalReviewLabel({ medicallyReviewed: false, reviewedBy: "Dr A" }), null);
});

test("names the reviewer when known", () => {
  const label = medicalReviewLabel({ medicallyReviewed: true, reviewedBy: " Dr Asha Rao ", reviewedAt: "2026-10-12T10:00:00.000Z" });
  assert.equal(label?.title, "Medically reviewed by Dr Asha Rao");
  assert.equal(label?.date, "12 Oct 2026");
});

test("falls back to a plain label without a name or date", () => {
  assert.deepEqual(medicalReviewLabel({ medicallyReviewed: true, reviewedBy: null }), { title: "Medically reviewed", date: null });
  assert.equal(formatReviewDate("not a date"), null);
});
