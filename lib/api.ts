import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import type { CyclePhase } from "./cycle";
import { emitDataChange, emitMutation } from "./data-sync";
import { getDeviceId } from "./deviceId";

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
  envApiBaseUrl || (__DEV__ ? getLocalDevApiBaseUrl() : "https://www.backend.thenura.care")
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
  /** GET /api/partner/notifications only: unread total across all pages. */
  unreadCount?: number;
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
export type ApiErrorKind =
  | "network"
  | "timeout"
  | "server"
  | "notFound"
  | "unauthorized"
  | "featureLocked"
  | "accountSuspended"
  | "unknown";

/** The 402 FEATURE_LOCKED body's payload — see
 * period-buddy-be's subscriptionMiddleware.requireFeatureAccess(). Carries
 * everything PaywallModal needs to render without a second round trip. */
export type FeatureLockInfo = {
  feature: {
    key: string;
    name: string;
    description?: string;
    price: number;
    billingCycle: "monthly" | "yearly" | "one_time";
  };
  plans: {
    _id: string;
    name: string;
    slug: string;
    price: number;
    billingCycle: "monthly" | "yearly" | "one_time";
    badge?: string;
  }[];
};

export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;
  /** Only set when kind === "featureLocked". */
  lock?: FeatureLockInfo;

  constructor(message: string, kind: ApiErrorKind, status?: number, lock?: FeatureLockInfo) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.lock = lock;
  }
}

/** True when a request was blocked by the subscription paywall. Screens can
 * catch this specifically to open PaywallModal instead of a generic error. */
export function isFeatureLockedError(err: unknown): err is ApiError & { lock: FeatureLockInfo } {
  return err instanceof ApiError && err.kind === "featureLocked" && !!err.lock;
}

/** True when the failure was connectivity-related (offline or timed out). */
export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiError && (err.kind === "network" || err.kind === "timeout");
}

/**
 * A user-friendly message for any thrown error, mapping raw fetch/abort failures
 * to plain language. Use this wherever an error is shown to the user.
 */
/** code ACCOUNT_SUSPENDED — an admin suspended this account (period-buddy-be's
 * utils/accountStatus.js). Login/Google sign-in return it as a 403 once the
 * credentials are verified; any authenticated request returns it as a 401 if
 * the account is suspended mid-session (which also triggers the unauthorized
 * handler with reason "suspended"). The message is user-facing. */
export function isAccountSuspendedError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.kind === "accountSuspended";
}

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

export type MoodValue =
  | "anxious"
  | "apathetic"
  | "calm"
  | "confused"
  | "depressed"
  | "emotional"
  | "energetic"
  | "frisky"
  | "guilty"
  | "happy"
  | "irritable"
  | "lowEnergy"
  | "moodSwings"
  | "neutral"
  | "obsessive"
  | "sad"
  | "selfCritical"
  | "tired";
// NOTE: "apathetic" | "confused" | "depressed" | "frisky" | "guilty" |
// "lowEnergy" | "moodSwings" | "obsessive" | "selfCritical" are new — the
// day-log modal now offers the reference app's full mood grid. `mood`/`moods`
// are backend-owned enum fields (period-buddy-be, a separate repo not present
// here), so if that service validates this union strictly, it needs the same
// values added server-side or it will reject these new logs.

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
  /** ISO start of the cycle currently in progress — the history-aware anchor
   *  the calendar should project future phases from (not the stale settings
   *  lastPeriodStartDate). */
  currentPeriodStartDateISO?: string;
  currentPeriodEndDateISO?: string;
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
  /** false for highly irregular cycles, where calendar ovulation is unreliable */
  ovulationReliable?: boolean;
  fertileWindowReliable?: boolean;
  periodLength: number;
  cycleLength: number;

  // Predicted vs. actual data model. The anchor for future predictions is the
  // most recent *actual* logged period start, never a stale predicted date.
  predictedPeriodStartISO?: string;
  predictedPeriodEndISO?: string;
  predictedPeriodStartEarliestISO?: string;
  predictedPeriodStartLatestISO?: string;
  predictedWindowRange?: string;
  actualPeriodStartISO?: string | null;
  actualPeriodEndISO?: string | null;

  // Prediction quality metadata.
  predictionMethod?:
    | "configured_cycle"
    | "historical_median"
    | "historical_weighted"
    | "irregular_range";
  confidence?: "low" | "medium" | "high";
  variability?: "low" | "medium" | "high" | "unknown";
  isRegular?: boolean | null;
  /** true when the date is a rough estimate (high variability) — show a window */
  isEstimate?: boolean;
  cyclesAnalyzed?: number;
  cycleLengthHistory?: number[];
  medianCycleLength?: number | null;
  minCycleLength?: number | null;
  maxCycleLength?: number | null;
  /** count of implausible "double cycle" lengths excluded from the estimate */
  outliersRemoved?: number;

  // Staleness — set when the user has stopped logging for 2+ predicted cycles,
  // so the projection is a guess rather than a measurement.
  daysSinceLastActualPeriod?: number | null;
  skippedCycles?: number;
  isStale?: boolean;
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

