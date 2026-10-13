import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useAppConfig } from "./app-config";
import { genZLabel, useGenZMode } from "./genz-mode";
import { LOCKED_OPACITY, PauseDot, isLocked, launchSuffix, pillColors, tilePill, useTilePress } from "./LaunchTileParts";
import { ThemeColors, useTheme } from "./theme";
import { useViewer } from "../hooks/useViewer";
import { HubTile, hubTilesFor } from "../lib/appConfig";

const PER_ROW = 4;
const ICON = 60;

/**
 * Features and link tiles the App CMS moved onto Home or Profile (placement
 * "home" / "profile"). Renders nothing when the CMS
 * put nothing there, which is the default.
 *
 * Drawn as quick actions, not cards: rows of four round icons with short
 * labels, straight on the page (no box, no heading). Tile size and description are hub-screen
 * ideas, so they're ignored here (the description is still read out).
 * Coming soon / paused shortcuts are drawn locked and open their sheet
 * (components/LaunchTileParts.tsx).
 */
export function CmsShortcuts({
  placement,
  tiles: given,
  style,
}: {
  placement: "home" | "profile";
  /** Tiles to draw instead of the placement's (Home passes the person's own picks). */
  tiles?: HubTile[];
  style?: object;
}) {
  const { config } = useAppConfig();
  const viewer = useViewer();
  const tiles = given ?? hubTilesFor(config, placement, viewer);
  if (tiles.length === 0) return null;

  const rows: HubTile[][] = [];
  for (let i = 0; i < tiles.length; i += PER_ROW) rows.push(tiles.slice(i, i + PER_ROW));

  return (
    <View style={style}>
      <View className="mx-6" style={{ paddingTop: 4, gap: 16 }}>
        {rows.map((row) => (
          <View key={row[0].key} style={{ flexDirection: "row" }}>
            {row.map((tile) => (
              <Shortcut key={tile.key} tile={tile} />
            ))}
            {/* Keep a short last row aligned to the grid. */}
            {Array.from({ length: PER_ROW - row.length }, (_, i) => (
              <View key={`gap-${i}`} style={{ flex: 1 }} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

// Mint is a wash colour; its icons use the darker text-safe mint.
const tint = (colors: ThemeColors, key: HubTile["colorKey"]) => ({
  color: key === "accent" ? colors.accentText : colors[key],
  bg: colors[`${key}Light` as keyof ThemeColors],
});

/** A website or another app, so the shortcut says it leaves the app. */
const isExternal = (tile: HubTile) => tile.action.type === "url" || tile.action.type === "app";

function Shortcut({ tile }: { tile: HubTile }) {
  const { colors, fonts } = useTheme();
  const { enabled: genZ } = useGenZMode();
  const onPress = useTilePress(tile);
  const { color, bg } = tint(colors, tile.colorKey);
  const label = tile.builtIn ? genZLabel(tile.title, genZ) : tile.title;
  const external = isExternal(tile) && !isLocked(tile);
  const pill = tilePill(tile);
  const pillTint = pill ? pillColors(colors, pill.tone) : null;
  const dim = tile.launch.access === "soon" ? LOCKED_OPACITY : 1;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={[
        [label, launchSuffix(tile)].filter(Boolean).join(", "),
        pill?.tone === "badge" ? pill.text : null,
        tile.description,
        external ? "Opens outside the app" : null,
      ]
        .filter(Boolean)
        .join(". ")}
      style={{ flex: 1, alignItems: "center", paddingHorizontal: 4 }}
    >
      <View>
        <View style={{ width: ICON, height: ICON, borderRadius: ICON / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={tile.icon as keyof typeof Ionicons.glyphMap} size={24} color={color} style={{ opacity: dim }} />
          {tile.launch.access === "paused" ? <PauseDot size={18} offset={-2} ring={colors.background} /> : null}
        </View>
        {pill && pillTint ? (
          <View
            style={{
              position: "absolute",
              top: -4,
              right: -10,
              backgroundColor: pillTint.bg,
              borderRadius: 8,
              paddingHorizontal: 5,
              paddingVertical: 1,
              borderWidth: 2,
              borderColor: colors.background,
            }}
          >
            <Text style={{ fontSize: 10.5, fontWeight: "800", color: pillTint.fg, fontFamily: fonts.body }} numberOfLines={1}>
              {pill.text}
            </Text>
          </View>
        ) : external ? (
          <View
            style={{
              position: "absolute",
              bottom: -2,
              right: -2,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: colors.background,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-up-outline" size={11} color={colors.mutedText} style={{ transform: [{ rotate: "45deg" }] }} />
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={1.3}
        style={{ marginTop: 8, fontSize: 12, lineHeight: 16, fontWeight: "500", color: colors.foreground, textAlign: "center", fontFamily: fonts.body, opacity: dim }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
