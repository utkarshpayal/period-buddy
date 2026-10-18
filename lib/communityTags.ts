/**
 * Custom tags on community posts ("+ Add tag" in the composer). Mirrors the
 * backend's `utils/communityTags.js`, which is what actually enforces these
 * rules — this copy just keeps the composer from offering a tag the server
 * would refuse.
 */

export const MAX_COMMUNITY_TAGS = 5;
export const MAX_COMMUNITY_TAG_LENGTH = 24;

/** Leading '#'s removed, only letters, digits, spaces, '-' and '_' kept,
 * whitespace collapsed. '' when nothing usable is left. */
export function sanitizeCommunityTag(value: string): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/^[\s#]+/u, "")
    .replace(/[^\p{L}\p{N}\p{M} _-]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type AddTagResult =
  | { ok: true; tags: string[] }
  | { ok: false; tags: string[]; reason: "empty" | "duplicate" | "too_long" | "limit" };

/** Adds a typed tag to the list, or says why it can't be added. Duplicates
 * are matched ignoring case, like the server does. */
export function addCommunityTag(tags: string[], raw: string): AddTagResult {
  const tag = sanitizeCommunityTag(raw);
  if (!tag) return { ok: false, tags, reason: "empty" };
  if (tag.length > MAX_COMMUNITY_TAG_LENGTH) return { ok: false, tags, reason: "too_long" };
  const key = tag.toLocaleLowerCase();
  if (tags.some((existing) => existing.toLocaleLowerCase() === key)) {
    return { ok: false, tags, reason: "duplicate" };
  }
  if (tags.length >= MAX_COMMUNITY_TAGS) return { ok: false, tags, reason: "limit" };
  return { ok: true, tags: [...tags, tag] };
}

/** Same tag, ignoring case (for the feed's active-tag highlight). */
export function sameCommunityTag(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return sanitizeCommunityTag(a).toLocaleLowerCase() === sanitizeCommunityTag(b).toLocaleLowerCase();
}
