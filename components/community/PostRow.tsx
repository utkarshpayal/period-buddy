import React, { useCallback } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { sameCommunityTag } from "../../lib/communityTags";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";
import { PostAttachmentView } from "./PostAttachmentView";
import { PostPollView } from "./PostPollView";
import { LONG_POST_CHAR_THRESHOLD, type Post } from "./types";
import { Icon } from "../Icon";

// One feed card. Memoized and fed only primitive per-row flags plus stable
// callbacks (see the handler ref in CommunityScreen), so a like, vote, search
// keystroke or sheet toggle re-renders just the row(s) whose props changed.
type PostRowProps = {
  post: Post;
  isFirst: boolean;
  isLiked: boolean;
  isSaved: boolean;
  isReported: boolean;
  isExpanded: boolean;
  isVoting: boolean;
  hasUnreadComments: boolean;
  // Only passed for posts that have tags, so changing the tag filter doesn't
  // re-render tagless rows.
  activeTag: string | null;
  readOnly: boolean;
  onOpenOptions: (post: Post) => void;
  onToggleLike: (post: Post) => void;
  onOpenComments: (post: Post) => void;
  onShare: (post: Post) => void;
  onToggleExpanded: (postId: string) => void;
  onTagPress: (tag: string | null) => void;
  onVote: (post: Post, optionIds: string[]) => void;
};

