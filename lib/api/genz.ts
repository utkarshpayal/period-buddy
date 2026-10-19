import type { CyclePhase } from "../cycle";
import { apiRequest } from "./client";

export type CountedValue = { value: string; count: number };

export type CycleWrapped = {
  period: "month" | "year";
  label: string;
  fromKey: string;
  toKey: string;
  daysLogged: number;
  daysInRange: number;
  /** 0–100, days logged over days so far in the range. */
  consistency: number;
  longestStreak: number;
  periodsStarted: number;
  periodDays: number;
  avgCycleLength: number | null;
  topMoods: CountedValue[];
  topSymptoms: CountedValue[];
  flowBreakdown: CountedValue[];
  avgSleepHours: number | null;
  avgWaterMl: number | null;
  avgStress: number | null;
  persona: { title: string; emoji: string };
  isEmpty: boolean;
};

export type CycleSyncCategory = "move" | "fuel" | "selfCare" | "vibe";
export type CycleSyncTip = { id?: string; emoji: string; title: string; body: string };
export type PhaseEraInfo = { name: string; emoji: string; tagline: string; aura: [string, string]; statusEmoji: string };

export type PhaseEra = {
  phase: CyclePhase;
  cycleDay: number;
  cycleLength: number;
  daysLeftInPhase: number;
  nextPhase: CyclePhase;
  nextEra: { name: string; emoji: string };
  nextPeriodDaysAway: number;
  isEstimate: boolean;
  era: PhaseEraInfo;
  tips: Record<CycleSyncCategory, CycleSyncTip[]>;
};

export type Badge = {
  key: string;
  emoji: string;
  title: string;
  description: string;
  earned: boolean;
  progress: { current: number; target: number };
};

export type BadgesSummary = {
  streak: { current: number; longest: number; nextMilestone: number | null };
  earnedCount: number;
  badges: Badge[];
};

export const genzApi = {
  /** Month (`value` YYYY-MM) or year (YYYY) recap; defaults to the current one. */
  getWrapped: (period: "month" | "year" = "month", value?: string) => {
    const query = new URLSearchParams({ period, tz: String(new Date().getTimezoneOffset()) });
    if (value) query.set("value", value);
    return apiRequest<{ wrapped: CycleWrapped }>(`/api/genz/wrapped?${query.toString()}`).then((d) => d.wrapped);
  },
  /** Today's phase era + cycle-syncing tips. 404s until cycle settings exist. */
  getEra: () => apiRequest<{ era: PhaseEra; eras: Record<CyclePhase, PhaseEraInfo> }>("/api/genz/era"),
  getBadges: () => apiRequest<BadgesSummary>("/api/genz/badges"),
};

export type CircleReaction = { emoji: string; count: number; mine: boolean };

export type CircleVibe = {
  id: string;
  userId: string;
  name?: string;
  emoji: string;
  text: string;
  phase: CyclePhase | null;
  phaseEmoji: string | null;
  askForSupport: boolean;
  reactions: CircleReaction[];
  isMine: boolean;
  createdAt: string;
};

export type CircleSummary = {
  id: string;
  name: string;
  emoji: string;
  memberCount: number;
  isOwner: boolean;
  latestVibe: { emoji: string; text: string; name: string; createdAt: string } | null;
  updatedAt: string;
  inviteCode?: string;
};

export type CircleMember = {
  userId: string;
  name: string;
  profilePicture: string | null;
  isYou: boolean;
  isOwner: boolean;
  joinedAt: string;
  vibe: CircleVibe | null;
};

export type CircleDetail = CircleSummary & { inviteCode: string; members: CircleMember[]; feed: CircleVibe[] };

export type CircleLimits = {
  maxMembers: number;
  maxCirclesPerUser: number;
  nameMaxLength: number;
  vibeMaxLength: number;
};

export const circlesApi = {
  list: () => apiRequest<{ circles: CircleSummary[]; limits: CircleLimits }>("/api/circles"),
  create: (input: { name: string; emoji?: string }) =>
    apiRequest<{ circle: CircleSummary & { inviteCode: string } }>("/api/circles", { method: "POST", body: JSON.stringify(input) }),
  join: (code: string) =>
    apiRequest<{ circle: CircleSummary; alreadyMember?: boolean }>("/api/circles/join", { method: "POST", body: JSON.stringify({ code }) }),
  get: (id: string) =>
    apiRequest<{ circle: CircleDetail; reactions: string[]; limits: CircleLimits }>(`/api/circles/${id}`),
  resetCode: (id: string) => apiRequest<{ inviteCode: string }>(`/api/circles/${id}/invite-code`, { method: "POST" }),
  /** `userId` "me" leaves; anyone else is removed (owner only). */
  removeMember: (id: string, userId: string | "me") =>
    apiRequest<{ deleted: boolean }>(`/api/circles/${id}/members/${userId}`, { method: "DELETE" }),
  postVibe: (id: string, input: { emoji: string; text?: string; sharePhase?: boolean; askForSupport?: boolean }) =>
    apiRequest<{ vibe: CircleVibe }>(`/api/circles/${id}/vibes`, { method: "POST", body: JSON.stringify(input) }),
  deleteVibe: (id: string, vibeId: string) =>
    apiRequest<{ id: string }>(`/api/circles/${id}/vibes/${vibeId}`, { method: "DELETE" }),
  react: (id: string, vibeId: string, emoji: string) =>
    apiRequest<{ vibe: CircleVibe }>(`/api/circles/${id}/vibes/${vibeId}/react`, { method: "POST", body: JSON.stringify({ emoji }) }),
  hype: (id: string, userId: string) =>
    apiRequest<{ sent: boolean }>(`/api/circles/${id}/hype/${userId}`, { method: "POST" }),
};
