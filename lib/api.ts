import AsyncStorage from "@react-native-async-storage/async-storage";

const LOCAL_DEV_API_BASE_URL = "http://localhost:5000";
const envApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

export const API_BASE_URL = (
  envApiBaseUrl || (__DEV__ ? LOCAL_DEV_API_BASE_URL : "")
).replace(/\/+$/, "");
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
};

export type Pagination = {
  limit: number;
  page: number;
  pages: number;
  total: number;
};

export type AuthUser = {
  _id?: string;
  createdAt?: string;
  dateOfBirth?: string;
  email?: string;
  firstName?: string;
  gender?: string;
  isEmailVerified?: boolean;
  isProfileComplete?: boolean;
  lastLogin?: string;
  lastName?: string;
  phone?: string;
  profilePicture?: string;
  role?: string;
  streakCount?: number;
  tokenEarned?: number;
  updatedAt?: string;
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

export type DayEntry = {
  _id?: string;
  cycleDay?: number;
  date?: string;
  dateKey: string;
  energy?: "high" | "low" | "medium" | "steady";
  flow?: "heavy" | "light" | "medium" | "none" | "spotting";
  mood?:
    | "anxious"
    | "calm"
    | "emotional"
    | "energetic"
    | "happy"
    | "irritable"
    | "neutral"
    | "sad"
    | "tired";
  note?: string;
  phase?: "follicular" | "luteal" | "ovulation" | "period" | string;
  symptoms?: string[];
  tokensEarned?: number;
};

export type CycleSettings = {
  _id?: string;
  cycleLength: number;
  lastPeriodStartDate: string;
  periodLength: number;
  reminderDaysBefore?: number;
  remindersEnabled?: boolean;
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
  icon: string;
  id: string;
  streak: number;
  title: string;
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
  dateKey: string;
  healthDelta: number;
  note?: string;
  tokensEarned: number;
};

export type Doctor = {
  _id: string;
  avatarEmoji?: string;
  availability?: string;
  bio?: string;
  currency: string;
  experience?: string;
  firstName?: string;
  isAvailable: boolean;
  languages?: string[];
  lastName?: string;
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
  messages: ConsultationMessage[];
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
};

export type PartnerProfile = {
  _id: string;
  connectedAt?: string;
  inviteCode?: string;
  inviteCodeExpiry?: string;
  isConnected: boolean;
  messages: PartnerMessage[];
  partnerId?: string | Pick<AuthUser, "firstName" | "lastName">;
  permissions: PartnerPermissions;
  userId: string;
};

export type PartnerSharedData = {
  alerts: string[];
  cycle?: Pick<
    Predictions,
    "currentCycleDay" | "currentPhase" | "nextPeriodDaysAway"
  >;
  permissions: Partial<PartnerPermissions>;
  recentSymptoms: string[];
};

export type BuddyMatch = {
  _id?: string;
  activeLimit?: number;
  alias: string;
  avatarSeed: string;
  compatibility: number;
  cycleOverlapDays: number;
  cyclePhase: string;
  id: string;
  matchKey?: string;
  nominatedAt?: string;
  similarities: string[];
  status?: "active" | "ended";
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
  createdAt?: string;
  message?: string;
  nomineeEmail: string;
  nomineeId?: string | AuthUser | null;
  nomineeName?: string;
  nominatorId?: string | AuthUser;
  status: "accepted" | "declined" | "pending";
};

export type CommunityComment = {
  _id?: string;
  content: string;
  createdAt?: string;
  id?: string;
  isAnonymous?: boolean;
  likes?: number;
  userId?: string | Pick<AuthUser, "firstName" | "lastName" | "profilePicture">;
};

export type CommunityPost = {
  _id: string;
  category?: string;
  comments?: CommunityComment[];
  commentsCount: number;
  content: string;
  createdAt?: string;
  id: string;
  isAnonymous?: boolean;
  likedByMe?: boolean;
  likes: number;
  savedByMe?: boolean;
  tags?: string[];
  title?: string;
  userId?: string | Pick<AuthUser, "firstName" | "lastName" | "profilePicture">;
};

export type Blog = {
  _id: string;
  author?: string;
  category?: string;
  content?: string;
  coverImageUrl?: string;
  excerpt?: string;
  isPublished: boolean;
  likes: number;
  publishedAt?: string;
  readTimeMinutes?: number;
  slug: string;
  tags?: string[];
  title: string;
  views: number;
};

export type ContentFeedItem = {
  author: string;
  id: string;
  imageUrl: string;
  sourceId: string;
  summary: string;
  time: string;
  title: string;
  type: "blog" | "reel";
  verified: boolean;
};

export type ReelPollOption = {
  optionId: string;
  topic: string;
  votes: number;
};

export type Reel = {
  _id?: string;
  category: string;
  creatorAvatar?: string;
  creatorId: string;
  creatorName: string;
  directMp4Url: string;
  duration: string;
  followedByMe?: boolean;
  id: string;
  pollOptions: ReelPollOption[];
  pollQuestion?: string;
  thumbnailUrl: string;
  title: string;
  verified: boolean;
  views: number;
  votedOptionId?: string | null;
};

export type HealthIssue = {
  _id?: string;
  category: string;
  color: string;
  guide: string;
  icon: string;
  id?: string;
  imageUrl?: string;
  order?: number;
  summary: string;
  title: string;
};

export type WellbeingResource = {
  _id?: string;
  color: string;
  extendedGuide: string[];
  icon: string;
  id?: string;
  items: number;
  order?: number;
  summary: string;
  title: string;
  type: "hygiene" | "sexual_wellbeing";
};

export type WellbeingGameDeck = {
  cards: unknown[];
  deck: "positions" | "spark" | string;
};

export type QuestionAnswer = {
  _id: string;
  answer: string;
  category?: string;
  medicallyReviewed?: boolean;
  question: string;
  reviewedBy?: string;
  shortAnswer?: string;
  slug?: string;
  tags?: string[];
  views?: number;
};

export type AskQuestionResponse = {
  answer: string;
  matchedQuestion?: QuestionAnswer;
  question: string;
  source: "ai" | "knowledge_base" | string;
};

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

function getErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const errorData = data as {
      error?: unknown;
      errors?: unknown;
      message?: unknown;
    };

    if (typeof errorData.message === "string") return errorData.message;
    if (typeof errorData.error === "string") return errorData.error;

    if (Array.isArray(errorData.errors) && errorData.errors.length > 0) {
      return errorData.errors
        .map((error) =>
          typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : String(error),
        )
        .join("\n");
    }
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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(getErrorMessage(data, response.status));
  }

  return data as ApiEnvelope<T>;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const envelope = await apiEnvelopeRequest<T>(path, options);
  return (envelope.data ?? envelope) as T;
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
    confirmPassword: string;
    dateOfBirth?: string;
    email: string;
    firstName: string;
    gender?: string;
    lastName: string;
    password: string;
    phone?: string;
  }) =>
    apiEnvelopeRequest<AuthUser>("/api/auth/signup", {
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

  saveLog: (payload: Omit<DayEntry, "cycleDay" | "phase" | "tokensEarned">) =>
    apiRequest<{ cycleLog: DayEntry; tokensEarned: number }>("/api/cycle/log", {
      body: JSON.stringify(payload),
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
      forestLog: ForestLog;
      status: ForestStatus;
      tokensAwarded: number;
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

  bookConsultation: (doctorId: string) =>
    apiRequest<Consultation>("/api/consultation/book", {
      body: JSON.stringify({ doctorId }),
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
};

export const buddyApi = {
  getMatches: (search?: string) =>
    apiRequest<{ activeLimit: number; matches: BuddyMatch[] }>(
      `/api/buddies/matches${toQuery({ search })}`,
    ),

  getActive: () => apiRequest<BuddyMatch | null>("/api/buddies/active"),

  nominate: (matchId: string) =>
    apiRequest<{ buddy: BuddyMatch; tokensAwarded: number }>(
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

  addComment: (id: string, content: string, isAnonymous = true) =>
    apiRequest<CommunityComment>(`/api/community/${id}/comment`, {
      body: JSON.stringify({ content, isAnonymous }),
      method: "POST",
    }),

  deletePost: (id: string) =>
    apiRequest<void>(`/api/community/${id}`, { method: "DELETE" }),
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
    limit?: number;
    page?: number;
    search?: string;
    type?: "all" | "blog" | "reel";
  }) =>
    apiRequest<{ items: ContentFeedItem[]; pagination: Pagination }>(
      `/api/blogs/feed${toQuery(params)}`,
    ),

  getBlogBySlug: (slug: string) => apiRequest<Blog>(`/api/blogs/${slug}`),

  likeBlog: (id: string) =>
    apiRequest<{ likes: number }>(`/api/blogs/${id}/like`, {
      method: "PATCH",
    }),

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

  ask: (question: string) =>
    apiRequest<AskQuestionResponse>("/api/questions/ask", {
      body: JSON.stringify({ question }),
      method: "POST",
      skipAuth: true,
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

export const profileApi = {
  getProfile: authApi.getProfile,
  updateProfile: authApi.updateProfile,
};
