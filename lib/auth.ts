import {
  apiEnvelopeRequest,
  authApi,
  partnerApi,
  type AuthResponse,
  type AuthUser,
} from "./api";

export type { AuthResponse, AuthUser };

type LoginPayload = {
  email: string;
  password: string;
};

type SignupPayload = {
  agreedToPrivacyPolicy?: boolean;
  dateOfBirth?: string;
  email: string;
  firstName: string;
  gender?: string;
  lastName: string;
  password: string;
  phone?: string;
  role?: string;
};

export type OnboardingPayload = {
  dateOfBirth: string;
  gender: string;
  phone?: string;
  profilePicture?: string;
};

export type CycleSettingsPayload = {
  cycleLength: number;
  lastPeriodStartDate: string;
  periodLength: number;
  trackingGoal: string;
  // Full multi-select goal set from onboarding. Sent additively alongside the
  // scalar `trackingGoal` (which stays the primary/first goal for backward
  // compat); the backend can adopt this without breaking existing clients.
  trackingGoals?: string[];
};

export function loginUser(payload: LoginPayload) {
  return authApi.login(payload);
}

export function signupUser(payload: SignupPayload) {
  return authApi.signup(payload);
}

export function verifyOtp(payload: { email: string; otp: string }) {
  return authApi.verifyOtp(payload);
}

export function resendOtp(payload: { email: string }) {
  return authApi.resendOtp(payload);
}

export function googleAuth(payload: { idToken: string; role?: string }) {
  return authApi.googleAuth(payload);
}

/**
 * Runs after a user is authenticated. If they arrived via a partner invite
 * code, links them to the owner's account. Either way, resolves their
 * current partner role (a connected "viewer" only ever sees the read-only
 * partner view; everyone else lands in the normal dashboard) so the caller
 * can route and persist it on the session.
 */
export async function connectPartnerAndResolveRoute(inviteCode?: string) {
  let connectError: string | undefined;

  if (inviteCode?.trim()) {
    try {
      await partnerApi.connectPartner(inviteCode.trim().toUpperCase());
    } catch (error) {
      connectError =
        error instanceof Error
          ? error.message
          : "Unable to connect with that code.";
    }
  }

  let partnerRole: "owner" | "viewer" | null = null;
  try {
    const profile = await partnerApi.getProfile();
    partnerRole = profile.role ?? null;
  } catch {
    partnerRole = null;
  }

  return {
    connectError,
    partnerRole,
    destination:
      partnerRole === "viewer"
        ? ("/(app)/(partner-view)/overview" as const)
        : ("/(app)/(dashboard)/tracker" as const),
  };
}

/**
 * `token` is the session's own token (already handed to the API client by
 * setSessionToken); it's sent explicitly as well because onboarding runs in
 * the moment right after sign-in. These go through the normal authed path
 * (no skipAuth), so a revoked session still signs out on a 401.
 */
export function submitOnboarding(payload: OnboardingPayload, token: string) {
  return apiEnvelopeRequest<AuthUser>("/api/auth/onboarding", {
    body: JSON.stringify(payload),
    headers: { Authorization: `Bearer ${token}` },
    method: "POST",
  });
}

/** Called right after submitOnboarding; see its note on the token. */
export function submitCycleSettings(payload: CycleSettingsPayload, token: string) {
  return apiEnvelopeRequest("/api/cycle/settings", {
    body: JSON.stringify(payload),
    headers: { Authorization: `Bearer ${token}` },
    method: "POST",
  });
}
