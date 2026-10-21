import React, { memo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { captionNeedsMore, formatCount, hasPoll, type ReelItem } from "../../lib/reels";
import { MedicalReviewBadge } from "../MedicalReviewBadge";
import { useTheme } from "../theme";
import { Icon } from "../Icon";

const SHADOW = { textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 6 } as const;

/**
 * Bottom-left text over the video: creator + follow, the caption (two lines,
 * "more" expands), #tags, the medical review stamp, views, and a small poll
 * chip once the poll panel (PollPanel in ReelSheets.tsx) is out of the way.
 */
export const ReelOverlay = memo(function ReelOverlay({
  reel,
  following,
  onOpenCreator,
  onFollow,
  onOpenPoll,
  onShowPoll,
  showPollChip,
}: {
  reel: ReelItem;
  following: boolean;
  onOpenCreator: () => void;
  onFollow: () => void;
  onOpenPoll: () => void;
  /** Brings the poll panel back up (dismissed before voting). */
  onShowPoll: () => void;
  /** A small chip once the poll panel is out of the way (dismissed or answered). */
  showPollChip: boolean;
}) {
  const { fonts } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const needsMore = captionNeedsMore(reel.caption);

  return (
    <View style={{ gap: 8 }}>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <TouchableOpacity
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Open ${reel.creatorName}'s profile`}
          className="flex-row items-center"
          style={{ flexShrink: 1, gap: 4 }}
          onPress={onOpenCreator}
        >
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            className="text-[15px] font-extrabold text-white"
            style={[{ flexShrink: 1, fontFamily: fonts.heading }, SHADOW]}
          >
            {reel.creatorName}
          </Text>
          {reel.verified ? <Icon set="mci" name="check-decagram" size={15} color="white" /> : null}
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={following ? `Unfollow ${reel.creatorName}` : `Follow ${reel.creatorName}`}
          onPress={onFollow}
          className="rounded-lg border border-white/70 px-3 py-1"
          style={{ backgroundColor: following ? "transparent" : "rgba(255,255,255,0.12)" }}
        >
          <Text maxFontSizeMultiplier={1.3} className="text-[13px] font-bold text-white" style={{ fontFamily: fonts.body }}>
            {following ? "Following" : "Follow"}
          </Text>
        </TouchableOpacity>
      </View>

      {reel.caption ? (
        <TouchableOpacity
          activeOpacity={0.9}
          disabled={!needsMore}
          accessibilityRole={needsMore ? "button" : undefined}
          accessibilityHint={needsMore ? (expanded ? "Shows less of the caption" : "Shows the full caption") : undefined}
          onPress={() => setExpanded((value) => !value)}
        >
          <Text
            numberOfLines={expanded ? 12 : 2}
            maxFontSizeMultiplier={1.4}
            className="text-sm leading-5 text-white"
            style={[{ fontFamily: fonts.body }, SHADOW]}
          >
            {reel.caption}
          </Text>
          {needsMore ? (
            <Text className="text-sm font-bold text-white/80" style={[{ fontFamily: fonts.body }, SHADOW]}>
              {expanded ? "less" : "more"}
            </Text>
          ) : null}
        </TouchableOpacity>
      ) : null}

      {reel.tags.length > 0 ? (
        <Text numberOfLines={1} className="text-[13px] font-bold text-white/90" style={[{ fontFamily: fonts.body }, SHADOW]}>
          {reel.tags.map((tag) => `#${tag}`).join("  ")}
        </Text>
      ) : null}

      <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
        <MedicalReviewBadge item={reel.review} variant="onDark" style={{ paddingVertical: 4 }} />
        <Text className="text-xs font-bold text-white/75" style={[{ fontFamily: fonts.mono }, SHADOW]}>
          {formatCount(reel.viewCount)} views · {reel.category}
        </Text>
      </View>

      {hasPoll(reel) && showPollChip ? (
        <TouchableOpacity
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={reel.votedOptionId ? `Poll results: ${reel.pollQuestion}` : `Vote in poll: ${reel.pollQuestion}`}
          onPress={reel.votedOptionId ? onOpenPoll : onShowPoll}
          className="flex-row items-center self-start rounded-full px-3 py-1.5"
          style={{ gap: 6, backgroundColor: "rgba(255,255,255,0.16)", maxWidth: "100%" }}
        >
          <Icon set="mci" name="poll" size={14} color="white" />
          <Text numberOfLines={1} className="text-[12.5px] font-bold text-white" style={{ flexShrink: 1, fontFamily: fonts.body }}>
            {reel.votedOptionId ? "Poll results" : "Vote in poll"}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});
