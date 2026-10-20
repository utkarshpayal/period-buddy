import { Feather } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown, LinearTransition, useReducedMotion } from "react-native-reanimated";
import { matchStrength, phaseKeyOf, PHASE_LABELS, type BuddyCandidate, type BuddyPhaseKey } from "../../lib/buddyMatch";
import PressableFeedback from "../PressableFeedback";
import { useTheme, type ThemeColors } from "../theme";
import { getShadow } from "../ui-tokens";
import { Icon } from "../Icon";
import { motion } from "../motion";

/** Solid + pale colour per cycle phase (same family the tracker uses). */
export function phaseTint(phase: BuddyPhaseKey, colors: ThemeColors) {
  switch (phase) {
    case "period":
      return { color: colors.rose, light: colors.roseLight };
    case "follicular":
      return { color: colors.success, light: colors.successLight };
    case "ovulation":
      return { color: colors.accentText, light: colors.accentLight };
    case "luteal":
      return { color: colors.warning, light: colors.warningLight };
    default:
      return { color: colors.mutedText, light: colors.surfaceSoft };
  }
}

const VISIBLE_TRAITS = 2;

type Status = "available" | "active" | "locked";

/**
 * One Period Buddy match in the discovery list: who, their phase, overlap and
 * match %, up to two shared interests, and one action (Invite, or nothing
 * while you already have a buddy). Tap the card to see why you match.
 */
export function BuddyMatchCard({
  buddy,
  avatarSeed,
  index,
  status,
  expanded,
  onToggle,
  onInvite,
  onOpenChat,
}: {
  buddy: BuddyCandidate;
  avatarSeed: string;
  /** Position in the list, for a short staggered entrance. */
  index: number;
  status: Status;
  expanded: boolean;
  onToggle: () => void;
  onInvite: () => void;
  onOpenChat: () => void;
}) {
  const { colors, fonts, isDark } = useTheme();
  const reduceMotion = useReducedMotion();
  const phase = phaseKeyOf(buddy.cyclePhase);
  const tint = phaseTint(phase, colors);
  const strength = matchStrength(buddy.compatibility);
  const strengthColor =
    strength.tier === "great" ? colors.success : strength.tier === "good" ? colors.primary : colors.mutedText;
  const score = Math.max(0, Math.min(100, Math.round(buddy.compatibility)));
  const traits = buddy.similarities.slice(0, VISIBLE_TRAITS);
  const hiddenTraits = buddy.similarities.length - traits.length;
  const isActive = status === "active";

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.delay(Math.min(index, 8) * 45).duration(motion.duration.slow)}
      layout={reduceMotion ? undefined : LinearTransition.duration(200)}
    >
      <PressableFeedback
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${buddy.name}, ${PHASE_LABELS[phase]} phase, ${score}% match, cycles overlap ${buddy.cycleOverlapDays} days`}
        accessibilityHint={expanded ? "Hides details" : "Shows why you match"}
        accessibilityState={{ expanded }}
        style={({ pressed }) => ({
          borderRadius: 22,
          borderWidth: isActive ? 1.5 : 1,
          borderColor: isActive ? colors.success : colors.border,
          backgroundColor: colors.surface,
          padding: 16,
          transform: [{ scale: pressed ? 0.985 : 1 }],
          ...getShadow(colors, isDark),
        })}
      >
        {/* Identity + score */}
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <View
            className="h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: tint.light }}
          >
            <Text style={{ fontSize: 15, fontWeight: "800", color: tint.color, fontFamily: fonts.heading }}>
              {avatarSeed}
            </Text>
          </View>

          <View className="flex-1">
            <View className="flex-row items-center" style={{ gap: 6 }}>
              <Text
                numberOfLines={1}
                style={{ flexShrink: 1, fontSize: 15, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}
              >
                {buddy.name}
              </Text>
              {isActive && (
                <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: colors.successLight }}>
                  <Text style={{ fontSize: 11.5, fontWeight: "800", color: colors.success, fontFamily: fonts.body }}>
                    YOUR BUDDY
                  </Text>
                </View>
              )}
            </View>
            <View className="flex-row items-center mt-1" style={{ gap: 6, flexWrap: "wrap" }}>
              <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: tint.light }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: tint.color, fontFamily: fonts.body }}>
                  {PHASE_LABELS[phase]}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>
                Overlap {buddy.cycleOverlapDays} {buddy.cycleOverlapDays === 1 ? "day" : "days"}
              </Text>
            </View>
          </View>

          <View className="items-end" style={{ gap: 2 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: strengthColor, fontFamily: fonts.mono }}>{score}%</Text>
            <Icon set="feather" name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedText} />
          </View>
        </View>

        {/* Why you match (tap the card) */}
        {expanded && (
          <View className="mt-3.5 rounded-2xl p-3.5" style={{ backgroundColor: colors.surfaceSoft, gap: 8 }}>
            <Reason icon="calendar" text={`Your cycles overlap for ${buddy.cycleOverlapDays} ${buddy.cycleOverlapDays === 1 ? "day" : "days"}.`} />
            <Reason icon="moon" text={`${buddy.name.split(" ")[0]} is in the ${PHASE_LABELS[phase].toLowerCase()} phase right now.`} />
            {buddy.similarities.length > 0 && (
              <Reason icon="heart" text={`You both: ${buddy.similarities.join(", ")}.`} />
            )}
          </View>
        )}

        {/* Shared interests + the one action */}
        {(status !== "locked" || (!expanded && traits.length > 0)) && (
          <View className="flex-row items-center mt-3.5" style={{ gap: 10 }}>
            <View className="flex-1 flex-row" style={{ gap: 6, flexWrap: "wrap" }}>
              {!expanded &&
                traits.map((trait) => (
                  <View key={trait} className="rounded-full px-2.5 py-1" style={{ backgroundColor: colors.surfaceSoft }}>
                    <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "600", color: colors.foreground, fontFamily: fonts.body }}>
                      {trait}
                    </Text>
                  </View>
                ))}
              {!expanded && hiddenTraits > 0 && (
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body, alignSelf: "center" }}>
                  +{hiddenTraits}
                </Text>
              )}
            </View>

            {status === "active" ? (
              <PressableFeedback
                onPress={onOpenChat}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Open chat with ${buddy.name}`}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 999,
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  backgroundColor: colors.success,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Icon set="ion" name="chatbubble-ellipses" size={15} color="#FFFFFF" />
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#FFFFFF", fontFamily: fonts.body }}>Open chat</Text>
              </PressableFeedback>
            ) : status === "available" ? (
              <PressableFeedback
                onPress={onInvite}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Invite ${buddy.name}`}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 999,
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Icon set="feather" name="user-plus" size={14} color="#FFFFFF" />
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#FFFFFF", fontFamily: fonts.body }}>Invite</Text>
              </PressableFeedback>
            ) : null}
          </View>
        )}
      </PressableFeedback>
    </Animated.View>
  );
}

function Reason({ icon, text }: { icon: React.ComponentProps<typeof Feather>["name"]; text: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View className="flex-row items-start" style={{ gap: 8 }}>
      <Icon set="feather" name={icon} size={14} color={colors.primary} style={{ marginTop: 2 }} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: colors.foreground, fontFamily: fonts.body }}>{text}</Text>
    </View>
  );
}
