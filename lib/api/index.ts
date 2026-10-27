/**
 * Every backend call goes through here. `from "…/lib/api"` resolves to this
 * index: the HTTP client (client.ts) plus one file per domain, each holding
 * its types and its API object together.
 */
export {
  API_BASE_URL,
  apiEnvelopeRequest,
  ApiError,
  type ApiErrorKind,
  apiRequest,
  APP_PLATFORM,
  APP_VERSION,
  type FeatureLockInfo,
  getFriendlyErrorMessage,
  getWebSocketUrl,
  hasMorePages,
  invalidateTokenCache,
  isFeatureLockedError,
  isNetworkError,
  type Pagination,
  setSessionToken,
  setUnauthorizedHandler,
  type UnauthorizedReason,
  WS_BASE_URL,
  AUTH_SESSION_KEY,
} from "./client";
export * from "./ai";
export * from "./appConfig";
export * from "./auth";
export * from "./community";
export * from "./consultation";
export * from "./content";
export * from "./cycle";
export * from "./genz";
export * from "./notifications";
export * from "./partner";
export * from "./schemes";
export * from "./subscription";
export * from "./support";
export * from "./upload";
