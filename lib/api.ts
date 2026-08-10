import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import type { CyclePhase } from "./cycle";

const LOCAL_DEV_API_PORT = "5000";
const envApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

function getLocalDevApiBaseUrl() {
  const constants = Constants as unknown as {
    expoConfig?: { hostUri?: string };
    manifest?: { debuggerHost?: string };
    manifest2?: {
      extra?: {
        expoClient?: { hostUri?: string };
        expoGo?: { debuggerHost?: string };
      };
    };
  };
  const hostUri =
    constants.expoConfig?.hostUri ??
    constants.manifest2?.extra?.expoClient?.hostUri ??
    constants.manifest2?.extra?.expoGo?.debuggerHost ??
    constants.manifest?.debuggerHost;
  const host = hostUri?.split(":")[0];

  return `http://${host || "localhost"}:${LOCAL_DEV_API_PORT}`;
}

export const API_BASE_URL = (
  envApiBaseUrl || (__DEV__ ? getLocalDevApiBaseUrl() : "https://period-buddy-be.onrender.com")
).replace(/\/+$/, "");
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");
export const AUTH_SESSION_KEY = "period-buddy.auth-session";


type QueryValue = boolean | number | string | null | undefined;

type ApiEnvelope<T> = {
  data?: T;
  error?: string;
  errors?: { field?: string; message?: string }[];
  isProfileComplete?: boolean;
  message?: string;
  pagination?: Pagination;
  questions?: QuestionAnswer[];
  statusCode?: number;
  success?: boolean;
  token?: string;
  user?: AuthUser;
};

type RequestOptions = RequestInit & {
  skipAuth?: boolean;
  /** Abort the request after this many ms (default 20s). Pass 0 to disable. */
  timeoutMs?: number;
};

/** How long a request waits before we give up and surface a timeout error. */
const DEFAULT_TIMEOUT_MS = 20000;

/**
 * Typed error for every failed request so screens can react to *why* it failed
 * (offline vs. server error vs. not-found) instead of string-matching messages.
 */
export type ApiErrorKind = "network" | "timeout" | "server" | "notFound" | "unauthorized" | "unknown";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;

  constructor(message: string, kind: ApiErrorKind, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

/** True when the failure was connectivity-related (offline or timed out). */
export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiError && (err.kind === "network" || err.kind === "timeout");
}

/**
 * A user-friendly message for any thrown error, mapping raw fetch/abort failures
 * to plain language. Use this wherever an error is shown to the user.
 */
