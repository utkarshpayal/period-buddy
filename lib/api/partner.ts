import type { AuthUser } from "./auth";
import { apiEnvelopeRequest, apiRequest, hasMorePages, toQuery } from "./client";
import type { VideoJoin } from "./consultation";
import type { DayEntry, Predictions } from "./cycle";

export type PartnerMessage = {
  _id?: string;
  sender: "partner" | "user";
  sentAt?: string;
  text: string;
};

export type PartnerPermissions = {
  shareAlerts: boolean;
  shareCyclePhase: boolean;
  shareIntimacyLog: boolean;
  shareSymptoms: boolean;
  shareReports: boolean;
};

export type PartnerProfile = {
  _id: string;
  blocked?: boolean;
  connectedAt?: string;
  connectionStatus?: "connected" | "disconnected" | "pending";
  inviteCode?: string;
  inviteCodeExpiry?: string;
  isConnected: boolean;
  lastSeen?: string;
  messages: PartnerMessage[];
  partnerId?: string | Pick<AuthUser, "firstName" | "lastName">;
  permissions: PartnerPermissions;
  role?: "owner" | "viewer" | null;
  userId: string;
};

export type PartnerSymptomLogSummary = {
  dateKey: string;
  energy?: DayEntry["energy"];
  flow?: DayEntry["flow"];
  mood?: DayEntry["mood"];
  sleepHours?: number;
  stressLevel?: number;
  symptoms?: string[];
  temperature?: number;
  waterIntake?: number;
  weight?: number;
};

export type PartnerSharedData = {
  alerts?: string[];
  cycle?: Pick<
    Predictions,
    | "currentCycleDay"
    | "currentPhase"
    | "fertileWindowRange"
    | "nextPeriodDate"
    | "nextPeriodDaysAway"
    | "ovulationDaysAway"
  >;
  permissions: Partial<PartnerPermissions>;
  recentSymptoms?: PartnerSymptomLogSummary[];
  intimacyLogs?: { dateKey: string; note: string }[];
  careSuggestions?: {
    suggestions: { category: string; title: string; message: string }[];
    dos: string[];
    donts: string[];
  };
  /** Not gated by a sharing permission — low-sensitivity engagement info shown to any connected partner. */
  streak?: { count: number };
};

export type BuddyMatch = {
  _id?: string;
  activeLimit?: number;
  /** Real display name for a genuine matched user, or a demo alias when backfilled from fallback content. */
  alias: string;
  /** False for the backend's demo discovery cards used to pad a thin match list — these are display-only and can't actually be nominated. Absent (undefined) on older responses means real. */
  isRealUser?: boolean;
  avatarSeed: string;
  compatibility: number;
  cycleOverlapDays: number;
  cyclePhase: string;
  id: string;
  lastMessage?: string;
  lastMessageAt?: string;
  matchKey?: string;
  /** Unique per pairing, shared by both sides; scopes the buddy_<roomKey> WebSocket room to this specific pairing so it can't collide with a past or future one. */
  roomKey?: string;
  buddyUserId?: string;
  nominatedAt?: string;
  similarities: string[];
  status?: "active" | "ended";
  unreadCount?: number;
  messages?: BuddyMessage[];
};

export type BuddyMessage = {
  _id?: string;
  id?: string;
  sender: "buddy" | "me";
  sentAt?: string;
  text: string;
};

export type Nomination = {
  _id: string;
  acceptedAt?: string;
  createdAt?: string;
  expiresAt?: string;
  inviteCode?: string;
  message?: string;
  nomineeEmail: string;
  nomineeId?: string | AuthUser | null;
  nomineeName?: string;
  nominatorId?: string | AuthUser;
  rejectedAt?: string;
  status: "accepted" | "declined" | "pending";
};

