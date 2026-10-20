import React, { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { formatCount, type ReelItem } from "../../lib/reels";
import { useTheme } from "../theme";
import { Icon } from "../Icon";
import { motion } from "../motion";

const SHADOW = { textShadowColor: "rgba(0,0,0,0.45)", textShadowRadius: 6 } as const;

function RailButton({
  label,
  count,
  accessibilityLabel,
  onPress,
  children,
}: {
  label?: string;
  count?: number;
  accessibilityLabel: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const { fonts } = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
      className="items-center"
      onPress={onPress}
    >
      {children}
      {count !== undefined || label ? (
        <Text
          maxFontSizeMultiplier={1.2}
          className="mt-1 text-xs font-bold text-white"
          style={[{ fontFamily: count !== undefined ? fonts.mono : fonts.body }, SHADOW]}
        >
          {count !== undefined ? formatCount(count) : label}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

/** Right-hand actions: creator (+ follow), like, comments, share, save. */
export const ReelActionRail = memo(function ReelActionRail({
  reel,
  following,
  onOpenCreator,
  onFollow,
  onLike,
  onComments,
  onShare,
  onSave,
}: {
  reel: ReelItem;
  following: boolean;
  onOpenCreator: () => void;
  onFollow: () => void;
  onLike: () => void;
  onComments: () => void;
  onShare: () => void;
  onSave: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="items-center" style={{ gap: 18 }}>
      <View className="items-center" style={{ marginBottom: 4 }}>
        <TouchableOpacity
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Open ${reel.creatorName}'s profile`}
          onPress={onOpenCreator}
        >
          {reel.creatorAvatar ? (
            <Image transition={motion.duration.base} source={{ uri: reel.creatorAvatar }} className="h-12 w-12 rounded-full border-2 border-white bg-neutral-300" />
          ) : (
            <View className="h-12 w-12 items-center justify-center rounded-full border-2 border-white bg-white/25">
              <Icon set="feather" name="user" size={22} color="white" />
            </View>
          )}
        </TouchableOpacity>
        {!following ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Follow ${reel.creatorName}`}
            hitSlop={12}
            onPress={onFollow}
            className="-mt-3 h-6 w-6 items-center justify-center rounded-full border-2 border-white"
            style={{ backgroundColor: colors.primary }}
          >
            <Icon set="ion" name="add" size={14} color="white" />
          </TouchableOpacity>
        ) : reel.verified ? (
          <View className="-mt-3 rounded-full border-2 border-white p-0.5" style={{ backgroundColor: colors.success }}>
            <Icon set="mci" name="check" size={11} color="white" />
          </View>
        ) : null}
      </View>

      <RailButton
        count={reel.likeCount}
        accessibilityLabel={`${reel.isLiked ? "Unlike" : "Like"}. ${reel.likeCount} likes`}
        onPress={onLike}
      >
        <Icon set="ion" name={reel.isLiked ? "heart" : "heart-outline"} size={32} color={reel.isLiked ? "#FF3B5C" : "white"} style={SHADOW} />
      </RailButton>

      <RailButton count={reel.commentCount} accessibilityLabel={`Comments. ${reel.commentCount} comments`} onPress={onComments}>
        <Icon set="ion" name="chatbubble-outline" size={29} color="white" style={SHADOW} />
      </RailButton>

      <RailButton label="Share" accessibilityLabel="Share reel" onPress={onShare}>
        <Icon set="feather" name="send" size={27} color="white" style={SHADOW} />
      </RailButton>

      <RailButton
        label={reel.isSaved ? "Saved" : "Save"}
        accessibilityLabel={reel.isSaved ? "Remove from saved" : "Save reel"}
        onPress={onSave}
      >
        <Icon set="ion" name={reel.isSaved ? "bookmark" : "bookmark-outline"} size={28} color="white" style={SHADOW} />
      </RailButton>
    </View>
  );
});
