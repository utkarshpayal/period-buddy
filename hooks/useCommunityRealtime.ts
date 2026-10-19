import { useCallback, useRef } from "react";
import { mapCommunityComment, mapCommunityPost } from "../components/community/mapCommunityPost";
import type { Comment, Post } from "../components/community/types";
import type { CommunityComment, CommunityPost } from "../lib/api";
import { useRealtimeSocket, type RealtimeMessage } from "./useRealtimeSocket";

/**
 * Live community events from other members on the shared socket's
 * "community" room. Our own posts/comments are ignored here: they're
 * already added from the HTTP response.
 */
export function useCommunityRealtime({
  enabled,
  userId,
  onPost,
  onComment,
}: {
  enabled: boolean;
  userId?: string;
  onPost: (post: Post) => void;
  onComment: (postId: string, comment: Comment) => void;
}) {
  // Read through refs so the socket subscription stays stable while the
  // screen re-renders (filters, open sheet...).
  const handlersRef = useRef({ onPost, onComment });
  handlersRef.current = { onPost, onComment };

  const onMessage = useCallback(
    (data: RealtimeMessage) => {
      try {
        if (data.type !== "community_notification" || data.senderId === userId) return;
        if (data.notificationType === "post" && data.post) {
          handlersRef.current.onPost(mapCommunityPost(data.post as CommunityPost));
        } else if (data.notificationType === "comment") {
          const { postId, comment } = data as { postId?: string; comment?: CommunityComment };
          if (!postId || !comment) return;
          // Someone else sent it, so it's never ours.
          const mapped = mapCommunityComment(comment, false);
          handlersRef.current.onComment(postId, {
            ...mapped,
            id: comment.id ?? comment._id ?? `c_${Date.now()}`,
          });
        }
      } catch (err) {
        console.error("Error handling realtime community message:", err);
      }
    },
    [userId],
  );

  useRealtimeSocket({
    enabled,
    onMessage,
    rooms: enabled ? ["community"] : [],
  });
}