export type AppNotification = {
  _id: string;
  body?: string;
  createdAt?: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  readAt?: string | null;
  scheduledFor?: string | null;
  sentAt?: string | null;
  title: string;
  type:
    | "buddy_message"
    | "community_reply"
    | "consultation_update"
    | "habit_reminder"
    | "ovulation_reminder"
    | "partner_message"
    | "period_reminder"
    | "reward_earned"
    | "streak_bonus"
    | "system";
  userId: string;
};

export const partnerApi = {
  getProfile: () => apiRequest<PartnerProfile>("/api/partner"),

  generateInviteCode: () =>
    apiRequest<{ expiresAt: string; inviteCode: string }>("/api/partner/invite", {
      method: "POST",
    }),

  connectPartner: (inviteCode: string) =>
    apiRequest<PartnerProfile>("/api/partner/connect", {
      body: JSON.stringify({ inviteCode }),
      method: "POST",
    }),

  updatePermissions: (permissions: PartnerPermissions) =>
    apiRequest<PartnerPermissions>("/api/partner/permissions", {
      body: JSON.stringify(permissions),
      method: "PATCH",
    }),

  getSharedData: () =>
    apiRequest<PartnerSharedData>("/api/partner/shared-data"),

  getMessages: () => apiRequest<PartnerMessage[]>("/api/partner/messages"),

  sendMessage: (text: string) =>
    apiRequest<PartnerMessage[]>("/api/partner/message", {
      body: JSON.stringify({ text }),
      method: "POST",
    }),

  disconnect: () =>
    apiRequest<void>("/api/partner/disconnect", { method: "DELETE" }),

  /** Newest 50, no paging — for callers that only need a quick look. */
  getNotifications: () => apiRequest<AppNotification[]>("/api/partner/notifications"),

  /** One page, newest first. `unreadCount` covers every notification (not
   * just this page); it's undefined on a backend without pagination, in
   * which case `hasMore` is false and callers can count unread in the page. */
  getNotificationsPage: async (params: { page?: number; limit?: number } = {}) => {
    const envelope = await apiEnvelopeRequest<AppNotification[]>(
      `/api/partner/notifications${toQuery({ page: params.page ?? 1, limit: params.limit ?? 20 })}`,
    );
    return {
      notifications: envelope.data ?? [],
      hasMore: hasMorePages(envelope.pagination),
      unreadCount: envelope.unreadCount,
    };
  },

  markNotificationAsRead: (id: string) =>
    apiRequest<AppNotification>(`/api/partner/notifications/${id}/read`, {
      method: "POST",
    }),

  markAllNotificationsAsRead: () =>
    apiRequest<{ updated: number }>("/api/partner/notifications/read-all", {
      method: "POST",
    }),
};

export const buddyApi = {
  getMatches: (search?: string) =>
    apiRequest<{ activeLimit: number; matches: BuddyMatch[] }>(
      `/api/buddies/matches${toQuery({ search })}`,
    ),

  getActive: () => apiRequest<BuddyMatch | null>("/api/buddies/active"),

  nominate: (matchId: string) =>
    apiRequest<{ buddy?: BuddyMatch; match?: BuddyMatch; tokensAwarded: number }>(
      `/api/buddies/${matchId}/nominate`,
      { method: "POST" },
    ),

  getMessages: () => apiRequest<BuddyMessage[]>("/api/buddies/messages"),

  sendMessage: (text: string) =>
    apiRequest<{ messages: BuddyMessage[]; tokensAwarded: number }>(
      "/api/buddies/message",
      {
        body: JSON.stringify({ text }),
        method: "POST",
      },
    ),

  endActive: () =>
    apiRequest<void>("/api/buddies/active", { method: "DELETE" }),

  /** A fresh token for the Jitsi room of my active pairing (404 = no pairing,
   * 409 = the buddy's account is unavailable, 503 = video calls are off). Never cache it. */
  joinVideo: () => apiRequest<VideoJoin>("/api/buddies/video/join", { method: "POST" }),
};
