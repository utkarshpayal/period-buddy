import { apiRequest, type Pagination, type QueryValue, toQuery } from "./client";

// ── Help & support tickets (`/api/support/*`) ─────────────────────────────
export type SupportCategoryId = "account" | "period_tracking" | "payments" | "consultation" | "bug" | "other";
export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";

/** Device/app info sent only when the person switches on "Attach app info". */
export type SupportTicketMeta = {
  platform?: string;
  osVersion?: string;
  appVersion?: string;
  deviceModel?: string;
  buildNumber?: string;
  locale?: string;
  timezoneOffset?: number;
};

export type SupportTicketSummary = {
  _id: string;
  ticketNumber: string;
  category: SupportCategoryId;
  categoryLabel: string;
  subject: string;
  status: SupportTicketStatus;
  lastReplyFrom: "user" | "admin";
  lastActivityAt: string;
  /** Support replied and the person hasn't opened it yet. */
  unread: boolean;
  replyCount: number;
  preview?: string;
  createdAt: string;
  updatedAt: string;
};

export type SupportTicketReply = { _id: string; from: "user" | "admin"; message: string; at: string };

export type SupportTicket = SupportTicketSummary & {
  message: string;
  meta: SupportTicketMeta | null;
  canReply: boolean;
  replies: SupportTicketReply[];
};

export const supportApi = {
  createTicket: (input: {
    category: SupportCategoryId;
    subject: string;
    message: string;
    attachAppInfo?: boolean;
    meta?: SupportTicketMeta;
  }) => apiRequest<{ ticket: SupportTicket }>("/api/support/tickets", { method: "POST", body: JSON.stringify(input) }),
  listTickets: (params?: { status?: SupportTicketStatus | "active"; page?: number; limit?: number }) =>
    apiRequest<{ tickets: SupportTicketSummary[]; unreadCount: number; pagination: Pagination }>(
      `/api/support/tickets${toQuery(params as Record<string, QueryValue>)}`,
    ),
  getTicket: (id: string) => apiRequest<{ ticket: SupportTicket }>(`/api/support/tickets/${id}`),
  reply: (id: string, message: string) =>
    apiRequest<{ ticket: SupportTicket }>(`/api/support/tickets/${id}/reply`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
};
