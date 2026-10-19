/**
 * Pure logic behind the consultation screen (app/(app)/consultation.tsx):
 * which bookings are live or past, their status and video-join state, the
 * chat header line, and merging chat logs. No React here, so it's
 * unit-tested in lib/__tests__/consultationModel.test.ts.
 */
import type { Consultation, ConsultationMessage, Doctor } from "./api";
import { formatSessionWhen } from "./consultationFormat";
import { isJoinWindowOpen } from "./jitsiCall";

/** Only ask about sessions that ended recently. */
export const RATE_WITHIN_MS = 30 * 24 * 60 * 60 * 1000;

/** A chat bubble: a server message, or our own still sending / failed one. */
export type ChatMessage = ConsultationMessage & { localId?: string; failed?: boolean };

export const SLOT_PERIODS = [
  { key: "morning", label: "Morning", icon: "sunrise" },
  { key: "afternoon", label: "Afternoon", icon: "sun" },
  { key: "evening", label: "Evening", icon: "moon" },
] as const;

export type SlotPeriodKey = (typeof SLOT_PERIODS)[number]["key"];

/** Which part of the (local) day a slot starts in. */
export function slotPeriod(start: string): SlotPeriodKey {
  const hour = new Date(start).getHours();
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

export function getDoctorDisplayName(doctor: Doctor) {
  return doctor.name || [doctor.firstName, doctor.lastName].filter(Boolean).join(" ") || "Clinical specialist";
}

export function doctorOf(consultation: Consultation): Doctor | null {
  return typeof consultation.doctorId === "object" ? consultation.doctorId : null;
}

export function doctorIdOf(consultation: Consultation): string {
  return typeof consultation.doctorId === "string" ? consultation.doctorId : consultation.doctorId._id;
}

/** The doctor's name for copy ("your doctor" when the booking isn't populated). */
export function doctorNameOf(consultation: Consultation, fallback = "your doctor"): string {
  const doc = doctorOf(consultation);
  return doc ? getDoctorDisplayName(doc) : fallback;
}

/** Paid/active: chat and calls are open. */
export function isLive(consultation: Consultation): boolean {
  return consultation.status === "paid" || consultation.status === "active";
}

function sortTime(consultation: Consultation): number {
  return new Date(consultation.completedAt ?? consultation.scheduledFor ?? consultation.createdAt ?? 0).getTime();
}

/** "Refund in progress" / "Refunded" for a cancelled paid booking, else null. */
export function refundLabel(consultation: Consultation): string | null {
  if (consultation.status !== "cancelled") return null;
  if (consultation.refundStatus === "processed" || consultation.paymentStatus === "refunded") return "Refunded";
  if (consultation.refundStatus === "required") return "Refund in progress";
  return null;
}

/** A past session's pill text. */
export function pastStatusText(consultation: Consultation): string {
  if (consultation.status === "completed") return "Completed";
  return consultation.cancelledBy === "doctor" ? "Cancelled by doctor" : "Cancelled";
}

/** Live bookings, soonest first. */
export function upcomingSessionsOf(list: Consultation[]): Consultation[] {
  return list
    .filter(isLive)
    .sort((a, b) => new Date(a.scheduledFor ?? 0).getTime() - new Date(b.scheduledFor ?? 0).getTime());
}

/**
 * Finished sessions, newest first; cancelled ones only if they were paid (an
 * abandoned checkout isn't a session).
 */
export function pastSessionsOf(list: Consultation[]): Consultation[] {
  return list
    .filter(
      (c) =>
        c.status === "completed" ||
        (c.status === "cancelled" &&
          (c.paymentStatus === "paid" || c.paymentStatus === "refunded" || Boolean(c.refundStatus))),
    )
    .sort((a, b) => sortTime(b) - sortTime(a));
}

/** The live booking with this doctor, if any. */
export function liveConsultationFor(list: Consultation[], doctorId: string): Consultation | undefined {
  return list.find((c) => doctorIdOf(c) === doctorId && isLive(c));
}

/** The latest finished session that hasn't been rated or skipped, ended recently. */
export function sessionToRate(list: Consultation[], skipped: readonly string[], now = Date.now()): Consultation | undefined {
  return list.find(
    (c) =>
      c.status === "completed" &&
      !c.rating &&
      !skipped.includes(c._id) &&
      now - new Date(c.completedAt ?? c.createdAt ?? 0).getTime() < RATE_WITHIN_MS,
  );
}

export type BookingStatus = "inProgress" | "booked" | "upcoming" | "now" | "over";

export const BOOKING_STATUS_TEXT: Record<BookingStatus, string> = {
  inProgress: "In progress",
  booked: "Booked",
  upcoming: "Upcoming",
  now: "Happening now",
  over: "Time over",
};

/**
 * A live booking's pill, by the slot time rather than 'paid' vs 'active': a
 * chat message before the slot makes it 'active', and it can still be
 * cancelled then.
 */
export function bookingStatus(session: Consultation, now: number): { status: BookingStatus; canCancel: boolean } {
  const startsAt = session.scheduledFor ? new Date(session.scheduledFor).getTime() : null;
  const endsAt = session.slotEndsAt ? new Date(session.slotEndsAt).getTime() : null;
  const canCancel = startsAt !== null && startsAt > now;
  const status: BookingStatus =
    startsAt === null
      ? session.status === "active"
        ? "inProgress"
        : "booked"
      : startsAt > now
        ? "upcoming"
        : endsAt === null || endsAt > now
          ? "now"
          : "over";
  return { status, canCancel };
}

/** Whether "Join video call" is on, and the note shown while it isn't; null without a call. */
export function videoJoinState(session: Consultation, clock: number): { open: boolean; note: string | null } | null {
  const video = session.videoCall;
  if (!video) return null;
  const available = video.available !== false;
  const open = available && isJoinWindowOpen(video, clock);
  const opensAt = video.joinOpensAt ? new Date(video.joinOpensAt).getTime() : null;
  const note = !available
    ? "Video calls aren't available right now"
    : !open && opensAt !== null && opensAt > clock
      ? `Video opens ${formatSessionWhen(video.joinOpensAt!, { now: new Date(clock) })}`
      : !open
        ? "The video time for this session is over"
        : null;
  return { open, note };
}

export type ChatStatusTone = "success" | "primary" | "muted";

/** The chat header line: the session's state instead of a presence guess. */
export function chatStatusOf(consultation: Consultation | null, chatEnded: boolean): { text: string; tone: ChatStatusTone } {
  if (!consultation) return { text: "", tone: "muted" };
  if (chatEnded && isLive(consultation)) return { text: "Session ended", tone: "muted" };
  switch (consultation.status) {
    case "active":
      return { text: "Session active", tone: "success" };
    case "paid":
      return {
        text: consultation.scheduledFor ? `Scheduled ${formatSessionWhen(consultation.scheduledFor)}` : "Booked",
        tone: "primary",
      };
    case "completed":
      return { text: "Session ended", tone: "muted" };
    case "cancelled":
      return { text: "Cancelled", tone: "muted" };
    default:
      return { text: "Awaiting payment", tone: "muted" };
  }
}

/** "12 yrs exp" (a bare number gets "yrs"), or null. */
export function experienceLabel(doctor: Doctor): string | null {
  if (!doctor.experience) return null;
  return `${doctor.experience}${/^\d+$/.test(doctor.experience.trim()) ? " yrs" : ""} exp`;
}

/** The first two languages, or null. */
export function languagesLabel(doctor: Doctor): string | null {
  return doctor.languages?.length ? doctor.languages.slice(0, 2).join(", ") : null;
}

/**
 * Collapses a message list so the same message never renders twice. The server
 * (sendMessage response) and the WebSocket broadcast both deliver the full log,
 * so without this an echoed message shows up multiple times. Messages with an
 * `_id` dedupe on it; our own unsent bubbles on their `localId`.
 */
export function dedupeMessages(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (const msg of messages) {
    const key = msg._id ? `id:${msg._id}` : msg.localId ? `local:${msg.localId}` : `tmp:${msg.sender}:${msg.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(msg);
  }
  return out;
}

/** The server's full log replaces ours, but our unsent/failed bubbles stay at the end. */
export function mergeServerLog(prev: ChatMessage[], latest: ConsultationMessage[]): ChatMessage[] {
  return dedupeMessages([...latest, ...prev.filter((m) => m.localId)]);
}
