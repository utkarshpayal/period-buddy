import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAttachmentComposer } from "../../hooks/useAttachmentComposer";
import { alert } from "../../lib/alert";
import {
  communityApi,
  getFriendlyErrorMessage,
  uploadApi,
  type CommunityAttachment,
} from "../../lib/api";
import { SkeletonRow } from "../Skeleton";
import { useTheme } from "../theme";
import { CommentRow, CommentSeparator, commentKeyExtractor } from "./CommentRow";
import { mapCommunityComment } from "./mapCommunityPost";
import type { Comment, Post } from "./types";
import { AppLockCover } from "../AppLockScreen";
import { Icon } from "../Icon";

/**
 * A post's thread with the reply composer. The reply draft and its
 * attachment belong to the open post: closing the sheet or switching posts
 * clears them and stops the mic, so a photo attached on post A can't be
 * posted on post B.
 */
export function CommunityCommentsSheet({
  visible,
  post,
  isLoading,
  canPost,
  onClose,
  onDeleteComment,
  onReplied,
}: {
  visible: boolean;
  post: Post | null;
  isLoading: boolean;
  canPost: boolean;
  onClose: () => void;
  onDeleteComment: (postId: string, commentId: string) => void;
  onReplied: (postId: string, comment: Comment, commentsCount: number) => void;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const attachment = useAttachmentComposer();
  const [newCommentContent, setNewCommentContent] = useState("");
  const [isPublishingComment, setIsPublishingComment] = useState(false);
  const publishingRef = useRef(false);
  const postId = post?.id ?? null;
  const postIdRef = useRef(postId);
  postIdRef.current = postId;
  const { reset: resetAttachment } = attachment;

  // A new post (or none) starts with an empty composer.
  useEffect(() => {
    setNewCommentContent("");
    void resetAttachment();
  }, [postId, resetAttachment]);

  function closeSheet() {
    setNewCommentContent("");
    void attachment.reset();
    onClose();
  }

  async function publishReply() {
    if (!newCommentContent.trim() || !postId || publishingRef.current) return;
    const targetId = postId;
    publishingRef.current = true;
    setIsPublishingComment(true);
    try {
      const pending = await attachment.finish();
      let attachments: CommunityAttachment[] | undefined;
      if (pending) {
        const { url, key } = await uploadApi.uploadMedia(pending.uri, "community", pending.mimeType);
        attachments = [{ url, key, type: pending.type }];
      }
      const result = await communityApi.addComment(
        targetId,
        newCommentContent.trim(),
        true,
        attachments,
      );
      onReplied(targetId, mapCommunityComment(result.comment, true), result.commentsCount);
      // Only clear the composer if it still belongs to the post we replied to.
      if (postIdRef.current === targetId) {
        setNewCommentContent("");
        void attachment.reset();
      }
    } catch (error) {
      alert("Couldn't post reply", getFriendlyErrorMessage(error));
    } finally {
      publishingRef.current = false;
      setIsPublishingComment(false);
    }
  }

  const renderComment = useCallback(
    ({ item }: { item: Comment }) => (
      <CommentRow comment={item} postId={postId} onDelete={onDeleteComment} />
    ),
    [postId, onDeleteComment],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeSheet}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
          {/* Sheet Header navigation panel bar — Android Modal ignores
              presentationStyle="pageSheet" and renders fullscreen under the
              status bar, so this needs its own top inset. */}
          <View
            className="px-6 py-4 flex-row justify-between items-center"
            style={{ paddingTop: insets.top + 16, borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close comments" onPress={closeSheet}>
              <Icon set="feather" name="x" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text
              className="text-[15px] font-bold"
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              Thread Discussion
            </Text>
            <View className="w-5" />
          </View>

          {/* A FlatList (not a ScrollView + map) so a long thread only mounts
              the replies near the viewport. It's the sheet's only vertical
              scroller, so nothing nests inside another list. */}
          <FlatList
            data={post?.comments ?? []}
            keyExtractor={commentKeyExtractor}
            renderItem={renderComment}
            ItemSeparatorComponent={CommentSeparator}
            showsVerticalScrollIndicator={false}
            className="flex-1 px-6 pt-4"
            contentContainerStyle={{ paddingBottom: 80 }}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            initialNumToRender={10}
            windowSize={7}
            ListHeaderComponent={
              <View>
                {/* Primary Render Target Focused Post Header Context info segment */}
                {post && (
                  <View
                    className="pb-5"
                    style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                  >
                    <View className="flex-row items-center gap-3">
                      <View
                        className="w-9 h-9 rounded-full items-center justify-center"
                        style={{ backgroundColor: colors.primaryLight }}
                      >
                        <Text
                          className="text-sm font-bold"
                          style={{ color: colors.primary, fontFamily: fonts.body }}
                        >
                          {post.avatar}
                        </Text>
                      </View>
                      <Text
                        className="text-[13px] font-bold"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        {post.author}
                      </Text>
                    </View>
                    <Text
                      className="mt-3 text-sm leading-5"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                    >
                      {post.content}
                    </Text>
                  </View>
                )}

                {/* Same 16px rhythm the old gap-4 column had: label, then
                    skeleton/replies/empty note 16px below it. */}
                <View className="mt-5 gap-4" style={{ paddingBottom: 16 }}>
                  <Text
                    className="text-xs font-bold tracking-widest uppercase mb-1"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    Responses
                  </Text>
                  {isLoading && post?.comments.length === 0 && (
                    <View className="gap-5 py-3">
                      <SkeletonRow />
                      <SkeletonRow />
                      <SkeletonRow />
                    </View>
                  )}
                </View>
              </View>
            }
            ListEmptyComponent={
              !isLoading && post ? (
                <Text
                  className="text-xs text-center italic my-6"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  Be the first one to leave a supportive reply!
                </Text>
              ) : null
            }
          />

          {/* Persistent Absolute Standard Footer Input field layout for writing replies
              (owners only — partners get a read-only note instead, see canPost) */}
          {!canPost ? (
            <View
              className="px-4 py-3 flex-row items-center gap-2"
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.border,
                backgroundColor: colors.surface,
                paddingBottom: Math.max(12, insets.bottom + 8),
              }}
            >
              <Icon set="ion" name="eye-outline" size={14} color={colors.mutedText} />
              <Text
                className="text-xs font-semibold"
                style={{ color: colors.mutedText, fontFamily: fonts.body }}
              >
                Partners can view the community but can&apos;t post replies.
              </Text>
            </View>
          ) : (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.surface,
              paddingBottom: Math.max(12, insets.bottom + 8),
            }}
          >
            {attachment.pending && (
              <View
                className="mx-4 mt-3 flex-row items-center gap-3 rounded-2xl px-4 py-2.5"
                style={{ backgroundColor: colors.surfaceSoft }}
              >
                <Icon set="ion"
                  name={
                    attachment.pending.type === "image"
                      ? "image-outline"
                      : attachment.pending.type === "video"
                        ? "videocam-outline"
                        : "mic-outline"
                  }
                  size={16}
                  color={colors.primary}
                />
                <Text
                  className="flex-1 text-xs font-bold"
                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                >
                  {attachment.pending.type === "image"
                    ? "Photo attached"
                    : attachment.pending.type === "video"
                      ? "Video attached"
                      : "Voice note attached"}
                </Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Remove attachment" onPress={() => void attachment.reset()}>
                  <Icon set="ion" name="close-circle" size={16} color={colors.mutedText} />
                </TouchableOpacity>
              </View>
            )}

            <View className="px-4 pt-3 flex-row items-center gap-2">
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add a photo" onPress={attachment.pickImage}>
                <Icon set="ion" name="image-outline" size={20} color={colors.mutedText} />
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add a video" onPress={attachment.pickVideo}>
                <Icon set="ion" name="videocam-outline" size={20} color={colors.mutedText} />
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={attachment.isRecording ? "Stop recording" : "Record a voice note"} onPress={attachment.toggleRecording}>
                <Icon set="ion"
                  name={attachment.isRecording ? "stop-circle" : "mic-outline"}
                  size={20}
                  color={attachment.isRecording ? colors.danger : colors.mutedText}
                />
              </TouchableOpacity>
            </View>

            <View className="px-4 pt-2 pb-1 flex-row items-center gap-3">
              <TextInput
                accessibilityLabel="Reply"
                placeholder="Post your reply..."
                placeholderTextColor={colors.mutedText}
                value={newCommentContent}
                onChangeText={setNewCommentContent}
                className="flex-1 px-4 py-3 rounded-xl text-sm"
                style={{
                  backgroundColor: colors.input,
                  color: colors.foreground,
                  fontFamily: fonts.body,
                }}
                onSubmitEditing={publishReply}
                returnKeyType="send"
              />
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send comment"
                disabled={!newCommentContent.trim() || isPublishingComment}
                onPress={publishReply}
                className="p-2.5 rounded-full items-center justify-center"
                style={{
                  backgroundColor: newCommentContent.trim()
                    ? colors.primary
                    : colors.border,
                  opacity: isPublishingComment ? 0.7 : 1,
                }}
              >
                {isPublishingComment ? (
                  <ActivityIndicator size="small" color={colors.buttonText} />
                ) : (
                  <Icon set="feather"
                    name="arrow-up"
                    size={16}
                    color={
                      newCommentContent.trim()
                        ? colors.buttonText
                        : colors.mutedText
                    }
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
          )}
        </View>
      </KeyboardAvoidingView>
      <AppLockCover />
    </Modal>
  );
}