export function getFriendlyErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) {
    // Bare fetch network failures land here (thrown before we wrap them).
    if (/network request failed|failed to fetch|network error/i.test(err.message)) {
      return "No internet connection. Please check your network and try again.";
    }
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

export type Pagination = {
  limit: number;
  page: number;
  pages: number;
  total: number;
};

export type AuthUser = {
  _id?: string;
  anonymousCommunityMode?: boolean;
  createdAt?: string;
  country?: string;
  dateOfBirth?: string;
  deletedAt?: string | null;
  email?: string;
  firstName?: string;
  gender?: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
  isProfileComplete?: boolean;
  language?: string;
  lastLogin?: string;
  lastStreakDate?: string;
  lastName?: string;
  notificationsEnabled?: boolean;
  notificationToken?: string;
  /** Client-side only: whether this account is a connected partner "viewer" or the data "owner". Not returned by the auth API — resolved separately from GET /api/partner and cached on the session. */
  partnerRole?: "owner" | "viewer" | null;
  phone?: string;
  profilePicture?: string;
  role?: string;
  streakCount?: number;
  subscriptionExpiry?: string;
  subscriptionPlan?: "basic" | "free" | "premium";
  timezone?: string;
  /** @deprecated use walletBalance */
  tokenEarned?: number;
  updatedAt?: string;
  walletBalance?: number;
};

export type AuthResponse = ApiEnvelope<AuthUser>;

export type DashboardSummary = {
  activeHabits: number;
  forestHealth: number;
  predictions?: Pick<
    Predictions,
    "currentCycleDay" | "currentPhase" | "nextPeriodDate" | "nextPeriodDaysAway"
  >;
  recentLogs: DayEntry[];
  tokens: number;
  trackedDays: number;
  user: AuthUser;
};

export type MoodValue =
  | "anxious"
  | "calm"
  | "emotional"
  | "energetic"
  | "happy"
  | "irritable"
  | "neutral"
  | "sad"
  | "tired";

export type DayEntry = {
  _id?: string;
  cycleDay?: number;
  date?: string;
  dateKey: string;
  digestion?: "bloated" | "constipated" | "diarrhea" | "normal";
  // Multi-select counterparts for fields that can genuinely co-occur in a day
  // (e.g. bloated *and* constipated, acne *and* oily, several moods). Sent
  // additively alongside the scalar field — the scalar stays the primary/first
  // value for backward-compat, and the backend can adopt these arrays without
  // breaking existing clients. Prefer these in new UI.
  digestions?: ("bloated" | "constipated" | "diarrhea" | "normal")[];
  discharge?: "creamy" | "egg-white" | "none" | "sticky" | "watery";
  energy?: "high" | "low" | "medium" | "steady";
  exercise?: string[];
  flow?: "heavy" | "light" | "medium" | "none" | "spotting";
  isIntimate?: boolean;
  medication?: string[];
  mood?: MoodValue;
  moods?: MoodValue[];
  note?: string;
  phase?: CyclePhase | string;
  rewardPoints?: number;
  skin?: "acne" | "clear" | "dry" | "oily";
  skins?: ("acne" | "clear" | "dry" | "oily")[];
  sleepHours?: number;
  stressLevel?: number;
  symptoms?: string[];
  temperature?: number;
  /** @deprecated use rewardPoints */
  tokensEarned?: number;
  waterIntake?: number;
  weight?: number;
};

export type CycleSettings = {
  _id?: string;
  cycleLength: number;
  fertilityReminder?: boolean;
  lastPeriodStartDate: string;
  ovulationReminder?: boolean;
  periodLength: number;
  pregnancyMode?: boolean;
  reminderDaysBefore?: number;
  remindersEnabled?: boolean;
  trackingGoal?: "achieve_pregnancy" | "avoid_pregnancy" | "general_health" | "manage_symptoms" | "track_period";
};

export type Predictions = {
  analyticsData: { daysLogged?: number; length: number; month: string }[];
  currentCycleDay: number;
  currentPhase: string;
  fertileWindowDuration: string;
  fertileWindowRange: string;
  isDataHighlyAccurate: boolean;
  nextPeriodDate: string;
  nextPeriodDateISO: string;
  nextPeriodDateKey?: string;
  nextPeriodDaysAway: number;
  ovulationDate: string;
  ovulationDateISO?: string;
  ovulationDaysAway: number;
  periodLength: number;
  cycleLength: number;
};

export type CycleStats = {
  analyticsData?: { daysLogged?: number; length: number; month: string }[];
  periodDays?: number;
  topSymptoms: { count: number; symptom: string }[];
  totalDaysLogged: number;
  totalTokens: number;
};

export type Habit = {
  _id?: string;
  color: string;
  completed: boolean;
  frequency?: "custom" | "daily" | "weekly";
  icon: string;
  id: string;
  reminderTime?: string;
  rewardPoints?: number;
  streak: number;
  target?: number;
  title: string;
  /** @deprecated use rewardPoints */
  tokens: number;
};

export type ForestTree = {
  health: number;
  month: string;
  status: "dead" | "healthy" | "wilted" | string;
};

export type ForestStatus = {
  activeHabits: number;
  averageHealth: number;
  careActions: number;
  currentHealth: number;
  forestTier: string;
  healthyTreeCount: number;
  todayCareLogged: boolean;
  tokens: number;
  trackedDays: number;
  trees: ForestTree[];
};

export type ForestLog = {
  _id: string;
  careType: "habit_completion" | "manual" | "reflection" | "symptom_log" | "water";
  completed?: boolean;
  dateKey: string;
  duration?: number;
  healthDelta: number;
  note?: string;
  rewardPoints?: number;
  treeType?: string;
};

export type Doctor = {
  _id: string;
  avatarEmoji?: string;
  /** @deprecated use DoctorAvailability */
  availability?: string;
  bio?: string;
  currency: string;
  education?: string[];
  experience?: string;
  firstName?: string;
  hospital?: string;
  isAvailable: boolean;
  languages?: string[];
  lastName?: string;
  licenses?: string[];
  name?: string;
  pricePerSession: number;
  rating: number;
  specialty: string;
  totalConsultations?: number;
};

export type ConsultationMessage = {
  _id?: string;
  sender: "doctor" | "user";
  sentAt?: string;
  text: string;
};

export type Consultation = {
  _id: string;
  amountPaid: number;
  completedAt?: string;
  createdAt?: string;
  currency: string;
  doctorId: Doctor | string;
  feedback?: string;
  meetingLink?: string;
  messages: ConsultationMessage[];
  paymentStatus?: "failed" | "paid" | "refunded" | "unpaid";
  prescription?: string;
  scheduledFor?: string | null;
  startedAt?: string;
  status: "active" | "cancelled" | "completed" | "paid" | "pending";
};

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

export type DoctorAvailabilityRange = {
  startTime: string;
  endTime: string;
  maxSlots?: number;
  timezone?: string;
};

export type DoctorAvailabilityDay = {
  dayOfWeek: number;
  day: string;
  slots: DoctorAvailabilityRange[];
};

export type DoctorAvailability = {
  doctorId: string;
  isAvailable: boolean;
  days: DoctorAvailabilityDay[];
};

export type ConsultationOrder = {
  // Present when a paid/active session already exists for this doctor — the
  // backend short-circuits order creation rather than double-charging, and
  // the caller should open this consultation directly instead of paying.
  consultation?: Consultation;
  consultationId?: string;
  orderId?: string;
  amount?: number;
  currency?: string;
  keyId?: string;
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

export type CommunityComment = {
  _id?: string;
  attachments?: CommunityAttachment[];
  content: string;
  createdAt?: string;
  id?: string;
  isAnonymous?: boolean;
  likes?: number;
  userId?: string | (Pick<AuthUser, "firstName" | "lastName" | "profilePicture"> & { isOwn?: boolean });
};

export type CommunityAttachment = {
  key?: string;
  type: "audio" | "image" | "video";
  url: string;
};

export type CommunityPost = {
  _id: string;
  attachments?: CommunityAttachment[];
  category?: string;
  commentCount?: number;
  comments?: CommunityComment[];
  /** @deprecated use commentCount */
  commentsCount: number;
  content: string;
  createdAt?: string;
  id: string;
  isAnonymous?: boolean;
  likeCount?: number;
  likedByMe?: boolean;
  /** @deprecated use likeCount */
  likes: number;
  reportCount?: number;
  savedByMe?: boolean;
  status?: "active" | "flagged" | "removed";
  tags?: string[];
  title?: string;
  userId?: string | (Pick<AuthUser, "firstName" | "lastName" | "profilePicture"> & { isOwn?: boolean });
};

export type BlogCategory = "general" | "health" | "lifestyle" | "beauty";
export type BlogStatus = "draft" | "published" | "archived";

export type Blog = {
  _id: string;
  author?: string;
  authorId?: string;
  canonicalUrl?: string;
  category?: BlogCategory;
  content?: string;
  coverImageUrl?: string;
  excerpt?: string;
  isPublished: boolean;
  /** @deprecated use likeCount */
  likesCount: number;
  likeCount?: number;
  publishedAt?: string;
  readTimeMinutes?: number;
  seoDescription?: string;
  seoTitle?: string;
  slug: string;
  status: BlogStatus;
  tags?: string[];
  title: string;
  /** @deprecated use viewCount */
  viewsCount: number;
  viewCount?: number;
};

export type ContentFeedItem = {
  author: string;
  category?: BlogCategory;
  id: string;
  imageUrl: string;
  likeCount?: number;
  publishedAt?: string;
  readTimeMinutes?: number;
  slug?: string;
  sourceId: string;
  summary: string;
  tags?: string[];
  time: string;
  title: string;
  type: "blog" | "reel";
  verified: boolean;
  viewCount?: number;
};

export type ReelPollOption = {
  optionId: string;
  topic: string;
  votes: number;
};

export type Reel = {
  _id?: string;
  category: string;
  commentCount?: number;
  /** @deprecated */
  creatorAvatar?: string;
  creatorId: string;
  /** @deprecated */
  creatorName: string;
  directMp4Url: string;
  duration: string;
  followedByMe?: boolean;
  id: string;
  likeCount?: number;
  pollOptions: ReelPollOption[];
  pollQuestion?: string;
  saveCount?: number;
  shareCount?: number;
  thumbnailUrl: string;
  title: string;
  verified: boolean;
  /** @deprecated use likeCount */
  views: number;
  viewCount?: number;
  votedOptionId?: string | null;
  watchTime?: number;
};

export type HealthIssue = {
  _id?: string;
  category: string;
  causes?: string[];
  color: string;
  guide: string;
  icon: string;
  id?: string;
  imageUrl?: string;
  order?: number;
  prevention?: string;
  summary: string;
  symptoms?: string[];
  title: string;
  treatment?: string;
  whenToSeeDoctor?: string;
};

export type WellbeingResource = {
  _id?: string;
  audioUrl?: string;
  color: string;
  estimatedReadTime?: number;
  extendedGuide: string[];
  icon: string;
  id?: string;
  items: number;
  order?: number;
  summary: string;
  title: string;
  type: "hygiene" | "sexual_wellbeing";
  videoUrl?: string;
};

export type WellbeingGameDeck = {
  cards: unknown[];
  deck: "positions" | "spark" | string;
};

export type QuestionAnswer = {
  _id: string;
  answer: string;
  category?: string;
  keywords?: string[];
  likeCount?: number;
  medicallyReviewed?: boolean;
  question: string;
  reviewedBy?: string;
  shortAnswer?: string;
  slug?: string;
  tags?: string[];
  version?: number;
  viewCount?: number;
  /** @deprecated use viewCount */
  views?: number;
};

export type AskQuestionResponse = {
  answer: string;
  disclaimer?: string;
  matchedQuestion?: QuestionAnswer;
  personalized?: boolean;
  question: string;
  suggestedQuestions?: string[];
  source: "ai" | "ai_personalized" | "knowledge_base" | string;
  tokensAwarded?: number;
};

export type RewardTransaction = {
  _id: string;
  amount: number;
  balanceAfter: number;
  createdAt?: string;
  description?: string;
  referenceId?: string;
  referenceModel?: string;
  type:
    | "adjustment"
    | "buddy_message"
    | "community_like"
    | "community_post"
    | "content_read"
    | "cycle_log"
    | "forest_care"
    | "habit_complete"
    | "purchase"
    | "qa_ask"
    | "redemption"
    | "referral"
    | "reel_vote"
    | "streak_bonus";
  userId: string;
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

// Registered by AuthProvider so a 401 from any endpoint (expired/invalid token,
// deactivated account) clears the local session instead of failing silently.
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function getToken(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as { token?: string };
    return session?.token ?? null;
  } catch {
    return null;
  }
}

export async function getWebSocketUrl(): Promise<string> {
  const token = await getToken();
  return `${WS_BASE_URL}${token ? `?token=${token}` : ""}`;
}


function getErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const errorData = data as {
      error?: unknown;
      errors?: unknown;
      message?: unknown;
    };

    // Prefer the detailed per-field messages (e.g. Mongoose validation errors)
    // over the generic top-level `message` ("Validation Error"), which would
    // otherwise always win and hide the actually useful text.
    if (Array.isArray(errorData.errors) && errorData.errors.length > 0) {
      return errorData.errors
        .map((error) =>
          typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : String(error),
        )
        .join("\n");
    }

    if (typeof errorData.message === "string") return errorData.message;
    if (typeof errorData.error === "string") return errorData.error;
  }

  return `Request failed (${status})`;
}

