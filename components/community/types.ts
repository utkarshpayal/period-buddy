import type { CommunityAttachment, CommunityPoll } from "../../lib/api";

export type PendingAttachment = {
  uri: string;
  type: "audio" | "image" | "video";
  mimeType: string;
};

export interface Comment {
  id: string;
  author: string;
  avatar: string;
  content: string;
  attachment?: CommunityAttachment;
  time: string;
  isOwner: boolean; // true when this comment belongs to the logged-in user
}

export interface Post {
  id: string;
  author: string;
  avatar: string;
  content: string;
  attachment?: CommunityAttachment;
  poll?: CommunityPoll;
  category?: string;
  tags: string[];
  likes: number;
  commentsCount: number;
  comments: Comment[];
  time: string;
  isOwner: boolean; // true when this post belongs to the logged-in user
}

// Matches the filter chips in the design; posts can carry any category
// string, but composing only ever offers these so filtering stays in sync.
export const COMMUNITY_CATEGORIES = ["PCOS", "Fitness", "Skin"];
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 6;
// Long post bodies are capped at 6 lines past this length, with Read more.
export const LONG_POST_CHAR_THRESHOLD = 240;
