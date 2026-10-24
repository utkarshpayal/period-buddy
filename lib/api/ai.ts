import { emitDataChange } from "../data-sync";
import { apiEnvelopeRequest, apiRequest, appendLocalFile, hasMorePages, multipartRequest, type Pagination, toQuery } from "./client";
import type { MedicalReview } from "./content";
import type { DayEntry } from "./cycle";

export type QuestionAnswer = MedicalReview & {
  _id: string;
  answer: string;
  category?: string;
  keywords?: string[];
  likeCount?: number;
  question: string;
  shortAnswer?: string;
  slug?: string;
  tags?: string[];
  version?: number;
  viewCount?: number;
  /** @deprecated use viewCount */
  views?: number;
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

export const questionAnswerApi = {
  getQuestions: (params?: { limit?: number; page?: number; search?: string }) =>
    apiEnvelopeRequest<QuestionAnswer[]>(`/api/questions${toQuery(params)}`, {
      skipAuth: true,
    }),

  // Persisted Nura Companion chat sessions — chat history the user can
  // reopen and continue, one per topic (or "general"). Login-gated (no
  // skipAuth), unlike ask() above.
  createSession: (topicId?: ChatTopicId) =>
    apiRequest<QaChatSessionSummary>("/api/questions/sessions", {
      body: JSON.stringify({ topicId }),
      method: "POST",
    }),

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
    /** The last few turns, so follow-ups ("why?", "and tomorrow?") make sense. Older backends ignore it. */
    history?: { role: "user" | "assistant"; text: string }[],
  ) =>
    apiRequest<VoiceAgentReply>("/api/voice-agent/converse", {
      body: JSON.stringify({ transcript, language, pendingAction, confirmed, history }),
      method: "POST",
    }).then((reply) => {
      // Most turns change nothing, so this endpoint isn't in MUTATION_TOPICS;
      // only a confirmed action wrote a cycle log on the server.
      if (reply.type === "action_result") emitDataChange("cycle", "dashboard");
      return reply;
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

export type DocType = "bill" | "lab_report" | "other" | "prescription" | "scan";

export type MedicalDocument = {
  _id: string;
  createdAt: string;
  docType: DocType;
  documentDate: string;
  /** "skipped": not read, because AI features are off for this account. */
  extractionStatus?: "done" | "failed" | "limited" | "pending" | "skipped";
  fileKey: string;
  fileSize?: number;
  fileUrl: string;
  mimeType: string;
  originalFileName?: string;
  title: string;
  updatedAt: string;
  userId: string;
  /** "consultation": a Nura doctor's prescription the server saved here; can't be deleted. */
  source?: "upload" | "consultation";
  /** The consultation it came from, when `source` is "consultation". */
  consultationId?: string;
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
    const formData = new FormData();
    formData.append("title", params.title);
    formData.append("docType", params.docType);
    formData.append("documentDate", params.documentDate);
    await appendLocalFile(formData, params.localUri, params.fileName, params.mimeType);
    const data = await multipartRequest<{ document: MedicalDocument }>("/api/documents", formData);
    return data.document;
  },

  list: (params?: { docType?: DocType; limit?: number; page?: number; sort?: "asc" | "desc" }) =>
    apiRequest<{ documents: MedicalDocument[]; pagination: Pagination }>(
      `/api/documents${toQuery(params)}`,
    ),

  /** One document with a fresh `fileUrl`: documents are private and their links expire after 10 minutes. */
  get: (id: string) => apiRequest<{ document: MedicalDocument }>(`/api/documents/${encodeURIComponent(id)}`),

  remove: (id: string) =>
    apiRequest<void>(`/api/documents/${id}`, { method: "DELETE" }),

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
    const fileName = localUri.split("/").pop()?.split("?")[0] || "recording.m4a";
    const formData = new FormData();
    if (languageCode) formData.append("languageCode", languageCode);
    // "audio/m4a" isn't a real IANA media type — the backend forwards this
    // string verbatim as the Content-Type on the multipart part it sends to
    // Sarvam's speech-to-text API, which rejects it as an invalid type.
    // audio/mp4 is the correct type for .m4a (AAC-in-MP4) and matches what
    // the backend itself uses for .m4a elsewhere (mediaUpload.js, contentRoutes.js).
    await appendLocalFile(formData, localUri, fileName, "audio/mp4", (blob) => {
      // A blob: URL has no file name; name it after what the browser recorded
      // (usually audio/webm) so speech-to-text reads the right format.
      const type = blob.type.split(";")[0] || "audio/webm";
      const ext = type.includes("mp4") ? "m4a" : type.split("/")[1] || "webm";
      return `recording.${ext}`;
    });
    return multipartRequest<{ languageCode: string | null; languageProbability: number | null; transcript: string }>(
      "/api/speech/transcribe",
      formData,
      { timeoutMs: 60_000 },
    );
  },

  /** Converts text to speech, returning base64-encoded audio ready to play. */
  synthesize: (payload: { languageCode?: LanguageCode; pace?: number; text: string }) =>
    apiRequest<{ audioBase64: string; audioCodec: string }>("/api/speech/synthesize", {
      body: JSON.stringify(payload),
      method: "POST",
    }),
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
  /** The AI summary needs `health_reports` (older backends leave these out). */
  analysisLocked?: boolean;
  /** Set when this month's AI summaries are used up. */
  analysisLimit?: { limit: number; resetsAt: string } | null;
  cycle: HealthReportCycleStats;
  documentCount: number;
  documents: { docType: DocType; documentDate: string; id: string; title: string }[];
};

export const reportApi = {
  /**
   * Aggregated cycle-log stats + document breakdown + an AI analysis of both,
   * computed server-side in one round trip for the downloadable PDF report.
   */
  /** `includeAnalysis: false` skips the AI summary (the free stats screens
   * don't show it, and it costs an AI call); the doctor PDF leaves it on. */
  getHealthReport: (payload: { endDate: string; includeAnalysis?: boolean; language?: LanguageCode; startDate: string }) =>
    apiRequest<HealthReportResponse>("/api/reports/health-report", {
      body: JSON.stringify(payload),
      method: "POST",
    }),
};

export type SymptomPrediction = {
  /** Finished cycles with any log in this phase (the likelihood's denominator). */
  cyclesAnalyzed: number;
  likelihood: number;
  occurrences: number;
  phase: string;
  symptom: string;
};

export type SymptomPredictionsResponse = {
  nextCycleStart: string | null;
  predictions: SymptomPrediction[];
  /** Finished cycles analysed (the current one isn't counted). */
  cyclesAnalyzed?: number;
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

export type ScreeningCondition = "pcos" | "endometriosis" | "fibroid" | "thyroid";

export type ScreeningQuestion = {
  id: string;
  text: string;
  /** The backend sends "boolean" for yes/no questions. */
  type: "boolean" | "yesno" | "scale";
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
  /** Question ids of red-flag answers: talk to a doctor whatever the score. */
  redFlags?: string[];
  /** Optional caveat, e.g. adult PCOS criteria don't apply to teens. */
  note?: string | null;
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

  /** Past checks, newest first (`GET /api/screening/history`). */
  getHistory: () => apiRequest<ScreeningHistoryItem[]>("/api/screening/history"),
};

export type ScreeningHistoryItem = {
  _id: string;
  condition: ScreeningCondition;
  score: number;
  riskLevel: ScreeningRiskLevel;
  createdAt: string;
};

/* ──────────────────────────────────────────────────────────
   Government Schemes & Benefits
────────────────────────────────────────────────────────── */
