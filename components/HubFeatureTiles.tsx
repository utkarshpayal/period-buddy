import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { genZLabel, useGenZMode } from "./genz-mode";
import { ThemeColors, useTheme } from "./theme";
import { LOCKED_OPACITY, PauseDot, TilePill, isLocked, launchSuffix, useTilePress } from "./LaunchTileParts";
import { getShadow } from "./ui-tokens";
import { HubTile, groupTiles } from "../lib/appConfig";

/**
 * A hub screen's feature tiles as the App CMS arranged them (lib/appConfig.ts
 * `featuresFor`): small tiles flow in a two-column grid, a large one takes a
 * full-width row, in CMS order. The look matches what the hubs hand-rolled
 * before (see git history of care-hub.tsx / wellness-hub.tsx).
 *
 * Tiles the CMS has Coming soon or paused are drawn locked and open their
 * sheet on tap (components/LaunchTileParts.tsx).
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
      style={{ fontSize: 11.5, fontWeight: "900", color: colors.mutedText, letterSpacing: 0.6, fontFamily: fonts.body, textTransform: "uppercase", marginTop: 14, marginBottom: 10 }}
    >
      {text}
    </Text>
  );
}

function SmallTile({ feature }: { feature: HubTile }) {
  const { colors, isDark, fonts } = useTheme();
  const { enabled: genZ } = useGenZMode();
  const onPress = useTilePress(feature);
  const { color, bg } = tint(colors, feature.colorKey);
  const title = feature.builtIn ? genZLabel(feature.title, genZ) : feature.title;
  const dim = feature.launch.access === "soon" ? LOCKED_OPACITY : 1;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={[title, launchSuffix(feature)].filter(Boolean).join(", ")}
      className="border"
      style={{ width: "48%", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, padding: 16, ...getShadow(colors, isDark) }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={feature.icon as any} size={18} color={color} style={{ opacity: dim }} />
          {feature.launch.access === "paused" ? <PauseDot /> : null}
        </View>
        {isExternal(feature) && !isLocked(feature) ? <Ionicons name="open-outline" size={14} color={colors.mutedText} accessibilityLabel="Opens outside the app" /> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
        <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body, opacity: dim }}>{title}</Text>
        <TilePill tile={feature} />
      </View>
      <Text style={{ fontSize: 12.5, color: colors.mutedText, marginTop: 3, fontFamily: fonts.body, opacity: dim }} numberOfLines={2}>
        {feature.description}
      </Text>
    </TouchableOpacity>
  );
}

function LargeTile({ feature }: { feature: HubTile }) {
  const { colors, isDark, fonts } = useTheme();
  const { enabled: genZ } = useGenZMode();
  const onPress = useTilePress(feature);
  const { color, bg } = tint(colors, feature.colorKey);
  const title = feature.builtIn ? genZLabel(feature.title, genZ) : feature.title;
  const soon = feature.launch.access === "soon";
  const dim = soon ? LOCKED_OPACITY : 1;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={[title, launchSuffix(feature)].filter(Boolean).join(", ")}
      className="flex-row items-center border"
      style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, padding: 16, ...getShadow(colors, isDark) }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: bg, alignItems: "center", justifyContent: "center", marginRight: 13 }}>
        <Ionicons name={feature.icon as any} size={20} color={color} style={{ opacity: dim }} />
        {feature.launch.access === "paused" ? <PauseDot /> : null}
      </View>
      <View className="flex-1">
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body, opacity: dim }}>{title}</Text>
          <TilePill tile={feature} />
        </View>
        <Text style={{ fontSize: 12.5, color: colors.mutedText, marginTop: 2, fontFamily: fonts.body, opacity: dim }} numberOfLines={2}>
          {feature.description}
        </Text>
      </View>
      {/* A Coming soon row doesn't lead anywhere yet, so no chevron. */}
      {soon ? null : (
        <Ionicons name={isExternal(feature) && !isLocked(feature) ? "open-outline" : "chevron-forward"} size={18} color={colors.mutedText} />
      )}
    </TouchableOpacity>
  );
}
