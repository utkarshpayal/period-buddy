import type { MedicalReview } from "./api";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Oct 2026", or null for a missing/invalid date. Built by hand so it
 * reads the same on every device (Hermes' Intl support varies). */
export function formatReviewDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Text for the "Medically reviewed" badge, or null when the item isn't
 * reviewed (the badge then isn't shown). */
export function medicalReviewLabel(item?: MedicalReview | null): { title: string; date: string | null } | null {
  if (!item?.medicallyReviewed) return null;
  const name = typeof item.reviewedBy === "string" ? item.reviewedBy.trim() : "";
  return {
    title: name ? `Medically reviewed by ${name}` : "Medically reviewed",
    date: formatReviewDate(item.reviewedAt),
  };
}

/** Just the review stamp of an API item, for screens that map API objects
 * into their own view types. */
export function pickMedicalReview(item: MedicalReview): MedicalReview {
  return { medicallyReviewed: item.medicallyReviewed, reviewedBy: item.reviewedBy, reviewedAt: item.reviewedAt };
}
