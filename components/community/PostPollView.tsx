import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { CommunityPoll } from "../../lib/api";
import { useTheme } from "../theme";
import { Icon } from "../Icon";
import { Button } from "../Button";

// Renders a post's poll. Before voting: tappable options (single-select votes
// immediately; multi-select accumulates a local selection + a Vote button).
// After voting (or when results should show): percentage bars with counts.
export function PostPollView({
  poll,
  isVoting,
  onVote,
  readOnly,
}: {
  poll: CommunityPoll;
  isVoting: boolean;
  onVote: (optionIds: string[]) => void;
  // A partner viewer can see community content but, like posting/commenting,
  // shouldn't be able to cast a vote on someone else's poll — only see the
  // current results.
  readOnly?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const [selected, setSelected] = useState<string[]>([]);
  const hasVoted = poll.myVote.length > 0;
  const showResults = hasVoted || readOnly;

  const toggleSelect = (optionId: string) => {
    if (readOnly) return;
    if (poll.allowMultiple) {
      setSelected((current) =>
        current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      );
    } else {
      // Single-select: tap casts the vote right away.
      onVote([optionId]);
    }
  };

  return (
    <View
      className="mt-4 rounded-2xl border p-4"
      style={{ borderColor: colors.border, backgroundColor: colors.surfaceSoft }}
    >
      <View className="flex-row items-center gap-2 mb-3">
        <Icon set="ion" name="stats-chart" size={15} color={colors.primary} />
        <Text
          className="text-[13px] font-bold flex-1"
          style={{ color: colors.foreground, fontFamily: fonts.body }}
        >
          {poll.question?.trim() || "Poll"}
        </Text>
        {poll.allowMultiple ? (
          <Text
            className="text-[11.5px] font-black uppercase tracking-wide"
            style={{ color: colors.mutedText, fontFamily: fonts.body }}
          >
            Multi
          </Text>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        {poll.options.map((option) => {
          const pct =
            poll.totalVotes > 0 ? Math.round((option.votes / poll.totalVotes) * 100) : 0;
          const isMine = poll.myVote.includes(option.optionId);
          const isSelected = selected.includes(option.optionId);

          if (showResults) {
            return (
              <View
                key={option.optionId}
                className="rounded-xl overflow-hidden border"
                style={{ borderColor: isMine ? colors.primary : colors.border }}
              >
                <View
                  className="absolute top-0 left-0 bottom-0"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: isMine ? colors.primaryLight : colors.surface,
                  }}
                />
                <View className="flex-row items-center justify-between px-3 py-2.5">
                  <View className="flex-row items-center gap-1.5 flex-1">
                    {isMine ? (
                      <Icon set="ion" name="checkmark-circle" size={14} color={colors.primary} />
                    ) : null}
                    <Text
                      className="text-[13px] font-semibold"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                      numberOfLines={1}
                    >
                      {option.topic}
                    </Text>
                  </View>
                  <Text
                    className="text-[13px] font-bold"
                    style={{ color: colors.mutedText, fontFamily: fonts.mono }}
                  >
                    {pct}%
                  </Text>
                </View>
              </View>
            );
          }

          return (
            <TouchableOpacity
              key={option.optionId}
              activeOpacity={0.85}
              disabled={isVoting}
              onPress={() => toggleSelect(option.optionId)}
              className="flex-row items-center gap-2 rounded-xl border px-3 py-2.5"
              style={{
                borderColor: isSelected ? colors.primary : colors.border,
                backgroundColor: isSelected ? colors.primaryLight : colors.surface,
              }}
            >
              <Icon set="ion"
                name={
                  poll.allowMultiple
                    ? isSelected
                      ? "checkbox"
                      : "square-outline"
                    : "radio-button-off"
                }
                size={16}
                color={isSelected ? colors.primary : colors.mutedText}
              />
              <Text
                className="text-[13px] font-semibold flex-1"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
                numberOfLines={1}
              >
                {option.topic}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {poll.allowMultiple && !showResults ? (
        <Button label="Vote" size="sm" onPress={() => onVote(selected)} disabled={selected.length === 0} loading={isVoting} fullWidth style={{ marginTop: 12 }} />
      ) : null}

      <Text
        className="mt-3 text-xs font-semibold"
        style={{ color: colors.mutedText, fontFamily: fonts.body }}
      >
        {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
        {hasVoted ? " · You voted" : ""}
      </Text>
    </View>
  );
}
