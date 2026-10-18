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

// Short verb labels used on scheme cards. A card only opens the scheme's
// page, so APPLY says "How to apply" rather than promising an application.
export const SCHEME_ACTION_LABELS: Record<SchemeActionType, string> = {
  APPLY: "How to apply",
  CHECK_ELIGIBILITY: "Check eligibility",
  FIND_FACILITY: "Find facility",
  LEARN_MORE: "Learn more",
  EXTERNAL_APPLICATION: "Apply online",
};

// Full call-to-action label + icon shown on the detail screen's primary button.
// APPLY only saves the scheme to My applications in the app (the real
// application happens on the official site), so its label says exactly that.
export const SCHEME_ACTION_CTA: Record<
  SchemeActionType,
  { label: string; icon: string }
> = {
  APPLY: { label: "Track this scheme", icon: "bookmark-outline" },
  CHECK_ELIGIBILITY: { label: "Check if I may be eligible", icon: "checkmark-circle-outline" },
  FIND_FACILITY: { label: "Find Government Hospital", icon: "location-outline" },
  LEARN_MORE: { label: "Learn more", icon: "book-outline" },
  EXTERNAL_APPLICATION: { label: "Apply online", icon: "open-outline" },
};

/** Primary CTA for an APPLY scheme that has an official site to apply on. */
export const APPLY_OFFICIAL_CTA = { label: "Apply on official site", icon: "open-outline" };

export type SchemePrimaryAction = "track" | "official" | "checker" | "maps";

/**
 * What the detail screen's primary button really does, by actionType.
 * APPLY sends people to the official site when there is one (tracking in the
 * app becomes the secondary action); without a site, tracking is primary.
 * FIND_FACILITY opens a maps search, never `officialUrl`.
 */
export function schemePrimaryAction(
  actionType: SchemeActionType,
  hasOfficialUrl: boolean,
): SchemePrimaryAction {
  switch (actionType) {
    case "APPLY":
      return hasOfficialUrl ? "official" : "track";
    case "CHECK_ELIGIBILITY":
      return "checker";
    case "FIND_FACILITY":
      return "maps";
    default:
      return "official";
  }
}

/** Label + icon for the primary button, matching `schemePrimaryAction`. */
export function schemePrimaryCta(
  actionType: SchemeActionType,
  hasOfficialUrl: boolean,
): { label: string; icon: string } {
  if (schemePrimaryAction(actionType, hasOfficialUrl) === "official" && actionType === "APPLY") {
    return APPLY_OFFICIAL_CTA;
  }
  return SCHEME_ACTION_CTA[actionType];
}

/** One helper line under "Track this scheme", in plain words. */
export function trackHelperText(actionType: SchemeActionType): string {
  return actionType === "APPLY" || actionType === "EXTERNAL_APPLICATION"
    ? "Saves it to My applications so you can follow up. Apply on the official site."
    : "Saves it to My applications so you can come back to it.";
}

export type StatusTint = "amber" | "emerald" | "danger" | "blue" | "purple";

// `next` is one plain line telling the person what happens now.
export const APPLICATION_STATUS_META: Record<
  SchemeApplicationStatus,
  { label: string; tint: StatusTint; next: string }
> = {
  draft: {
    label: "Draft",
    tint: "purple",
    next: "Not sent yet. Finish the official steps when you're ready.",
  },
  submitted: {
    label: "Saved",
    tint: "blue",
    next: "Saved to follow up. Next, apply on the official site or at a government centre.",
  },
  in_review: {
    label: "In review",
    tint: "amber",
    next: "It's being checked. This page will change when there's news.",
  },
  approved: {
    label: "Approved",
    tint: "emerald",
    next: "Approved. Follow the official steps to get your benefit.",
  },
  rejected: {
    label: "Not approved",
    tint: "danger",
    next: "Not approved this time. Call the scheme helpline to ask why.",
  },
  withdrawn: {
    label: "Withdrawn",
    tint: "purple",
    next: "You withdrew this. It stays here for your records.",
  },
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


/** All Indian states and union territories, for the eligibility state picker. */
export const INDIAN_STATES_AND_UTS: readonly string[] = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

/** States/UTs whose name contains `query` (case-insensitive); all when empty. */
export function filterIndianStates(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...INDIAN_STATES_AND_UTS];
  return INDIAN_STATES_AND_UTS.filter((s) => s.toLowerCase().includes(q));
}

/** The list's spelling of a saved state ("rajasthan " → "Rajasthan"), else the trimmed input. */
export function canonicalStateName(state?: string | null): string {
  const trimmed = state?.trim() ?? "";
  const match = INDIAN_STATES_AND_UTS.find(
    (s) => s.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ?? trimmed;
}
