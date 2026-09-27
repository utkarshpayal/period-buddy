import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "./theme";
import type { HubTile } from "../lib/appConfig";
import { openTileSheet } from "../lib/launchGuard";
import { runTapAction } from "../lib/tapAction";

/**
 * Shared pieces for drawing an App CMS tile in its launch state (The-Nura-CMS
 * docs/launch-states.md §4.1), used by components/HubFeatureTiles.tsx and
 * components/CmsShortcuts.tsx:
 *   open    → as before, plus a BETA pill when the CMS asks for it
 *   soon    → dimmed, SOON pill instead of any custom badge; tap = Coming soon sheet
 *   paused  → normal look with a pause dot, custom badge hidden; tap = Paused sheet
 */

/** Dim a Coming soon tile's icon and text; it still has to look tappable. */
export const LOCKED_OPACITY = 0.55;

export const isLocked = (tile: HubTile) => tile.launch.access !== "open";

/** What a tap does: the tile's action when open, its sheet otherwise. */
export function useTilePress(tile: HubTile) {
  const router = useRouter();
  return () => (tile.launch.access === "open" ? runTapAction(tile.action, router) : openTileSheet(tile));
}

/** "{Title}, coming soon" etc., for the tile's accessibility label. */
export function launchSuffix(tile: HubTile): string | null {
  if (tile.launch.access === "soon") return "coming soon";
  if (tile.launch.access === "paused") return "temporarily unavailable";
  return tile.launch.beta ? "beta" : null;
}

/** The pill a tile shows: SOON / BETA, else its custom badge (never on a paused tile). */
export function tilePill(tile: HubTile): { text: string; tone: "soon" | "beta" | "badge" } | null {
  if (tile.launch.access === "soon") return { text: "SOON", tone: "soon" };
  if (tile.launch.access === "paused") return null;
  if (tile.launch.beta) return { text: "BETA", tone: "beta" };
  return tile.badge ? { text: tile.badge, tone: "badge" } : null;
}

export function pillColors(colors: ReturnType<typeof useTheme>["colors"], tone: "soon" | "beta" | "badge") {
  if (tone === "soon") return { bg: colors.warning, fg: colors.buttonText };
  if (tone === "beta") return { bg: colors.info, fg: colors.buttonText };
  return { bg: colors.primary, fg: colors.buttonText };
}

/** Small amber dot with a pause glyph, pinned to the corner of a tile's icon. */
export function PauseDot({ size = 16, offset = -4, ring }: { size?: number; offset?: number; ring?: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        position: "absolute",
        right: offset,
        bottom: offset,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.warning,
        borderWidth: 2,
        // Matches what's behind the tile so the dot reads as cut out.
        borderColor: ring ?? colors.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="pause" size={size * 0.45} color={colors.buttonText} />
    </View>
  );
}

/** A tile pill (SOON / BETA / custom badge) in the hub tiles' style. */
export function TilePill({ tile }: { tile: HubTile }) {
  const { colors, fonts } = useTheme();
  const pill = tilePill(tile);
  if (!pill) return null;
  const { bg, fg } = pillColors(colors, pill.tone);
  return (
    <View style={{ marginLeft: 6, backgroundColor: bg, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
      <Text style={{ fontSize: 9, fontWeight: "900", color: fg, fontFamily: fonts.body }}>{pill.text}</Text>
    </View>
  );
}
