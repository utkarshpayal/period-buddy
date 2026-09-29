// Mirrors the backend's validatePasswordStrength (The-Nura-Backend
// src/utils/password.js), so signup can show every rule live instead of
// failing on submit. Keep the two in sync.
export const PASSWORD_RULES: { id: string; label: string; test: (value: string) => boolean }[] = [
  { id: "length", label: "8+ characters", test: (value) => value.length >= 8 },
  { id: "upper", label: "Uppercase letter", test: (value) => /[A-Z]/.test(value) },
  { id: "lower", label: "Lowercase letter", test: (value) => /[a-z]/.test(value) },
  { id: "number", label: "Number", test: (value) => /\d/.test(value) },
  { id: "symbol", label: "Symbol", test: (value) => /[^A-Za-z\d]/.test(value) },
];

export function isStrongPassword(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}
