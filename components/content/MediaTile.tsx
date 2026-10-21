import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";
import { Icon } from "../Icon";
import { PressableScale } from "../PressableScale";
import { motion } from "../motion";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** Pale background + solid foreground for a tile's placeholder and eyebrow. */
export type MediaTone = { bg: string; fg: string; icon: IconName };

/**
 * Cover image at a fixed aspect ratio. A missing or broken image becomes a
 * tinted panel with the category icon (never a random stock photo).
 */
export function MediaCover({
  imageUrl,
  tone,
  aspectRatio,
  iconSize = 28,
  children,
}: {
  imageUrl?: string | null;
  tone: MediaTone;
  aspectRatio: number;
  iconSize?: number;
  children?: React.ReactNode;
}) {
  // Remembers which URL failed, so a recycled tile with a new image tries again.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(imageUrl) && failedUrl !== imageUrl;
  return (
    <View style={{ width: "100%", aspectRatio, backgroundColor: tone.bg, alignItems: "center", justifyContent: "center" }}>
      {showImage ? (
        <Image
          transition={motion.duration.base}
          source={{ uri: imageUrl! }}
          contentFit="cover"
          onError={() => setFailedUrl(imageUrl ?? null)}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Icon set="ion" name={tone.icon} size={iconSize} color={tone.fg} />
      )}
      {children}
    </View>
  );
}

/** Round play badge (+ optional duration pill) drawn over a video cover. */
function VideoBadges({ duration, large }: { duration?: string | null; large?: boolean }) {
  const { fonts } = useTheme();
  const size = large ? 48 : 36;
  return (
    <>
      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(0,0,0,0.5)",
        }}
      >
        <Icon set="ion" name="play" size={large ? 22 : 16} color="#FFFFFF" style={{ marginLeft: 2 }} />
      </View>
      {duration ? (
        <View
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 8,
            backgroundColor: "rgba(0,0,0,0.6)",
          }}
        >
          <Text maxFontSizeMultiplier={1.3} style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>
            {duration}
          </Text>
        </View>
      ) : null}
    </>
  );
}

/** 36px save button over a cover, with a 44px tap target. */
function SaveButton({ saved, onPress }: { saved: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={saved ? "Saved" : "Save article"}
      accessibilityHint={saved ? "Removes it from your saved articles" : undefined}
      accessibilityState={{ selected: saved }}
      hitSlop={4}
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Icon set="ion" name={saved ? "bookmark" : "bookmark-outline"} size={17} color={saved ? colors.primaryDark : colors.foreground} />
    </TouchableOpacity>
  );
}

export type MediaTileProps = {
  title: string;
  imageUrl?: string | null;
  /** Small coloured label above the title (category). */
  eyebrow?: string;
  /** One muted line, e.g. "Article · 3 min read". */
  meta: string;
  /** Featured only: two-line summary. */
  summary?: string;
  tone: MediaTone;
  isVideo?: boolean;
  duration?: string | null;
  /** Omit to hide the save button (videos can't be saved here). */
  saved?: boolean;
  onToggleSave?: () => void;
  onPress: () => void;
  /** Large full-width card (16:9 cover) instead of a grid tile (16:10). */
  featured?: boolean;
  width?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * One article or video in the content grid: 16:10 cover, eyebrow, title and
 * a meta line, in the app's standard card (surface, 1px border, radius 24,
 * soft shadow). `featured` draws the larger lead card above the grid.
 */
export function MediaTile({
  title,
  imageUrl,
  eyebrow,
  meta,
  summary,
  tone,
  isVideo,
  duration,
  saved,
  onToggleSave,
  onPress,
  featured,
  width,
  style,
}: MediaTileProps) {
  const { colors, fonts, isDark } = useTheme();
  const pad = featured ? 18 : 14;

  return (
    <View style={[{ width, borderRadius: 24, backgroundColor: colors.surface, ...getShadow(colors, isDark) }, style]}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${isVideo ? "Video" : "Article"}: ${title}. ${meta}`}
        accessibilityHint={isVideo ? "Plays the video" : "Opens the article"}
        style={{ borderRadius: 24, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, overflow: "hidden", backgroundColor: colors.surface }}
      >
        <MediaCover imageUrl={imageUrl} tone={tone} aspectRatio={featured ? 16 / 9 : 16 / 10} iconSize={featured ? 40 : 28}>
          {isVideo ? <VideoBadges duration={duration} large={featured} /> : null}
        </MediaCover>

        <View style={{ padding: pad, paddingTop: featured ? 16 : 12, gap: 4 }}>
          {eyebrow ? (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{ color: tone.fg, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", fontFamily: fonts.body }}
            >
              {eyebrow}
            </Text>
          ) : null}
          <Text
            numberOfLines={featured ? 3 : 2}
            style={{
              flexShrink: 1,
              color: colors.foreground,
              fontSize: featured ? 19 : 15,
              lineHeight: featured ? 25 : 20,
              fontWeight: featured ? "800" : "700",
              fontFamily: fonts.heading,
            }}
          >
            {title}
          </Text>
          {featured && summary ? (
            <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 14, lineHeight: 20, fontWeight: "400", fontFamily: fonts.body, marginTop: 2 }}>
              {summary}
            </Text>
          ) : null}
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            style={{ color: colors.mutedText, fontSize: 13, lineHeight: 18, fontWeight: "500", fontFamily: fonts.body, marginTop: 2 }}
          >
            {meta}
          </Text>
        </View>
      </PressableScale>

      {/* Sibling of the card's touchable, so it isn't a nested button. */}
      {onToggleSave && saved !== undefined ? <SaveButton saved={saved} onPress={onToggleSave} /> : null}
    </View>
  );
}
