import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
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
  isFeatureLockedError,
  uploadApi,
  type CommunityAttachment,
} from "../../lib/api";
import {
  addCommunityTag,
  MAX_COMMUNITY_TAG_LENGTH,
  MAX_COMMUNITY_TAGS,
} from "../../lib/communityTags";
import { useTheme } from "../theme";
import { mapCommunityPost } from "./mapCommunityPost";
import {
  COMMUNITY_CATEGORIES,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  type Post,
} from "./types";
import { AppLockCover } from "../AppLockScreen";
import { Icon } from "../Icon";

/**
 * The "New Thread" sheet. It owns its draft, so the feed doesn't re-render
 * per keystroke. Every way out (Cancel, Android Back, a successful post, a
 * paywall hit) goes through one path that also stops the mic.
 */
export function ComposePostSheet({
  visible,
  onClose,
  onPublished,
  onLocked,
}: {
  visible: boolean;
  onClose: () => void;
  onPublished: (post: Post) => void;
  /** The server's paywall fired (the cached access check was stale). */
  onLocked: () => void;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const attachment = useAttachmentComposer();
  const [newPostContent, setNewPostContent] = useState("");
  const [newPostCategory, setNewPostCategory] = useState<string | null>(null);
  // Custom tags typed into the composer ("+ Add tag"), next to the presets.
  const [newPostTags, setNewPostTags] = useState<string[]>([]);
  const [tagInputVisible, setTagInputVisible] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  // `pollOptions === null` means "no poll attached"; toggling the poll button
  // seeds two empty options (up to POLL_MAX_OPTIONS).
  const [pollOptions, setPollOptions] = useState<string[] | null>(null);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  // State lags a render, so a fast double tap on Post could publish twice.
  const publishingRef = useRef(false);

  function resetDraft() {
    setNewPostContent("");
    setNewPostCategory(null);
    setNewPostTags([]);
    setTagDraft("");
    setTagInputVisible(false);
    setPollOptions(null);
    setPollAllowMultiple(false);
    void attachment.reset();
  }

  function closeCompose() {
    if (publishingRef.current) return;
    resetDraft();
    onClose();
  }

  async function publish() {
    if (publishingRef.current) return;
    if (!newPostContent.trim()) {
      alert("Empty Post", "Please type something before sharing with the community.");
      return;
    }

    // Validate the attached poll (if any) before uploading anything.
    let pollPayload: { allowMultiple: boolean; options: string[] } | undefined;
    if (pollOptions !== null) {
      const trimmed = pollOptions.map((option) => option.trim()).filter(Boolean);
      if (trimmed.length < POLL_MIN_OPTIONS) {
        alert("Add poll options", `A poll needs at least ${POLL_MIN_OPTIONS} filled options.`);
        return;
      }
      pollPayload = { allowMultiple: pollAllowMultiple, options: trimmed };
    }

    // A tag typed but not yet confirmed still counts, if it's valid.
    let tagsPayload = newPostTags;
    if (tagDraft.trim()) {
      const added = addCommunityTag(newPostTags, tagDraft);
      if (added.ok) tagsPayload = added.tags;
    }

    publishingRef.current = true;
    setIsPublishing(true);
    let created: Post | null = null;
    try {
      // Posting mid-recording keeps the voice note instead of dropping it.
      const pending = await attachment.finish();
      let attachments: CommunityAttachment[] | undefined;
      if (pending) {
        const { url, key } = await uploadApi.uploadMedia(pending.uri, "community", pending.mimeType);
        attachments = [{ url, key, type: pending.type }];
      }

      created = mapCommunityPost(
        await communityApi.createPost({
          content: newPostContent.trim(),
          isAnonymous: true,
          category: newPostCategory ?? undefined,
          tags: tagsPayload.length ? tagsPayload : undefined,
          attachments,
          poll: pollPayload,
        }),
      );
    } catch (error) {
      publishingRef.current = false;
      setIsPublishing(false);
      // The client-side hasAccess() check is optimistic (cached), so the
      // server's own gate can still fire if access lapsed since: route that
      // case to the paywall instead of a generic error.
      if (isFeatureLockedError(error)) {
        closeCompose();
        onLocked();
        return;
      }
      alert("Couldn't publish post", getFriendlyErrorMessage(error));
      return;
    }
    publishingRef.current = false;
    setIsPublishing(false);
    onPublished(created);
    closeCompose();
  }

  function commitTagDraft() {
    if (!tagDraft.trim()) {
      setTagInputVisible(false);
      return;
    }
    const result = addCommunityTag(newPostTags, tagDraft);
    if (result.ok) {
      setNewPostTags(result.tags);
      setTagDraft("");
      if (result.tags.length >= MAX_COMMUNITY_TAGS) setTagInputVisible(false);
      return;
    }
    if (result.reason === "duplicate") {
      // Already there: just clear the box.
      setTagDraft("");
      return;
    }
    alert(
      "Can't add that tag",
      result.reason === "limit"
        ? `A post can have up to ${MAX_COMMUNITY_TAGS} tags.`
        : result.reason === "too_long"
          ? `Tags can be up to ${MAX_COMMUNITY_TAG_LENGTH} characters.`
          : "Use letters, numbers, spaces, - or _.",
    );
  }

  const removeComposeTag = (tag: string) =>
    setNewPostTags((current) => current.filter((existing) => existing !== tag));

  const togglePollComposer = () =>
    setPollOptions((current) => (current === null ? ["", ""] : null));
  const updatePollOption = (index: number, value: string) =>
    setPollOptions((current) =>
      current ? current.map((option, i) => (i === index ? value : option)) : current,
    );
  const addPollOption = () =>
    setPollOptions((current) =>
      current && current.length < POLL_MAX_OPTIONS ? [...current, ""] : current,
    );
  const removePollOption = (index: number) =>
    setPollOptions((current) =>
      current && current.length > POLL_MIN_OPTIONS
        ? current.filter((_, i) => i !== index)
        : current,
    );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeCompose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View
          className="flex-1 px-6"
          style={{
            backgroundColor: colors.background,
            // Modal on Android ignores `presentationStyle="pageSheet"` and
            // always renders truly fullscreen under the status bar, so the
            // header row needs an explicit safe-area top inset here — the
            // outer screen's SafeAreaView doesn't wrap this Modal's content.
            paddingTop: Math.max(18, insets.top + 10),
            paddingBottom: Math.max(18, insets.bottom + 10),
          }}
        >
          <View className="flex-row justify-between items-center mb-6">
            <TouchableOpacity onPress={closeCompose} disabled={isPublishing}>
              <Text
                className="text-base font-semibold"
                style={{ color: colors.mutedText, fontFamily: fonts.body }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <Text
              className="text-[17px] font-bold"
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              New Thread
            </Text>
            <TouchableOpacity
              onPress={publish}
              disabled={isPublishing}
              className="px-4 py-1.5 rounded-full flex-row items-center gap-2"
              style={{ backgroundColor: colors.primary, opacity: isPublishing ? 0.7 : 1 }}
            >
              {isPublishing && <ActivityIndicator size="small" color={colors.buttonText} />}
              <Text
                className="text-xs font-bold"
                style={{ color: colors.buttonText, fontFamily: fonts.body }}
              >
                {isPublishing ? "Posting..." : "Post"}
              </Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row gap-4">
            <View
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.primaryLight }}
            >
              <Icon set="feather" name="edit-3" size={18} color={colors.primary} />
            </View>
            <TextInput
              multiline
              autoFocus
              placeholder="What's on your mind? Share your cycle update anonymously..."
              placeholderTextColor={colors.mutedText}
              value={newPostContent}
              onChangeText={setNewPostContent}
              className="flex-1 text-base pt-1"
              style={{ color: colors.foreground, verticalAlign: "top", fontFamily: fonts.body }}
              textAlignVertical="top"
            />
          </View>

          <View className="mt-4 ml-14 flex-row flex-wrap gap-2">
            {COMMUNITY_CATEGORIES.map((category) => {
              const isActive = newPostCategory === category;
              return (
                <TouchableOpacity
                  key={category}
                  activeOpacity={0.85}
                  onPress={() =>
                    setNewPostCategory((current) =>
                      current === category ? null : category,
                    )
                  }
                  className="rounded-full px-3 py-1.5"
                  style={{
                    backgroundColor: isActive ? colors.primary : colors.surfaceSoft,
                    borderWidth: isActive ? 0 : 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{
                      color: isActive ? colors.buttonText : colors.mutedText,
                      fontFamily: fonts.body,
                    }}
                  >
                    {category}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Custom tags: typed by the member, shown as removable chips */}
            {newPostTags.map((tag) => (
              <TouchableOpacity
                key={`tag-${tag}`}
                activeOpacity={0.85}
                onPress={() => removeComposeTag(tag)}
                accessibilityRole="button"
                accessibilityLabel={`Remove tag ${tag}`}
                className="rounded-full pl-3 pr-2 py-1.5 flex-row items-center gap-1"
                style={{ backgroundColor: colors.primaryLight }}
              >
                <Text
                  className="text-xs font-bold"
                  style={{ color: colors.primary, fontFamily: fonts.body }}
                >
                  #{tag}
                </Text>
                <Icon set="ion" name="close" size={13} color={colors.primary} />
              </TouchableOpacity>
            ))}

            {tagInputVisible ? (
              <View
                className="rounded-full px-3 flex-row items-center"
                style={{
                  backgroundColor: colors.surfaceSoft,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  minWidth: 130,
                }}
              >
                <Text
                  className="text-xs font-bold"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  #
                </Text>
                <TextInput
                  autoFocus
                  value={tagDraft}
                  onChangeText={setTagDraft}
                  onSubmitEditing={commitTagDraft}
                  onBlur={commitTagDraft}
                  placeholder="your tag"
                  placeholderTextColor={colors.mutedText}
                  maxLength={MAX_COMMUNITY_TAG_LENGTH + 1}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  blurOnSubmit={false}
                  accessibilityLabel="New tag"
                  className="text-xs py-1.5 ml-0.5"
                  style={{ color: colors.foreground, fontFamily: fonts.body, minWidth: 90 }}
                />
              </View>
            ) : newPostTags.length < MAX_COMMUNITY_TAGS ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setTagInputVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Add a tag"
                className="rounded-full px-3 py-1.5 flex-row items-center gap-1"
                style={{
                  backgroundColor: colors.surfaceSoft,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: colors.border,
                }}
              >
                <Icon set="feather" name="plus" size={12} color={colors.mutedText} />
                <Text
                  className="text-xs font-bold"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  Add tag
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {attachment.pending && (
            <View
              className="mt-4 ml-14 flex-row items-center gap-3 rounded-2xl px-4 py-3"
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
                size={18}
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
                <Icon set="ion" name="close-circle" size={18} color={colors.mutedText} />
              </TouchableOpacity>
            </View>
          )}

          {pollOptions !== null && (
            <View
              className="mt-4 ml-14 rounded-2xl border p-4"
              style={{ borderColor: colors.border, backgroundColor: colors.surfaceSoft }}
            >
              <View className="flex-row items-center justify-between mb-3">
                <Text
                  className="text-[13px] font-bold"
                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                >
                  Poll
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setPollOptions(null);
                    setPollAllowMultiple(false);
                  }}
                  accessibilityLabel="Remove poll"
                >
                  <Icon set="ion" name="trash-outline" size={16} color={colors.mutedText} />
                </TouchableOpacity>
              </View>

              <View style={{ gap: 8 }}>
                {pollOptions.map((option, index) => (
                  <View key={index} className="flex-row items-center gap-2">
                    <TextInput
                      placeholder={`Option ${index + 1}`}
                      placeholderTextColor={colors.mutedText}
                      value={option}
                      onChangeText={(text) => updatePollOption(index, text)}
                      className="flex-1 rounded-xl border px-3 py-2 text-sm"
                      style={{
                        color: colors.foreground,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                        fontFamily: fonts.body,
                      }}
                    />
                    {pollOptions.length > POLL_MIN_OPTIONS && (
                      <TouchableOpacity
                        onPress={() => removePollOption(index)}
                        accessibilityLabel={`Remove option ${index + 1}`}
                      >
                        <Icon set="ion" name="close-circle" size={20} color={colors.mutedText} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>

              {pollOptions.length < POLL_MAX_OPTIONS && (
                <TouchableOpacity
                  onPress={addPollOption}
                  className="flex-row items-center gap-1.5 mt-3"
                >
                  <Icon set="ion" name="add-circle-outline" size={18} color={colors.primary} />
                  <Text
                    className="text-xs font-bold"
                    style={{ color: colors.primary, fontFamily: fonts.body }}
                  >
                    Add option
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => setPollAllowMultiple((current) => !current)}
                className="flex-row items-center gap-2 mt-4 pt-3"
                style={{ borderTopWidth: 1, borderTopColor: colors.border }}
              >
                <Icon set="ion"
                  name={pollAllowMultiple ? "checkbox" : "square-outline"}
                  size={18}
                  color={pollAllowMultiple ? colors.primary : colors.mutedText}
                />
                <Text
                  className="text-xs font-semibold"
                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                >
                  Allow selecting multiple options
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View
            className="mt-4 ml-14 flex-row items-center gap-5 pt-3"
            style={{ borderTopWidth: 1, borderTopColor: colors.border }}
          >
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add a photo" onPress={attachment.pickImage}>
              <Icon set="ion" name="image-outline" size={22} color={colors.mutedText} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add a video" onPress={attachment.pickVideo}>
              <Icon set="ion" name="videocam-outline" size={22} color={colors.mutedText} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={attachment.isRecording ? "Stop recording" : "Record a voice note"} onPress={attachment.toggleRecording}>
              <Icon set="ion"
                name={attachment.isRecording ? "stop-circle" : "mic-outline"}
                size={22}
                color={attachment.isRecording ? colors.danger : colors.mutedText}
              />
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add a poll" onPress={togglePollComposer}>
              <Icon set="ion"
                name="stats-chart"
                size={22}
                color={pollOptions !== null ? colors.primary : colors.mutedText}
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
      <AppLockCover />
    </Modal>
  );
}
