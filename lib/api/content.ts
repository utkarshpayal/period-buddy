import { analyticsAllowed } from "../analyticsConsent";
import type { LanguageCode } from "./ai";
import { apiRequest, type Pagination, toQuery } from "./client";

export type BlogCategory = "general" | "health" | "lifestyle" | "beauty";
export type BlogStatus = "draft" | "published" | "archived";

/** Medical-review stamp the backend sets when a Content Super Admin reviews
 * an item. Only published items are served, so these never describe a draft. */
export type MedicalReview = {
  medicallyReviewed?: boolean;
  /** Reviewer's display name. */
  reviewedBy?: string | null;
  /** ISO date of the review. */
  reviewedAt?: string | null;
};

export type Blog = MedicalReview & {
  _id: string;
  author?: string;
  authorId?: string;
  canonicalUrl?: string;
  category?: BlogCategory;
  content?: string;
  coverImageUrl?: string;
  excerpt?: string;
  isPublished: boolean;
  /** @deprecated use likeCount */
  likesCount: number;
  likeCount?: number;
  publishedAt?: string;
  /** Minutes to read, from the article's word count (server-computed). */
  readTimeMinutes?: number;
  /** Average active reading time per read (on screen, not idle); null until anyone has read it. */
  averageReadMinutes?: number | null;
  averageReadSeconds?: number | null;
  /** Share of reads that reached the end (0–1). */
  completionRate?: number | null;
  readSessionCount?: number;
  seoDescription?: string;
  seoTitle?: string;
  slug: string;
  status: BlogStatus;
  tags?: string[];
  title: string;
  /** @deprecated use viewCount */
  viewsCount: number;
  viewCount?: number;
};

export type ContentFeedItem = {
  author: string;
  category?: BlogCategory;
  id: string;
  imageUrl: string;
  likeCount?: number;
  publishedAt?: string;
  readTimeMinutes?: number;
  /** Real average active reading time per visit (seconds); null until anyone has read it. */
  averageReadSeconds?: number | null;
  slug?: string;
  sourceId: string;
  summary: string;
  tags?: string[];
  time: string;
  title: string;
  type: "blog" | "reel";
  verified: boolean;
  viewCount?: number;
};

export type ReelPollOption = {
  optionId: string;
  topic: string;
  votes: number;
};

export type Reel = MedicalReview & {
  _id?: string;
  category: string;
  commentCount?: number;
  /** @deprecated */
  creatorAvatar?: string;
  creatorId: string;
  /** @deprecated */
  creatorName: string;
  /** Caption (admin "summary"); the app falls back to `title`. */
  description?: string;
  directMp4Url: string;
  duration: string;
  followedByMe?: boolean;
  id: string;
  /** The signed-in person liked / saved it (GET /api/reels, /:id, /saved). */
  isLiked?: boolean;
  isSaved?: boolean;
  likeCount?: number;
  pollOptions: ReelPollOption[];
  pollQuestion?: string;
  saveCount?: number;
  shareCount?: number;
  tags?: string[];
  thumbnailUrl: string;
  title: string;
  verified: boolean;
  /** @deprecated use viewCount */
  views: number;
  viewCount?: number;
  votedOptionId?: string | null;
  watchTime?: number;
};

/** One reel comment (GET/POST /api/reels/:id/comments). The author's account id is never sent. */
export type ReelComment = {
  id: string;
  reelId: string;
  text: string;
  createdAt: string;
  author: { name: string; avatar: string | null };
  isOwn: boolean;
  canDelete: boolean;
  /** Client-only: optimistic row still being sent. */
  pending?: boolean;
};

export type HealthIssue = MedicalReview & {
  _id?: string;
  category: string;
  causes?: string[];
  color: string;
  guide: string;
  icon: string;
  id?: string;
  imageUrl?: string;
  order?: number;
  prevention?: string;
  summary: string;
  symptoms?: string[];
  title: string;
  treatment?: string;
  whenToSeeDoctor?: string;
};

export type WellbeingResource = MedicalReview & {
  _id?: string;
  audioUrl?: string;
  color: string;
  estimatedReadTime?: number;
  extendedGuide: string[];
  icon: string;
  id?: string;
  items: number;
  order?: number;
  summary: string;
  title: string;
  type: "hygiene" | "sexual_wellbeing";
  videoUrl?: string;
};

export type WellbeingGameDeck = {
  cards: unknown[];
  deck: "positions" | "spark" | string;
};

