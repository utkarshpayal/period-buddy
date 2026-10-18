/**
 * Help & support tickets — pure helpers shared by the Help & support sheet
 * (components/SupportTicketSheet.tsx) and the My tickets screens. The rules
 * mirror period-buddy-be's utils/supportTicket.js; keep the category ids and
 * length limits in step with it.
 */
import type { SupportCategoryId, SupportTicketStatus } from "./api";

export const SUPPORT_CATEGORIES: { id: SupportCategoryId; label: string; icon: string }[] = [
  { id: "account", label: "Account", icon: "person-circle-outline" },
  { id: "period_tracking", label: "Period tracking", icon: "calendar-outline" },
  { id: "payments", label: "Payments / Subscription", icon: "card-outline" },
  { id: "consultation", label: "Consultation", icon: "medkit-outline" },
  { id: "bug", label: "Bug / App issue", icon: "bug-outline" },
  { id: "other", label: "Other", icon: "chatbubble-ellipses-outline" },
];

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 140;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 4000;
export const REPLY_MAX = 4000;

export const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

/** Which theme colour pair a status pill uses. */
export type StatusTone = "info" | "warning" | "success" | "muted";
export const STATUS_TONES: Record<SupportTicketStatus, StatusTone> = {
  open: "info",
  in_progress: "warning",
  resolved: "success",
  closed: "muted",
};

/** Form check before sending: the first problem, or null when it can be sent. */
export function validateTicketForm(input: { category: SupportCategoryId | null; subject: string; message: string }) {
  if (!input.category) return "Pick what your issue is about";
  const subject = input.subject.trim();
  if (subject.length < SUBJECT_MIN) return "Add a short subject";
  if (subject.length > SUBJECT_MAX) return `Keep the subject under ${SUBJECT_MAX} characters`;
  const message = input.message.trim();
  if (message.length < MESSAGE_MIN) return `Tell us a little more (at least ${MESSAGE_MIN} characters)`;
  if (message.length > MESSAGE_MAX) return `Keep the message under ${MESSAGE_MAX} characters`;
  return null;
}

/** "2h ago" style label for list rows and replies. */
export function ticketTimeLabel(dateStr: string | undefined, now = Date.now()) {
  if (!dateStr) return "";
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
