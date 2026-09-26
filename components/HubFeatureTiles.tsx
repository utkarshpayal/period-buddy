import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { genZLabel, useGenZMode } from "./genz-mode";
import { ThemeColors, useTheme } from "./theme";
import { getShadow } from "./ui-tokens";
import { HubTile, groupTiles } from "../lib/appConfig";
import { runTapAction } from "../lib/tapAction";

/**
 * A hub screen's feature tiles as the App CMS arranged them (lib/appConfig.ts
 * `featuresFor`): small tiles flow in a two-column grid, a large one takes a
 * full-width row, in CMS order. The look matches what the hubs hand-rolled
 * before (see git history of care-hub.tsx / wellness-hub.tsx).
 *
 * `smallHeading` labels a grid that follows large rows (Wellness uses
 * "More support"), so a mixed hub still reads as primary + secondary.
 */
export function HubFeatureTiles({ features, smallHeading }: { features: HubTile[]; smallHeading?: string }) {
  const blocks = groupTiles(features);
  return (
    <View className="mx-6" style={{ gap: 10 }}>
      {blocks.map((block, i) =>
        Array.isArray(block) ? (
          <View key={block[0].key}>
            {smallHeading && i > 0 && !Array.isArray(blocks[i - 1]) ? <SectionLabel text={smallHeading} /> : null}
            <View className="flex-row flex-wrap" style={{ gap: 10 }}>
              {block.map((f) => (
                <SmallTile key={f.key} feature={f} />
              ))}
            </View>
          </View>
        ) : (
          <LargeTile key={block.key} feature={block} />
        )
      )}
    </View>
  );
}

const tint = (colors: ThemeColors, key: HubTile["colorKey"]) => ({
  color: colors[key],
  bg: colors[`${key}Light` as keyof ThemeColors],
});

/** A website or another app, so the tile says it leaves the app. */
const isExternal = (tile: HubTile) => tile.action.type === "url" || tile.action.type === "app";

function SectionLabel({ text }: { text: string }) {
  const { colors, fonts } = useTheme();
  return (
    <Text
      style={{ fontSize: 10, fontWeight: "900", color: colors.mutedText, letterSpacing: 0.6, fontFamily: fonts.body, textTransform: "uppercase", marginTop: 14, marginBottom: 10 }}
    >
      {text}
    </Text>
  );
}

function Badge({ text }: { text: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ marginLeft: 6, backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
      <Text style={{ fontSize: 9, fontWeight: "900", color: colors.buttonText, fontFamily: fonts.body }}>{text}</Text>
    </View>
  );
}

function SmallTile({ feature }: { feature: HubTile }) {
  const { colors, isDark, fonts } = useTheme();
  const { enabled: genZ } = useGenZMode();
  const router = useRouter();
  const { color, bg } = tint(colors, feature.colorKey);
  return (
    <TouchableOpacity
      onPress={() => runTapAction(feature.action, router)}
      activeOpacity={0.8}
      accessibilityRole="button"
      className="border"
      style={{ width: "48%", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, padding: 16, ...getShadow(colors, isDark) }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={feature.icon as any} size={18} color={color} />
        </View>
        {isExternal(feature) ? <Ionicons name="open-outline" size={14} color={colors.mutedText} accessibilityLabel="Opens outside the app" /> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
        <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}>
          {feature.builtIn ? genZLabel(feature.title, genZ) : feature.title}
        </Text>
        {feature.badge ? <Badge text={feature.badge} /> : null}
      </View>
      <Text style={{ fontSize: 11, color: colors.mutedText, marginTop: 3, fontFamily: fonts.body }} numberOfLines={2}>
        {feature.description}
      </Text>
    </TouchableOpacity>
  );
}

function LargeTile({ feature }: { feature: HubTile }) {
  const { colors, isDark, fonts } = useTheme();
  const { enabled: genZ } = useGenZMode();
  const router = useRouter();
  const { color, bg } = tint(colors, feature.colorKey);
  return (
    <TouchableOpacity
      onPress={() => runTapAction(feature.action, router)}
      activeOpacity={0.85}
      accessibilityRole="button"
      className="flex-row items-center border"
      style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, padding: 16, ...getShadow(colors, isDark) }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: bg, alignItems: "center", justifyContent: "center", marginRight: 13 }}>
        <Ionicons name={feature.icon as any} size={20} color={color} />
      </View>
      <View className="flex-1">
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}>
            {feature.builtIn ? genZLabel(feature.title, genZ) : feature.title}
          </Text>
          {feature.badge ? <Badge text={feature.badge} /> : null}
        </View>
        <Text style={{ fontSize: 11.5, color: colors.mutedText, marginTop: 2, fontFamily: fonts.body }} numberOfLines={2}>
          {feature.description}
        </Text>
      </View>
      <Ionicons name={isExternal(feature) ? "open-outline" : "chevron-forward"} size={18} color={colors.mutedText} />
    </TouchableOpacity>
  );
}
