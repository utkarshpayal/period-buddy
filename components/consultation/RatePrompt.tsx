import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { Consultation } from "../../lib/api";
import { doctorNameOf } from "../../lib/consultationModel";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";
import { Icon } from "../Icon";

/** "How was your session?" for the latest finished, unrated session. */
export function RatePrompt({
  consultation,
  onRate,
  onSkip,
}: {
  consultation: Consultation;
  onRate: (stars: number) => void;
  onSkip: () => void;
}) {
  const { colors, isDark, fonts } = useTheme();
  const name = doctorNameOf(consultation);
  return (
    <View className="mt-6 rounded-2xl p-4" style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-sm font-extrabold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
          How was your session with {name}?
        </Text>
        <TouchableOpacity onPress={onSkip} hitSlop={8} accessibilityLabel="Not now">
          <Text className="text-xs font-bold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
            Not now
          </Text>
        </TouchableOpacity>
      </View>
      <Text className="text-xs mt-1" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
        Your rating helps others choose the right specialist.
      </Text>
      <View className="flex-row gap-2 mt-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity key={n} onPress={() => onRate(n)} accessibilityLabel={`Rate ${n} star${n > 1 ? "s" : ""}`} hitSlop={4}>
            <Icon set="mci" name="star-outline" size={32} color={colors.primary} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
