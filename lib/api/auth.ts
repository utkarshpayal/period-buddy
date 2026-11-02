import { fetchQuery } from "../queryCache";
import { type ApiEnvelope, apiEnvelopeRequest, apiRequest } from "./client";
import type { DayEntry, Predictions } from "./cycle";

/** A signed-in device, from GET /api/auth/sessions. */
export type SignedInDevice = {
  id: string;
  platform: "android" | "ios" | "web" | null;
  appVersion: string | null;
  userAgent: string | null;
  signedInAt: string;
  lastActiveAt: string;
  current: boolean;
};

/** Privacy choices. `granted: null` = never asked. */
export type PrivacyConsents = {
  aiProcessing: {
    granted: boolean | null;
    version: string | null;
    updatedAt: string | null;
    currentVersion: string;
    providers: string[];
    allowedNow: boolean;
  };
};

/** Body/response of /api/auth/home-layout (parsed by lib/homeLayout.ts). */
export type HomeLayoutPayload = {
  order: string[];
  hidden: string[];
  shortcuts: string[] | null;
  shortcutStyles?: Record<string, { look: "icon" | "tile" | "card"; color: string | null; label: string | null; icon: string | null }>;
  blocks?: Record<string, { title: string | null; items: string[] | null }>;
  updatedAt?: string | null;
};

/** Settings on the privacy screen (User.privacySettings on the backend). */
export type PrivacySettings = {
  /** Pushes say "You have a new update" instead of their text. */
  hideNotificationDetails: boolean;
  /** Nura AI and document chats older than this are deleted; 0 = keep. */
  aiChatRetentionDays: number;
  aiChatRetentionOptions: number[];
  /** Email when the account signs in on a new device. */
  newSignInAlerts: boolean;
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
  state?: string;
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

  /** Shared through lib/queryCache.ts (15 s, stale on `profile` writes); `force` for pull-to-refresh. */
  getProfile: (opts: { force?: boolean } = {}) =>
    fetchQuery("auth:profile", () => apiRequest<AuthUser>("/api/auth/profile"), {
      staleMs: 15_000,
      topics: ["profile"],
      force: opts.force,
    }),

  // `platform: "web"` stores a browser (web app / PWA) token next to the
  // phone's instead of replacing it.
  updateFcmToken: (token: string, platform?: "web") =>
    apiEnvelopeRequest<{ notificationToken: string }>("/api/auth/fcm-token", {
      body: JSON.stringify(platform ? { token, platform } : { token }),
      method: "POST",
    }),

  updateProfile: (payload: Partial<AuthUser>) =>
    apiRequest<AuthUser>("/api/auth/profile", {
      body: JSON.stringify(payload),
      method: "PUT",
    }),

  /** Sign out of every device, this one included. */
  logoutAll: () => apiRequest<null>("/api/auth/logout-all", { method: "POST" }),

  /** Devices signed in to this account; `current` is this one. */
  getSessions: () => apiRequest<{ sessions: SignedInDevice[] }>("/api/auth/sessions"),

  endSession: (id: string) => apiRequest<null>(`/api/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // `settings` is missing from backends older than the privacy settings.
  getPrivacy: () => apiRequest<{ consents: PrivacyConsents; settings?: PrivacySettings }>("/api/auth/privacy"),

  /** Save privacy settings; only the fields sent change. */
  setPrivacySettings: (
    settings: Partial<Pick<PrivacySettings, "hideNotificationDetails" | "aiChatRetentionDays" | "newSignInAlerts">>,
  ) =>
    apiRequest<{ consents: PrivacyConsents; settings: PrivacySettings }>("/api/auth/privacy/settings", {
      body: JSON.stringify(settings),
      method: "PUT",
    }),

  /** This person's own Home layout (lib/homeLayout.ts); 404 on backends older than it. */
  getHomeLayout: () => apiRequest<HomeLayoutPayload>("/api/auth/home-layout"),

  /** Replace the Home layout; `shortcuts: null` = the default shortcuts. */
  saveHomeLayout: (layout: HomeLayoutPayload) =>
    apiRequest<HomeLayoutPayload>("/api/auth/home-layout", {
      body: JSON.stringify(layout),
      method: "PUT",
    }),

  /** Allow or refuse sending your content to the AI provider. */
  setAiConsent: (granted: boolean) =>
    apiRequest<{ consents: PrivacyConsents }>("/api/auth/privacy/ai-consent", {
      body: JSON.stringify({ granted }),
      method: "PUT",
    }),

  /** Everything the app stores about you (lib/privacyExport.ts saves and shares it). */
  // A full export is large; the 20s default is too tight on a phone connection.
  exportData: () => apiRequest<Record<string, unknown>>("/api/auth/export-data", { timeoutMs: 60_000 }),

  // `fcmToken` is this device's current push token (optional): the backend
  // only clears the stored token when it matches, so logging out on one
  // device doesn't stop pushes to another that registered since.
  logoutAlias: (fcmToken?: string | null) =>
    apiRequest<null>("/api/logout", {
      body: JSON.stringify(fcmToken ? { fcmToken } : {}),
      method: "POST",
    }),

  deleteAccount: (password: string) =>
    apiRequest<null>("/api/auth/delete-account", {
      body: JSON.stringify({ password }),
      method: "DELETE",
    }),

  /** Shared through lib/queryCache.ts (15 s, stale on `dashboard` writes); `force` for pull-to-refresh. */
  getDashboard: (opts: { force?: boolean } = {}) =>
    fetchQuery("auth:dashboard", () => apiRequest<DashboardSummary>("/api/auth/dashboard"), {
      staleMs: 15_000,
      topics: ["dashboard"],
      force: opts.force,
    }),
};
