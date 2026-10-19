/**
 * Reels screen logic with no React or network in it (unit-tested in
 * lib/__tests__/reels.test.ts): mapping API reels to what the pager draws,
 * optimistic like/save counters, paging helpers and count formatting.
 */
import type { MedicalReview, Reel as ApiReel, ReelComment } from "./api";
import { pickMedicalReview } from "./medicalReview";

export type ReelPollChoice = { id: string; topic: string; votes: number };

export type ReelItem = {
  id: string;
  title: string;
  /** Caption under the video; falls back to the title when the admin left it empty. */
  caption: string;
  tags: string[];
  creatorId: string;
  creatorName: string;
  creatorAvatar: string | null;
  category: string;
  verified: boolean;
  thumbnailUrl: string;
  videoUrl: string;
  /** Set when `videoUrl` is a YouTube link (played through the WebView bridge). */
  youtubeId: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  saveCount: number;
  isLiked: boolean;
  isSaved: boolean;
  pollQuestion: string;
  pollOptions: ReelPollChoice[];
  votedOptionId: string | null;
  /** Medical review stamp (MedicalReviewBadge shows it when medicallyReviewed). */
  review: MedicalReview;
};

/** A view counts once the active reel has really played this long. */
export const REEL_VIEW_AFTER_MS = 2000;
/** The poll slides up once the reel has played this long (mid-video for a short reel). */
export const REEL_POLL_AFTER_MS = 4000;
/** After a vote the results stay up this long, then the poll slides away. */
export const REEL_POLL_RESULTS_MS = 2200;
/** Load the next page when the active reel is this close to the end. */
export const REEL_PREFETCH_REMAINING = 3;
export const REELS_PAGE_SIZE = 10;
/** Two taps closer than this are a double tap (like). */
export const DOUBLE_TAP_MS = 280;
export const REEL_COMMENT_MAX = 500;

// Only the id's own alphabet: it ends up inside a script in the player page.
const YOUTUBE_ID = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([A-Za-z0-9_-]{11})(?:[#&?/].*)?$/;

/** The 11-character id of a YouTube watch/shorts/embed/youtu.be link, else null. */
export function getYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(YOUTUBE_ID);
  return match ? match[2] : null;
}

const nonNegative = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

export function mapApiReel(reel: ApiReel): ReelItem {
  const id = String(reel.id ?? reel._id ?? "");
  const description = typeof reel.description === "string" ? reel.description.trim() : "";
  const options = (reel.pollOptions || []).map((option) => ({
    id: option.optionId,
    topic: option.topic,
    votes: nonNegative(option.votes),
  }));
  return {
    id,
    title: reel.title?.trim() || "Untitled reel",
    caption: description || reel.title?.trim() || "",
    tags: Array.isArray(reel.tags) ? reel.tags.filter((tag) => typeof tag === "string" && tag) : [],
    creatorId: reel.creatorId,
    creatorName: reel.creatorName?.trim() || "Nura creator",
    creatorAvatar: reel.creatorAvatar || null,
    category: reel.category || "Wellness",
    verified: Boolean(reel.verified),
    thumbnailUrl: reel.thumbnailUrl || "",
    videoUrl: reel.directMp4Url || "",
    youtubeId: getYouTubeId(reel.directMp4Url),
    viewCount: nonNegative(reel.viewCount ?? reel.views),
    likeCount: nonNegative(reel.likeCount),
    commentCount: nonNegative(reel.commentCount),
    saveCount: nonNegative(reel.saveCount),
    isLiked: Boolean(reel.isLiked),
    isSaved: Boolean(reel.isSaved),
    pollQuestion: reel.pollQuestion?.trim() || "Vote for the next topic",
    pollOptions: options,
    votedOptionId: reel.votedOptionId ?? null,
    review: pickMedicalReview(reel),
  };
}

export const hasPoll = (reel: Pick<ReelItem, "pollOptions">) => reel.pollOptions.length > 0;

/** Append a page, skipping reels already in the list (a pinned deep-linked reel can reappear). */
export function appendUnique(current: ReelItem[], incoming: ReelItem[]): ReelItem[] {
  const seen = new Set(current.map((reel) => reel.id));
  const added = incoming.filter((reel) => {
    if (!reel.id || seen.has(reel.id)) return false;
    seen.add(reel.id);
    return true;
  });
  return added.length === 0 ? current : [...current, ...added];
}

/** First page, with a deep-linked reel pinned first (and not repeated). */
export function withPinnedFirst(page: ReelItem[], pinned: ReelItem | null): ReelItem[] {
  const unique = appendUnique([], page);
  if (!pinned) return unique;
  return [pinned, ...unique.filter((reel) => reel.id !== pinned.id)];
}

/** Optimistic like: flips the flag and moves the count by one, never below zero. */
export function applyLiked<T extends Pick<ReelItem, "isLiked" | "likeCount">>(reel: T, liked: boolean): T {
  if (reel.isLiked === liked) return reel;
  return { ...reel, isLiked: liked, likeCount: Math.max(0, reel.likeCount + (liked ? 1 : -1)) };
}

export function applySaved<T extends Pick<ReelItem, "isSaved" | "saveCount">>(reel: T, saved: boolean): T {
  if (reel.isSaved === saved) return reel;
  return { ...reel, isSaved: saved, saveCount: Math.max(0, reel.saveCount + (saved ? 1 : -1)) };
}

/** Replace one reel by id; returns the same array when nothing changed. */
export function updateReel(
  reels: ReelItem[],
  id: string,
  update: (reel: ReelItem) => ReelItem,
): ReelItem[] {
  let changed = false;
  const next = reels.map((reel) => {
    if (reel.id !== id) return reel;
    const updated = update(reel);
    if (updated !== reel) changed = true;
    return updated;
  });
  return changed ? next : reels;
}

export function shouldPrefetch(activeIndex: number, length: number): boolean {
  return length > 0 && activeIndex >= length - REEL_PREFETCH_REMAINING;
}

/** 999 → "999", 1200 → "1.2K", 15300 → "15K", 2_400_000 → "2.4M". */
export function formatCount(value: number): string {
  const n = nonNegative(value);
  if (n < 1000) return String(n);
  const [divisor, suffix] = n < 1_000_000 ? [1000, "K"] : [1_000_000, "M"];
  const scaled = n / divisor;
  const text = scaled < 10 ? (Math.floor(scaled * 10) / 10).toFixed(1) : String(Math.floor(scaled));
  return `${text.replace(/\.0$/, "")}${suffix}`;
}

/** "now", "5m", "3h", "2d", "4w", then a short date. */
export function formatCommentAge(iso: string | undefined, now = Date.now()): string {
  const time = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(time)) return "";
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 53) return `${Math.floor(days / 7)}w`;
  return new Date(time).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Captions longer than this (or with more than two lines) get a "more" toggle. */
export function captionNeedsMore(caption: string, maxChars = 90): boolean {
  return caption.length > maxChars || caption.split("\n").length > 2;
}

/** Comments list: add pages without repeating rows (ids are unique). */
export function appendComments(current: ReelComment[], incoming: ReelComment[]): ReelComment[] {
  const seen = new Set(current.map((comment) => comment.id));
  const added = incoming.filter((comment) => !seen.has(comment.id));
  return added.length === 0 ? current : [...current, ...added];
}
