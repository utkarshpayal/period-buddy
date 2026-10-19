import test from "node:test";
import assert from "node:assert/strict";
import type { Consultation, Doctor } from "../api";
import {
  bookingStatus,
  chatStatusOf,
  dedupeMessages,
  doctorIdOf,
  doctorNameOf,
  experienceLabel,
  getDoctorDisplayName,
  languagesLabel,
  liveConsultationFor,
  mergeServerLog,
  pastSessionsOf,
  pastStatusText,
  refundLabel,
  sessionToRate,
  slotPeriod,
  upcomingSessionsOf,
  videoJoinState,
  RATE_WITHIN_MS,
  type ChatMessage,
} from "../consultationModel";

const doctor = (over: Partial<Doctor> = {}): Doctor => ({
  _id: "d1",
  currency: "INR",
  isAvailable: true,
  rating: 0,
  specialty: "Gynecologist",
  ...over,
});

const consult = (over: Partial<Consultation> = {}): Consultation =>
  ({ _id: "c1", doctorId: "d1", status: "paid", ...over }) as Consultation;

test("doctor names: legacy name, then first + last, then a fallback", () => {
  assert.equal(getDoctorDisplayName(doctor({ name: "Dr A" })), "Dr A");
  assert.equal(getDoctorDisplayName(doctor({ firstName: "Asha", lastName: "Rao" })), "Asha Rao");
  assert.equal(getDoctorDisplayName(doctor({ firstName: "Asha" })), "Asha");
  assert.equal(getDoctorDisplayName(doctor()), "Clinical specialist");
  assert.equal(doctorNameOf(consult()), "your doctor");
  assert.equal(doctorNameOf(consult({ doctorId: doctor({ firstName: "Asha" }) })), "Asha");
  assert.equal(doctorIdOf(consult({ doctorId: doctor({ _id: "d9" }) })), "d9");
  assert.equal(doctorIdOf(consult({ doctorId: "d7" })), "d7");
});

test("upcoming is live bookings soonest first; past keeps only real sessions, newest first", () => {
  const list = [
    consult({ _id: "late", scheduledFor: "2026-05-02T10:00:00Z" }),
    consult({ _id: "soon", status: "active", scheduledFor: "2026-05-01T10:00:00Z" }),
    consult({ _id: "pending", status: "pending" }),
    consult({ _id: "done-old", status: "completed", completedAt: "2026-01-01T00:00:00Z" }),
    consult({ _id: "done-new", status: "completed", completedAt: "2026-03-01T00:00:00Z" }),
    consult({ _id: "abandoned", status: "cancelled", paymentStatus: "unpaid" }),
    consult({ _id: "refunded", status: "cancelled", paymentStatus: "refunded", createdAt: "2026-02-01T00:00:00Z" }),
  ];
  assert.deepEqual(upcomingSessionsOf(list).map((c) => c._id), ["soon", "late"]);
  assert.deepEqual(pastSessionsOf(list).map((c) => c._id), ["done-new", "refunded", "done-old"]);
  assert.equal(liveConsultationFor(list, "d1")?._id, "late");
  assert.equal(liveConsultationFor(list, "other"), undefined);
});

test("refund and past status labels", () => {
  assert.equal(refundLabel(consult({ status: "completed" })), null);
  assert.equal(refundLabel(consult({ status: "cancelled", refundStatus: "required" })), "Refund in progress");
  assert.equal(refundLabel(consult({ status: "cancelled", paymentStatus: "refunded" })), "Refunded");
  assert.equal(refundLabel(consult({ status: "cancelled" })), null);
  assert.equal(pastStatusText(consult({ status: "completed" })), "Completed");
  assert.equal(pastStatusText(consult({ status: "cancelled", cancelledBy: "doctor" })), "Cancelled by doctor");
  assert.equal(pastStatusText(consult({ status: "cancelled", cancelledBy: "patient" })), "Cancelled");
});

test("sessionToRate skips rated, skipped and old sessions", () => {
  const now = Date.parse("2026-05-01T00:00:00Z");
  const recent = new Date(now - 1000).toISOString();
  const old = new Date(now - RATE_WITHIN_MS - 1000).toISOString();
  const list = [
    consult({ _id: "rated", status: "completed", rating: 5, completedAt: recent }),
    consult({ _id: "skipped", status: "completed", completedAt: recent }),
    consult({ _id: "old", status: "completed", completedAt: old }),
    consult({ _id: "ok", status: "completed", completedAt: recent }),
  ];
  assert.equal(sessionToRate(list, ["skipped"], now)?._id, "ok");
  assert.equal(sessionToRate(list, ["skipped", "ok"], now), undefined);
});

