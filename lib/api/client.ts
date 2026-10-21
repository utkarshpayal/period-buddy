import Constants from "expo-constants";
import { Platform } from "react-native";
import { emitMutation } from "../data-sync";
import { getDeviceId } from "../deviceId";
import { loadSessionToken } from "../sessionStore";
import type { QuestionAnswer } from "./ai";
import type { AuthUser } from "./auth";

const LOCAL_DEV_API_PORT = "5000";
const envApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
// Backend URLs per environment, from app.json's `extra.apiBaseUrls`.
const configApiBaseUrls = Constants.expoConfig?.extra?.apiBaseUrls as { prod?: string; stage?: string } | undefined;
const API_BASE_URLS = {
  prod: configApiBaseUrls?.prod?.trim() || "https://www.backend.thenura.care",
  stage: configApiBaseUrls?.stage?.trim() || "https://stage.backend.thenura.care",
};
// The prod/stage toggle: EXPO_PUBLIC_APP_ENV=prod|stage (in .env or eas.json).
// Unset means prod for release builds and the local backend in __DEV__.
const envAppEnv = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
export const APP_ENV: "prod" | "stage" | undefined =
  envAppEnv === "stage" || envAppEnv === "prod" ? envAppEnv : undefined;

function getLocalDevApiBaseUrl() {
  // The browser runs on this machine, so the local backend is on localhost
  // (Metro's hostUri there can be a LAN IP the backend's CORS doesn't allow).
  if (Platform.OS === "web") return `http://localhost:${LOCAL_DEV_API_PORT}`;

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
  envApiBaseUrl ||
  (APP_ENV ? API_BASE_URLS[APP_ENV] : __DEV__ ? getLocalDevApiBaseUrl() : API_BASE_URLS.prod)
).replace(/\/+$/, "");
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");
/** The installed app's version (app.json `version`), e.g. "1.0.0". */
export const APP_VERSION: string =
  Constants.expoConfig?.version ?? (Constants as unknown as { nativeAppVersion?: string }).nativeAppVersion ?? "0.0.0";
/** Platform name as the CMS audience rules and waitlist export use it. */
export const APP_PLATFORM: "android" | "ios" | "web" =
  Platform.OS === "ios" ? "ios" : Platform.OS === "web" ? "web" : "android";
export { AUTH_SESSION_KEY } from "../sessionStore";

export type QueryValue = boolean | number | string | null | undefined;

