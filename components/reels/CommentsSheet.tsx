import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alert } from "../../lib/alert";
import { getFriendlyErrorMessage, isNetworkError, reelsApi, type ReelComment } from "../../lib/api";
import { appendComments, formatCommentAge, REEL_COMMENT_MAX } from "../../lib/reels";
import { useAuth } from "../auth-context";
import { EmptyState } from "../EmptyState";
import { BottomSheet } from "../BottomSheet";
import { AppModalHost } from "../modals/AppModalHost";
import { useTheme } from "../theme";
import { Icon } from "../Icon";
import { SendButton } from "../SendButton";

const PAGE_SIZE = 20;

function Avatar({ uri, name, size = 34 }: { uri: string | null; name: string; size?: number }) {
  const { colors, fonts } = useTheme();
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceSoft }} />;
  }
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primaryLight }}
      className="items-center justify-center"
    >
      <Text style={{ color: colors.primary, fontFamily: fonts.heading, fontWeight: "800" }}>
        {name.trim().charAt(0).toUpperCase() || "N"}
      </Text>
    </View>
  );
}

const CommentRow = React.memo(function CommentRow({
  comment,
  onDelete,
  onReport,
}: {
  comment: ReelComment;
  onDelete: (comment: ReelComment) => void;
  onReport: (comment: ReelComment) => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View className="flex-row px-5 py-3" style={{ gap: 12, opacity: comment.pending ? 0.55 : 1 }}>
      <Avatar uri={comment.author.avatar} name={comment.author.name} />
      <View className="flex-1">
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.foreground, fontFamily: fonts.heading, fontWeight: "700", fontSize: 13 }}>
            {comment.author.name}
          </Text>
          <Text style={{ color: colors.mutedText, fontFamily: fonts.body, fontSize: 13 }}>
            {comment.pending ? "Posting…" : formatCommentAge(comment.createdAt)}
          </Text>
        </View>
        <Text style={{ marginTop: 2, color: colors.foreground, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 }}>
          {comment.text}
        </Text>
      </View>
      {!comment.pending ? (
        comment.canDelete ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Delete your comment"
            hitSlop={10}
            onPress={() => onDelete(comment)}
            className="pt-1"
          >
            <Icon set="feather" name="trash-2" size={16} color={colors.mutedText} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Report ${comment.author.name}'s comment`}
            hitSlop={10}
            onPress={() => onReport(comment)}
            className="pt-1"
          >
            <Icon set="feather" name="flag" size={15} color={colors.mutedText} />
          </TouchableOpacity>
        )
      ) : null}
    </View>
  );
});

/**
 * Reel comments in a bottom sheet: newest first, cursor-paged, a composer
 * with optimistic posting, delete for your own comments and report for others.
 * Count changes go back to the pager through `onCountChange`.
 */