test("bookingStatus goes by the slot time", () => {
  const now = Date.parse("2026-05-01T10:00:00Z");
  assert.deepEqual(bookingStatus(consult(), now), { status: "booked", canCancel: false });
  assert.deepEqual(bookingStatus(consult({ status: "active" }), now), { status: "inProgress", canCancel: false });
  assert.deepEqual(bookingStatus(consult({ status: "active", scheduledFor: "2026-05-01T11:00:00Z" }), now), {
    status: "upcoming",
    canCancel: true,
  });
  assert.equal(
    bookingStatus(consult({ scheduledFor: "2026-05-01T09:50:00Z", slotEndsAt: "2026-05-01T10:10:00Z" }), now).status,
    "now",
  );
  assert.equal(
    bookingStatus(consult({ scheduledFor: "2026-05-01T09:00:00Z", slotEndsAt: "2026-05-01T09:20:00Z" }), now).status,
    "over",
  );
});

test("videoJoinState: off without a call, notes while closed", () => {
  const now = Date.parse("2026-05-01T10:00:00Z");
  assert.equal(videoJoinState(consult(), now), null);
  const call = (over: object) =>
    consult({ videoCall: { joinOpensAt: null, joinClosesAt: null, ...over } as Consultation["videoCall"] });
  assert.deepEqual(videoJoinState(call({}), now), { open: true, note: null });
  assert.deepEqual(videoJoinState(call({ available: false }), now), {
    open: false,
    note: "Video calls aren't available right now",
  });
  assert.deepEqual(videoJoinState(call({ joinClosesAt: "2026-05-01T09:00:00Z" }), now), {
    open: false,
    note: "The video time for this session is over",
  });
  const opening = videoJoinState(call({ joinOpensAt: "2026-05-01T11:00:00Z" }), now);
  assert.equal(opening?.open, false);
  assert.match(opening?.note ?? "", /^Video opens /);
});

test("chatStatusOf reflects the session, and an ended live chat", () => {
  assert.deepEqual(chatStatusOf(null, false), { text: "", tone: "muted" });
  assert.deepEqual(chatStatusOf(consult({ status: "active" }), false), { text: "Session active", tone: "success" });
  assert.deepEqual(chatStatusOf(consult({ status: "active" }), true), { text: "Session ended", tone: "muted" });
  assert.deepEqual(chatStatusOf(consult(), false), { text: "Booked", tone: "primary" });
  assert.deepEqual(chatStatusOf(consult({ status: "cancelled" }), false), { text: "Cancelled", tone: "muted" });
  assert.deepEqual(chatStatusOf(consult({ status: "pending" }), false), { text: "Awaiting payment", tone: "muted" });
});

test("doctor card labels", () => {
  assert.equal(experienceLabel(doctor({ experience: "12" })), "12 yrs exp");
  assert.equal(experienceLabel(doctor({ experience: "10+ years" })), "10+ years exp");
  assert.equal(experienceLabel(doctor()), null);
  assert.equal(languagesLabel(doctor({ languages: ["en", "hi", "ta"] })), "en, hi");
  assert.equal(languagesLabel(doctor({ languages: [] })), null);
});

test("slotPeriod splits the local day", () => {
  const at = (h: number) => new Date(2026, 4, 1, h).toISOString();
  assert.equal(slotPeriod(at(9)), "morning");
  assert.equal(slotPeriod(at(13)), "afternoon");
  assert.equal(slotPeriod(at(19)), "evening");
});

test("chat logs: server log replaces ours, unsent bubbles stay, nothing doubles", () => {
  const prev: ChatMessage[] = [
    { _id: "m1", sender: "doctor", text: "hi" },
    { sender: "user", text: "sending", localId: "l1" },
    { sender: "user", text: "failed", localId: "l2", failed: true },
  ];
  const merged = mergeServerLog(prev, [
    { _id: "m1", sender: "doctor", text: "hi" },
    { _id: "m2", sender: "user", text: "earlier" },
  ]);
  assert.deepEqual(merged.map((m) => m._id ?? m.localId), ["m1", "m2", "l1", "l2"]);
  assert.equal(dedupeMessages([...merged, ...merged]).length, 4);
});
