/**
 * Google sign-in on web (and the installed PWA) as a full-page redirect.
 *
 * expo-auth-session's web flow opens a popup and hands the result back through
 * `window.opener` + localStorage. An installed PWA breaks both: on iOS the
 * popup opens in a separate Safari context (no opener, separate storage), and
 * on Android it opens in a Custom Tab. So on web the whole page goes to Google
 * and comes back to the site root with `#id_token=…`, all in one window.
 *
 * Flow: `startGoogleRedirect()` saves state/nonce/role/return path and leaves;
 * on the next page load `captureGoogleRedirect()` (called once from
 * app/_layout.tsx before the router renders) reads and clears the hash;
 * app/index.tsx sends the person back to the login/signup screen they came
 * from, and GoogleSignInButton there takes the result and finishes sign-in.
 *
 * The redirect URI is the site's origin (same as expo-auth-session used), so
 * the Web OAuth client in Google Cloud must list it under both "Authorized
 * JavaScript origins" and "Authorized redirect URIs".
 */

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const PENDING_KEY = "period-buddy.google-web-auth";
/** A sign-in left unfinished longer than this is ignored. */
export const PENDING_TTL_MS = 10 * 60 * 1000;

export type PendingGoogleAuth = {
  state: string;
  nonce: string;
  role?: string;
  returnPath: string;
  startedAt: number;
};

export type GoogleRedirectResult =
  | { kind: "success"; idToken: string; role?: string; returnPath: string }
  | { kind: "error"; message: string; returnPath: string };

export const GOOGLE_DENIED_MESSAGE =
  'Google denied this sign-in. If you tapped "Cancel" or "Deny", try again and allow access. Otherwise this app\'s Google sign-in isn\'t authorized yet for your account — contact support.';
const GOOGLE_INCOMPLETE_MESSAGE = "Google sign-in didn't complete. Please try again.";

export function buildGoogleAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "id_token",
    scope: "openid email profile",
    state: opts.state,
    nonce: opts.nonce,
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/** Only same-site paths ("/login", "/signup?role=x"), never "//evil.com". */
export function safeReturnPath(path: string | undefined | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return "/login";
  return path;
}

/** Google's answer from the URL hash (implicit flow) or query (errors). */
export function parseGoogleRedirect(
  hash: string,
  search = "",
): { idToken?: string; error?: string; state?: string } | null {
  const read = (raw: string) => new URLSearchParams(raw.replace(/^[#?]/, ""));
  for (const params of [read(hash), read(search)]) {
    const idToken = params.get("id_token") ?? undefined;
    const error = params.get("error") ?? undefined;
    if (!idToken && !error) continue;
    return { idToken, error, state: params.get("state") ?? undefined };
  }
  return null;
}

/** The JWT's payload, unverified (the backend verifies the signature). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? decodeURIComponent(
            Array.from(atob(padded), (c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""),
          )
        : Buffer.from(padded, "base64").toString("utf8");
    const value = JSON.parse(json);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Checks Google's answer against the sign-in this browser started: the state
 * must match (it was us who asked) and the token's nonce too (the token was
 * issued for this request, not replayed). Null when there's nothing to do.
 */
export function resolveGoogleRedirect(
  parsed: ReturnType<typeof parseGoogleRedirect>,
  pending: PendingGoogleAuth | null,
  now = Date.now(),
): GoogleRedirectResult | null {
  if (!parsed) return null;
  if (!pending || now - pending.startedAt > PENDING_TTL_MS || parsed.state !== pending.state) {
    return { kind: "error", message: GOOGLE_INCOMPLETE_MESSAGE, returnPath: safeReturnPath(pending?.returnPath) };
  }
  const returnPath = safeReturnPath(pending.returnPath);
  if (parsed.error) {
    return {
      kind: "error",
      message: parsed.error === "access_denied" ? GOOGLE_DENIED_MESSAGE : GOOGLE_INCOMPLETE_MESSAGE,
      returnPath,
    };
  }
  if (!parsed.idToken || decodeJwtPayload(parsed.idToken)?.nonce !== pending.nonce) {
    return { kind: "error", message: GOOGLE_INCOMPLETE_MESSAGE, returnPath };
  }
  return { kind: "success", idToken: parsed.idToken, role: pending.role, returnPath };
}

// ---- Browser side (web only; every call is a no-op elsewhere) ----

const isBrowser = () => typeof window !== "undefined" && typeof window.location !== "undefined";

function randomHex(bytes = 16): string {
  const values = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (v) => v.toString(16).padStart(2, "0")).join("");
}

function readPending(): PendingGoogleAuth | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingGoogleAuth) : null;
  } catch {
    return null;
  }
}

function clearPending() {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {}
}

/** Leaves the page for Google's sign-in. Call from a tap. */
export function startGoogleRedirect(opts: { clientId: string; role?: string }) {
  if (!isBrowser()) return;
  const pending: PendingGoogleAuth = {
    state: randomHex(),
    nonce: randomHex(),
    role: opts.role,
    returnPath: safeReturnPath(window.location.pathname + window.location.search),
    startedAt: Date.now(),
  };
  // localStorage, not sessionStorage: it survives the trip in every browser
  // and in an installed PWA, which navigates out and back in one context.
  window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  window.location.assign(
    buildGoogleAuthUrl({
      clientId: opts.clientId,
      redirectUri: window.location.origin,
      state: pending.state,
      nonce: pending.nonce,
    }),
  );
}

let captured: GoogleRedirectResult | null = null;
let didCapture = false;

/**
 * Reads Google's answer from the URL once, at startup, and removes it from
 * the address bar (and history) so the token never lingers there.
 */
export function captureGoogleRedirect() {
  if (didCapture || !isBrowser()) return;
  didCapture = true;
  const parsed = parseGoogleRedirect(window.location.hash, window.location.search);
  if (!parsed) return;
  captured = resolveGoogleRedirect(parsed, readPending());
  clearPending();
  try {
    window.history.replaceState(window.history.state, "", window.location.pathname);
  } catch {}
}

/** The waiting result, left in place (for routing to its screen). */
export function peekGoogleRedirectResult(): GoogleRedirectResult | null {
  return captured;
}

/** The waiting result, handed over once. */
export function takeGoogleRedirectResult(): GoogleRedirectResult | null {
  const result = captured;
  captured = null;
  return result;
}
