import type { CommunityComment, CommunityPost } from "../../lib/api";
import type { Comment, Post } from "./types";

export function formatRelativeTime(value?: string) {
  if (!value) return "Just now";
  const diffMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffMinutes < 1440) return `${Math.round(diffMinutes / 60)}h ago`;
  return `${Math.round(diffMinutes / 1440)}d ago`;
}

export const VERIFIED_GYNAECOLOGIST_LABEL = "Verified gynaecologist";

export function doctorInitials(name?: string | null): string {
  if (!name) return "DR";
  const clean = name.replace(/^dr\.?\s+/i, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return "DR";
}

/**
 * `isOwner` overrides the server's `isOwn` flag: a comment we just posted, or
 * one a realtime event says someone else sent.
 */
export function mapCommunityComment(comment: CommunityComment, isOwner?: boolean): Comment {
  const isCommentOwner =
    isOwner ?? (typeof comment.userId === "object" && comment.userId?.isOwn === true);

  const expert = comment.expert;
  const isExpert = Boolean(expert?.verified);

  let author: string;
  let avatar: string;
  let avatarUrl: string | null = null;

  if (isExpert && expert) {
    if (expert.showName && expert.name) {
      author = isCommentOwner ? `${expert.name} (You)` : expert.name;
      avatar = doctorInitials(expert.name);
      avatarUrl = expert.avatarUrl || null;
    } else {
      author = isCommentOwner ? `You (${VERIFIED_GYNAECOLOGIST_LABEL})` : VERIFIED_GYNAECOLOGIST_LABEL;
      avatar = "DR";
    }
  } else {
    author = isCommentOwner ? "You" : comment.isAnonymous ? "Anonymous member" : "Community member";
    avatar = isCommentOwner ? "U" : "AU";
  }

  return {
    id: comment.id ?? comment._id ?? `comment_${Math.random()}`,
    author,
    avatar,
    avatarUrl,
    content: comment.content,
    attachment: comment.attachments?.[0],
    time: formatRelativeTime(comment.createdAt),
    isOwner: isCommentOwner,
    expert: isExpert ? expert : null,
  };
}

export function mapCommunityPost(post: CommunityPost): Post {
  // Backend resolveAuthor sets isOwn:true on userId when requester is the author
  const isOwner = typeof post.userId === "object" && post.userId?.isOwn === true;

  return {
    id: post.id ?? post._id,
    author: isOwner ? "You" : post.isAnonymous ? "Anonymous member" : "Community member",
    avatar: isOwner ? "YO" : "NU",
    content: post.content,
    attachment: post.attachments?.[0],
    poll: post.poll,
    category: post.category,
    tags: post.tags ?? [],
    likes: post.likeCount ?? post.likes,
    commentsCount: post.commentCount ?? post.commentsCount ?? post.comments?.length ?? 0,
    expertAnswerCount: post.expertAnswerCount ?? 0,
    time: formatRelativeTime(post.createdAt),
    isOwner,
    comments: post.comments?.map((comment) => mapCommunityComment(comment)) ?? [],
  };
}
