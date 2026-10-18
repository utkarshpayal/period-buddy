import test from "node:test";
import assert from "node:assert/strict";
import { SUPPORT_CATEGORIES, STATUS_LABELS, STATUS_TONES, ticketTimeLabel, validateTicketForm } from "../support";

test("categories match the backend ids", () => {
  assert.deepEqual(
    SUPPORT_CATEGORIES.map((c) => c.id),
    ["account", "period_tracking", "payments", "consultation", "bug", "other"],
  );
});

test("every status has a label and a tone", () => {
  for (const status of ["open", "in_progress", "resolved", "closed"] as const) {
    assert.ok(STATUS_LABELS[status]);
    assert.ok(STATUS_TONES[status]);
  }
});

test("validateTicketForm returns the first problem", () => {
  const ok = { category: "bug" as const, subject: "Crash", message: "It crashes when I open the tracker." };
  assert.equal(validateTicketForm(ok), null);
  assert.match(validateTicketForm({ ...ok, category: null }) ?? "", /Pick/);
  assert.match(validateTicketForm({ ...ok, subject: "  a " }) ?? "", /subject/);
  assert.match(validateTicketForm({ ...ok, message: "short" }) ?? "", /more/);
  assert.match(validateTicketForm({ ...ok, message: "x".repeat(4001) }) ?? "", /under/);
});

test("ticketTimeLabel", () => {
  const now = Date.parse("2026-10-16T12:00:00Z");
  assert.equal(ticketTimeLabel("2026-10-16T11:59:40Z", now), "Just now");
  assert.equal(ticketTimeLabel("2026-10-16T11:15:00Z", now), "45m ago");
  assert.equal(ticketTimeLabel("2026-10-16T07:00:00Z", now), "5h ago");
  assert.equal(ticketTimeLabel("2026-10-14T12:00:00Z", now), "2d ago");
  assert.equal(ticketTimeLabel(undefined, now), "");
});