export type ApiEnvelope<T> = {
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
  /** The server's machine-readable `code`, when it sent one (e.g. JOIN_WINDOW_NOT_OPEN). */
  code?: string;
  /** The error body's other fields (e.g. `opensAt`), for callers that know the endpoint. */
  details?: Record<string, unknown>;

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
// explicitly on a 401 below. Only used while AuthProvider hasn't handed over
// the session token (`setSessionToken`), e.g. a request fired during launch.
const TOKEN_CACHE_TTL_MS = 30_000;
let cachedToken: { readAt: number; token: string | null } | null = null;

export function invalidateTokenCache() {
  cachedToken = null;
}

// The signed-in session's token, set by AuthProvider on sign-in, launch and
// sign-out. Requests use it first, so they never depend on the keystore write
// that follows a sign-in: screens mount and fetch as soon as the session is
// set, and reading storage before that write landed sent them (and, through
// the cache, every request for the next 30s) with no Authorization header
// ("No authentication token provided").
let sessionToken: string | null = null;
// Once AuthProvider has spoken (sign-in, launch with a session, sign-out),
// `sessionToken` is the truth. Without this, a request fired right after
// sign-out (by the refetches clearAccountData triggers) would read the old
// token back from the keystore before clearSession() removes it, and cache it.
let sessionTokenSet = false;

export function setSessionToken(token: string | null) {
  sessionToken = token;
  sessionTokenSet = true;
  cachedToken = null;
}

export async function getToken(): Promise<string | null> {
  if (sessionToken || sessionTokenSet) return sessionToken;
  if (cachedToken && Date.now() - cachedToken.readAt < TOKEN_CACHE_TTL_MS) {
    return cachedToken.token;
  }
  try {
    // The token lives in the OS keystore (lib/sessionStore.ts).
    const token = await loadSessionToken();
    // Never cache "no token": a sign-in may be writing one right now.
    if (token) cachedToken = { readAt: Date.now(), token };
    return token;
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

/** Whether a `Pagination` block says another page exists (false when absent). */
export function hasMorePages(pagination?: Pagination | null) {
  return Boolean(pagination && pagination.page < pagination.pages);
}

export function toQuery(params?: Record<string, QueryValue>) {
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
    // A FormData body sets its own multipart Content-Type (with the boundary).
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };

  if (token) headers.Authorization = `Bearer ${token}`;
  // Which install and version is asking: shown in Privacy → Signed-in devices.
  headers["X-App-Version"] = APP_VERSION;
  // The phone's UTC offset, so cycle day, phase and "days until" count from
  // the person's local today, not server UTC (backend clientTodayKey).
  headers["X-Timezone-Offset"] = String(new Date().getTimezoneOffset());
  if (path.startsWith("/api/auth/")) headers["X-Device-Id"] = await getDeviceId();

  // Time out the request so a dropped/slow connection surfaces a clear error
  // instead of hanging the screen's loading state forever. The timer covers
  // reading the body too: a large response can stall after the headers.
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer =
    timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  // Respect a caller-provided AbortSignal alongside our timeout one.
  const abortFromCaller = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", abortFromCaller, { once: true });
  }

  let response: Response;
  let text: string;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
    text = await response.text();
  } catch {
    // fetch only rejects on network failure or abort — never on HTTP status.
    if (callerSignal?.aborted) {
      // The caller cancelled on purpose (e.g. the screen moved on): not an
      // offline error, so it must not show the offline state.
      const aborted = new Error("The request was cancelled.");
      aborted.name = "AbortError";
      throw aborted;
    }
    if (controller.signal.aborted) {
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
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }

  let data: unknown = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (!response.ok) {
      // Not JSON: a proxy/load balancer page (502 HTML, nginx 413, ...).
      // Never show its body to the user.
      throw new ApiError(
        nonJsonErrorMessage(response.status),
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
    const error = new ApiError(getErrorMessage(data, response.status), kind, response.status);
    if (data && typeof data === "object") {
      const body = data as Record<string, unknown>;
      if (typeof body.code === "string") error.code = body.code;
      error.details = body;
    }
    throw error;
  }

  // Tell still-mounted screens that show this data to refetch (lib/data-sync.ts).
  emitMutation(fetchOptions.method ?? "GET", path);

  return data as ApiEnvelope<T>;
}

function nonJsonErrorMessage(status: number) {
  if (status === 413) return "This file is too large to upload.";
  if (status >= 500) return "Our servers are having trouble. Please try again in a moment.";
  return `Request failed (${status})`;
}

/** Uploads take longer than a JSON call on a phone connection. */
const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * Appends a local file (picker/recorder URI) to a multipart form. On web,
 * FormData needs a real Blob/File: the RN {uri,name,type} shape would be
 * silently stringified to "[object Object]" instead of becoming a file part.
 */
export async function appendLocalFile(
  formData: FormData,
  localUri: string,
  fileName: string,
  mimeType: string,
  webFileName?: (blob: Blob) => string,
) {
  if (Platform.OS === "web") {
    const blob = await (await fetch(localUri)).blob();
    formData.append("file", blob, webFileName ? webFileName(blob) : fileName);
  } else {
    formData.append("file", { uri: localUri, name: fileName, type: mimeType } as unknown as Blob);
  }
}

/** POSTs a multipart form through the normal request path (auth, timeout, typed errors, data-sync). */
export function multipartRequest<T>(path: string, formData: FormData, options: RequestOptions = {}) {
  return apiRequest<T>(path, { timeoutMs: UPLOAD_TIMEOUT_MS, ...options, body: formData, method: "POST" });
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const envelope = await apiEnvelopeRequest<T>(path, options);
  return (envelope.data !== undefined ? envelope.data : envelope) as T;
}
