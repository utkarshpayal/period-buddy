import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { genZLabel, useGenZMode } from "./genz-mode";
import { ListGroup, ListRow } from "./ListGroup";
import { NuraAvatar } from "./NuraAvatar";
import { ThemeColors, useTheme } from "./theme";
import { LOCKED_OPACITY, PauseDot, TilePill, isLocked, launchSuffix, useTilePress } from "./LaunchTileParts";
import { getHeroGradient, getShadow } from "./ui-tokens";
import { HubTile, groupTiles } from "../lib/appConfig";
import { trackUse } from "../lib/usage";
import { Icon } from "./Icon";
import { PressableScale } from "./PressableScale";

/**
 * Hub tiles in the looks the hub screens use (lib/hubLayout.ts decides
 * which): `HubTileGrid` (two-column tinted cards), `HubTileList` (rows in
 * one white card) and the two hero cards (`HubHero`). `HubFeatureTiles`
 * draws a run of tiles by their CMS size (small → grid, large → card row);
 * Home's tile/card shortcuts use it.
 *
 * Tiles the CMS has Coming soon or paused are drawn locked and open their
 * sheet on tap (components/LaunchTileParts.tsx).
 */
export function HubFeatureTiles({ features }: { features: HubTile[] }) {
  const blocks = groupTiles(features);
  return (
    <View className="mx-6" style={{ gap: 12 }}>
      {blocks.map((block) =>
        Array.isArray(block) ? <HubTileGrid key={block[0].key} tiles={block} inset={false} /> : <LargeTile key={block.key} feature={block} />,
      )}
    </View>
  );
}

// Mint is a wash colour; its icons use the darker text-safe mint.
const tint = (colors: ThemeColors, key: HubTile["colorKey"]) => ({
  color: key === "accent" ? colors.accentText : colors[key],
  bg: colors[`${key}Light` as keyof ThemeColors],
});

/** A website or another app, so the tile says it leaves the app. */
const isExternal = (tile: HubTile) => tile.action.type === "url" || tile.action.type === "app";

function useTileTitle(tile: HubTile) {
  const { enabled: genZ } = useGenZMode();
  return tile.builtIn ? genZLabel(tile.title, genZ) : tile.title;
}

