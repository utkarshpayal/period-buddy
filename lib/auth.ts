import {
  apiEnvelopeRequest,
  authApi,
  type AuthResponse,
  type AuthUser,
} from "./api";

export type { AuthResponse, AuthUser };

type LoginPayload = {
  email: string;
  password: string;
};

type SignupPayload = {
  dateOfBirth?: string;
  email: string;
  firstName: string;
  gender?: string;
  lastName: string;
  password: string;
  phone?: string;
};

export type OnboardingPayload = {
  dateOfBirth: string;
  gender: string;
  phone: string;
  profilePicture: string;
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

export function googleAuth(payload: { idToken: string }) {
  return authApi.googleAuth(payload);
}

export function submitOnboarding(payload: OnboardingPayload, token: string) {
  return apiEnvelopeRequest<AuthUser>("/api/auth/onboarding", {
    body: JSON.stringify(payload),
    headers: { Authorization: `Bearer ${token}` },
    method: "POST",
    skipAuth: true,
  });
}