function toQuery(params?: Record<string, QueryValue>) {
  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function apiEnvelopeRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiEnvelope<T>> {
  if (!API_BASE_URL) {
    throw new Error(
      "Missing EXPO_PUBLIC_API_BASE_URL. Set it in .env or eas.json before building the app.",
    );
  }

  const token = options.skipAuth ? null : await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  // Time out the request so a dropped/slow connection surfaces a clear error
  // instead of hanging the screen's loading state forever.
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer =
    timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  // Respect a caller-provided AbortSignal alongside our timeout one.
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
  } catch {
    // fetch only rejects on network failure or abort — never on HTTP status.
    if (controller.signal.aborted && !callerSignal?.aborted) {
      throw new ApiError(
        "The request timed out. Please check your connection and try again.",
        "timeout",
      );
    }
    throw new ApiError(
      "No internet connection. Please check your network and try again.",
      "network",
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  const text = await response.text();
  let data: unknown = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (!response.ok) {
      throw new ApiError(
        text || `Request failed (${response.status})`,
        response.status >= 500 ? "server" : "unknown",
        response.status,
      );
    }

    throw new ApiError("The API returned a response the app could not read.", "unknown");
  }

  if (!response.ok) {
    if (response.status === 401 && !options.skipAuth) {
      onUnauthorized?.();
    }
    const kind: ApiErrorKind =
      response.status === 401
        ? "unauthorized"
        : response.status === 404
          ? "notFound"
          : response.status >= 500
            ? "server"
            : "unknown";
    throw new ApiError(getErrorMessage(data, response.status), kind, response.status);
  }

  return data as ApiEnvelope<T>;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const envelope = await apiEnvelopeRequest<T>(path, options);
  return (envelope.data !== undefined ? envelope.data : envelope) as T;
}

export const healthApi = {
  check: () =>
    apiRequest<{
      environment: string;
      message: string;
      timestamp: string;
      version: string;
    }>("/health", { skipAuth: true }),
};

export const authApi = {
  login: (payload: { email: string; password: string }) =>
    apiEnvelopeRequest<AuthUser>("/api/auth/login", {
      body: JSON.stringify(payload),
      method: "POST",
      skipAuth: true,
    }),

  signup: (payload: {
    agreedToPrivacyPolicy?: boolean;
    dateOfBirth?: string;
    email: string;
    firstName: string;
    gender?: string;
    lastName: string;
    password: string;
    phone?: string;
    role?: string;
  }) =>
    apiEnvelopeRequest<{ email: string; expiresInMinutes: number }>(
      "/api/auth/signup",
      {
        body: JSON.stringify(payload),
        method: "POST",
        skipAuth: true,
      },
    ),

  verifyOtp: (payload: { email: string; otp: string }) =>
    apiEnvelopeRequest<AuthUser>("/api/auth/verify-otp", {
      body: JSON.stringify(payload),
      method: "POST",
      skipAuth: true,
    }),

  resendOtp: (payload: { email: string }) =>
    apiEnvelopeRequest<{ email: string; expiresInMinutes: number }>(
      "/api/auth/resend-otp",
      {
        body: JSON.stringify(payload),
        method: "POST",
        skipAuth: true,
      },
    ),

  googleAuth: (payload: { idToken: string; role?: string }) =>
    apiEnvelopeRequest<AuthUser>("/api/auth/google", {
      body: JSON.stringify(payload),
      method: "POST",
      skipAuth: true,
    }),

  submitOnboarding: (payload: {
    dateOfBirth: string;
    gender: string;
    phone: string;
    profilePicture: string;
  }) =>
    apiRequest<AuthUser>("/api/auth/onboarding", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  getProfile: () => apiRequest<AuthUser>("/api/auth/profile"),

  updateFcmToken: (token: string) =>
    apiEnvelopeRequest<{ notificationToken: string }>("/api/auth/fcm-token", {
      body: JSON.stringify({ token }),
      method: "POST",
    }),

  updateProfile: (payload: Partial<AuthUser>) =>
    apiRequest<AuthUser>("/api/auth/profile", {
      body: JSON.stringify(payload),
      method: "PUT",
    }),

  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    apiRequest<null>("/api/auth/change-password", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  logout: () => apiRequest<null>("/api/auth/logout", { method: "POST" }),

  logoutAlias: () => apiRequest<null>("/api/logout", { method: "POST" }),

  deleteAccount: (password: string) =>
    apiRequest<null>("/api/auth/delete-account", {
      body: JSON.stringify({ password }),
      method: "DELETE",
    }),

  getDashboard: () => apiRequest<DashboardSummary>("/api/auth/dashboard"),
};

export const cycleApi = {
  saveSettings: (payload: Partial<CycleSettings>) =>
    apiRequest<CycleSettings>("/api/cycle/settings", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  getSettings: () => apiRequest<CycleSettings | null>("/api/cycle/settings"),

  getPredictions: () => apiRequest<Predictions>("/api/cycle/predictions"),

  getSymptomPredictions: () =>
    apiRequest<SymptomPredictionsResponse>("/api/cycle/symptom-predictions"),

  saveLog: (payload: Omit<DayEntry, "cycleDay" | "phase" | "tokensEarned">) =>
    apiRequest<{ cycleLog: DayEntry; tokensEarned: number }>("/api/cycle/log", {
      // Send the client's timezone offset so the backend anchors the tracking
      // streak to the user's *local* "today", not server UTC (avoids near-
      // midnight off-by-one for users far from UTC).
      body: JSON.stringify({
        ...payload,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      }),
      method: "POST",
    }),

  getMonthLogs: (month?: string) =>
    apiRequest<DayEntry[]>(`/api/cycle/logs${toQuery({ month })}`),

  getDayLog: (dateKey: string) =>
    apiRequest<DayEntry | null>(`/api/cycle/log/${dateKey}`),

  getStats: () => apiRequest<CycleStats>("/api/cycle/stats"),
};

export const habitsApi = {
  getHabits: () => apiRequest<Habit[]>("/api/habits"),

  createHabit: (payload: {
    color?: string;
    icon?: string;
    title: string;
    tokens?: number;
  }) =>
    apiRequest<Habit>("/api/habits", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  toggleHabit: (id: string) =>
    apiRequest<{
      completed: boolean;
      id: string;
      streak: number;
      tokensAwarded: number;
    }>(`/api/habits/${id}/toggle`, { method: "PATCH" }),

  deleteHabit: (id: string) =>
    apiRequest<void>(`/api/habits/${id}`, { method: "DELETE" }),
};

export const forestApi = {
  getStatus: () => apiRequest<ForestStatus>("/api/forest/status"),

  logCare: (payload: {
    careType?: ForestLog["careType"];
    dateKey: string;
    note?: string;
  }) =>
    apiRequest<{
      log: ForestLog;
      status: ForestStatus;
      tokensEarned: number;
    }>("/api/forest/care", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  getLogs: (params?: { limit?: number; month?: string; page?: number }) =>
    apiRequest<{ logs: ForestLog[]; pagination: Pagination }>(
      `/api/forest/logs${toQuery(params)}`,
    ),
};

export const consultationApi = {
  getDoctors: (search?: string) =>
    apiRequest<Doctor[]>(
      `/api/consultation/doctors${toQuery({ search })}`,
    ),

  getDoctorAvailability: (doctorId: string) =>
    apiRequest<DoctorAvailability>(
      `/api/consultation/doctors/${doctorId}/availability`,
    ),

  createOrder: (doctorId: string, scheduledFor?: string) =>
    apiRequest<ConsultationOrder>("/api/consultation/order", {
      body: JSON.stringify({ doctorId, scheduledFor }),
      method: "POST",
    }),

  verifyPayment: (payload: {
    consultationId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) =>
    apiRequest<Consultation>("/api/consultation/verify", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  getMyConsultations: () => apiRequest<Consultation[]>("/api/consultation/my"),

  getMessages: (consultationId: string) =>
    apiRequest<ConsultationMessage[]>(
      `/api/consultation/${consultationId}/messages`,
    ),

  sendMessage: (consultationId: string, text: string) =>
    apiRequest<ConsultationMessage[]>(
      `/api/consultation/${consultationId}/message`,
      {
        body: JSON.stringify({ text }),
        method: "POST",
      },
    ),

  completeConsultation: (consultationId: string) =>
    apiRequest<Consultation>(`/api/consultation/${consultationId}/complete`, {
      method: "PATCH",
    }),

  cancelConsultation: (consultationId: string) =>
    apiRequest<Consultation>(`/api/consultation/${consultationId}/cancel`, {
      method: "PATCH",
    }),
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

  getNotifications: () => apiRequest<AppNotification[]>("/api/partner/notifications"),

  markNotificationAsRead: (id: string) =>
    apiRequest<AppNotification>(`/api/partner/notifications/${id}/read`, {
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
};

export const nominationsApi = {
  getSent: () => apiRequest<Nomination[]>("/api/nominations"),

  getIncoming: () => apiRequest<Nomination[]>("/api/nominations/incoming"),

  nominate: (payload: {
    message?: string;
    nomineeEmail: string;
    nomineeName?: string;
  }) =>
    apiRequest<Nomination>("/api/nominations", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  respond: (id: string, status: "accepted" | "declined") =>
    apiRequest<Nomination>(`/api/nominations/${id}/respond`, {
      body: JSON.stringify({ status }),
      method: "PATCH",
    }),
};

export const communityApi = {
  getPosts: (params?: {
    category?: string;
    limit?: number;
    page?: number;
    search?: string;
  }) =>
    apiRequest<{ pagination: Pagination; posts: CommunityPost[] }>(
      `/api/community${toQuery(params)}`,
    ),

  createPost: (payload: {
    attachments?: CommunityAttachment[];
    category?: string;
    content: string;
    isAnonymous?: boolean;
    tags?: string[];
    title?: string;
  }) =>
    apiRequest<CommunityPost>("/api/community", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  getPostById: (id: string) => apiRequest<CommunityPost>(`/api/community/${id}`),

  toggleLike: (id: string) =>
    apiRequest<{ likedByMe: boolean; likes: number }>(`/api/community/${id}/like`, {
      method: "POST",
    }),

  toggleSave: (id: string) =>
    apiRequest<{ savedByMe: boolean; tokensAwarded?: number }>(
      `/api/community/${id}/save`,
      { method: "POST" },
    ),

  report: (id: string, reason: string) =>
    apiRequest<void>(`/api/community/${id}/report`, {
      body: JSON.stringify({ reason }),
      method: "POST",
    }),

  addComment: (
    id: string,
    content: string,
    isAnonymous = true,
    attachments?: CommunityAttachment[],
  ) =>
    apiRequest<{ comment: CommunityComment; commentsCount: number }>(
      `/api/community/${id}/comment`,
      {
        body: JSON.stringify({ content, isAnonymous, attachments }),
        method: "POST",
      },
    ),

  deletePost: (id: string) =>
    apiRequest<void>(`/api/community/${id}`, { method: "DELETE" }),

  deleteComment: (postId: string, commentId: string) =>
    apiRequest<{ commentsCount: number }>(
      `/api/community/${postId}/comment/${commentId}`,
      { method: "DELETE" },
    ),
};

export const blogsApi = {
  getBlogs: (params?: {
    category?: string;
    limit?: number;
    page?: number;
    search?: string;
    tag?: string;
  }) =>
    apiRequest<{ blogs: Blog[]; pagination: Pagination }>(
      `/api/blogs${toQuery(params)}`,
    ),

  getFeed: (params?: {
    category?: BlogCategory;
    limit?: number;
    page?: number;
    search?: string;
    tag?: string;
    type?: "all" | "blog" | "reel";
  }) =>
    apiRequest<{ items: ContentFeedItem[]; pagination: Pagination }>(
      `/api/blogs/feed${toQuery(params)}`,
    ),

  getBlogBySlug: (slug: string) => apiRequest<Blog>(`/api/blogs/${slug}`),

  likeBlog: (id: string) =>
    apiRequest<{ likesCount: number }>(`/api/blogs/${id}/like`, {
      method: "PATCH",
    }),

  translateBlog: (slug: string, language: LanguageCode) =>
    apiRequest<{ content: string; language: LanguageCode; title: string }>(
      `/api/blogs/${slug}/translate`,
      { body: JSON.stringify({ language }), method: "POST" },
    ),

  toggleBookmark: (id: string) =>
    apiRequest<{ bookmarked: boolean }>(`/api/blogs/${id}/bookmark`, {
      method: "POST",
    }),

  getBookmarks: () => apiRequest<{ blogs: Blog[] }>("/api/blogs/bookmarks"),

  /**
   * Reports how long the reader actually had the article open, so the
   * backend can count a genuine view (and refine its read-time average)
   * instead of incrementing on every fetch regardless of dwell time.
   */
  trackView: (id: string, durationSeconds: number) =>
    apiRequest<{ counted: boolean; readTimeMinutes?: number; viewCount?: number }>(
      `/api/blogs/${id}/track-view`,
      { body: JSON.stringify({ durationSeconds }), method: "POST" },
    ),

  createBlog: (payload: Partial<Blog>) =>
    apiRequest<Blog>("/api/blogs", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  updateBlog: (id: string, payload: Partial<Blog>) =>
    apiRequest<Blog>(`/api/blogs/${id}`, {
      body: JSON.stringify(payload),
      method: "PUT",
    }),

  deleteBlog: (id: string) =>
    apiRequest<void>(`/api/blogs/${id}`, { method: "DELETE" }),
};

export const reelsApi = {
  getReels: (params?: {
    category?: string;
    limit?: number;
    page?: number;
    search?: string;
  }) =>
    apiRequest<{ pagination: Pagination; reels: Reel[] }>(
      `/api/reels${toQuery(params)}`,
    ),

  getReelById: (id: string) => apiRequest<Reel>(`/api/reels/${id}`),

  recordView: (id: string) =>
    apiRequest<{ views: number }>(`/api/reels/${id}/view`, {
      method: "PATCH",
    }),

  toggleFollowCreator: (id: string) =>
    apiRequest<{ followedByMe: boolean; tokensAwarded?: number }>(
      `/api/reels/${id}/follow`,
      { method: "PATCH" },
    ),

  votePoll: (id: string, optionId: string) =>
    apiRequest<{ pollOptions: ReelPollOption[]; tokensAwarded: number }>(
      `/api/reels/${id}/vote`,
      {
        body: JSON.stringify({ optionId }),
        method: "POST",
      },
    ),

  createReel: (payload: Partial<Reel>) =>
    apiRequest<Reel>("/api/reels", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  updateReel: (id: string, payload: Partial<Reel>) =>
    apiRequest<Reel>(`/api/reels/${id}`, {
      body: JSON.stringify(payload),
      method: "PUT",
    }),

  deleteReel: (id: string) =>
    apiRequest<void>(`/api/reels/${id}`, { method: "DELETE" }),
};

export const healthIssuesApi = {
  getIssues: () => apiRequest<HealthIssue[]>("/api/health-issues"),

  getIssueById: (id: string) =>
    apiRequest<HealthIssue>(`/api/health-issues/${id}`),

  createIssue: (payload: Partial<HealthIssue>) =>
    apiRequest<HealthIssue>("/api/health-issues", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  updateIssue: (id: string, payload: Partial<HealthIssue>) =>
    apiRequest<HealthIssue>(`/api/health-issues/${id}`, {
      body: JSON.stringify(payload),
      method: "PUT",
    }),

  deleteIssue: (id: string) =>
    apiRequest<void>(`/api/health-issues/${id}`, { method: "DELETE" }),
};

export const wellbeingApi = {
  getResources: (type?: WellbeingResource["type"]) =>
    apiRequest<WellbeingResource[]>(`/api/wellbeing${toQuery({ type })}`),

  getResourceById: (id: string) =>
    apiRequest<WellbeingResource>(`/api/wellbeing/${id}`),

  /**
   * Reports how long the reader actually had the resource open, so the
   * backend can refine its read-time average instead of relying on a static
   * admin estimate.
   */
  trackView: (id: string, durationSeconds: number) =>
    apiRequest<{ counted: boolean; estimatedReadTime?: number }>(
      `/api/wellbeing/${id}/track-view`,
      { body: JSON.stringify({ durationSeconds }), method: "POST" },
    ),

  getGameDecks: (deck?: "positions" | "spark") =>
    apiRequest<WellbeingGameDeck>(`/api/wellbeing/games${toQuery({ deck })}`),

  drawGameCard: (deck: "positions" | "spark", index: number) =>
    apiRequest<{
      card: unknown;
      deck: string;
      index: number;
      tokensAwarded: number;
    }>(`/api/wellbeing/games/${deck}/draw`, {
      body: JSON.stringify({ index }),
      method: "POST",
    }),

  createResource: (payload: Partial<WellbeingResource>) =>
    apiRequest<WellbeingResource>("/api/wellbeing", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  updateResource: (id: string, payload: Partial<WellbeingResource>) =>
    apiRequest<WellbeingResource>(`/api/wellbeing/${id}`, {
      body: JSON.stringify(payload),
      method: "PUT",
    }),

  deleteResource: (id: string) =>
    apiRequest<void>(`/api/wellbeing/${id}`, { method: "DELETE" }),
};

export const questionAnswerApi = {
  getQuestions: (params?: { limit?: number; page?: number; search?: string }) =>
    apiEnvelopeRequest<QuestionAnswer[]>(`/api/questions${toQuery(params)}`, {
      skipAuth: true,
    }),

  ask: (question: string, language?: LanguageCode) =>
    apiRequest<AskQuestionResponse>("/api/questions/ask", {
      body: JSON.stringify({ question, language }),
      method: "POST",
    }),

  getQuestionById: (idOrSlug: string) =>
    apiRequest<QuestionAnswer>(`/api/questions/${idOrSlug}`, {
      skipAuth: true,
    }),

  createQuestion: (payload: Partial<QuestionAnswer>) =>
    apiRequest<QuestionAnswer>("/api/questions", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  updateQuestion: (id: string, payload: Partial<QuestionAnswer>) =>
    apiRequest<QuestionAnswer>(`/api/questions/${id}`, {
      body: JSON.stringify(payload),
      method: "PUT",
    }),

  deleteQuestion: (id: string) =>
    apiRequest<void>(`/api/questions/${id}`, { method: "DELETE" }),
};

export type VoiceAgentPendingAction = {
  action: "log_cycle_entry";
  payload: Partial<DayEntry>;
};

export type VoiceAgentReply =
  | { type: "answer"; text: string }
  | ({ type: "action_proposal"; followUpQuestion?: string } & VoiceAgentPendingAction)
  | ({ type: "action_confirm"; confirmationText: string } & VoiceAgentPendingAction)
  | ({
      type: "action_result";
      action: "log_cycle_entry";
      text: string;
      cycleLog: DayEntry;
      tokensEarned: number;
    });

export const voiceAgentApi = {
  converse: (
    transcript: string,
    language?: LanguageCode,
    pendingAction?: VoiceAgentPendingAction,
    confirmed?: boolean,
  ) =>
    apiRequest<VoiceAgentReply>("/api/voice-agent/converse", {
      body: JSON.stringify({ transcript, language, pendingAction, confirmed }),
      method: "POST",
    }),
};

export const uploadApi = {
  /**
   * Uploads a local file (e.g. an `expo-image-picker`, video, or audio
   * recording result URI) to the backend, which stores it in S3 and returns
   * its public URL. Pass `mimeType` explicitly for video/audio assets since
   * their extension can't be reliably guessed the way image ones can.
   */
  uploadMedia: async (localUri: string, folder = "profile-pictures", mimeType?: string) => {
    const token = await getToken();
    if (!token) throw new Error("You must be signed in to upload a file.");

    const fileName = localUri.split("/").pop()?.split("?")[0] || "upload";
    const extensionMatch = /\.(\w+)$/.exec(fileName);
    const extension = extensionMatch?.[1]?.toLowerCase();
    const resolvedMimeType =
      mimeType || (extension === "png" ? "image/png" : "image/jpeg");

    const formData = new FormData();
    formData.append("folder", folder);

    if (Platform.OS === "web") {
      // On web, FormData needs a real Blob/File — the RN {uri,name,type}
      // shape below gets silently stringified to "[object Object]" instead
      // of becoming a file part.
      const blob = await (await fetch(localUri)).blob();
      formData.append("file", blob, fileName);
    } else {
      formData.append("file", {
        uri: localUri,
        name: fileName,
        type: resolvedMimeType,
      } as unknown as Blob);
    }

    const response = await fetch(`${API_BASE_URL}/api/upload`, {
      body: formData,
      headers: { Authorization: `Bearer ${token}` },
      method: "POST",
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new Error(getErrorMessage(data, response.status));
    }

    return data.data as { key: string; url: string };
  },

  /** @deprecated use uploadMedia */
  uploadImage: async (localUri: string, folder = "profile-pictures") =>
    uploadApi.uploadMedia(localUri, folder),
};

export type DocType = "bill" | "lab_report" | "other" | "prescription" | "scan";

export type MedicalDocument = {
  _id: string;
  createdAt: string;
  docType: DocType;
  documentDate: string;
  extractionStatus?: "done" | "failed" | "limited" | "pending";
  fileKey: string;
  fileSize?: number;
  fileUrl: string;
  mimeType: string;
  originalFileName?: string;
  title: string;
  updatedAt: string;
  userId: string;
};

export type DocumentChatMessage = {
  _id: string;
  createdAt: string;
  role: "assistant" | "user";
  text: string;
  userId: string;
};

export const documentApi = {
  /**
   * Uploads a medical document (PDF or image) straight to /api/documents,
   * which stores the file in S3, runs text extraction, and creates the
   * record in one round trip.
   */
  upload: async (params: {
    docType: DocType;
    documentDate: string;
    fileName: string;
    localUri: string;
    mimeType: string;
    title: string;
  }) => {
    const token = await getToken();
    if (!token) throw new Error("You must be signed in to upload a document.");

    const formData = new FormData();
    formData.append("title", params.title);
    formData.append("docType", params.docType);
    formData.append("documentDate", params.documentDate);

    if (Platform.OS === "web") {
      const blob = await (await fetch(params.localUri)).blob();
      formData.append("file", blob, params.fileName);
    } else {
      formData.append("file", {
        uri: params.localUri,
        name: params.fileName,
        type: params.mimeType,
      } as unknown as Blob);
    }

    const response = await fetch(`${API_BASE_URL}/api/documents`, {
      body: formData,
      headers: { Authorization: `Bearer ${token}` },
      method: "POST",
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new Error(getErrorMessage(data, response.status));
    }

    return data.data.document as MedicalDocument;
  },

  list: (params?: { docType?: DocType; limit?: number; page?: number; sort?: "asc" | "desc" }) =>
    apiRequest<{ documents: MedicalDocument[]; pagination: Pagination }>(
      `/api/documents${toQuery(params)}`,
    ),

  remove: (id: string) =>
    apiRequest<void>(`/api/documents/${id}`, { method: "DELETE" }),

  /** Re-runs text extraction for a document stuck at "pending"/"failed"/"limited". */
  retryExtraction: (id: string) =>
    apiRequest<{ document: MedicalDocument }>(`/api/documents/${id}/retry-extraction`, {
      method: "POST",
    }),

  summarize: (payload: { endDate: string; language?: LanguageCode; startDate: string }) =>
    apiRequest<{
      documentCount: number;
      documents: { docType: DocType; documentDate: string; id: string; title: string }[];
      summary: string;
    }>("/api/documents/summarize", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  getChatHistory: () =>
    apiRequest<{ messages: DocumentChatMessage[] }>("/api/documents/chat"),

  sendChatMessage: (message: string, language?: LanguageCode) =>
    apiRequest<{ assistantMessage: DocumentChatMessage; userMessage: DocumentChatMessage }>(
      "/api/documents/chat",
      {
        body: JSON.stringify({ message, language }),
        method: "POST",
      },
    ),
};

export type LanguageCode =
  | "en-IN"
  | "hi-IN"
  | "bn-IN"
  | "gu-IN"
  | "kn-IN"
  | "ml-IN"
  | "mr-IN"
  | "od-IN"
  | "pa-IN"
  | "ta-IN"
  | "te-IN";

export type Language = { code: LanguageCode; label: string };

export const speechApi = {
  getLanguages: () => apiRequest<{ languages: Language[] }>("/api/speech/languages"),

  /**
   * Uploads a short recorded voice clip and returns its transcript, so the
   * caller can drop the text straight into a chat input.
   */
  transcribe: async (localUri: string, languageCode?: LanguageCode) => {
    const token = await getToken();
    if (!token) throw new Error("You must be signed in to use voice input.");

    const fileName = localUri.split("/").pop()?.split("?")[0] || "recording.m4a";
    const formData = new FormData();
    if (languageCode) formData.append("languageCode", languageCode);

    if (Platform.OS === "web") {
      const blob = await (await fetch(localUri)).blob();
      formData.append("file", blob, fileName);
    } else {
      formData.append("file", {
        uri: localUri,
        name: fileName,
        type: "audio/m4a",
      } as unknown as Blob);
    }

    const response = await fetch(`${API_BASE_URL}/api/speech/transcribe`, {
      body: formData,
      headers: { Authorization: `Bearer ${token}` },
      method: "POST",
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new Error(getErrorMessage(data, response.status));
    }

    return data.data as { languageCode: string | null; languageProbability: number | null; transcript: string };
  },

  /** Converts text to speech, returning base64-encoded audio ready to play. */
  synthesize: (payload: { languageCode?: LanguageCode; pace?: number; text: string }) =>
    apiRequest<{ audioBase64: string; audioCodec: string }>("/api/speech/synthesize", {
      body: JSON.stringify(payload),
      method: "POST",
    }),
};

export const profileApi = {
  getProfile: authApi.getProfile,
  updateProfile: authApi.updateProfile,
};

export type ReportCountItem = { label: string; value: number };
export type ReportTrendPoint = { dateKey: string; value: number };

export type HealthReportCycleStats = {
  averages: { sleepHours: number | null; stressLevel: number | null; waterIntake: number | null };
  daysLogged: number;
  flowCounts: ReportCountItem[];
  moodCounts: ReportCountItem[];
  periodDays: number;
  symptomCounts: ReportCountItem[];
  trends: {
    sleepHours: ReportTrendPoint[];
    stressLevel: ReportTrendPoint[];
    waterIntake: ReportTrendPoint[];
  };
};

export type HealthReportResponse = {
  analysis: string | null;
  cycle: HealthReportCycleStats;
  documentCount: number;
  documents: { docType: DocType; documentDate: string; id: string; title: string }[];
};

export const reportApi = {
  /**
   * Aggregated cycle-log stats + document breakdown + an AI analysis of both,
   * computed server-side in one round trip for the downloadable PDF report.
   */
  getHealthReport: (payload: { endDate: string; language?: LanguageCode; startDate: string }) =>
    apiRequest<HealthReportResponse>("/api/reports/health-report", {
      body: JSON.stringify(payload),
      method: "POST",
    }),
};

export type SymptomPrediction = {
  cyclesAnalyzed: number;
  likelihood: number;
  occurrences: number;
  phase: string;
  symptom: string;
};

export type SymptomPredictionsResponse = {
  nextCycleStart: string | null;
  predictions: SymptomPrediction[];
};

export const insightsApi = {
  /**
   * Personalized daily insight built server-side from the user's cycle
   * phase and log history — hormone/mood/energy/skin context plus
   * exercise/nutrition/sleep/wellness suggestion lists.
   */
  getDaily: () =>
    apiRequest<{
      dailySummary: string;
      energyInsight: string;
      exerciseSuggestions: string[];
      hormoneExplanation: string;
      moodInsight: string;
      nutritionSuggestions: string[];
      phase: string | null;
      pregnancyMode: boolean;
      skinInsight: string;
      sleepSuggestions: string[];
      wellnessRecommendations: string[];
    }>("/api/insights/daily"),
};

export type ScreeningCondition = "pcos" | "endometriosis" | "fibroid" | "thyroid";

export type ScreeningQuestion = {
  id: string;
  text: string;
  type: "yesno" | "scale";
};

export type ScreeningQuestionsResponse = {
  condition: ScreeningCondition;
  disclaimer: string;
  questions: ScreeningQuestion[];
};

export type ScreeningRiskLevel = "low" | "moderate" | "high";

export type ScreeningAssessmentResponse = {
  condition: ScreeningCondition;
  createdAt: string;
  disclaimer: string;
  doctorDiscussionSummary: string;
  riskLevel: ScreeningRiskLevel;
  score: number;
  summary: string;
};

export type ScreeningHistoryItem = {
  _id: string;
  condition: ScreeningCondition;
  createdAt: string;
  riskLevel: ScreeningRiskLevel;
  score: number;
  summary: string;
};

export const screeningApi = {
  getQuestions: (condition: ScreeningCondition) =>
    apiRequest<ScreeningQuestionsResponse>(
      `/api/screening/questions${toQuery({ condition })}`,
    ),

  submitAssessment: (
    condition: ScreeningCondition,
    answers: Record<string, number | boolean>,
  ) =>
    apiRequest<ScreeningAssessmentResponse>("/api/screening/assess", {
      body: JSON.stringify({ condition, answers }),
      method: "POST",
    }),

  getHistory: () => apiRequest<ScreeningHistoryItem[]>("/api/screening/history"),
};
