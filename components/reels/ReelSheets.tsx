import React from "react";
import { Image, Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { formatCount, type ReelItem } from "../../lib/reels";
import { ColumnLabel } from "../ColumnLabel";
import { MedicalReviewBadge } from "../MedicalReviewBadge";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";
import { Icon } from "../Icon";

/** Creator profile (page sheet): stats from the loaded reels, follow, their videos. */
export function CreatorSheet({
  creator,
  reels,
  following,
  onToggleFollow,
  onPlayReel,
  onClose,
}: {
  creator: ReelItem | null;
  reels: ReelItem[];
  following: boolean;
  onToggleFollow: (reel: ReelItem) => void;
  onPlayReel: (id: string) => void;
  onClose: () => void;
}) {
  const { colors, fonts } = useTheme();
  const creatorReels = creator ? reels.filter((reel) => reel.creatorId === creator.creatorId) : [];
  const stats = [
    { label: "Videos", value: String(creatorReels.length), icon: "play-circle-outline" as const },
    { label: "Views", value: formatCount(creatorReels.reduce((sum, reel) => sum + reel.viewCount, 0)), icon: "eye-outline" as const },
    { label: "Likes", value: formatCount(creatorReels.reduce((sum, reel) => sum + reel.likeCount, 0)), icon: "heart-outline" as const },
  ];

  return (
    <Modal visible={!!creator} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {creator ? (
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            <View className="flex-row items-center justify-between px-6 pt-6">
              <Text className="text-xl font-black tracking-tight" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                Creator profile
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close creator profile"
                className="rounded-full border p-2"
                onPress={onClose}
                style={{ backgroundColor: colors.surface, borderColor: colors.border }}
              >
                <Icon set="feather" name="x" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <View className="items-center px-6 pt-8">
              {creator.creatorAvatar ? (
                <Image source={{ uri: creator.creatorAvatar }} className="h-28 w-28 rounded-full bg-neutral-200" />
              ) : (
                <View className="h-28 w-28 items-center justify-center rounded-full" style={{ backgroundColor: colors.primaryLight }}>
                  <Icon set="feather" name="user" size={44} color={colors.primary} />
                </View>
              )}
              <View className="mt-4 flex-row items-center" style={{ gap: 6 }}>
                <Text
                  numberOfLines={2}
                  className="text-center text-2xl font-black tracking-tight"
                  style={{ flexShrink: 1, color: colors.foreground, fontFamily: fonts.heading }}
                >
                  {creator.creatorName}
                </Text>
                {creator.verified ? <Icon set="mci" name="shield-check" size={18} color={colors.success} /> : null}
              </View>
              <Text className="mt-1 text-xs font-bold uppercase tracking-wider" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                {creator.category} creator
              </Text>
            </View>

            <View className="mx-6 mt-8 flex-row" style={{ gap: 12 }}>
              {stats.map((metric) => (
                <View
                  key={metric.label}
                  className="flex-1 items-center rounded-2xl border p-4"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                >
                  <Icon set="ion" name={metric.icon} size={18} color={colors.primary} />
                  <Text className="mt-2 text-base font-black" style={{ color: colors.foreground, fontFamily: fonts.mono }}>
                    {metric.value}
                  </Text>
                  <ColumnLabel style={{ fontSize: 13, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body }}>
                    {metric.label}
                  </ColumnLabel>
                </View>
              ))}
            </View>

            <View className="mx-6 mt-6 rounded-3xl border p-5" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              <Text className="text-sm font-black" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                About this creator
              </Text>
              <Text className="mt-2 text-xs font-semibold leading-5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                Follow to keep their cycle education videos and polls close in your feed.
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={following ? `Unfollow ${creator.creatorName}` : `Follow ${creator.creatorName}`}
                className="mt-5 items-center justify-center rounded-full py-3.5"
                onPress={() => onToggleFollow(creator)}
                style={{
                  backgroundColor: following ? colors.input : colors.primary,
                  borderColor: colors.border,
                  borderWidth: following ? 1 : 0,
                }}
              >
                <Text className="text-sm font-black" style={{ color: following ? colors.foreground : colors.buttonText, fontFamily: fonts.body }}>
                  {following ? "Following" : "Follow creator"}
                </Text>
              </TouchableOpacity>
            </View>

            <View className="mx-6 mt-6">
              <Text className="mb-3 text-xs font-black uppercase tracking-widest" style={{ color: colors.primary, fontFamily: fonts.heading }}>
                Videos by this creator
              </Text>
              <View style={{ gap: 12 }}>
                {creatorReels.map((reel) => (
                  <TouchableOpacity
                    key={reel.id}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Play ${reel.title}`}
                    className="flex-row overflow-hidden rounded-2xl border"
                    onPress={() => onPlayReel(reel.id)}
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    <Image source={{ uri: reel.thumbnailUrl }} className="h-20 w-24 bg-neutral-200" />
                    <View className="flex-1 justify-center p-3">
                      <Text className="text-xs font-black" numberOfLines={2} style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                        {reel.title}
                      </Text>
                      <Text className="mt-1 text-xs font-bold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                        {formatCount(reel.viewCount)} views · {formatCount(reel.likeCount)} likes
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      ) : null}
    </Modal>
  );
}

/**
 * The poll as a bottom panel: the question, then options that turn into
 * result bars once voted. Used inside PollSheet (a modal, from the chip) and
 * straight over the video in ReelPage when the poll pops up mid-reel.
 */
export function PollPanel({
  reel,
  onVote,
  onClose,
  bottomInset,
}: {
  reel: ReelItem;
  onVote: (reelId: string, optionId: string) => void;
  onClose: () => void;
  bottomInset: number;
}) {
  const { colors, fonts } = useTheme();
  const total = reel.pollOptions.reduce((sum, option) => sum + option.votes, 0);
  const voted = !!reel.votedOptionId;

  return (
    <View
      className="rounded-t-3xl border-t p-5"
      style={{ backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: bottomInset + 20 }}
    >
      <View className="mb-4 flex-row items-center justify-between">
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <Icon set="mci" name="vote-outline" size={16} color={colors.primary} />
          <Text className="text-[11.5px] font-black uppercase tracking-widest" style={{ color: colors.primary, fontFamily: fonts.body }}>
            Next topic poll
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Close poll"
          className="h-7 w-7 items-center justify-center rounded-full"
          onPress={onClose}
          hitSlop={8}
          style={{ backgroundColor: colors.surfaceSoft }}
        >
          <Icon set="feather" name="x" size={16} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <Text className="mb-3 text-base font-black" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
        {reel.pollQuestion}
      </Text>
      <MedicalReviewBadge item={reel.review} style={{ marginBottom: 12 }} />
      <View style={{ gap: 8 }}>
        {reel.pollOptions.map((option) => {
          const percent = total > 0 ? Math.round((option.votes / total) * 100) : 0;
          const mine = reel.votedOptionId === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={voted ? `${option.topic}, ${percent} percent` : `Vote for ${option.topic}`}
              className="overflow-hidden rounded-2xl border px-4 py-3"
              disabled={voted}
              onPress={() => onVote(reel.id, option.id)}
              style={{ borderColor: mine ? colors.primary : colors.border, backgroundColor: colors.input }}
            >
              {voted ? (
                <View className="absolute bottom-0 left-0 top-0" style={{ width: `${percent}%`, backgroundColor: colors.primaryLight }} />
              ) : null}
              <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
                <Text className="flex-1 text-sm font-bold" numberOfLines={2} style={{ color: colors.foreground, fontFamily: fonts.body }}>
                  {option.topic}
                </Text>
                {voted ? (
                  <Text className="text-xs font-black" style={{ color: mine ? colors.primary : colors.mutedText, fontFamily: fonts.mono }}>
                    {percent}%
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {voted ? (
        <Text className="mt-3 text-center text-xs font-bold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
          Thanks for voting · {total.toLocaleString()} total votes
        </Text>
      ) : null}
    </View>
  );
}

/** Poll sheet (from the "Vote in poll" / "Poll results" chip): the same panel over a dimmed reel. */
export function PollSheet({
  reel,
  onVote,
  onClose,
}: {
  reel: ReelItem | null;
  onVote: (reelId: string, optionId: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={!!reel} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation()}>
          {reel ? <PollPanel reel={reel} onVote={onVote} onClose={onClose} bottomInset={insets.bottom} /> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** "For You" / "Saved" / category picker. */
export function FeedPicker({
  visible,
  value,
  categories,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: string;
  categories: string[];
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const { colors, fonts, isDark } = useTheme();
  const options = [
    { id: "all", label: "For You" },
    { id: "saved", label: "Saved" },
    ...categories.map((category) => ({ id: category, label: category })),
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 items-center justify-center px-8" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onPress={onClose}>
        <View
          className="w-full max-w-[300px] rounded-3xl border p-4"
          style={{ backgroundColor: colors.surface, borderColor: colors.border, ...getShadow(colors, isDark) }}
        >
          <Text className="mb-3 text-center text-base font-extrabold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
            Show reels
          </Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {options.map((option) => {
              const selected = option.id === value;
              return (
                <TouchableOpacity
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(option.id)}
                  className="flex-row items-center justify-between rounded-xl px-4 py-3"
                  style={{ backgroundColor: selected ? colors.primaryLight : "transparent" }}
                >
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    {option.id === "saved" ? (
                      <Icon set="ion" name="bookmark-outline" size={15} color={selected ? colors.primary : colors.foreground} />
                    ) : null}
                    <Text className="text-sm font-bold" style={{ color: selected ? colors.primary : colors.foreground, fontFamily: fonts.body }}>
                      {option.label}
                    </Text>
                  </View>
                  {selected ? <Icon set="feather" name="check" size={16} color={colors.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}