export type ForestTaskKey = "log" | "habit" | "water";
export type ForestGrowthStage = "seed" | "sprout" | "seedling" | "sapling" | "young" | "mature" | "bloom";
export type ForestVitality = "new" | "thriving" | "thirsty" | "wilting" | "dry";

/** Seed → tree growth from daily tasks (backend utils/forestGrowth.js). */
export type ForestGrowth = {
  stage: ForestGrowthStage;
  stageIndex: number;
  stageCount: number;
  stageProgress: number;
  nextStage: ForestGrowthStage | null;
  pointsToNextStage: number;
  points: number;
  pointsPerTree: number;
  /** 0..1 along seed → full tree. */
  growth: number;
  totalPoints: number;
  treesGrown: number;
  grownTrees: { number: number; grownOn: string }[];
  vitality: ForestVitality;
  vitalityLevel: number;
  daysSinceActive: number | null;
  today: { dateKey: string; tasks: { key: ForestTaskKey; done: boolean }[]; done: number; total: number };
  week: { dateKey: string; done: number }[];
};

export type ForestStatus = {
  /** Missing from backends older than the growth feature. */
  growth?: ForestGrowth;
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
  // Cashfree checkout session token for CashfreeCheckoutModal — absent
  // whenever `consultation` is present (no order was created).
  paymentSessionId?: string;
  /** "sandbox" | "production", passed straight through to Cashfree's JS SDK. */
  cashfreeMode?: "sandbox" | "production";
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

export type CommunityPollOption = {
  optionId: string;
  topic: string;
  votes: number;
};

export type CommunityPoll = {
  question?: string;
  allowMultiple: boolean;
  options: CommunityPollOption[];
  totalVotes: number;
  /** optionIds the requesting user has already voted for ([] if not yet voted) */
  myVote: string[];
};

export type CommunityPost = {
  _id: string;
  attachments?: CommunityAttachment[];
  poll?: CommunityPoll;
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

/** Mirrors the backend's CHAT_TOPICS ids (period-buddy-be's
 * utils/companionChat.js) — a chat session pinned to one of these gets a
 * topic-scoped AI system prompt; "general" is unscoped. Keep in sync with
 * `lib/chatTopics.ts`'s CHAT_TOPICS ids. */
export type ChatTopicId = "cycle" | "symptoms" | "hygiene" | "mood" | "partner" | "nutrition" | "general";

export type QaChatSessionSummary = {
  id: string;
  topicId: ChatTopicId;
  topicLabel: string;
  title: string;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
};

export type QaChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  source?: string;
  personalized?: boolean;
  disclaimer?: string;
  suggestedQuestions?: string[];
  createdAt: string;
};

export type QaChatSessionDetail = QaChatSessionSummary & {
  messages: QaChatMessage[];
};

export type SendChatSessionMessageResponse = {
  session: QaChatSessionSummary;
  question: string;
  answer: string;
  source: string;
  personalized?: boolean;
  matchedQuestion?: QuestionAnswer | null;
  suggestedQuestions?: string[];
  disclaimer?: string;
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
// deleted account) clears the local session instead of failing silently.
// `reason` is "suspended" for a 403 ACCOUNT_SUSPENDED, so the user is told why.
export type UnauthorizedReason = "suspended";
let onUnauthorized: ((reason?: UnauthorizedReason) => void) | null = null;

export function setUnauthorizedHandler(handler: ((reason?: UnauthorizedReason) => void) | null) {
  onUnauthorized = handler;
}

// In-memory cache of the parsed session token, avoiding an AsyncStorage
// round trip + JSON.parse on every single API call (a screen can fire many
// concurrent requests, e.g. tracker.tsx's 12 month-log calls). Invalidated
// explicitly on a 401 below; the short TTL is a safety net for a
// login/logout/account-switch writing AUTH_SESSION_KEY directly via
// AsyncStorage without going through this file (auth-context.tsx) — call
// `invalidateTokenCache()` from there on login/logout for immediate
// correctness instead of waiting out the TTL.
const TOKEN_CACHE_TTL_MS = 30_000;
let cachedToken: { readAt: number; token: string | null } | null = null;

export function invalidateTokenCache() {
  cachedToken = null;
}

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() - cachedToken.readAt < TOKEN_CACHE_TTL_MS) {
    return cachedToken.token;
  }
  try {
    const raw = await AsyncStorage.getItem(AUTH_SESSION_KEY);
    const session = raw ? (JSON.parse(raw) as { token?: string }) : null;
    const token = session?.token ?? null;
    cachedToken = { readAt: Date.now(), token };
    return token;
  } catch {
    cachedToken = { readAt: Date.now(), token: null };
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

/** Whether a `Pagination` block says another page exists (false when absent). */
export function hasMorePages(pagination?: Pagination | null) {
  return Boolean(pagination && pagination.page < pagination.pages);
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
    // Login/Google sign-in answer 403 for a suspended account; any other
    // authenticated request answers 401 (so older clients still sign out) —
    // both carry this code.
    // Only sign out when the token this request carried is still the
    // session's: a slow request from before a logout/login would otherwise
    // come back 401 and sign the new account straight out.
    const tokenStillCurrent = async () => {
      invalidateTokenCache();
      return (await getToken()) === token;
    };
    if ((data as { code?: string })?.code === "ACCOUNT_SUSPENDED") {
      if (!options.skipAuth && token && (await tokenStillCurrent())) {
        onUnauthorized?.("suspended");
      }
      throw new ApiError(getErrorMessage(data, response.status), "accountSuspended", response.status);
    }
    if (response.status === 401 && !options.skipAuth && token && (await tokenStillCurrent())) {
      onUnauthorized?.();
    }
    if (response.status === 402) {
      const body = data as { code?: string } & Partial<FeatureLockInfo>;
      if (body?.code === "FEATURE_LOCKED" && body.feature) {
        throw new ApiError(getErrorMessage(data, response.status), "featureLocked", response.status, {
          feature: body.feature,
          plans: body.plans ?? [],
        });
      }
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

  // Tell still-mounted screens that show this data to refetch (lib/data-sync.ts).
  emitMutation(fetchOptions.method ?? "GET", path);

  return data as ApiEnvelope<T>;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const envelope = await apiEnvelopeRequest<T>(path, options);
  return (envelope.data !== undefined ? envelope.data : envelope) as T;
}

/**
 * Headers for the App CMS endpoints: who's asking (token when signed in, and
 * this install's id) and `X-Nura-Launch: 1`, which tells the backend this
 * build understands launch states. Without it the backend hides every item
 * that isn't plainly open, so older builds never show unfinished features.
 */
async function launchHeaders(): Promise<Record<string, string>> {
  const [token, deviceId] = await Promise.all([getToken(), getDeviceId()]);
  const headers: Record<string, string> = { "X-Device-Id": deviceId, "X-Nura-Launch": "1" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * App CMS layout (period-buddy-be `/api/app-config`, public). Parsed and
 * cached by components/app-config.tsx — screens read it via useAppConfig(),
 * never call this directly.
 *
 * The config is per viewer since launch states (rollout slice, testers,
 * "Notify me"), so the token rides along — attached by hand, with skipAuth,
 * so an expired session can never sign the user out from a background
 * config fetch (the backend's optionalAuth just ignores a bad token).
 */
export const appConfigApi = {
  get: async () =>
    apiRequest<unknown>("/api/app-config", { skipAuth: true, timeoutMs: 8000, headers: await launchHeaders() }),
  /** Join a Coming soon feature's "Notify me" list (itemKey: feature key or `link:<id>`). */
  notifyLaunch: async (itemKey: string) =>
    apiRequest<{ onList: boolean }>(`/api/app-config/launch/${encodeURIComponent(itemKey)}/notify`, {
      method: "POST",
      skipAuth: true,
      timeoutMs: 8000,
      headers: await launchHeaders(),
      // Same platform names as hooks/useViewer.ts, for the CMS's waitlist export.
      body: JSON.stringify({ platform: Platform.OS === "ios" ? "ios" : Platform.OS === "web" ? "web" : "android" }),
    }),
  /** Fire-and-forget: someone tapped a locked (Coming soon) tile. */
  /** Batched feature usage (lib/usage.ts): `open` = its screen was visited, `tap` = its tile was tapped. */
  trackUsage: async (events: { itemKey: string; kind: "open" | "tap" }[]) =>
    apiRequest<unknown>("/api/app-config/usage", {
      method: "POST",
      skipAuth: true,
      timeoutMs: 8000,
      headers: await launchHeaders(),
      body: JSON.stringify({ events }),
    }),
  trackLockedTap: async (itemKey: string) =>
    apiRequest<unknown>(`/api/app-config/launch/${encodeURIComponent(itemKey)}/tap`, {
      method: "POST",
      skipAuth: true,
      timeoutMs: 5000,
      headers: await launchHeaders(),
    }),
  trackBannerClick: (id: string) =>
    apiRequest<unknown>(`/api/app-config/banners/${encodeURIComponent(id)}/click`, {
      method: "POST",
      skipAuth: true,
      timeoutMs: 5000,
    }),
  trackBannerImpressions: (ids: string[]) =>
    apiRequest<unknown>("/api/app-config/banners/impressions", {
      method: "POST",
      skipAuth: true,
      timeoutMs: 5000,
      body: JSON.stringify({ ids }),
    }),
};

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
  /** `today` is the device's local YYYY-MM-DD, so "today's tasks" match the day logs are saved under. */
  getStatus: (today?: string) => apiRequest<ForestStatus>(`/api/forest/status${toQuery({ today })}`),

  logCare: (payload: {
    careType?: ForestLog["careType"];
    dateKey: string;
    note?: string;
    today?: string;
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

  // A pending UPI-collect approval (or any other still-open Cashfree
  // order) comes back as { pending: true } rather than a Consultation —
  // callers polling this (CashfreeUpiCollectModal) must check for that
  // shape before treating the response as a booked session.
  verifyPayment: (payload: { consultationId: string; orderId: string }) =>
    apiRequest<Consultation | { pending: true }>("/api/consultation/verify", {
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

/* ------------------------------ Subscriptions ------------------------------ */
// Feature-wise + plan-wise paid access. Same order->CashfreeCheckoutModal->
// verify flow as consultationApi above; see period-buddy-be's
// subscriptionController.js for the server side.

export type BillingCycle = "monthly" | "yearly" | "one_time";

export type SubscriptionFeature = {
  _id: string;
  key: string;
  name: string;
  description?: string;
  category: string;
  icon?: string;
  isPremium: boolean;
  price: number;
  billingCycle: BillingCycle;
  isActive: boolean;
  sortOrder: number;
};

export type SubscriptionPlan = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  billingCycle: BillingCycle;
  features: string[];
  isDefault: boolean;
  isActive: boolean;
  badge?: string;
};

export type Entitlement = {
  _id: string;
  source: "plan" | "feature";
  plan?: SubscriptionPlan | string | null;
  featureKey?: string;
  status: "pending" | "active" | "expired" | "cancelled" | "failed";
  amount: number;
  currency: string;
  billingCycle: BillingCycle;
  startedAt?: string;
  expiresAt?: string | null;
  createdAt: string;
};

export type MySubscription = {
  subscriptionEnabled: boolean;
  currency: string;
  entitlements: Entitlement[];
  unlockedFeatureKeys: "ALL" | string[];
};

// `orderId`/`paymentSessionId` are absent when `free` is true — a 100%-off
// coupon activates the entitlement immediately server-side, with no
// Cashfree order created at all. Always check `free` before touching
// either field.
export type SubscriptionOrder = {
  entitlementId: string;
  free: boolean;
  orderId?: string;
  amount: number;
  currency: string;
  paymentSessionId?: string;
  cashfreeMode?: "sandbox" | "production";
};

export type DiscountType = "percentage" | "flat";

export type CouponPreview = {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  currency: string;
  /** True when this coupon brings the price to ₹0 — purchasing skips
   * Cashfree checkout entirely (see createOrder's `free` response field). */
  free: boolean;
};

type PurchasePayload =
  | { source: "plan"; planId: string }
  | { source: "feature"; featureKey: string };

export const subscriptionApi = {
  getPlans: () => apiRequest<SubscriptionPlan[]>("/api/subscriptions/plans", { skipAuth: true }),

  getFeatures: () =>
    apiRequest<SubscriptionFeature[]>("/api/subscriptions/features", { skipAuth: true }),

  getMe: () => apiRequest<MySubscription>("/api/subscriptions/me"),

  getHistory: () => apiRequest<Entitlement[]>("/api/subscriptions/history"),

  /** Preview a coupon's discount against a specific plan/feature before
   * buying — creates nothing. The actual purchase (createOrder below) still
   * re-validates the code itself, so this is just for showing the
   * discounted price / "Free!" state before the user commits. */
  applyCoupon: (payload: { code: string } & PurchasePayload) =>
    apiRequest<CouponPreview>("/api/subscriptions/coupons/apply", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  createOrder: (payload: PurchasePayload & { couponCode?: string }) =>
    apiRequest<SubscriptionOrder>("/api/subscriptions/order", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  // See consultationApi.verifyPayment's note — a still-open Cashfree order
  // (e.g. an unapproved UPI collect request) comes back as { pending: true }.
  verifyPayment: (payload: { entitlementId: string; orderId: string }) =>
    apiRequest<Entitlement | { pending: true }>("/api/subscriptions/verify", {
      body: JSON.stringify(payload),
      method: "POST",
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
    poll?: { question?: string; allowMultiple?: boolean; options: string[] };
    tags?: string[];
    title?: string;
  }) =>
    apiRequest<CommunityPost>("/api/community", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  votePoll: (id: string, optionIds: string[]) =>
    apiRequest<{ poll: CommunityPoll; tokensAwarded: number }>(
      `/api/community/${id}/poll/vote`,
      { body: JSON.stringify({ optionIds }), method: "POST" },
    ),

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

  // Persisted Nura Companion chat sessions — chat history the user can
  // reopen and continue, one per topic (or "general"). Login-gated (no
  // skipAuth), unlike ask() above.
  createSession: (topicId?: ChatTopicId) =>
    apiRequest<QaChatSessionSummary>("/api/questions/sessions", {
      body: JSON.stringify({ topicId }),
      method: "POST",
    }),

  listSessions: () => apiRequest<QaChatSessionSummary[]>("/api/questions/sessions"),

  listSessionsPage: async (params: { page?: number; limit?: number } = {}) => {
    const envelope = await apiEnvelopeRequest<QaChatSessionSummary[]>(
      `/api/questions/sessions${toQuery({ page: params.page ?? 1, limit: params.limit ?? 20 })}`,
    );
    return { sessions: envelope.data ?? [], hasMore: hasMorePages(envelope.pagination) };
  },

  getSession: (sessionId: string) =>
    apiRequest<QaChatSessionDetail>(`/api/questions/sessions/${sessionId}`),

  sendSessionMessage: (sessionId: string, question: string, language?: LanguageCode) =>
    apiRequest<SendChatSessionMessageResponse>(`/api/questions/sessions/${sessionId}/messages`, {
      body: JSON.stringify({ question, language }),
      method: "POST",
    }),

  deleteSession: (sessionId: string) =>
    apiRequest<void>(`/api/questions/sessions/${sessionId}`, { method: "DELETE" }),
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

export type CheckinCallResult = {
  callId: string;
  expectedPeriodDate: string;
  /** "Call me now" requests left today after this one. */
  callsLeftToday: number;
};

export type CheckinCallMode = "once" | "period_daily";

export type CheckinCallOutcome =
  | "completed"
  | "declined"
  | "callback"
  | "no_answer"
  | "opted_out"
  | "wrong_person"
  | "dropped"
  | "failed";

export type CheckinCallRecord = {
  _id: string;
  source: "manual" | "scheduled" | "retry";
  dateKey: string;
  status: "dialing" | "requested" | "connected" | "no_answer" | "busy" | "failed";
  /** Absent while the call is still ringing or in progress. */
  outcome?: CheckinCallOutcome;
  durationSeconds?: number;
  summary?: string;
  loggedFields?: string[];
  /** When Buddy will try again (no answer / callback requested). */
  retryAt?: string;
  endedAt?: string;
  createdAt: string;
};

export type CheckinCallSchedule = {
  enabled: boolean;
  /** "period_daily" = one call on each day of the period; "once" = one
   * call per cycle on period start + dayOffset. */
  mode: CheckinCallMode;
  /** "once" mode only. Days relative to the period start: 0 = on period
   * day, negative = N days before, positive = N days after. */
  dayOffset: number;
  /** Local time of day, "HH:mm" (24h), or null if never set. */
  time: string | null;
  periodLength: number;
  /** ISO time of the next automatic call, or null when none is coming up. */
  nextCallAt: string | null;
  lastCall: CheckinCallRecord | null;
  limits: {
    maxCallMinutes: number;
    manualCallsPerDay: number;
    manualCooldownMinutes: number;
  };
};

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

  /** Triggers an outbound "call me now" cycle check-in call (via Samvaad)
   * to the logged-in user's own phone number on file. */
  checkinCall: () =>
    apiRequest<CheckinCallResult>("/api/voice-agent/checkin-call", {
      method: "POST",
    }),

  /** This user's recurring check-in call preference (fired automatically by
   * the backend's cron scheduler, not by the app). */
  getCheckinCallSchedule: () =>
    apiRequest<CheckinCallSchedule>("/api/voice-agent/checkin-call/schedule"),

  /** timezoneOffsetMinutes must be Date.prototype.getTimezoneOffset() from
   * the client — required whenever enabled is true, so the server can
   * resolve "time" to this user's actual local moment. */
  saveCheckinCallSchedule: (payload: {
    enabled: boolean;
    mode?: CheckinCallMode;
    dayOffset: number;
    time?: string;
    timezoneOffsetMinutes?: number;
  }) =>
    apiRequest<CheckinCallSchedule>("/api/voice-agent/checkin-call/schedule", {
      body: JSON.stringify(payload),
      method: "PUT",
    }),

  /** This user's recent check-in calls, newest first. */
  getCheckinCallHistory: (limit = 10) =>
    apiRequest<{ calls: CheckinCallRecord[] }>(
      `/api/voice-agent/checkin-call/history?limit=${limit}`,
    ),
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

    // Bypasses apiEnvelopeRequest, so announce the change by hand.
    emitDataChange("documents");
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
        // "audio/m4a" isn't a real IANA media type — the backend forwards this
        // string verbatim as the Content-Type on the multipart part it sends to
        // Sarvam's speech-to-text API, which rejects it as an invalid type.
        // audio/mp4 is the correct type for .m4a (AAC-in-MP4) and matches what
        // the backend itself uses for .m4a elsewhere (mediaUpload.js, contentRoutes.js).
        type: "audio/mp4",
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

/* ─────────────── Gen Z pack (period-buddy-be /api/genz, /api/circles) ─────────────── */

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
  rename: (id: string, input: { name: string; emoji?: string }) =>
    apiRequest<{ circle: CircleSummary }>(`/api/circles/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
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

/* ──────────────────────────────────────────────────────────
   Government Schemes & Benefits
────────────────────────────────────────────────────────── */

export type SchemeCategory =
  | "menstrual_hygiene"
  | "adolescent_health"
  | "sexual_reproductive_health"
  | "family_planning"
  | "pregnancy_antenatal"
  | "maternity_postpartum"
  | "mother_newborn_care"
  | "maternal_nutrition"
  | "reproductive_health";

export type GovernmentLevel = "central" | "state";

// A benefit's primary call-to-action — not everything is an "apply" flow.
export type SchemeActionType =
  | "APPLY"
  | "CHECK_ELIGIBILITY"
  | "FIND_FACILITY"
  | "LEARN_MORE"
  | "EXTERNAL_APPLICATION";

export type SchemeType = "scheme" | "programme" | "service" | "entitlement";

export type SchemeEligibilityRule = {
  text: string;
  field?: string;
  operator?: "eq" | "neq" | "gte" | "lte" | "in" | "exists";
  value?: unknown;
};

export type SchemeApplicationStep = { title: string; detail?: string };

export type GovernmentBenefit = {
  _id: string;
  name: string;
  slug: string;
  shortName?: string;
  type: SchemeType;
  governmentLevel: GovernmentLevel;
  state?: string | null;
  categories: SchemeCategory[];
  description: string;
  benefits: string[];
  eligibility: SchemeEligibilityRule[];
  documents: string[];
  actionType: SchemeActionType;
  applicationMethod?: string;
  applicationSteps?: SchemeApplicationStep[];
  whereToGet?: string;
  officialUrl?: string;
  source?: string;
  helpline?: string;
  lastVerifiedAt?: string;
  isActive: boolean;
};

export type SchemeCategoryMeta = {
  key: SchemeCategory;
  label: string;
  icon: string;
};

export type SchemeEligibilityResult = {
  schemeId: string;
  actionType: SchemeActionType;
  status: "may_be_eligible" | "not_eligible";
  message: string;
  criteria: { text: string; result: "pass" | "fail" | "unknown" }[];
  unmetCriteria: string[];
};

export type SchemeApplicationStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "withdrawn";

export type SchemeApplicationDocument = { name?: string; url?: string };

export type SchemeApplicationUser = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

export type SchemeApplication = {
  _id: string;
  // A string id normally; populated with basic user fields on admin endpoints.
  userId: string | SchemeApplicationUser;
  reviewNote?: string;
  reviewedAt?: string;
  schemeId:
    | string
    | Pick<
        GovernmentBenefit,
        | "_id"
        | "name"
        | "shortName"
        | "slug"
        | "actionType"
        | "governmentLevel"
        | "state"
        | "officialUrl"
      >;
  schemeName?: string;
  formData?: Record<string, unknown>;
  documents?: SchemeApplicationDocument[];
  status: SchemeApplicationStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type SchemeListParams = {
  search?: string;
  category?: SchemeCategory | string;
  state?: string;
  governmentLevel?: GovernmentLevel;
  page?: number;
  limit?: number;
};

export type SchemeEligibilityAnswers = {
  gender?: string;
  age?: number;
  state?: string;
  isPregnant?: boolean;
  hasChildren?: boolean;
};

export const schemesApi = {
  list: (params?: SchemeListParams) =>
    apiRequest<{ schemes: GovernmentBenefit[]; pagination: Pagination }>(
      `/api/schemes${toQuery(params as Record<string, QueryValue>)}`,
    ),

  getById: (idOrSlug: string) =>
    apiRequest<{ scheme: GovernmentBenefit }>(`/api/schemes/${idOrSlug}`),

  getRecommended: () =>
    apiRequest<{ schemes: GovernmentBenefit[] }>("/api/schemes/recommended"),

  getCategories: () =>
    apiRequest<{ categories: SchemeCategoryMeta[] }>("/api/schemes/categories"),

  checkEligibility: (idOrSlug: string, answers?: SchemeEligibilityAnswers) =>
    apiRequest<SchemeEligibilityResult>(
      `/api/schemes/${idOrSlug}/eligibility${toQuery(
        answers as Record<string, QueryValue>,
      )}`,
    ),
};

export const schemeApplicationsApi = {
  create: (input: {
    schemeId: string;
    formData?: Record<string, unknown>;
    documents?: SchemeApplicationDocument[];
  }) =>
    apiRequest<{ application: SchemeApplication; alreadyExists?: boolean }>(
      "/api/scheme-applications",
      {
        body: JSON.stringify(input),
        method: "POST",
      },
    ),

  list: (params?: {
    status?: SchemeApplicationStatus;
    page?: number;
    limit?: number;
  }) =>
    apiRequest<{ applications: SchemeApplication[]; pagination: Pagination }>(
      `/api/scheme-applications${toQuery(params as Record<string, QueryValue>)}`,
    ),

  getById: (id: string) =>
    apiRequest<{ application: SchemeApplication }>(
      `/api/scheme-applications/${id}`,
    ),

  update: (
    id: string,
    updates: {
      status?: SchemeApplicationStatus;
      notes?: string;
      formData?: Record<string, unknown>;
      documents?: SchemeApplicationDocument[];
    },
  ) =>
    apiRequest<{ application: SchemeApplication }>(
      `/api/scheme-applications/${id}`,
      { body: JSON.stringify(updates), method: "PATCH" },
    ),

  // Admin review queue (requires role: admin).
  adminList: (params?: {
    status?: SchemeApplicationStatus;
    schemeId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) =>
    apiRequest<{ applications: SchemeApplication[]; pagination: Pagination }>(
      `/api/scheme-applications/admin/all${toQuery(
        params as Record<string, QueryValue>,
      )}`,
    ),

  adminReview: (
    id: string,
    input: { status: "in_review" | "approved" | "rejected"; reviewNote?: string },
  ) =>
    apiRequest<{ application: SchemeApplication }>(
      `/api/scheme-applications/admin/${id}`,
      { body: JSON.stringify(input), method: "PATCH" },
    ),
};
