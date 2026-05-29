const API_BASE_URL = "http://localhost:5000";

export type AuthUser = {
  _id?: string;
  dateOfBirth?: string;
  email?: string;
  firstName?: string;
  gender?: string;
  isProfileComplete?: boolean;
  lastName?: string;
  phone?: string;
  profilePicture?: string;
  role?: string;
};

export type AuthResponse = {
  data?: AuthUser;
  isProfileComplete?: boolean;
  message?: string;
  token?: string;
  user?: AuthUser;
};

type LoginPayload = {
  email: string;
  password: string;
};

type SignupPayload = LoginPayload & {
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phone?: string;
};

export type OnboardingPayload = {
  dateOfBirth: string;
  gender: string;
  phone: string;
  profilePicture: string;
};

async function postAuth(path: string, payload: LoginPayload | SignupPayload) {
  return postJson(path, payload);
}

async function postAuthenticatedAuth(
  path: string,
  payload: OnboardingPayload,
  token: string,
) {
  return postJson(path, payload, token);
}

async function postJson(
  path: string,
  payload: LoginPayload | OnboardingPayload | SignupPayload,
  token?: string,
) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(getErrorMessage(data, response.status));
  }

  return data as AuthResponse;
}

function getErrorMessage(data: unknown, status: number) {
  if (typeof data === "object" && data !== null) {
    const errorData = data as {
      error?: unknown;
      errors?: unknown;
      message?: unknown;
    };

    if (typeof errorData.message === "string") {
      return errorData.message;
    }

    if (typeof errorData.error === "string") {
      return errorData.error;
    }

    if (Array.isArray(errorData.errors) && errorData.errors.length > 0) {
      return errorData.errors
        .map((error) => {
          if (
            typeof error === "object" &&
            error !== null &&
            "message" in error
          ) {
            return String(error.message);
          }

          return String(error);
        })
        .join("\n");
    }
  }

  return `Request failed with status ${status}`;
}

export function loginUser(payload: LoginPayload) {
  return postAuth("/api/auth/login", payload);
}

export function signupUser(payload: SignupPayload) {
  return postAuth("/api/auth/signup", payload);
}

export function submitOnboarding(payload: OnboardingPayload, token: string) {
  return postAuthenticatedAuth("/api/auth/onboarding", payload, token);
}