export const blogsApi = {
  getFeed: (params?: {
    category?: BlogCategory;
    limit?: number;
    page?: number;
    search?: string;
    tag?: string;
    type?: "all" | "blog" | "reel";
  }) =>
    apiRequest<{ items: ContentFeedItem[]; pagination: Pagination }>(
      `/api/blogs/feed${toQuery(params)}`,
    ),

  getBlogBySlug: (slug: string) => apiRequest<Blog>(`/api/blogs/${slug}`),

  translateBlog: (slug: string, language: LanguageCode) =>
    apiRequest<{ content: string; language: LanguageCode; title: string }>(
      `/api/blogs/${slug}/translate`,
      { body: JSON.stringify({ language }), method: "POST" },
    ),

  toggleBookmark: (id: string) =>
    apiRequest<{ bookmarked: boolean }>(`/api/blogs/${id}/bookmark`, {
      method: "POST",
    }),

  getBookmarks: () => apiRequest<{ blogs: Blog[] }>("/api/blogs/bookmarks"),

  /**
   * Reports active reading time (lib/readTimer.ts) so the backend counts a
   * genuine view and a real average. `continued` adds to a read already
   * counted; `completed` marks that the reader reached the end.
   */
  trackView: async (id: string, report: { durationSeconds: number; continued?: boolean; completed?: boolean }) =>
    // Read-time analytics: never sent for under-18s (lib/analyticsConsent.ts).
    !analyticsAllowed()
      ? null
      : apiRequest<{ counted: boolean; readTimeMinutes?: number; viewCount?: number }>(
          `/api/blogs/${id}/track-view`,
          { body: JSON.stringify(report), method: "POST" },
        ),

};

export const reelsApi = {
  getReels: (params?: {
    category?: string;
    limit?: number;
    page?: number;
    search?: string;
  }) =>
    apiRequest<{ pagination: Pagination; reels: Reel[] }>(
      `/api/reels${toQuery(params)}`,
    ),

  getReelById: (id: string) => apiRequest<Reel>(`/api/reels/${id}`),

  /** The signed-in person's saved reels, newest save first. */
  getSaved: (params?: { limit?: number; page?: number }) =>
    apiRequest<{ pagination: Pagination; reels: Reel[] }>(`/api/reels/saved${toQuery(params)}`),

  /** Sets (never toggles) the like, so retries and double taps are safe. */
  setLike: (id: string, liked: boolean) =>
    apiRequest<{ liked: boolean; likeCount: number }>(`/api/reels/${id}/like`, {
      body: JSON.stringify({ liked }),
      method: "POST",
    }),

  /** Sets (never toggles) the bookmark. */
  setSaved: (id: string, saved: boolean) =>
    apiRequest<{ saved: boolean; saveCount: number }>(`/api/reels/${id}/save`, {
      body: JSON.stringify({ saved }),
      method: "POST",
    }),

  /** Newest first; pass the previous page's `nextCursor` for the next one. */
  getComments: (id: string, params?: { cursor?: string | null; limit?: number }) =>
    apiRequest<{ comments: ReelComment[]; nextCursor: string | null; commentCount: number }>(
      `/api/reels/${id}/comments${toQuery({ cursor: params?.cursor ?? undefined, limit: params?.limit })}`,
    ),

  addComment: (id: string, text: string) =>
    apiRequest<{ comment: ReelComment; commentCount: number }>(`/api/reels/${id}/comments`, {
      body: JSON.stringify({ text }),
      method: "POST",
    }),

  deleteComment: (id: string, commentId: string) =>
    apiRequest<{ commentCount: number }>(`/api/reels/${id}/comments/${commentId}`, {
      method: "DELETE",
    }),

  reportComment: (id: string, commentId: string) =>
    apiRequest<{ reported: boolean }>(`/api/reels/${id}/comments/${commentId}/report`, {
      method: "POST",
    }),

  recordView: (id: string) =>
    apiRequest<{ views: number; viewCount?: number }>(`/api/reels/${id}/view`, {
      method: "PATCH",
    }),

  toggleFollowCreator: (id: string) =>
    apiRequest<{ followedByMe: boolean; tokensAwarded?: number }>(
      `/api/reels/${id}/follow`,
      { method: "PATCH" },
    ),

  votePoll: (id: string, optionId: string) =>
    apiRequest<{ pollOptions: ReelPollOption[]; tokensAwarded: number }>(
      `/api/reels/${id}/vote`,
      {
        body: JSON.stringify({ optionId }),
        method: "POST",
      },
    ),

};

export const healthIssuesApi = {
  getIssues: () => apiRequest<HealthIssue[]>("/api/health-issues"),

};

export const wellbeingApi = {
  getResources: (type?: WellbeingResource["type"]) =>
    apiRequest<WellbeingResource[]>(`/api/wellbeing${toQuery({ type })}`),

  /**
   * Reports how long the reader actually had the resource open, so the
   * backend can refine its read-time average instead of relying on a static
   * admin estimate.
   */
  trackView: async (id: string, durationSeconds: number) =>
    // Read-time analytics: never sent for under-18s (lib/analyticsConsent.ts).
    !analyticsAllowed()
      ? null
      : apiRequest<{ counted: boolean; estimatedReadTime?: number }>(
          `/api/wellbeing/${id}/track-view`,
          { body: JSON.stringify({ durationSeconds }), method: "POST" },
        ),

  getGameDecks: (deck?: "positions" | "spark") =>
    apiRequest<WellbeingGameDeck>(`/api/wellbeing/games${toQuery({ deck })}`),

  drawGameCard: (deck: "positions" | "spark", index: number) =>
    apiRequest<{
      card: unknown;
      deck: string;
      index: number;
      tokensAwarded: number;
    }>(`/api/wellbeing/games/${deck}/draw`, {
      body: JSON.stringify({ index }),
      method: "POST",
    }),

};
