import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
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
  const { colors, fonts, isDark } = useTheme();
  const isExpert = Boolean(comment.expert?.verified);

  return (
    <View className="flex-row gap-3.5 items-start p-1">
      <View className="relative">
        {isExpert && comment.avatarUrl ? (
          <Image
            source={{ uri: comment.avatarUrl }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: colors.successLight,
            }}
          />
        ) : (
          <View
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{
              backgroundColor: isExpert ? colors.successLight : colors.primaryLight,
            }}
          >
            <Text
              className="text-sm font-bold"
              style={{
                color: isExpert ? colors.success : colors.primary,
                fontFamily: fonts.body,
              }}
            >
              {comment.avatar}
            </Text>
          </View>
        )}
        {isExpert && (
          <View
            style={{
              position: "absolute",
              bottom: -2,
              right: -2,
              backgroundColor: colors.surface,
              borderRadius: 8,
              padding: 1,
            }}
          >
            <Icon name="badge-check" size={13} color={colors.success} />
          </View>
        )}
      </View>

      <View
        className="flex-1 p-3.5 rounded-2xl"
        style={{
          backgroundColor: isExpert
            ? isDark
              ? "rgba(142, 214, 168, 0.08)"
              : "#F4FAF6"
            : colors.surfaceSoft,
          borderWidth: isExpert ? 1.5 : 1,
          borderColor: isExpert
            ? isDark
              ? "rgba(142, 214, 168, 0.4)"
              : "#B8E3CA"
            : colors.border,
        }}
      >
        <View className="flex-row justify-between items-start">
          <View className="flex-1 pr-2">
            <View className="flex-row items-center flex-wrap gap-1.5">
              <Text
                className="text-xs font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
              >
                {comment.author}
              </Text>
              {isExpert && (
                <View
                  className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
                  style={{ backgroundColor: colors.successLight }}
                >
                  <Icon name="badge-check" size={11} color={colors.success} />
                  <Text
                    className="text-[10px] font-bold"
                    style={{ color: colors.success, fontFamily: fonts.body }}
                  >
                    Medically verified
                  </Text>
                </View>
              )}
            </View>
            {isExpert && comment.expert?.specialty ? (
              <Text
                className="text-[11px] font-medium mt-0.5"
                style={{ color: colors.mutedText, fontFamily: fonts.body }}
              >
                {comment.expert.specialty}
              </Text>
            ) : null}
          </View>

          <View className="flex-row items-center gap-2">
            <Text
              className="text-xs font-semibold"
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              {comment.time}
            </Text>
            {comment.isOwner && postId && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Delete comment"
                onPress={() => onDelete(postId, comment.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon
                  set="feather"
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