export function CommentsSheet({
  reelId,
  initialCount,
  onClose,
  onCountChange,
}: {
  reelId: string | null;
  initialCount: number;
  onClose: () => void;
  onCountChange: (reelId: string, count: number) => void;
}) {
  const { colors, fonts } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [count, setCount] = useState(initialCount);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ message: string; offline: boolean } | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const requestRef = useRef(0);
  // Sends and deletes finish after awaits; the sheet may show another reel by then.
  const currentReelRef = useRef(reelId);
  currentReelRef.current = reelId;
  // State lags a frame: a double tap would pass a `sending` check twice.
  const sendingRef = useRef(false);
  const visible = reelId !== null;

  const updateCount = useCallback(
    (next: number) => {
      setCount(next);
      if (reelId) onCountChange(reelId, next);
    },
    [onCountChange, reelId],
  );

  const loadFirst = useCallback(async () => {
    if (!reelId) return;
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const page = await reelsApi.getComments(reelId, { limit: PAGE_SIZE });
      if (request !== requestRef.current) return;
      setComments(page.comments);
      setCursor(page.nextCursor);
      updateCount(page.commentCount);
    } catch (err) {
      if (request !== requestRef.current) return;
      setError({ message: getFriendlyErrorMessage(err), offline: isNetworkError(err) });
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [reelId, updateCount]);

  useEffect(() => {
    if (!reelId) return;
    setComments([]);
    setCursor(null);
    setText("");
    setCount(initialCount);
    void loadFirst();
    // Only when a different reel's comments open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reelId]);

  const loadMore = useCallback(async () => {
    if (!reelId || !cursor || loadingMore || loading) return;
    const request = requestRef.current;
    setLoadingMore(true);
    try {
      const page = await reelsApi.getComments(reelId, { cursor, limit: PAGE_SIZE });
      if (request !== requestRef.current) return;
      setComments((current) => appendComments(current, page.comments));
      setCursor(page.nextCursor);
    } catch {
      // Scrolling to the end again retries.
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loading, loadingMore, reelId]);

  async function send() {
    const body = text.trim();
    if (!reelId || !body || sendingRef.current) return;
    const id = reelId;
    const isCurrent = () => currentReelRef.current === id;
    const tempId = `temp-${Date.now()}`;
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "You";
    const optimistic: ReelComment = {
      id: tempId,
      reelId,
      text: body,
      createdAt: new Date().toISOString(),
      author: { name, avatar: user?.profilePicture || null },
      isOwn: true,
      canDelete: true,
      pending: true,
    };
    const before = count;
    sendingRef.current = true;
    setSending(true);
    setText("");
    setComments((current) => [optimistic, ...current]);
    updateCount(before + 1);
    try {
      const result = await reelsApi.addComment(id, body);
      if (isCurrent()) {
        setComments((current) => current.map((comment) => (comment.id === tempId ? result.comment : comment)));
        updateCount(result.commentCount);
      } else {
        // Another reel is open now: only its own count in the pager changes.
        onCountChange(id, result.commentCount);
      }
    } catch (err) {
      if (isCurrent()) {
        setComments((current) => current.filter((comment) => comment.id !== tempId));
        updateCount(before);
        setText(body);
      } else {
        onCountChange(id, before);
      }
      alert("Comment not posted", getFriendlyErrorMessage(err));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  const handleDelete = useCallback(
    (target: ReelComment) => {
      if (!reelId) return;
      alert("Delete comment?", "This can't be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const id = reelId;
            const position = comments.findIndex((comment) => comment.id === target.id);
            setComments((current) => current.filter((comment) => comment.id !== target.id));
            const before = count;
            updateCount(Math.max(0, count - 1));
            try {
              const result = await reelsApi.deleteComment(id, target.id);
              if (currentReelRef.current === id) updateCount(result.commentCount);
              else onCountChange(id, result.commentCount);
            } catch (err) {
              if (currentReelRef.current !== id) {
                onCountChange(id, before);
                alert("Couldn't delete", getFriendlyErrorMessage(err));
                return;
              }
              setComments((current) => {
                if (current.some((comment) => comment.id === target.id)) return current;
                const next = [...current];
                next.splice(position < 0 ? 0 : Math.min(position, next.length), 0, target);
                return next;
              });
              updateCount(before);
              alert("Couldn't delete", getFriendlyErrorMessage(err));
            }
          },
        },
      ]);
    },
    [comments, count, onCountChange, reelId, updateCount],
  );

  const handleReport = useCallback(
    (target: ReelComment) => {
      if (!reelId) return;
      alert("Report this comment?", "Our team reviews reported comments. Several reports hide it for everyone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Report",
          style: "destructive",
          onPress: async () => {
            try {
              await reelsApi.reportComment(reelId, target.id);
              alert("Thanks for letting us know", "We'll take a look.");
            } catch (err) {
              alert("Couldn't report", getFriendlyErrorMessage(err));
            }
          },
        },
      ]);
    },
    [reelId],
  );

  const remaining = REEL_COMMENT_MAX - text.length;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      avoidKeyboard
      backdropLabel="Close comments"
      style={{ height: Math.round(height * 0.68), backgroundColor: colors.surface, paddingBottom: insets.bottom }}
      overlay={visible ? <AppModalHost inline /> : null}
    >
      <View className="flex-row items-center justify-between px-5 pb-2 pt-3">
        <View style={{ width: 28 }} />
        <Text style={{ color: colors.foreground, fontFamily: fonts.heading, fontWeight: "700", fontSize: 16 }}>
          Comments{count > 0 ? ` · ${count}` : ""}
        </Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close comments" hitSlop={10} onPress={onClose}>
          <Icon set="feather" name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>
      <View style={{ height: 1, backgroundColor: colors.border }} />

      {loading && comments.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error && comments.length === 0 ? (
        <EmptyState
          compact
          icon={error.offline ? "wifi-off" : "alert-circle-outline"}
          title={error.offline ? "You're offline" : "Couldn't load comments"}
          message={error.message}
          actionLabel="Try again"
          onAction={loadFirst}
        />
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CommentRow comment={item} onDelete={handleDelete} onReport={handleReport} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={comments.length === 0 ? { flexGrow: 1 } : { paddingVertical: 6 }}
          ListEmptyComponent={
            <EmptyState compact icon="comment-outline" title="No comments yet" message="Start the conversation." />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} /> : null}
        />
      )}

      <View style={{ height: 1, backgroundColor: colors.border }} />
      <View className="flex-row items-end px-4 py-2.5" style={{ gap: 10 }}>
        <Avatar uri={user?.profilePicture || null} name={user?.firstName || "You"} size={32} />
        <View
          className="flex-1 flex-row items-end rounded-3xl border px-4"
          style={{ borderColor: colors.border, backgroundColor: colors.input, minHeight: 40 }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Add a comment…"
            placeholderTextColor={colors.mutedText}
            maxLength={REEL_COMMENT_MAX}
            multiline
            accessibilityLabel="Write a comment"
            style={{ flex: 1, color: colors.foreground, fontFamily: fonts.body, fontSize: 14, maxHeight: 100, paddingVertical: 10 }}
          />
          {remaining <= 50 ? (
            <Text style={{ color: remaining <= 10 ? colors.danger : colors.mutedText, fontFamily: fonts.mono, fontSize: 12, paddingBottom: 11, marginLeft: 6 }}>
              {remaining}
            </Text>
          ) : null}
        </View>
        <SendButton onPress={send} disabled={!text.trim()} loading={sending} size={40} accessibilityLabel="Post comment" />
      </View>
    </BottomSheet>
  );
}