export const PostRow = React.memo(function PostRow({
  post,
  isFirst,
  isLiked,
  isSaved,
  isReported,
  isExpanded,
  isVoting,
  hasUnreadComments,
  activeTag,
  readOnly,
  onOpenOptions,
  onToggleLike,
  onOpenComments,
  onShare,
  onToggleExpanded,
  onTagPress,
  onVote,
}: PostRowProps) {
  const { colors, isDark, fonts } = useTheme();
  const handleVote = useCallback(
    (optionIds: string[]) => onVote(post, optionIds),
    [onVote, post],
  );

  return (
    <View style={{ paddingHorizontal: 24, paddingTop: isFirst ? 24 : 0 }}>
      <View
        className="rounded-3xl border p-5 relative"
        style={{
          backgroundColor: colors.surface,
          borderColor: isReported ? colors.danger : colors.border,
          ...getShadow(colors, isDark),
        }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View
              className="w-10 h-10 rounded-full items-center justify-center border-2"
              style={{ backgroundColor: colors.primaryLight, borderColor: colors.background }}
            >
              <Text
                className="text-sm font-bold"
                style={{ color: colors.primary, fontFamily: fonts.body }}
              >
                {post.avatar}
              </Text>
            </View>
            <View>
              <Text
                className="text-[13px] font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
              >
                {post.author}
              </Text>
              <View className="flex-row items-center gap-1.5 mt-0.5">
                <Text
                  className="text-xs font-semibold"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  {post.time}
                </Text>
                {post.category ? (
                  <View
                    className="rounded-full px-2 py-[1px]"
                    style={{ backgroundColor: colors.primaryLight }}
                  >
                    <Text
                      className="text-[11.5px] font-black uppercase tracking-wide"
                      style={{ color: colors.primary, fontFamily: fonts.body }}
                    >
                      {post.category}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => onOpenOptions(post)}
            accessibilityRole="button"
            accessibilityLabel="Post options"
            className="p-2 -mr-2 rounded-full"
          >
            <Icon set="feather" name="more-vertical" size={18} color={colors.mutedText} />
          </TouchableOpacity>
        </View>

        <Text
          className="mt-4 text-sm font-medium leading-5"
          style={{ color: colors.foreground, fontFamily: fonts.body }}
          numberOfLines={
            post.content.length > LONG_POST_CHAR_THRESHOLD && !isExpanded ? 6 : undefined
          }
        >
          {post.content}
        </Text>
        {post.content.length > LONG_POST_CHAR_THRESHOLD && (
          <TouchableOpacity
            onPress={() => onToggleExpanded(post.id)}
            activeOpacity={0.7}
            className="mt-1"
            accessibilityRole="button"
          >
            <Text className="text-xs font-bold" style={{ color: colors.primary, fontFamily: fonts.body }}>
              {isExpanded ? "Show less" : "Read more"}
            </Text>
          </TouchableOpacity>
        )}

        {post.tags.length > 0 && (
          <View className="mt-2 flex-row flex-wrap gap-1.5">
            {post.tags.map((tag) => {
              const isActive = sameCommunityTag(activeTag, tag);
              return (
                <TouchableOpacity
                  key={`${post.id}-${tag}`}
                  activeOpacity={0.7}
                  onPress={() => onTagPress(isActive ? null : tag)}
                  accessibilityRole="button"
                  accessibilityLabel={isActive ? `Stop filtering by ${tag}` : `Show posts tagged ${tag}`}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{
                      color: colors.primary,
                      fontFamily: fonts.body,
                      textDecorationLine: isActive ? "underline" : "none",
                    }}
                  >
                    #{tag}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {post.attachment && <PostAttachmentView attachment={post.attachment} />}

        {post.poll && (
          <PostPollView
            poll={post.poll}
            isVoting={isVoting}
            onVote={handleVote}
            readOnly={readOnly}
          />
        )}

        {/* Action Bar - all icons left side together */}
        <View
          className="mt-5 pt-3 flex-row items-center"
          style={{ borderTopWidth: 1, borderTopColor: colors.border, gap: 10 }}
        >
          {/* Like */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={isLiked ? "Unlike post" : "Like post"}
            className="flex-row items-center gap-1.5 py-1.5 px-2.5 rounded-full"
            style={{ backgroundColor: isLiked ? colors.primaryLight : "transparent" }}
            onPress={() => onToggleLike(post)}
          >
            <Icon set="ion"
              name={isLiked ? "heart" : "heart-outline"}
              size={19}
              color={isLiked ? colors.primary : colors.mutedText}
            />
            <Text
              className="text-xs font-bold"
              style={{ color: isLiked ? colors.primary : colors.mutedText, fontFamily: fonts.mono }}
            >
              {post.likes}
            </Text>
          </TouchableOpacity>

          {/* Comment */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="View comments"
            className="flex-row items-center gap-1.5 py-1.5 px-2.5 rounded-full relative"
            onPress={() => onOpenComments(post)}
          >
            <View className="relative">
              <Icon set="ion" name="chatbubble-outline" size={18} color={colors.mutedText} />
              {hasUnreadComments && (
                <View
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -2,
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors.danger,
                  }}
                />
              )}
            </View>
            <Text
              className="text-xs font-bold"
              style={{ color: colors.mutedText, fontFamily: fonts.mono }}
            >
              {post.commentsCount}
            </Text>
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Share post"
            className="flex-row items-center gap-1.5 py-1.5 px-2.5 rounded-full"
            onPress={() => onShare(post)}
          >
            <Icon set="ion" name="arrow-redo-outline" size={18} color={colors.mutedText} />
          </TouchableOpacity>
        </View>

        {/* Meta badges overlay */}
        {(isSaved || isReported) && (
          <View className="mt-4 flex-row gap-1.5">
            {isSaved && (
              <View
                className="flex-row items-center gap-1 rounded-full px-2.5 py-0.5"
                style={{ backgroundColor: colors.primaryLight }}
              >
                <Text
                  className="text-xs font-bold"
                  style={{ color: colors.primary, fontFamily: fonts.body }}
                >
                  Saved
                </Text>
              </View>
            )}
            {isReported && (
              <View
                className="flex-row items-center gap-1 rounded-full px-2.5 py-0.5"
                style={{ backgroundColor: colors.dangerLight }}
              >
                <Text
                  className="text-xs font-bold"
                  style={{ color: colors.danger, fontFamily: fonts.body }}
                >
                  Reported
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
});

// 16px gap between virtualized post cards. Module-level so its component type
// stays stable across renders (an inline one would remount every separator).
export function PostSeparator() {
  return <View style={{ height: 16 }} />;
}

export const postKeyExtractor = (item: Post) => item.id;
