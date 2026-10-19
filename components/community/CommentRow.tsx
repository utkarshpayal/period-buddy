import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../theme";
import { PostAttachmentView } from "./PostAttachmentView";
import type { Comment } from "./types";
import { Icon } from "../Icon";

// One reply in the comments sheet. Memoized so typing in the reply box (which
// re-renders the whole screen) doesn't re-render every reply.
export const CommentRow = React.memo(function CommentRow({
  comment,
  postId,
  onDelete,
}: {
  comment: Comment;
  // The open post's id; null hides the delete button (no post open).
  postId: string | null;
  onDelete: (postId: string, commentId: string) => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View className="flex-row gap-3.5 items-start p-1"
    >
      <View
        className="w-9 h-9 rounded-full items-center justify-center"
        style={{ backgroundColor: colors.primaryLight }}
      >
        <Text
          className="text-sm font-bold"
          style={{ color: colors.primary, fontFamily: fonts.body }}
        >
          {comment.avatar}
        </Text>
      </View>
      <View
        className="flex-1 p-3.5 rounded-2xl"
        style={{
          backgroundColor: colors.surfaceSoft,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View className="flex-row justify-between items-center">
          <Text
            className="text-xs font-bold"
            style={{ color: colors.foreground, fontFamily: fonts.body }}
          >
            {comment.author}
          </Text>
          <View className="flex-row items-center gap-2">
            <Text
              className="text-xs font-semibold"
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              {comment.time}
            </Text>
            {comment.isOwner && postId && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Delete comment"
                onPress={() => onDelete(postId, comment.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon set="feather"
                  name="trash-2"
                  size={13}
                  color={colors.danger}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <Text
          className="text-xs font-medium mt-1.5 leading-4"
          style={{ color: colors.foreground, fontFamily: fonts.body }}
        >
          {comment.content}
        </Text>
        {comment.attachment && (
          <PostAttachmentView attachment={comment.attachment} />
        )}
      </View>
    </View>
  );
});

export function CommentSeparator() {
  return <View style={{ height: 16 }} />;
}

export const commentKeyExtractor = (item: Comment) => item.id;
