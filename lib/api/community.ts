import type { AuthUser } from "./auth";
import { apiRequest, type Pagination, toQuery } from "./client";

export type CommunityExpert = {
  verified: boolean;
  showName: boolean;
  name?: string | null;
  specialty?: string | null;
  avatarUrl?: string | null;
};

export type CommunityComment = {
  _id?: string;
  attachments?: CommunityAttachment[];
  content: string;
  createdAt?: string;
  id?: string;
  isAnonymous?: boolean;
  likes?: number;
  userId?: string | (Pick<AuthUser, "firstName" | "lastName" | "profilePicture"> & { isOwn?: boolean });
  expert?: CommunityExpert | null;
};

export type CommunityAttachment = {
  key?: string;
  type: "audio" | "image" | "video";
  url: string;
};

export type CommunityPollOption = {
  optionId: string;
  topic: string;
  votes: number;
};

export type CommunityPoll = {
  question?: string;
  allowMultiple: boolean;
  options: CommunityPollOption[];
  totalVotes: number;
  /** optionIds the requesting user has already voted for ([] if not yet voted) */
  myVote: string[];
};

export type CommunityPost = {
  _id: string;
  attachments?: CommunityAttachment[];
  poll?: CommunityPoll;
  category?: string;
  commentCount?: number;
  comments?: CommunityComment[];
  /** @deprecated use commentCount */
  commentsCount: number;
  expertAnswerCount?: number;
  content: string;
  createdAt?: string;
  id: string;
  isAnonymous?: boolean;
  likeCount?: number;
  likedByMe?: boolean;
  /** @deprecated use likeCount */
  likes: number;
  reportCount?: number;
  savedByMe?: boolean;
  status?: "active" | "flagged" | "removed";
  tags?: string[];
  title?: string;
  userId?: string | (Pick<AuthUser, "firstName" | "lastName" | "profilePicture"> & { isOwn?: boolean });
};

export const communityApi = {
  getPosts: (params?: {
    category?: string;
    limit?: number;
    page?: number;
    search?: string;
    /** Exact tag match, ignoring case and a leading '#'. */
    tag?: string;
  }) =>
    apiRequest<{ pagination: Pagination; posts: CommunityPost[] }>(
      `/api/community${toQuery(params)}`,
    ),

  createPost: (payload: {
    attachments?: CommunityAttachment[];
    category?: string;
    content: string;
    isAnonymous?: boolean;
    poll?: { question?: string; allowMultiple?: boolean; options: string[] };
    tags?: string[];
    title?: string;
  }) =>
    apiRequest<CommunityPost>("/api/community", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  votePoll: (id: string, optionIds: string[]) =>
    apiRequest<{ poll: CommunityPoll; tokensAwarded: number }>(
      `/api/community/${id}/poll/vote`,
      { body: JSON.stringify({ optionIds }), method: "POST" },
    ),

  getPostById: (id: string) => apiRequest<CommunityPost>(`/api/community/${id}`),

  toggleLike: (id: string) =>
    apiRequest<{ likedByMe: boolean; likes: number }>(`/api/community/${id}/like`, {
      method: "POST",
    }),

  toggleSave: (id: string) =>
    apiRequest<{ savedByMe: boolean; tokensAwarded?: number }>(
      `/api/community/${id}/save`,
      { method: "POST" },
    ),

  report: (id: string, reason: string) =>
    apiRequest<void>(`/api/community/${id}/report`, {
      body: JSON.stringify({ reason }),
      method: "POST",
    }),

  addComment: (
    id: string,
    content: string,
    isAnonymous = true,
    attachments?: CommunityAttachment[],
  ) =>
    apiRequest<{ comment: CommunityComment; commentsCount: number }>(
      `/api/community/${id}/comment`,
      {
        body: JSON.stringify({ content, isAnonymous, attachments }),
        method: "POST",
      },
    ),

  deletePost: (id: string) =>
    apiRequest<void>(`/api/community/${id}`, { method: "DELETE" }),

  deleteComment: (postId: string, commentId: string) =>
    apiRequest<{ commentsCount: number }>(
      `/api/community/${postId}/comment/${commentId}`,
      { method: "DELETE" },
    ),
};
