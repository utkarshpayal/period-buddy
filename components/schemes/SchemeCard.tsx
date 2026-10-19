import { useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { GovernmentBenefit } from "../../lib/api";
import { SCHEME_ACTION_LABELS } from "../../lib/schemeHelpers";
import { useTheme } from "../theme";
import { getShadow, getSoftTints } from "../ui-tokens";
import { SchemePills } from "./SchemePills";
import { Icon } from "../Icon";

/** One scheme in the Government Schemes list; opens its detail screen. */
export function SchemeCard({ scheme }: { scheme: GovernmentBenefit }) {
  const { colors, fonts, isDark } = useTheme();
  const router = useRouter();
  const softTints = getSoftTints(colors);
  const levelLabel =
    scheme.governmentLevel === "central" ? "Central" : scheme.state || "State";
  const actionLabel = SCHEME_ACTION_LABELS[scheme.actionType] || "View";

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() =>
        router.push(`/government-scheme-detail?id=${scheme.slug}`)
      }
      accessibilityRole="button"
      accessibilityLabel={`${scheme.name}. ${levelLabel}. ${actionLabel}`}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 24,
        padding: 16,
        marginBottom: 12,
        ...getShadow(colors, isDark),
      }}
    >
      <View className="flex-row items-start" style={{ gap: 12 }}>
        <View
          className="items-center justify-center"
          style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: softTints.pink }}
        >
          <Icon set="ion" name="ribbon-outline" size={20} color={colors.primaryDark} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <SchemePills level={levelLabel} shortName={scheme.shortName} small style={{ marginBottom: 6 }} />
          <Text
            numberOfLines={2}
            style={{ flexShrink: 1, fontSize: 15, lineHeight: 21, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}
          >
            {scheme.name}
          </Text>
          <Text
            numberOfLines={2}
            style={{ marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: "400", color: colors.foreground, fontFamily: fonts.body }}
          >
            {scheme.description}
          </Text>
          <View className="flex-row items-center" style={{ marginTop: 10, gap: 2 }}>
            <Text
              maxFontSizeMultiplier={1.4}
              style={{ fontSize: 13, fontWeight: "700", color: colors.primaryDark, fontFamily: fonts.body }}
            >
              {actionLabel}
            </Text>
            <Icon set="feather" name="chevron-right" size={15} color={colors.primaryDark} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
