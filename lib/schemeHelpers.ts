/**
 * Pure, dependency-free helpers for the Government Schemes feature, extracted
 * so they can be unit-tested without pulling in React Native. Keep this file
 * free of any RN / expo imports.
 */
import type {
  SchemeActionType,
  SchemeApplication,
  SchemeApplicationStatus,
} from "./api";

// Short verb labels used on scheme cards.
export const SCHEME_ACTION_LABELS: Record<SchemeActionType, string> = {
  APPLY: "Apply",
  CHECK_ELIGIBILITY: "Check eligibility",
  FIND_FACILITY: "Find facility",
  LEARN_MORE: "Learn more",
  EXTERNAL_APPLICATION: "Apply online",
};

// Full call-to-action label + icon shown on the detail screen's primary button.
export const SCHEME_ACTION_CTA: Record<
  SchemeActionType,
  { label: string; icon: string }
> = {
  APPLY: { label: "Apply", icon: "create-outline" },
  CHECK_ELIGIBILITY: { label: "Check Eligibility", icon: "checkmark-circle-outline" },
  FIND_FACILITY: { label: "Find Government Hospital", icon: "location-outline" },
  LEARN_MORE: { label: "Learn More", icon: "book-outline" },
  EXTERNAL_APPLICATION: { label: "Apply Online", icon: "open-outline" },
};

export type StatusTint = "amber" | "emerald" | "danger" | "blue" | "purple";

export const APPLICATION_STATUS_META: Record<
  SchemeApplicationStatus,
  { label: string; tint: StatusTint }
> = {
  draft: { label: "Draft", tint: "purple" },
  submitted: { label: "Saved", tint: "blue" },
  in_review: { label: "In review", tint: "amber" },
  approved: { label: "Approved", tint: "emerald" },
  rejected: { label: "Rejected", tint: "danger" },
  withdrawn: { label: "Withdrawn", tint: "purple" },
};

export const STATUS_TINT_TO_COLOR_KEY: Record<
  StatusTint,
  "warning" | "success" | "danger" | "info" | "accent"
> = {
  amber: "warning",
  emerald: "success",
  danger: "danger",
  blue: "info",
  purple: "accent",
};

/** The scheme slug for deep-linking, whether the app's schemeId is populated or a raw id. */
export function schemeSlugOf(app: SchemeApplication): string | undefined {
  return typeof app.schemeId === "object" && app.schemeId
    ? app.schemeId.slug
    : undefined;
}

/** Best display name for an application row, tolerating populate/no-populate. */
export function applicationDisplayName(app: SchemeApplication): string {
  if (typeof app.schemeId === "object" && app.schemeId?.name) {
    return app.schemeId.name;
  }
  return app.schemeName || "Scheme application";
}

/** Only APPLY-type benefits create an in-app application record. */
export function supportsInAppApplication(actionType: SchemeActionType): boolean {
  return actionType === "APPLY";
}

/** Applicant label for the admin queue, from a populated (or raw) userId. */
export function applicantLabel(app: SchemeApplication): string {
  if (typeof app.userId === "object" && app.userId) {
    const name = [app.userId.firstName, app.userId.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return name || app.userId.email || "Applicant";
  }
  return "Applicant";
}

/** Applicant email for the admin queue, if available. */
export function applicantEmail(app: SchemeApplication): string | undefined {
  return typeof app.userId === "object" ? app.userId?.email : undefined;
}

/**
 * A Google Maps search URL for nearby government hospitals. FIND_FACILITY
 * schemes point here instead of the scheme's info page (`officialUrl`), which
 * is not a facility locator. When we know the user's state we scope the query
 * to it; otherwise we fall back to a "near me" search that uses device
 * location. Kept pure so it's unit-testable without RN/Linking.
 */
export function governmentHospitalMapsUrl(state?: string | null): string {
  const trimmed = state?.trim();
  const query = trimmed
    ? `government hospital in ${trimmed}`
    : "government hospital near me";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query,
  )}`;
}