/** Two tinted cards a row; an odd last tile keeps its column width. */
export function HubTileGrid({ tiles, inset = true }: { tiles: HubTile[]; inset?: boolean }) {
  const rows: HubTile[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
  return (
    <View className={inset ? "mx-6" : undefined} style={{ gap: 12 }}>
      {rows.map((row) => (
        <View key={row[0].key} style={{ flexDirection: "row", gap: 12 }}>
          {row.map((tile) => (
            <GridTile key={tile.key} feature={tile} />
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

function GridTile({ feature }: { feature: HubTile }) {
  const { colors, fonts } = useTheme();
  const onPress = useTilePress(feature);
  const { color, bg } = tint(colors, feature.colorKey);
  const title = useTileTitle(feature);
  const soon = feature.launch.access === "soon";
  const dim = soon ? LOCKED_OPACITY : 1;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, launchSuffix(feature)].filter(Boolean).join(", ")}
      style={{ flex: 1, backgroundColor: bg, borderRadius: 22, padding: 16, gap: 18 }}
    >
      {/* The whole card is the button; only a link that leaves the app gets a mark. */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
          <Icon set="ion" name={feature.icon as any} size={22} color={color} style={{ opacity: dim }} />
          {feature.launch.access === "paused" ? <PauseDot /> : null}
        </View>
        {!soon && isExternal(feature) && !isLocked(feature) ? (
          <Icon set="ion" name="open-outline" size={16} color={colors.mutedText} accessibilityLabel="Opens outside the app" />
        ) : null}
      </View>
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={1.4}
            style={{ flexShrink: 1, fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body, opacity: dim }}
          >
            {title}
          </Text>
          <TilePill tile={feature} />
        </View>
        <Text numberOfLines={2} maxFontSizeMultiplier={1.4} style={{ fontSize: 13, lineHeight: 18, color: colors.mutedText, fontFamily: fonts.body, opacity: dim }}>
          {feature.description}
        </Text>
      </View>
    </PressableScale>
  );
}

/** Rows in one white card. */
export function HubTileList({ tiles }: { tiles: HubTile[] }) {
  return (
    <ListGroup style={{ marginHorizontal: 24 }}>
      {tiles.map((tile) => (
        <HubRow key={tile.key} feature={tile} />
      ))}
    </ListGroup>
  );
}

function HubRow({ feature }: { feature: HubTile }) {
  const { colors } = useTheme();
  const onPress = useTilePress(feature);
  const { color, bg } = tint(colors, feature.colorKey);
  const title = useTileTitle(feature);
  const soon = feature.launch.access === "soon";
  return (
    <ListRow
      icon={feature.icon as any}
      iconColor={color}
      iconBg={bg}
      title={title}
      description={feature.description}
      onPress={onPress}
      accessibilityLabel={[title, launchSuffix(feature)].filter(Boolean).join(", ")}
      // A Coming soon row doesn't lead anywhere yet, so no chevron.
      trailing={soon ? "none" : isExternal(feature) && !isLocked(feature) ? "external" : "chevron"}
      dim={soon ? LOCKED_OPACITY : 1}
      titleAccessory={<TilePill tile={feature} />}
      iconAccessory={feature.launch.access === "paused" ? <PauseDot /> : null}
    />
  );
}

/** A full-width single row card (Home's "card" shortcuts). */
function LargeTile({ feature }: { feature: HubTile }) {
  return (
    <ListGroup>
      <HubRow feature={feature} />
    </ListGroup>
  );
}

/* ─────────────────────────────── Hero cards ─────────────────────────────── */

/** The hub's lead feature drawn big (lib/hubLayout.ts HUB_HERO). Only ever given an open tile. */
export function HubHero({ tile }: { tile: HubTile }) {
  return tile.key === "nuraAi" ? <AskHero tile={tile} /> : <BookHero tile={tile} />;
}

// White text clears 4.5:1 on each stop.
const BOOK_HERO_DARK: [string, string, string] = ["#B23D64", "#9A3060", "#7B2D6B"];

/** Rose card with one call to action (Care & Insights → consultation). */
function BookHero({ tile }: { tile: HubTile }) {
  const { colors, isDark, fonts } = useTheme();
  const onPress = useTilePress(tile);
  const title = useTileTitle(tile);
  // Dark mode's hero gradient ends in pale pink/lavender, too light under
  // white text, so this card keeps deep berry stops there. Rose on the white
  // button/badge likewise needs a deeper shade than dark mode's primaryDark.
  const gradient = isDark ? BOOK_HERO_DARK : (getHeroGradient(colors, isDark) as [string, string, ...string[]]);
  const roseOnWhite = isDark ? "#A3305A" : colors.primaryDark;
  return (
    <View className="mx-6">
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 24,
          padding: 20,
          gap: 16,
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: isDark ? 0.3 : 0.22,
          shadowRadius: 28,
          elevation: 6,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
            <Icon set="mci" name="doctor" size={28} color={roseOnWhite} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.4} style={{ fontSize: 17, lineHeight: 24, fontWeight: "700", color: "#FFFFFF", fontFamily: fonts.heading }}>
              {title}
            </Text>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.4} style={{ fontSize: 13, lineHeight: 18, color: "#FFFFFF", opacity: 0.85, fontFamily: fonts.body }}>
              {tile.description}
            </Text>
          </View>
        </View>
        {/* What you get, at a glance. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(
            [
              ["shield-checkmark", "Verified doctors"],
              ["videocam", "Video & chat"],
              ["lock-closed", "Private"],
            ] as const
          ).map(([icon, label]) => (
            <View
              key={label}
              style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}
            >
              <Icon set="ion" name={icon} size={13} color="#FFFFFF" />
              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 12, fontWeight: "600", color: "#FFFFFF", fontFamily: fonts.body }}>
                {label}
              </Text>
            </View>
          ))}
        </View>
        <PressableScale
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${title}, book a call`}
          style={{ height: 48, borderRadius: 14, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <Icon set="ion" name="calendar-outline" size={18} color={roseOnWhite} />
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 15, fontWeight: "700", color: roseOnWhite, fontFamily: fonts.body }}>
            Book a call
          </Text>
          <Icon set="ion" name="arrow-forward" size={16} color={roseOnWhite} />
        </PressableScale>
      </LinearGradient>
    </View>
  );
}

/** White card with Nura's avatar and a question box (Wellness & Support → Nura AI). Sending opens a new chat with the question. */
function AskHero({ tile }: { tile: HubTile }) {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const onPress = useTilePress(tile);
  const title = useTileTitle(tile);
  const [question, setQuestion] = useState("");

  function send() {
    const q = question.trim();
    if (!q) return onPress();
    trackUse(tile.key, "tap");
    setQuestion("");
    router.push({ pathname: "/(app)/qa", params: { new: "1", q } });
  }

  return (
    <View className="mx-6" style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, gap: 16, ...getShadow(colors, isDark) }}>
        <PressableScale
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${title}. Open chats`}
          style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
        >
          <NuraAvatar size={56} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ fontSize: 17, lineHeight: 24, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>
              {title}
            </Text>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.4} style={{ fontSize: 13, lineHeight: 18, color: colors.mutedText, fontFamily: fonts.body }}>
              {tile.description}
            </Text>
          </View>
          <Icon set="ion" name="chevron-forward" size={18} color={colors.mutedText} />
        </PressableScale>
        <View
          style={{
            height: 48,
            borderRadius: 24,
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            paddingLeft: 18,
            paddingRight: 5,
            gap: 8,
          }}
        >
          <TextInput
            value={question}
            onChangeText={setQuestion}
            onSubmitEditing={send}
            returnKeyType="send"
            placeholder="Ask about your body or cycle…"
            placeholderTextColor={colors.mutedText}
            accessibilityLabel={`Ask ${title}`}
            maxFontSizeMultiplier={1.3}
            style={{ flex: 1, minWidth: 0, fontSize: 14, color: colors.foreground, fontFamily: fonts.body, paddingVertical: 0 }}
          />
          <TouchableOpacity
            hitSlop={6}
            onPress={send}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}
          >
            <Icon set="ion" name="arrow-up" size={18} color={colors.buttonText} />
          </TouchableOpacity>
        </View>
    </View>
  );
}
